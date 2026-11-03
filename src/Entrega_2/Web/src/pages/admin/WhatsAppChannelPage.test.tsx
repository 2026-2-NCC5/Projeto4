import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeCatalog } from '@/features/support/staff/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import type { SupportChannelList, SupportChannelView, SupportProviderHealth } from '@/types/api';
import WhatsAppChannelPage from './WhatsAppChannelPage';

const adminSession = () => makeSession(makeMe('technical_admin'));
const open = (session = adminSession()) => renderRoutes([{ path: '/admin/canais/whatsapp', element: <WhatsAppChannelPage /> }], { initialPath: '/admin/canais/whatsapp', session });

const channel = (overrides: Partial<SupportChannelView> = {}): SupportChannelView => ({
  id: 'c-1',
  name: 'Canal ASA',
  provider: 'wa-akg',
  state: 'enabled',
  status: 'DISCONNECTED',
  maskedNumber: null,
  isDemo: false,
  lastWebhookAt: null,
  team: 'Atendimento ASA',
  publicNumber: '+5511000000000',
  authorizationReference: 'Ofício 12/2026',
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  lastErrorCode: null,
  healthCheckedAt: null,
  circuitOpenUntil: null,
  sessionManagementEnabled: true,
  webhookPath: '/api/internal/webhooks/wa-akg/c-1',
  createdAt: '2026-11-02T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
  ...overrides,
});

const list = (items: SupportChannelView[], overrides: Partial<SupportChannelList> = {}): SupportChannelList => ({ items, provider: 'wa-akg', configured: true, disabledReason: null, demoMode: false, ...overrides });
const health: SupportProviderHealth = { provider: 'wa-akg', configured: true, demoMode: false, disabledReason: null, outbox: { pending: 2, processing: 0, failed: 1, unknown: 1, oldestPendingAt: '2026-11-02T10:00:00.000Z' }, inbox: { pending: 0, failed: 0, lastReceivedAt: null }, eventLagSeconds: 12, channels: [], checkedAt: '2026-11-02T10:00:00.000Z' };

const routes = (data: SupportChannelList, extra: Parameters<typeof mockApi>[0] = {}) =>
  mockApi({
    'GET /api/support/catalog': () => ({ data: makeCatalog() }),
    'GET /api/admin/support/channels': () => ({ data }),
    'GET /api/admin/support/provider-health': () => ({ data: health }),
    'GET /api/admin/support/contact-reviews': () => ({ data: { items: [] } }),
    ...extra,
  });

