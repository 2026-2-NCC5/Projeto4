import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { INTEGRATION_STATE_META, INTEGRATION_STATE_ORDER } from '@/features/admin/labels';
import { makeIntegrations } from '@/features/admin/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import IntegrationsPage from './IntegrationsPage';

const adminSession = () => makeSession(makeMe('technical_admin'));
const routes = [{ path: '/admin/integracoes', element: <IntegrationsPage /> }];

const itemIn = (list: HTMLElement, name: string) => within(list).getByRole('heading', { name, level: 3 }).closest('li') as HTMLElement;

describe('Integrações', () => {
  it('mostra o estado de cada integração com explicação, detalhe e só os NOMES das variáveis de ambiente', async () => {
    mockApi({ 'GET /api/admin/integrations': () => ({ data: makeIntegrations() }) });
    renderRoutes(routes, { initialPath: '/admin/integracoes', session: adminSession() });

    const current = await screen.findByRole('list', { name: 'Integrações deste ambiente' });
    const agent = itemIn(current, 'Agent Service (Agente para o Estudante)');
    expect(within(agent).getByText('Operacional', { selector: 'span' })).toBeInTheDocument();
    expect(within(agent).getByText('Respondendo ao /health.')).toBeInTheDocument();
    expect(within(agent).getByText(INTEGRATION_STATE_META.operational.explanation)).toBeInTheDocument();
    expect(within(agent).getByText('AGENT_SERVICE_URL')).toBeInTheDocument();
    expect(within(agent).getByText('AGENT_SERVICE_TIMEOUT_MS')).toBeInTheDocument();

    const email = itemIn(current, 'E-mail (recuperação de senha e convites)');
    expect(within(email).getByText('Não configurado', { selector: 'span' })).toBeInTheDocument();
    expect(within(email).getByText(/MAIL_TRANSPORT=disabled/)).toBeInTheDocument();

    // JEV e SSO: planejadas, separadas e sem sugerir que funcionam
    const planned = screen.getByRole('list', { name: 'Integrações planejadas' });
    expect(within(itemIn(planned, 'JEV (provedor de IA)')).getByText('Planejado', { selector: 'span' })).toBeInTheDocument();
    const sso = itemIn(planned, 'Login institucional (SSO/OIDC da FECAP)');
    expect(within(sso).getByText('Planejado', { selector: 'span' })).toBeInTheDocument();
    expect(within(sso).getByText(/Nenhuma ainda: depende de credenciais/)).toBeInTheDocument();
    expect(within(current).queryByText('JEV (provedor de IA)')).toBeNull();
    expect(screen.getByText(/Ainda não funcionam/)).toBeInTheDocument();
    expect(screen.getByText(/Verificado às/)).toBeInTheDocument();
  });

  it('a legenda explica todos os estados', async () => {
    mockApi({ 'GET /api/admin/integrations': () => ({ data: makeIntegrations() }) });
    renderRoutes(routes, { initialPath: '/admin/integracoes', session: adminSession() });
    await userEvent.click(await screen.findByText('O que significa cada estado'));
    for (const state of INTEGRATION_STATE_ORDER) {
      expect(screen.getAllByText(INTEGRATION_STATE_META[state].explanation).length).toBeGreaterThan(0);
    }
  });

  it('erro na verificação mostra a falha com nova tentativa', async () => {
    mockApi({ 'GET /api/admin/integrations': () => ({ status: 502, error: { code: 'CONTRACT_ERROR', message: 'falha' } }) });
    renderRoutes(routes, { initialPath: '/admin/integracoes', session: adminSession() });
    expect(await screen.findByText('Não foi possível verificar as integrações')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('403 mostra acesso não permitido', async () => {
    mockApi({ 'GET /api/admin/integrations': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Acesso não autorizado a este recurso.' } }) });
    renderRoutes(routes, { initialPath: '/admin/integracoes', session: adminSession() });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
  });
});
