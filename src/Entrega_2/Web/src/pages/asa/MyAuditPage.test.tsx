import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeAuditEvent } from '@/features/support/staff/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import MyAuditPage from './MyAuditPage';

const staffSession = () => makeSession(makeMe('institutional_staff'));
const routes = [{ path: '/asa/auditoria', element: <MyAuditPage /> }];

describe('Minha auditoria', () => {
  it('mostra rótulos, resultado, canal e código de suporte, e pagina no servidor', async () => {
    const { calls } = mockApi({
      'GET /api/audit/mine': ({ url }) => {
        const page = Number(url.searchParams.get('page') ?? '1');
        return {
          data: {
            items:
              page === 1
                ? [makeAuditEvent(), makeAuditEvent({ id: 'a-2', action: 'auth.login_failed', label: 'Tentativa de entrada recusada', outcome: 'failure', channel: 'mobile', resource: null, requestId: null })]
                : [makeAuditEvent({ id: 'a-3', action: 'student_context.viewed', label: 'Consultou o contexto de atendimento de um aluno', resource: { type: 'student', id: 'student-1' } })],
            total: 27,
            page,
            pageSize: 25,
          },
        };
      },
    });
    renderRoutes(routes, { initialPath: '/asa/auditoria', session: staffSession() });
    const table = await screen.findByRole('table', { name: 'Minhas ações registradas na auditoria' });
    expect(within(table).getByText('Mudou a situação de um chamado')).toBeInTheDocument();
    expect(within(table).getByText('Tentativa de entrada recusada')).toBeInTheDocument();
    expect(within(table).getByText('Concluída')).toBeInTheDocument();
    expect(within(table).getByText('Falhou')).toBeInTheDocument();
    expect(within(table).getByText('Aplicativo')).toBeInTheDocument();
    expect(within(table).getByText('req-abc-123')).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Copiar código req-abc-123' })).toBeInTheDocument();
    expect(screen.getByText('1–25 de 27')).toBeInTheDocument();
    expect(calls[0]!.path).toBe('/api/audit/mine?page=1&pageSize=25');

    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(await screen.findByText('Consultou o contexto de atendimento de um aluno')).toBeInTheDocument();
    expect(calls.at(-1)!.path).toBe('/api/audit/mine?page=2&pageSize=25');
  });

  it('filtra por tipo de ação e período (AAAA-MM-DD) e volta à primeira página', async () => {
    const { calls } = mockApi({ 'GET /api/audit/mine': () => ({ data: { items: [makeAuditEvent()], total: 1, page: 1, pageSize: 25 } }) });
    const { router } = renderRoutes(routes, { initialPath: '/asa/auditoria?de=2026-10-01&ate=2026-10-15&pagina=3', session: staffSession() });
    await screen.findByRole('table', { name: 'Minhas ações registradas na auditoria' });
    expect(calls[0]!.path).toBe('/api/audit/mine?page=3&pageSize=25&from=2026-10-01&to=2026-10-15');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de ação'), 'ticket.');
    expect(router.state.location.search).toBe('?de=2026-10-01&ate=2026-10-15&acao=ticket.');
    await screen.findByRole('table', { name: 'Minhas ações registradas na auditoria' });
    expect(calls.at(-1)!.path).toBe('/api/audit/mine?page=1&pageSize=25&action=ticket.&from=2026-10-01&to=2026-10-15');
  });

  it('período invertido não consulta a API', async () => {
    const { calls } = mockApi({ 'GET /api/audit/mine': () => ({ data: { items: [], total: 0, page: 1, pageSize: 25 } }) });
    renderRoutes(routes, { initialPath: '/asa/auditoria?de=2026-10-15&ate=2026-10-01', session: staffSession() });
    expect(await screen.findByText('Período inválido')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