describe('Canal WhatsApp (administração)', () => {
  it('sem provedor explica o motivo e diz que o atendimento continua', async () => {
    routes(list([], { provider: null, configured: false, disabledReason: 'Provedor wa-akg sem configuração: ASA_WHATSAPP_PII_KEY.' }));
    open();
    expect(await screen.findByText('Nenhum provedor ativo neste ambiente')).toBeInTheDocument();
    expect(screen.getByText(/ASA_WHATSAPP_PII_KEY/)).toBeInTheDocument();
    expect(screen.getByText(/continua funcionando/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Conectar/ })).toBeNull();
  });

  it('avisa do risco do gateway não oficial e mostra o estado real; "conectado" não aparece sem confirmação', async () => {
    routes(list([channel()]));
    open();
    expect(await screen.findByText(/cliente não oficial/)).toBeInTheDocument();
    expect(screen.getByText('Desconectado')).toBeInTheDocument();
    expect(screen.queryByText('Conectado')).toBeNull();
    expect(await screen.findByText('Sem confirmação')).toBeInTheDocument();
  });

  it('sem referência de autorização não dá para conectar número real', async () => {
    routes(list([channel({ authorizationReference: null })]));
    open();
    expect(await screen.findByLabelText(/Referência da autorização institucional/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conectar conta institucional' })).toBeDisabled();
  });

  it('o QR aparece só depois do pedido, na resposta para a administração', async () => {
    const { calls } = routes(list([channel()]), {
      'POST /api/admin/support/channels/c-1/connect': () => ({ data: { channel: channel({ status: 'QR_REQUIRED' }), action: 'qr', qr: { format: 'image_data_url', value: 'data:image/png;base64,AAAA', expiresAt: null }, message: 'Escaneie com o aparelho do número institucional autorizado.' } }),
    });
    open();
    expect(screen.queryByRole('img', { name: /QR code/ })).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Conectar conta institucional' }));
    const image = await screen.findByRole('img', { name: /QR code/ });
    expect(image).toHaveAttribute('src', 'data:image/png;base64,AAAA');
    expect(screen.getByText(/nunca com um número pessoal/)).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/connect'))).toBe(true);
  });

  it('desconectar pede confirmação e explica o que acontece com os chamados', async () => {
    const { calls } = routes(list([channel({ status: 'CONNECTED', maskedNumber: '+55 •••• 0000' })]), { 'DELETE /api/admin/support/channels/c-1/connection': () => ({ data: channel() }) });
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Desconectar' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Chamados e histórico continuam disponíveis');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));
  });

  it('simulador só aparece em demonstração e usa as rotas de simulação', async () => {
    const { calls } = routes(list([channel({ provider: 'fake', isDemo: true })], { provider: 'fake', demoMode: true }), {
      'POST /api/admin/support/simulator/inbound': () => ({ data: { received: 1, duplicates: 0, failed: 0 } }),
      'POST /api/admin/support/simulator/connection': () => ({ data: { received: 1 } }),
    });
    open();
    expect(await screen.findByText('Simulador de demonstração')).toBeInTheDocument();
    expect(screen.getAllByText(/nenhum número real|Nada sai para o WhatsApp/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Receber mensagem' }));
    await waitFor(() => expect(calls.find((call) => call.path.endsWith('/simulator/inbound'))?.body).toMatchObject({ channelId: 'c-1', from: '+99900001234', kind: 'text' }));
  });

  it('simulador não aparece com provedor real', async () => {
    routes(list([channel()]));
    open();
    await screen.findByText('Canal ASA');
    expect(screen.queryByText('Simulador de demonstração')).toBeNull();
  });

  it('criar canal envia só dados institucionais', async () => {
    const { calls } = routes(list([]), { 'POST /api/admin/support/channels': () => ({ status: 201, data: channel() }) });
    open();
    await userEvent.type(await screen.findByLabelText(/Nome do canal/), 'Atendimento ASA');
    await userEvent.selectOptions(screen.getByLabelText(/Equipe que recebe/), makeCatalog().teams?.[0] ?? '');
    await userEvent.type(screen.getByLabelText(/Número institucional/), '+5511000000000');
    await userEvent.click(screen.getByRole('button', { name: 'Criar canal' }));
    await waitFor(() => expect(calls.find((call) => call.method === 'POST' && call.path === '/api/admin/support/channels')?.body).toMatchObject({ name: 'Atendimento ASA', publicNumber: '+5511000000000' }));
  });

  it('equipe e aluno não têm acesso à página', async () => {
    routes(list([]));
    open(makeSession(makeMe('institutional_staff')));
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
  });

  it('conflito de vínculo não mostra quem é o outro estudante e exige motivo', async () => {
    const { calls } = routes(list([channel()]), {
      'GET /api/admin/support/contact-reviews': () => ({ data: { items: [{ id: 'r-1', contactMasked: '+55 •••• 0000', createdAt: '2026-11-02T10:00:00.000Z' }] } }),
      'POST /api/admin/support/contact-reviews/r-1/decision': () => ({ data: { decided: true } }),
    });
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Recusar pedido' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Registrar decisão' })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Motivo e como a identidade/), 'Conferido por telefone com a secretaria.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar decisão' }));
    await waitFor(() => expect(calls.find((call) => call.path.endsWith('/decision'))?.body).toMatchObject({ decision: 'reject' }));
  });
});
