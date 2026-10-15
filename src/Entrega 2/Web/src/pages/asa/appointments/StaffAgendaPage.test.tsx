import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStaffAppointment, makeStaffList } from '@/features/appointments/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import type { StaffAppointment } from '@/types/api';
import StaffAgendaPage from './StaffAgendaPage';

const routes = [{ path: '/asa/agendamentos', element: <StaffAgendaPage /> }];
const staffSession = () => makeSession(makeMe('institutional_staff'));

// "agora" = quinta-feira, 15/10/2026, 12:00 em São Paulo (15:00 UTC); semana exibida: 12 a 18/10
const NOW = new Date('2026-10-15T15:00:00.000Z');

/** sexta 16/10, 10:00 (SP): ainda não começou */
const future = makeStaffAppointment({ id: 'a-future', protocol: 'AGD-2026-00020', status: 'scheduled', startsAt: '2026-10-16T13:00:00.000Z', endsAt: '2026-10-16T13:30:00.000Z' });
/** quinta 15/10, 11:30–12:00 (SP): já começou e terminou agora */
const started = makeStaffAppointment({
  id: 'a-started',
  protocol: 'AGD-2026-00021',
  status: 'confirmed',
  startsAt: '2026-10-15T14:30:00.000Z',
  endsAt: '2026-10-15T15:00:00.000Z',
  student: { id: 'student-2', fullName: 'João Lima', registrationNumber: '2026002' },
});
/** quarta 14/10: concluído */
const finished = makeStaffAppointment({
  id: 'a-done',
  protocol: 'AGD-2026-00019',
  status: 'completed',
  startsAt: '2026-10-14T17:00:00.000Z',
  endsAt: '2026-10-14T17:30:00.000Z',
  student: { id: 'student-3', fullName: 'Ana Prado', registrationNumber: '2026003' },
});
const all = [finished, started, future];

function agendaApi(extra: Record<string, Parameters<typeof mockApi>[0][string]> = {}) {
  const byId = new Map<string, StaffAppointment>(all.map((item) => [item.id, item]));
  return mockApi({
    'GET /api/asa/appointments': () => ({ data: makeStaffList(all) }),
    ...Object.fromEntries([...byId].map(([id, item]) => [`GET /api/asa/appointments/${id}`, () => ({ data: item })])),
    ...extra,
  });
}

