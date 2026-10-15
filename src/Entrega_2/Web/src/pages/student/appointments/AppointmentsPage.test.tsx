import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAppointment, makeCatalog, makeSlot, makeSlotList } from '@/features/appointments/testFixtures';
import { mockApi, renderRoutes } from '@/test/utils';
import type { Appointment } from '@/types/api';
import AppointmentsPage from './AppointmentsPage';

const routes = [{ path: '/aluno/agendamentos', element: <AppointmentsPage /> }];

const upcoming = makeAppointment();
const locked = makeAppointment({ id: 'appt-2', protocol: 'AGD-2026-00013', startsAt: '2026-10-15T20:00:00.000Z', endsAt: '2026-10-15T20:30:00.000Z', canCancel: false, canReschedule: false, changeDeadline: '2026-10-15T18:00:00.000Z' });
const done = makeAppointment({
  id: 'appt-0',
  protocol: 'AGD-2026-00003',
  status: 'completed',
  topicLabel: 'Documentos',
  startsAt: '2026-10-01T13:00:00.000Z',
  endsAt: '2026-10-01T13:30:00.000Z',
  canCancel: false,
  canReschedule: false,
  changeDeadline: null,
});

function listRoutes(extra: Record<string, Parameters<typeof mockApi>[0][string]> = {}) {
  return mockApi({
    'GET /api/appointments': ({ url }) => ({ data: { items: url.searchParams.get('scope') === 'past' ? [done] : [upcoming, locked] } }),
    'GET /api/appointments/catalog': () => ({ data: makeCatalog() }),
    'GET /api/appointments/appt-1': () => ({ data: upcoming }),
    'GET /api/appointments/appt-2': () => ({ data: locked }),
    ...extra,
  });
}

