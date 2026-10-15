import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { adminUser, makeAdminAuditEvent } from '@/features/admin/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import AuditPage, { filtersFromParams } from './AuditPage';

const adminSession = () => makeSession(makeMe('technical_admin'));
const routes = [{ path: '/admin/auditoria', element: <AuditPage /> }];
const auditCalls = (calls: Array<{ path: string }>) => calls.filter((call) => call.path.startsWith('/api/admin/audit-events'));

function auditApi() {
  return mockApi({
    'GET /api/admin/audit-events': ({ url }) => {
      const page = Number(url.searchParams.get('page') ?? '1');
      return {
        data: {
          items:
            page === 1
              ? [makeAdminAuditEvent(), makeAdminAuditEvent({ id: 'a-2', action: 'auth.login_failed', label: 'Tentativa de entrada recusada', outcome: 'failure', channel: 'mobile', actor: { userId: null, role: null, name: null }, resource: null, metadata: { reason: 'invalid_credentials' }, requestId: null })]
              : [makeAdminAuditEvent({ id: 'a-3', action: 'authz.denied', label: 'Acesso negado por permissão', outcome: 'denied' })],
          total: 30,
          page,
          pageSize: Number(url.searchParams.get('pageSize') ?? '25'),
        },
      };
    },
    'GET /api/admin/users/u-admin-2': () => ({ data: adminUser }),
  });
}

describe('Auditoria', () => {
  it('mostra quem, o quê, resultado, canal, recurso, detalhes e código de suporte', async () => {
    const { calls } = auditApi();
    renderRoutes(routes, { initialPath: '/admin/auditoria', session: adminSession() });
    const table = await screen.findByRole('table', { name: 'Registros da trilha de auditoria' });
    const first = within(table).getByText('Mudou o papel de uma conta').closest('tr') as HTMLElement;
    expect(within(first).getByRole('link', { name: 'Ver só os registros de Carla Administração' })).toHaveAttribute('href', '/admin/auditoria?actorUserId=u-admin-2');
    expect(within(first).getByText('user.role_changed')).toBeInTheDocument();
    expect(within(first).getByText('Concluída')).toBeInTheDocument();
    expect(within(first).getByText('Portal web')).toBeInTheDocument();
    expect(within(first).getByText('Conta')).toBeInTheDocument();
    expect(within(first).getByText('sessionsRevoked:')).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: 'Copiar código req-admin-1' })).toBeInTheDocument();
    const failed = within(table).getByText('Tentativa de entrada recusada').closest('tr') as HTMLElement;
    expect(within(failed).getByText('Não identificada')).toBeInTheDocument();
    expect(within(failed).getByText('Falhou')).toBeInTheDocument();
    expect(within(failed).getByText('Aplicativo')).toBeInTheDocument();
    expect(screen.getByText('30 registros')).toBeInTheDocument();
    expect(auditCalls(calls)[0]!.path).toBe('/api/admin/audit-events?page=1&pageSize=25');

    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(await within(table).findByText('Acesso negado por permissão')).toBeInTheDocument();
    expect(auditCalls(calls).at(-1)!.path).toBe('/api/admin/audit-events?page=2&pageSize=25');
  });

  it('filtros vindos da URL (ex.: link da visão geral) vão para a API e aparecem como etiquetas removíveis', async () => {
    const { calls } = auditApi();
    const { router } = renderRoutes(routes, { initialPath: '/admin/auditoria?outcome=denied&from=2026-10-14&actorUserId=u-admin-2', session: adminSession() });
    await screen.findByRole('table', { name: 'Registros da trilha de auditoria' });
    expect(auditCalls(calls)[0]!.path).toBe('/api/admin/audit-events?page=1&pageSize=25&outcome=denied&actorUserId=u-admin-2&from=2026-10-14');
    const chips = screen.getByRole('group', { name: 'Filtros aplicados' });
    expect(within(chips).getByText('Resultado: Negada')).toBeInTheDocument();
    expect(within(chips).getByText('De: 14/10/2026')).toBeInTheDocument();
    expect(await within(chips).findByText('Pessoa: Carla Administração')).toBeInTheDocument();
    expect(screen.getByLabelText('Resultado')).toHaveDisplayValue('Negada');

    await userEvent.click(within(chips).getByRole('button', { name: 'Remover filtro Resultado: Negada' }));
    expect(router.state.location.search).toBe('?actorUserId=u-admin-2&from=2026-10-14');
  });

  it('o formulário aplica ação, tipo de recurso, código e tamanho da página', async () => {
    const { calls } = auditApi();
    const { router } = renderRoutes(routes, { initialPath: '/admin/auditoria', session: adminSession() });
    await screen.findByRole('table', { name: 'Registros da trilha de auditoria' });
    await userEvent.selectOptions(screen.getByLabelText('Ação'), 'user.');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de recurso'), 'user');
    await userEvent.type(screen.getByLabelText('Código do recurso'), ' u-staff ');
    await userEvent.selectOptions(screen.getByLabelText('Registros por página'), '50');
    // nada muda até aplicar
    expect(router.state.location.search).toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    expect(router.state.location.search).toBe('?action=user.&resourceType=user&resourceId=u-staff&pageSize=50');
    await screen.findByRole('table', { name: 'Registros da trilha de auditoria' });
    expect(auditCalls(calls).at(-1)!.path).toBe('/api/admin/audit-events?page=1&pageSize=50&action=user.&resourceType=user&resourceId=u-staff');
  });

  it('período invertido não consulta a API', async () => {
    const { calls } = auditApi();
    renderRoutes(routes, { initialPath: '/admin/auditoria?from=2026-10-15&to=2026-10-01', session: adminSession() });
    expect(await screen.findByText('Período inválido')).toBeInTheDocument();
    expect(auditCalls(calls)).toHaveLength(0);
  });

  it('ignora valores inválidos na URL', () => {
    const filters = filtersFromParams(new URLSearchParams('outcome=talvez&from=2026-02-30&pageSize=7&action=auth.'));
    expect(filters).toMatchObject({ outcome: '', from: '', pageSize: '', action: 'auth.' });
  });

  it('403 mostra acesso não permitido', async () => {
    mockApi({ 'GET /api/admin/audit-events': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Acesso não autorizado a este recurso.' } }) });
    renderRoutes(routes, { initialPath: '/admin/auditoria', session: adminSession() });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
  });
});
