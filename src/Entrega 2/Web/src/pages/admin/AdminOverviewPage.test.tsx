import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, makeOverview } from '@/features/admin/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import AdminOverviewPage, { ACTIVE_TICKETS_LINK, securityLinks } from './AdminOverviewPage';

const adminSession = () => makeSession(makeMe('technical_admin'));
const routes = [{ path: '/admin', element: <AdminOverviewPage /> }];

const overview = makeOverview({
  users: { students: 120, staff: 6, admins: 1, inactive: 3, activeSessions: 41 },
  tickets: { open: 21, slaOverdue: 4, slaNearDeadline: 2, unassigned: 7 },
  appointmentsToday: 5,
  security: { failedLogins24h: 9, deniedAccess24h: 11 },
});

/** Valor exibido logo abaixo do rótulo do indicador (<dt> → <dd>). */
const statValue = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

describe('Visão geral da administração', () => {
  it('mostra contas, contagens de atendimento, segurança, serviços, integrações e a origem dos dados', async () => {
    mockApi({
      'GET /api/admin/overview': () => ({ data: overview }),
      'GET /api/platform/info': () => ({ data: { dataMode: 'demo', dataModeLabel: 'DEMONSTRAÇÃO — Dados fictícios' } }),
    });
    renderRoutes(routes, { initialPath: '/admin', session: adminSession() });

    expect(await screen.findByText('Alunos', { selector: 'dt' })).toBeInTheDocument();
    expect(statValue('Alunos')).toBe('120');
    expect(statValue('Equipe ASA')).toBe('6');
    expect(statValue('Administração')).toBe('1');
    expect(statValue('Contas inativas')).toBe('3');
    expect(statValue('Sessões ativas')).toBe('41');
    expect(statValue('Chamados em aberto')).toBe('21');
    expect(statValue('Prazo excedido')).toBe('4');
    expect(statValue('Prazo próximo')).toBe('2');
    expect(statValue('Sem atendente')).toBe('7');
    expect(statValue('Agendamentos hoje')).toBe('5');
    expect(statValue('Entradas recusadas')).toBe('9');
    expect(statValue('Acessos negados')).toBe('11');
    // só metadados: o conteúdo é da equipe ASA
    expect(screen.getByText(/ficam visíveis apenas para a equipe ASA/)).toBeInTheDocument();

    // segurança leva à auditoria já filtrada (desde o dia de 24 h antes da geração)
    expect(screen.getByRole('link', { name: 'Ver as entradas recusadas na auditoria' })).toHaveAttribute('href', '/admin/auditoria?action=auth.login_failed&from=2026-10-14');
    expect(screen.getByRole('link', { name: 'Ver os acessos negados na auditoria' })).toHaveAttribute('href', '/admin/auditoria?outcome=denied&from=2026-10-14');
    expect(decodeURIComponent(screen.getByRole('link', { name: 'Ver a lista de chamados em aberto (metadados)' }).getAttribute('href') ?? '')).toBe(ACTIVE_TICKETS_LINK);

    const services = screen.getByRole('region', { name: 'Serviços' });
    expect(within(services).getByText('Banco de dados (PostgreSQL)').closest('li')).toHaveTextContent('Funcionando');
    expect(within(services).getByText('Agent Service').closest('li')).toHaveTextContent('Fora do ar');
    expect(within(services).getByText('Fila presencial do ASA').closest('li')).toHaveTextContent('Desligado');
    expect(within(services).getByRole('link', { name: 'Ver saúde dos serviços' })).toHaveAttribute('href', '/admin/saude');

    const integrations = screen.getByRole('region', { name: 'Integrações' });
    expect(within(integrations).getByText('JEV (provedor de IA)').closest('li')).toHaveTextContent('Planejado');
    expect(within(integrations).getByText('E-mail (recuperação de senha e convites)').closest('li')).toHaveTextContent('Não configurado');
    expect(within(integrations).getByRole('link', { name: 'Ver detalhes das integrações' })).toHaveAttribute('href', '/admin/integracoes');

    expect(screen.getByText(/Fonte: Contas, sessões, chamados/)).toBeInTheDocument();
    expect(await screen.findByText('DEMONSTRAÇÃO — Dados fictícios')).toBeInTheDocument();
  });

  it('agendamentos indisponíveis aparecem como indisponíveis, sem número inventado', async () => {
    mockApi({ 'GET /api/admin/overview': () => ({ data: makeOverview({ appointmentsToday: null }) }) });
    renderRoutes(routes, { initialPath: '/admin', session: adminSession() });
    expect(await screen.findByText('Agendamentos hoje', { selector: 'dt' })).toBeInTheDocument();
    expect(statValue('Agendamentos hoje')).toBe('—');
    expect(screen.getByText(/Indisponível: agendamentos desligados ou sem banco de dados/)).toBeInTheDocument();
    // sem a informação da plataforma, o rótulo do modo vem da própria fonte dos números
    expect(screen.getByText('Modo demonstração: dados fictícios')).toBeInTheDocument();
  });

  it('securityLinks começa no dia de 24 h antes, no fuso da instituição', () => {
    // 02:00 UTC de 16/10 = 23:00 de 15/10 em São Paulo → 24 h antes = 14/10
    expect(securityLinks('2026-10-16T02:00:00.000Z').denied).toBe('/admin/auditoria?outcome=denied&from=2026-10-14');
  });

  it('erro do servidor mostra a falha com nova tentativa (sem dados falsos)', async () => {
    let attempts = 0;
    mockApi({
      'GET /api/admin/overview': () => {
        attempts += 1;
        return attempts === 1 ? { status: 500, error: { code: 'INTERNAL_ERROR', message: 'falha' } } : { data: overview };
      },
    });
    renderRoutes(routes, { initialPath: '/admin', session: adminSession() });
    expect(await screen.findByText('Não foi possível carregar a visão geral')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Alunos', { selector: 'dt' })).toBeInTheDocument();
  });

  it('403 mostra acesso não permitido', async () => {
    mockApi({ 'GET /api/admin/overview': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Acesso não autorizado a este recurso.' } }) });
    renderRoutes(routes, { initialPath: '/admin', session: adminSession() });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
  });

  it('503 database_required explica que o recurso depende do banco', async () => {
    mockApi({ 'GET /api/admin/overview': () => apiError(503, 'DEPENDENCY_ERROR', 'A administração exige o banco de dados PostgreSQL.', { reason: 'database_required' }) });
    renderRoutes(routes, { initialPath: '/admin', session: adminSession() });
    expect(await screen.findByText('Indisponível neste ambiente')).toBeInTheDocument();
    expect(screen.getByText(/depende do banco de dados PostgreSQL/)).toBeInTheDocument();
  });

  it('perfil sem permissão não consulta a API', async () => {
    const { calls } = mockApi({ 'GET /api/admin/overview': () => ({ data: overview }) });
    renderRoutes(routes, { initialPath: '/admin', session: makeSession(makeMe('institutional_staff')) });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
    expect(calls.some((call) => call.path.startsWith('/api/admin/'))).toBe(false);
  });
});