describe('Agendamentos do aluno', () => {
  // "agora" fixo: quinta-feira, 15/10/2026, 09:00 em São Paulo (o ano e o "hoje" exibidos dependem do relógio)
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lista próximos e histórico com data/hora em São Paulo, situação e protocolo', async () => {
    listRoutes();
    renderRoutes(routes, { initialPath: '/aluno/agendamentos' });
    const next = await screen.findByRole('list', { name: 'Próximos agendamentos' });
    const first = within(next).getAllByRole('link')[0]!;
    expect(first).toHaveAttribute('href', '/aluno/agendamentos?agendamento=appt-1');
    expect(first).toHaveTextContent('Ter., 20 de out. · 10:00–10:30');
    expect(first).toHaveTextContent('Matrícula · Presencial · Sala 3 — Prédio ASA');
    expect(first).toHaveTextContent('Agendado');
    expect(first).toHaveTextContent('AGD-2026-00012');
    const history = await screen.findByRole('list', { name: 'Histórico de agendamentos' });
    expect(within(history).getByRole('link')).toHaveTextContent('Realizado');
    expect(screen.getByRole('link', { name: 'Agendar atendimento' })).toHaveAttribute('href', '/aluno/agendamentos/novo');
  });

  it('detalhes via ?agendamento=: cancelar e remarcar seguem canCancel/canReschedule e o .ics aponta para a API', async () => {
    listRoutes();
    renderRoutes(routes, { initialPath: '/aluno/agendamentos?agendamento=appt-1' });
    const dialog = await screen.findByRole('dialog', { name: 'Matrícula' });
    expect(await within(dialog).findByText('AGD-2026-00012')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancelar agendamento' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Remarcar' })).toBeEnabled();
    expect(within(dialog).getByText(/Você pode cancelar ou remarcar pelo portal ou pelo app até 20\/10\/2026 às 08:00/)).toBeInTheDocument();
    const ics = within(dialog).getByRole('link', { name: /Adicionar à agenda \(\.ics\)/ });
    expect(ics).toHaveAttribute('href', '/api/appointments/appt-1/calendar.ics');
    expect(ics).toHaveAttribute('download');
    expect(within(dialog).getByRole('list', { name: 'Histórico do agendamento' })).toHaveTextContent('Atendimento agendado');
  });

  it('sem canCancel/canReschedule as ações somem e o prazo encerrado é explicado', async () => {
    listRoutes();
    renderRoutes(routes, { initialPath: '/aluno/agendamentos?agendamento=appt-2' });
    const dialog = await screen.findByRole('dialog', { name: 'Matrícula' });
    expect(await within(dialog).findByText(/O prazo para cancelar ou remarcar pelo portal terminou em 15\/10\/2026 às 15:00/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Cancelar agendamento' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Remarcar' })).toBeNull();
    // continua ativo: o arquivo de agenda segue disponível
    expect(within(dialog).getByRole('link', { name: /Adicionar à agenda/ })).toHaveAttribute('href', '/api/appointments/appt-2/calendar.ics');
  });

  it('cancelar pede confirmação, aceita motivo opcional e envia para a API', async () => {
    const cancelled: Appointment = { ...upcoming, status: 'cancelled', cancelledBy: 'student', cancelReason: 'Tenho prova nesse horário', canCancel: false, canReschedule: false, changeDeadline: null };
    const { calls } = listRoutes({ 'POST /api/appointments/appt-1/cancel': () => ({ data: cancelled }) });
    renderRoutes(routes, { initialPath: '/aluno/agendamentos?agendamento=appt-1' });
    const drawer = await screen.findByRole('dialog', { name: 'Matrícula' });
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Cancelar agendamento' }));
    const confirm = await screen.findByRole('dialog', { name: 'Cancelar este agendamento?' });
    expect(within(confirm).getByText(/Cancelamentos pelo portal valem até 20\/10\/2026 às 08:00/)).toBeInTheDocument();
    await userEvent.type(within(confirm).getByLabelText('Motivo (opcional)'), 'Tenho prova nesse horário');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancelar agendamento' }));
    expect(await screen.findByText('Agendamento AGD-2026-00012 cancelado. O horário foi liberado.')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST')).toMatchObject({ path: '/api/appointments/appt-1/cancel', body: { reason: 'Tenho prova nesse horário' } });
    await waitFor(() => expect(within(drawer).queryByRole('button', { name: 'Cancelar agendamento' })).toBeNull());
    expect(within(drawer).getByText('Cancelado por você: Tenho prova nesse horário')).toBeInTheDocument();
  });

  it('remarcar reaproveita a grade de horários e abre o NOVO agendamento devolvido pela API', async () => {
    const created = makeAppointment({ id: 'appt-9', protocol: 'AGD-2026-00050', startsAt: '2026-10-16T12:30:00.000Z', endsAt: '2026-10-16T13:00:00.000Z', rescheduledFromId: 'appt-1' });
    const { calls, fetchMock } = listRoutes({
      'GET /api/appointments/slots': () => ({ data: makeSlotList() }),
      'POST /api/appointments/appt-1/reschedule': () => ({ data: created }),
      'GET /api/appointments/appt-9': () => ({ data: created }),
    });
    const { router } = renderRoutes(routes, { initialPath: '/aluno/agendamentos?agendamento=appt-1' });
    const drawer = await screen.findByRole('dialog', { name: 'Matrícula' });
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Remarcar' }));
    const picker = await screen.findByRole('dialog', { name: 'Remarcar atendimento' });
    expect(within(picker).getByRole('button', { name: 'Confirmar remarcação' })).toBeDisabled();
    await userEvent.click(await within(picker).findByRole('button', { name: /09:30–10:00/ }));
    await userEvent.click(within(picker).getByRole('button', { name: 'Confirmar remarcação' }));

    await waitFor(() => expect(router.state.location.search).toBe('?agendamento=appt-9'));
    expect(await screen.findByText(/Atendimento remarcado para sexta-feira, 16 de outubro às 09:30. Novo protocolo: AGD-2026-00050./)).toBeInTheDocument();
    const post = calls.find((call) => call.method === 'POST')!;
    expect(post.path).toBe('/api/appointments/appt-1/reschedule');
    expect(post.body).toEqual({ clientRequestId: expect.stringMatching(/^[A-Za-z0-9._:-]{8,128}$/), startsAt: '2026-10-16T12:30:00.000Z', mode: 'presencial', location: 'Sala 3 — Prédio ASA' });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('remarcar: o horário atual e o mesmo horário em outro local ficam desabilitados (o servidor recusa ambos)', async () => {
    listRoutes({
      'GET /api/appointments/slots': () => ({
        data: makeSlotList({ extra: { '2026-10-20': [makeSlot('2026-10-20T13:00:00.000Z'), makeSlot('2026-10-20T13:00:00.000Z', 30, 'Sala 7 — Bloco B'), makeSlot('2026-10-20T13:30:00.000Z')] } }),
      }),
    });
    renderRoutes(routes, { initialPath: '/aluno/agendamentos?agendamento=appt-1' });
    const drawer = await screen.findByRole('dialog', { name: 'Matrícula' });
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Remarcar' }));
    const picker = await screen.findByRole('dialog', { name: 'Remarcar atendimento' });
    await userEvent.click(await within(picker).findByRole('button', { name: 'terça-feira, 20 de outubro: 3 horários livres' }));
    expect(within(picker).getByRole('button', { name: /^10:00–10:30\s*Horário atual$/ })).toBeDisabled();
    expect(within(picker).getByRole('button', { name: /^10:00–10:30\s*Sala 7 — Bloco B · mesmo horário do atual$/ })).toBeDisabled();
    expect(within(picker).getByRole('button', { name: /^10:30–11:00\s*Sala 3 — Prédio ASA$/ })).toBeEnabled();
  });

  it('agendamento remarcado mostra "Remarcado para …" com o novo horário e abre o substituto', async () => {
    const old = makeAppointment({ id: 'appt-old', protocol: 'AGD-2026-00011', status: 'cancelled', cancelledBy: 'student', cancelReason: 'Remarcado pelo aluno', canCancel: false, canReschedule: false, changeDeadline: null, rescheduledToId: 'appt-9' });
    const created = makeAppointment({ id: 'appt-9', protocol: 'AGD-2026-00050', startsAt: '2026-10-16T12:30:00.000Z', endsAt: '2026-10-16T13:00:00.000Z', rescheduledFromId: 'appt-old' });
    listRoutes({ 'GET /api/appointments/appt-old': () => ({ data: old }), 'GET /api/appointments/appt-9': () => ({ data: created }) });
    const { router } = renderRoutes(routes, { initialPath: '/aluno/agendamentos?agendamento=appt-old' });
    const drawer = await screen.findByRole('dialog', { name: 'Matrícula' });
    expect(await within(drawer).findByText('Remarcado')).toBeInTheDocument();
    const forward = await within(drawer).findByRole('link', { name: 'Remarcado para sexta-feira, 16 de outubro, 09:30–10:00' });
    expect(forward).toHaveAttribute('href', '/aluno/agendamentos?agendamento=appt-9');
    // remarcação não é um cancelamento comum: sem o bloco "Cancelamento"
    expect(within(drawer).queryByText(/Cancelado por você/)).toBeNull();
    await userEvent.click(forward);
    await waitFor(() => expect(router.state.location.search).toBe('?agendamento=appt-9'));
    expect(await within(drawer).findByText('AGD-2026-00050')).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: 'Ver o horário anterior' })).toHaveAttribute('href', '/aluno/agendamentos?agendamento=appt-old');
  });

  it('recurso desligado ou sem banco: explica em vez de mostrar listas vazias', async () => {
    mockApi({ 'GET /api/appointments': () => ({ status: 503, error: { code: 'DEPENDENCY_ERROR', message: 'Agendamentos exigem o banco de dados PostgreSQL.', reason: 'database_required' } }) });
    renderRoutes(routes, { initialPath: '/aluno/agendamentos' });
    expect(await screen.findByText('Agendamentos indisponíveis neste ambiente')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Agendar atendimento' })).toBeNull();
  });
});
