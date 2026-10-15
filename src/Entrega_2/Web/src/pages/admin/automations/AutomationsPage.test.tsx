import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { describeConditions, joinOr, ruleErrorsFrom } from '@/features/admin/automations';
import { apiError, makeAutomationList, makeRule } from '@/features/admin/testFixtures';
import { makeCatalog } from '@/features/support/staff/testFixtures';
import { ApiError } from '@/services/api/client';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import AutomationsPage, { FEATURE_TOGGLES_LINK } from './AutomationsPage';

const adminSession = () => makeSession(makeMe('technical_admin'));
const routes = [{ path: '/admin/automacoes', element: <AutomationsPage /> }];
const rule = makeRule();

function automationsApi(extra: Parameters<typeof mockApi>[0] = {}, list = makeAutomationList()) {
  return mockApi({
    'GET /api/admin/automations': () => ({ data: list }),
    'GET /api/support/catalog': () => ({ data: makeCatalog() }),
    ...extra,
  });
}

describe('Automações', () => {
  it('lista regras com gatilho, condições (pelo nome da categoria), ação e execuções', async () => {
    automationsApi();
    renderRoutes(routes, { initialPath: '/admin/automacoes', session: adminSession() });
    const list = await screen.findByRole('list', { name: 'Regras de automação' });
    const item = within(list).getByRole('heading', { name: rule.name }).closest('li') as HTMLElement;
    expect(within(item).getByText('Novo chamado')).toBeInTheDocument();
    expect(await within(item).findByText('Categoria Financeiro')).toBeInTheDocument();
    expect(within(item).getByText('Avisar toda a equipe ASA')).toBeInTheDocument();
    expect(item).toHaveTextContent('Execuções: 3 aplicadas · 1 ignoradas · 0 com falha');
    expect(within(item).getByRole('switch', { name: `Regra “${rule.name}” ativa` })).toHaveAttribute('aria-checked', 'false');
    // nunca escreve para o aluno nem muda a situação do chamado
    expect(screen.getByText(/Nunca enviam mensagens a alunos e nunca mudam a situação de um chamado/)).toBeInTheDocument();
    expect(screen.queryByText('O motor de automações está desligado')).toBeNull();
  });

  it('motor desligado: avisa e aponta para Configurações → Recursos ativos', async () => {
    automationsApi({}, makeAutomationList({ engineEnabled: false }));
    renderRoutes(routes, { initialPath: '/admin/automacoes', session: adminSession() });
    expect(await screen.findByText('O motor de automações está desligado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configurações → Recursos ativos' })).toHaveAttribute('href', FEATURE_TOGGLES_LINK);
  });

  it('criar regra valida antes de enviar e cria desativada', async () => {
    const created = makeRule({ id: 'rule-2', name: 'Urgente quando estourar', trigger: 'sla_overdue', conditions: { categoryIds: ['academic'] }, action: 'raise_priority', actionParams: { priority: 'urgent' } });
    const { calls } = automationsApi({ 'POST /api/admin/automations': () => ({ status: 201, data: created }) });
    renderRoutes(routes, { initialPath: '/admin/automacoes', session: adminSession() });
    await userEvent.click(await screen.findByRole('button', { name: 'Nova regra' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova regra de automação' });
    expect(within(dialog).getByText(/A regra é criada desativada/)).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/^Nome/), 'Ur');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar regra desativada' }));
    expect(within(dialog).getByText('Dê um nome com pelo menos 3 caracteres.')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);

    await userEvent.type(within(dialog).getByLabelText(/^Nome/), 'gente quando estourar');
    await userEvent.click(within(dialog).getByRole('radio', { name: /^Prazo excedido/ }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Acadêmico' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: /^Elevar a prioridade/ }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Urgente' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar regra desativada' }));

    expect(await screen.findByText('Regra “Urgente quando estourar” criada desativada. Revise e ative quando estiver pronta.')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST')!.body).toEqual({
      name: 'Urgente quando estourar',
      description: null,
      trigger: 'sla_overdue',
      conditions: { categoryIds: ['academic'] },
      action: 'raise_priority',
      actionParams: { priority: 'urgent' },
      enabled: false,
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova regra de automação' })).toBeNull());
  });

  it('avisa quando o gatilho de abertura é combinado com aviso ao responsável (sempre ignorado)', async () => {
    automationsApi();
    renderRoutes(routes, { initialPath: '/admin/automacoes', session: adminSession() });
    await userEvent.click(await screen.findByRole('button', { name: 'Nova regra' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova regra de automação' });
    await userEvent.click(within(dialog).getByRole('radio', { name: /^Só o atendente responsável/ }));
    expect(within(dialog).getByText(/o aviso ao responsável será sempre ignorado/)).toBeInTheDocument();
  });

  it('400 do servidor aparece no campo certo', async () => {
    automationsApi({
      'PATCH /api/admin/automations/rule-1': () => apiError(400, 'VALIDATION_ERROR', 'Regra inválida.', { details: [{ field: 'conditions.categoryIds', message: 'categoria desconhecida: financial' }] }),
    });
    renderRoutes(routes, { initialPath: '/admin/automacoes', session: adminSession() });
    await userEvent.click(await screen.findByRole('button', { name: `Editar regra “${rule.name}”` }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar regra' });
    expect(within(dialog).getByLabelText(/^Nome/)).toHaveValue(rule.name);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }));
    expect(await within(dialog).findByText('Categoria desconhecida: financial')).toBeInTheDocument();
    expect(within(dialog).getByText('Confira os campos destacados.')).toBeInTheDocument();
  });

  it('ativar pede confirmação explicando o efeito e envia só { enabled: true }', async () => {
    const { calls } = automationsApi({ 'PATCH /api/admin/automations/rule-1': ({ body }) => ({ data: { ...rule, ...(body as object) } }) });
    renderRoutes(routes, { initialPath: '/admin/automacoes', session: adminSession() });
    await userEvent.click(await screen.findByRole('switch', { name: `Regra “${rule.name}” ativa` }));
    const confirm = await screen.findByRole('dialog', { name: 'Ativar regra?' });
    expect(confirm).toHaveTextContent('A partir de agora, quando um chamado é aberto (categoria Financeiro), a regra vai avisar toda a equipe ASA.');
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Ativar' }));
    expect(await screen.findByText(`Regra “${rule.name}” ativada.`)).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PATCH')).toMatchObject({ path: '/api/admin/automations/rule-1', body: { enabled: true } });
  });

  it('com o motor desligado, a confirmação avisa que a regra ainda não vai rodar', async () => {
    automationsApi({}, makeAutomationList({ engineEnabled: false }));
    renderRoutes(routes, { initialPath: '/admin/automacoes', session: adminSession() });
    await userEvent.click(await screen.findByRole('switch', { name: `Regra “${rule.name}” ativa` }));
    const confirm = await screen.findByRole('dialog', { name: 'Ativar regra?' });
    expect(confirm).toHaveTextContent('o motor de automações está desligado em Configurações');
  });

  it('histórico mostra as execuções da regra', async () => {
    automationsApi({
      'GET /api/admin/automations/rule-1/runs': () => ({
        data: [
          { id: 'run-1', ticketProtocol: 'ASA-2026-00099', trigger: 'ticket_created', status: 'applied', detail: 'Aviso para 3 pessoa(s) da equipe.', createdAt: '2026-10-14T13:00:00.000Z' },
          { id: 'run-2', ticketProtocol: 'ASA-2026-00100', trigger: 'ticket_created', status: 'skipped', detail: 'Nenhuma pessoa ativa na equipe.', createdAt: '2026-10-14T12:00:00.000Z' },
        ],
      }),
    });
    renderRoutes(routes, { initialPath: '/admin/automacoes', session: adminSession() });
    await userEvent.click(await screen.findByRole('button', { name: `Histórico da regra “${rule.name}”` }));
    const dialog = await screen.findByRole('dialog', { name: 'Histórico de execuções' });
    const runs = await within(dialog).findByRole('list', { name: 'Execuções da regra' });
    expect(within(runs).getByText('ASA-2026-00099').closest('li')).toHaveTextContent('Aplicada');
    expect(within(runs).getByText('ASA-2026-00100').closest('li')).toHaveTextContent('Ignorada');
    expect(within(runs).getByText(/Aviso para 3 pessoa\(s\) da equipe\./)).toBeInTheDocument();
  });

  it('sem catálogo, as categorias aparecem pelo código', async () => {
    automationsApi({ 'GET /api/support/catalog': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Acesso não autorizado a este recurso.' } }) });
    renderRoutes(routes, { initialPath: '/admin/automacoes', session: adminSession() });
    expect(await screen.findByText('Categoria financial')).toBeInTheDocument();
    expect(screen.getByText(/as categorias aparecem pelo código/)).toBeInTheDocument();
  });

  it('503 database_required explica que depende do banco', async () => {
    mockApi({ 'GET /api/admin/automations': () => apiError(503, 'DEPENDENCY_ERROR', 'A administração exige o banco de dados PostgreSQL.', { reason: 'database_required' }) });
    renderRoutes(routes, { initialPath: '/admin/automacoes', session: adminSession() });
    expect(await screen.findByText('Indisponível neste ambiente')).toBeInTheDocument();
  });

  it('403 mostra acesso não permitido', async () => {
    mockApi({ 'GET /api/admin/automations': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Acesso não autorizado a este recurso.' } }) });
    renderRoutes(routes, { initialPath: '/admin/automacoes', session: adminSession() });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
  });

  it('textos e erros de campo das regras', () => {
    expect(joinOr(['A', 'B', 'C'])).toBe('A, B ou C');
    expect(describeConditions({ priorities: ['high', 'urgent'] }, (id) => id)).toBe('Prioridade alta ou urgente');
    expect(describeConditions({}, (id) => id)).toBe('Qualquer chamado');
    const error = new ApiError('validation', 'Regra inválida.', { status: 400, details: [{ field: 'actionParams.priority', message: 'alta ou urgente' }] });
    expect(ruleErrorsFrom(error)).toEqual({ priority: 'Alta ou urgente' });
  });
});