describe('Agenda do ASA', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('busca a semana atual (segunda a domingo), agrupa por dia e mostra as contagens do servidor', async () => {
    const { calls } = agendaApi();
    renderRoutes(routes, { initialPath: '/asa/agendamentos', session: staffSession() });
    const today = await screen.findByRole('list', { name: 'Agendamentos de quinta-feira, 15 de outubro' });
    expect(calls[0]!.path).toBe('/api/asa/appointments?from=2026-10-12&to=2026-10-18');
    expect(screen.getByText('12 a 18 de outubro de 2026')).toBeInTheDocument();
    const row = within(today).getByRole('link');
    expect(row).toHaveTextContent('11:30–12:00 · João Lima');
    expect(row).toHaveTextContent('RA 2026002 · Matrícula · Presencial · Sala 3 — Prédio ASA');
    expect(row).toHaveTextContent('Atendente: Atendente ASA');
    expect(row).toHaveTextContent('Confirmado');
    expect(row).toHaveAttribute('href', '/asa/agendamentos?agendamento=a-started');
    expect(screen.getByRole('heading', { name: /Quinta-feira, 15 de outubro\s*Hoje/ })).toBeInTheDocument();
    expect(screen.getByText('3 agendamentos na semana.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmados\s*1/ })).toHaveAttribute('aria-pressed', 'false');

    // filtro por situação (local) e "Só os meus" (servidor)
    await userEvent.click(screen.getByRole('button', { name: /Realizados\s*1/ }));
    expect(screen.queryByRole('list', { name: 'Agendamentos de quinta-feira, 15 de outubro' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Agendamentos de quarta-feira, 14 de outubro' })).toHaveTextContent('Ana Prado');
    await userEvent.click(screen.getByRole('button', { name: 'Só os meus' }));
    await waitFor(() => expect(calls.some((call) => call.path === '/api/asa/appointments?from=2026-10-12&to=2026-10-18&attendant=mine')).toBe(true));

    await userEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    await waitFor(() => expect(calls.some((call) => call.path.startsWith('/api/asa/appointments?from=2026-10-19&to=2026-10-25'))).toBe(true));
  });

  it('ações seguem a situação e o horário: confirmar antes do fim, concluir/ausência só depois do início, encerrado não muda', async () => {
    agendaApi();
    const { router } = renderRoutes(routes, { initialPath: '/asa/agendamentos?agendamento=a-future', session: staffSession() });
    let dialog = await screen.findByRole('dialog', { name: 'Maria Souza' });
    expect(await within(dialog).findByRole('button', { name: 'Confirmar' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Concluir' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Registrar ausência' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeEnabled();
    expect(within(dialog).getByText(/Concluir e registrar ausência ficam disponíveis a partir do início do horário \(16\/10\/2026 às 10:00\)/)).toBeInTheDocument();

    await router.navigate('/asa/agendamentos?agendamento=a-started');
    dialog = await screen.findByRole('dialog', { name: 'João Lima' });
    expect(await within(dialog).findByRole('button', { name: 'Concluir' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Registrar ausência' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeEnabled();

    await router.navigate('/asa/agendamentos?agendamento=a-done');
    dialog = await screen.findByRole('dialog', { name: 'Ana Prado' });
    for (const name of ['Confirmar', 'Concluir', 'Registrar ausência', 'Cancelar']) expect(await within(dialog).findByRole('button', { name })).toBeDisabled();
    expect(within(dialog).getByText(/Atendimento encerrado \(realizado\): a situação não pode mais ser alterada/)).toBeInTheDocument();
  });

  it('cancelar exige motivo de pelo menos 5 caracteres e envia o motivo para a API', async () => {
    const cancelled = makeStaffAppointment({ ...future, status: 'cancelled', cancelledBy: 'staff', cancelReason: 'Atendente em reunião', canCancel: false });
    const { calls } = agendaApi({ 'PATCH /api/asa/appointments/a-future': () => ({ data: cancelled }) });
    renderRoutes(routes, { initialPath: '/asa/agendamentos?agendamento=a-future', session: staffSession() });
    const drawer = await screen.findByRole('dialog', { name: 'Maria Souza' });
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Cancelar' }));
    const confirm = await screen.findByRole('dialog', { name: 'Cancelar este agendamento?' });
    const submit = within(confirm).getByRole('button', { name: 'Cancelar agendamento' });
    expect(submit).toBeDisabled();
    const reason = within(confirm).getByLabelText(/Motivo do cancelamento/);
    await userEvent.type(reason, 'Ate');
    expect(submit).toBeDisabled();
    await userEvent.type(reason, 'ndente em reunião');
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(await screen.findByText('Agendamento cancelado. O aluno recebeu o aviso com o motivo.')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PATCH')).toMatchObject({ path: '/api/asa/appointments/a-future', body: { status: 'cancelled', reason: 'Atendente em reunião' } });
    await waitFor(() => expect(within(drawer).getByText('Cancelado pela equipe: Atendente em reunião')).toBeInTheDocument());
  });

  it('409 ao confirmar: recarrega o agendamento e explica o motivo', async () => {
    let detailRequests = 0;
    agendaApi({
      'GET /api/asa/appointments/a-future': () => {
        detailRequests += 1;
        return { data: detailRequests === 1 ? future : { ...future, status: 'cancelled', cancelledBy: 'student', cancelReason: null, canCancel: false } };
      },
      'PATCH /api/asa/appointments/a-future': () => ({ status: 409, error: { code: 'CONFLICT', message: 'Este agendamento já foi encerrado.', reason: 'appointment_not_active' } }),
    });
    renderRoutes(routes, { initialPath: '/asa/agendamentos?agendamento=a-future', session: staffSession() });
    const drawer = await screen.findByRole('dialog', { name: 'Maria Souza' });
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Confirmar' }));
    expect(await within(drawer).findByText(/Este agendamento já foi encerrado. Os dados foram recarregados/)).toBeInTheDocument();
    await waitFor(() => expect(detailRequests).toBe(2));
    await waitFor(() => expect(within(drawer).getByRole('button', { name: 'Confirmar' })).toBeDisabled());
    expect(within(drawer).getByText('Cancelado pelo aluno.')).toBeInTheDocument();
  });

  it('anotação interna é salva com PATCH staffNotes', async () => {
    const { calls } = agendaApi({ 'PATCH /api/asa/appointments/a-future': ({ body }) => ({ data: { ...future, staffNotes: (body as { staffNotes: string }).staffNotes } }) });
    renderRoutes(routes, { initialPath: '/asa/agendamentos?agendamento=a-future', session: staffSession() });
    const drawer = await screen.findByRole('dialog', { name: 'Maria Souza' });
    const save = await within(drawer).findByRole('button', { name: 'Salvar anotação' });
    expect(save).toBeDisabled();
    await userEvent.type(within(drawer).getByLabelText('Anotação interna'), 'Levar histórico impresso');
    await userEvent.click(save);
    expect(await screen.findByText('Anotação interna salva.')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PATCH')).toMatchObject({ body: { staffNotes: 'Levar histórico impresso' } });
  });

  it('remarcado: link para o substituto mantém a semana e os filtros no endereço', async () => {
    const replacement = makeStaffAppointment({ id: 'a-new', protocol: 'AGD-2026-00030', startsAt: '2026-10-16T17:00:00.000Z', endsAt: '2026-10-16T17:30:00.000Z', rescheduledFromId: 'a-old' });
    const old = makeStaffAppointment({ id: 'a-old', protocol: 'AGD-2026-00029', status: 'cancelled', cancelledBy: 'student', cancelReason: 'Remarcado pelo aluno', canCancel: false, rescheduledToId: 'a-new' });
    agendaApi({ 'GET /api/asa/appointments/a-old': () => ({ data: old }), 'GET /api/asa/appointments/a-new': () => ({ data: replacement }) });
    renderRoutes(routes, { initialPath: '/asa/agendamentos?semana=2026-10-12&meus=1&agendamento=a-old', session: staffSession() });
    const drawer = await screen.findByRole('dialog', { name: 'Maria Souza' });
    const forward = await within(drawer).findByRole('link', { name: 'Remarcado para sexta-feira, 16 de outubro, 14:00–14:30' });
    expect(forward).toHaveAttribute('href', '/asa/agendamentos?semana=2026-10-12&meus=1&agendamento=a-new');
    for (const name of ['Confirmar', 'Concluir', 'Registrar ausência', 'Cancelar']) expect(within(drawer).getByRole('button', { name })).toBeDisabled();
    // remarcação não aparece como cancelamento comum
    expect(within(drawer).queryByRole('heading', { name: 'Cancelamento' })).toBeNull();
  });

  it('recurso desligado (403 feature_disabled) explica em vez de mostrar a agenda', async () => {
    mockApi({ 'GET /api/asa/appointments': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Este recurso está desativado neste ambiente.', reason: 'feature_disabled' } }) });
    renderRoutes(routes, { initialPath: '/asa/agendamentos', session: staffSession() });
    expect(await screen.findByText('Agendamentos desativados')).toBeInTheDocument();
  });
});
