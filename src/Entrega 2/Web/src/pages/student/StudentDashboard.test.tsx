import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACADEMIC_UNAVAILABLE, makePendingItems, makePlatformInfo, makeSummary } from '@/features/academic/testing/fixtures';
import { makeAppointment } from '@/features/appointments/testFixtures';
import { mockApi, renderRoutes } from '@/test/utils';
import StudentDashboard from './StudentDashboard';

const routes = [{ path: '/aluno', element: <StudentDashboard /> }];

type Routes = Parameters<typeof mockApi>[0];

function dashboardRoutes(extra: Routes = {}) {
  return mockApi({
    'GET /api/platform/info': () => ({ data: makePlatformInfo() }),
    'GET /api/student/summary': () => ({ data: makeSummary() }),
    'GET /api/student/pending-items': () => ({ data: makePendingItems() }),
    'GET /api/support/overview': () => ({ data: { activeCount: 2, waitingStudentCount: 1, unreadMessagesCount: 0, unreadNotificationsCount: 3, highlight: null } }),
    'GET /api/notifications': () => ({
      data: {
        items: [{ id: 'n-1', category: 'support', kind: 'status_changed', title: 'Chamado atualizado', body: 'ASA-2026-00442 · Em análise.', resource: { type: 'ticket', id: 'ticket-1' }, createdAt: '2026-10-15T11:00:00.000Z', readAt: null }],
        unreadCount: 3,
      },
    }),
    'GET /api/appointments': () => ({ data: { items: [makeAppointment(), makeAppointment({ id: 'appt-2', startsAt: '2026-10-27T13:00:00.000Z', endsAt: '2026-10-27T13:30:00.000Z' })] } }),
    ...extra,
  });
}

describe('Início do aluno', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra o próximo atendimento (o primeiro da lista "upcoming"), avisos não lidos e chamados em andamento', async () => {
    const { calls } = dashboardRoutes();
    renderRoutes(routes, { initialPath: '/aluno' });

    const next = await screen.findByRole('region', { name: 'Próximo atendimento' });
    const link = await within(next).findByRole('link', { name: /Terça-feira, 20 de outubro/ });
    expect(link).toHaveAttribute('href', '/aluno/agendamentos?agendamento=appt-1');
    expect(link).toHaveTextContent('10:00–10:30 · Matrícula');
    expect(link).toHaveTextContent('Presencial · Sala 3 — Prédio ASA');
    expect(link).toHaveTextContent('Agendado');
    expect(within(next).queryByText(/27 de outubro/)).toBeNull();
    expect(calls.some((call) => call.path === '/api/appointments?scope=upcoming')).toBe(true);

    expect(await screen.findByText('3 avisos não lidos')).toBeInTheDocument();
    expect(await screen.findByText('2 chamados em andamento')).toBeInTheDocument();
    expect(screen.getByText('1 aguardando você')).toBeInTheDocument();
    const summary = await screen.findByRole('region', { name: 'Resumo acadêmico' });
    expect(within(summary).getByText('7,6')).toBeInTheDocument();
    expect(await screen.findByText('Entrega do trabalho prático de Banco de Dados')).toBeInTheDocument();
  });

  it('esconde o próximo atendimento quando os agendamentos estão desligados (403 feature_disabled)', async () => {
    dashboardRoutes({ 'GET /api/appointments': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Este recurso está desativado neste ambiente.', reason: 'feature_disabled' } }) });
    renderRoutes(routes, { initialPath: '/aluno' });
    expect(await screen.findByText('3 avisos não lidos')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Atendimento ASA' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Próximo atendimento' })).toBeNull();
    expect(screen.queryByText('Acesso não permitido')).toBeNull();
  });

  it('sem agendamento futuro oferece agendar; fonte acadêmica indisponível (503) mostra a mensagem do servidor', async () => {
    dashboardRoutes({
      'GET /api/appointments': () => ({ data: { items: [] } }),
      'GET /api/student/summary': () => ACADEMIC_UNAVAILABLE,
      'GET /api/student/pending-items': () => ACADEMIC_UNAVAILABLE,
    });
    renderRoutes(routes, { initialPath: '/aluno' });
    const next = await screen.findByRole('region', { name: 'Próximo atendimento' });
    expect(await within(next).findByRole('link', { name: 'Agendar atendimento' })).toHaveAttribute('href', '/aluno/agendamentos/novo');
    expect(await screen.findByText('Dados acadêmicos indisponíveis')).toBeInTheDocument();
    expect(screen.getByText(/nenhuma fonte institucional configurada/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Pendências' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Agente para o Estudante' })).toBeNull();
  });
});
