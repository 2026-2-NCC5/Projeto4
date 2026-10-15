import {
  addDaysToIsoDate,
  appointmentErrorMessage,
  appointmentShareText,
  appointmentStatusMeta,
  bookingReducer,
  canAdvanceBooking,
  formatAppointmentDate,
  formatClock,
  formatDeadline,
  formatTimeRange,
  httpAppointmentsApi,
  initialBookingState,
  isAppointmentsUnavailable,
  isDefinitiveRejection,
  newAppointmentRequestId,
  slotRange,
  uniqueSlots,
  zonedParts,
} from '../features/appointments';
import { groupInbox, httpNotificationsApi, inboxTarget, inboxTargetFromPush, markListRead } from '../features/notifications';
import { ApiClientError, configureApiClient, resetApiClientForTests } from '../services/apiClient';

import { catalogFixture, fail, inboxFixture, makeAppointment, makeNotification, NOW, ok, routedFetch, slot, slotListFixture } from './support/platformFixtures';

describe('API de agendamentos (fetch simulado)', () => {
  afterEach(() => resetApiClientForTests());

  function configure(routes: Parameters<typeof routedFetch>[0]) {
    const router = routedFetch(routes);
    configureApiClient({ baseUrl: 'http://api.test', getAccessToken: () => 'token-aluno', fetchFn: router.fn as unknown as typeof fetch });
    return router;
  }

  it('monta as rotas do contrato v1.6 com Bearer e devolve só `data`', async () => {
    const router = configure({
      'GET /api/appointments/catalog': () => ok(catalogFixture),
      'GET /api/appointments/slots': (call) => ok(slotListFixture(call.query.mode ?? null)),
      'GET /api/appointments': () => ok({ items: [makeAppointment()] }),
      'GET /api/appointments/appt-1': () => ok(makeAppointment()),
    });
    expect((await httpAppointmentsApi.getCatalog()).topics).toHaveLength(2);
    const slots = await httpAppointmentsApi.getSlots({ from: '2026-10-15', to: '2026-10-28', mode: 'online' });
    expect(slots.days).toHaveLength(14);
    expect((await httpAppointmentsApi.list('past')).items[0]?.id).toBe('appt-1');
    expect((await httpAppointmentsApi.get('appt-1')).protocol).toBe('AGD-2026-00001');

    expect(router.find('GET', '/api/appointments/slots')[0]?.query).toEqual({ from: '2026-10-15', to: '2026-10-28', mode: 'online' });
    expect(router.find('GET', '/api/appointments')[0]?.query).toEqual({ scope: 'past' });
    const [, init] = router.fn.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-aluno');
  });

  it('agendar, cancelar e remarcar enviam POST com o corpo do contrato', async () => {
    const router = configure({
      'POST /api/appointments': () => ok(makeAppointment({ id: 'appt-9' }), 201),
      'POST /api/appointments/appt-1/cancel': () => ok(makeAppointment({ status: 'cancelled', canCancel: false, canReschedule: false })),
      'POST /api/appointments/appt-1/reschedule': () => ok(makeAppointment({ id: 'appt-2', rescheduledFromId: 'appt-1' })),
    });
    await httpAppointmentsApi.create({ clientRequestId: 'appt-req-12345678', topicId: 'documents', startsAt: '2026-10-19T13:00:00.000Z', mode: 'presencial', location: 'Sala 2', notes: 'Histórico' });
    await httpAppointmentsApi.cancel('appt-1', { reason: 'Imprevisto' });
    const moved = await httpAppointmentsApi.reschedule('appt-1', { clientRequestId: 'appt-req-87654321', startsAt: '2026-10-19T12:30:00.000Z', mode: 'presencial', location: 'Sala 2' });
    expect(moved.rescheduledFromId).toBe('appt-1');
    expect(router.find('POST', '/api/appointments')[0]?.body).toEqual({ clientRequestId: 'appt-req-12345678', topicId: 'documents', startsAt: '2026-10-19T13:00:00.000Z', mode: 'presencial', location: 'Sala 2', notes: 'Histórico' });
    expect(router.find('POST', '/api/appointments/appt-1/cancel')[0]?.body).toEqual({ reason: 'Imprevisto' });
    expect(router.find('POST', '/api/appointments/appt-1/reschedule')[0]?.body).toEqual({ clientRequestId: 'appt-req-87654321', startsAt: '2026-10-19T12:30:00.000Z', mode: 'presencial', location: 'Sala 2' });
  });

  it('409 slot_unavailable chega com o motivo estável e vira mensagem amigável', async () => {
    configure({ 'POST /api/appointments': () => fail(409, 'CONFLICT', 'Esse horário não está mais disponível. Escolha outro.', 'slot_unavailable') });
    const error = await httpAppointmentsApi.create({ clientRequestId: 'appt-req-12345678', topicId: 'documents', startsAt: '2026-10-19T13:00:00.000Z', mode: 'presencial' }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).status).toBe(409);
    expect((error as ApiClientError).reason).toBe('slot_unavailable');
    expect(appointmentErrorMessage(error)).toBe('Esse horário não está mais disponível. Escolha outro horário.');
    expect(isDefinitiveRejection(error)).toBe(true);
  });

  it('chave de idempotência no padrão aceito pela API e única por tentativa', () => {
    const first = newAppointmentRequestId();
    const second = newAppointmentRequestId();
    expect(first).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(second).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(first).not.toBe(second);
  });
});

describe('erros dos agendamentos', () => {
  const error = (status: number, reason?: string, message = 'Mensagem do servidor.', kind: ApiClientError['kind'] = 'unknown') => new ApiClientError({ kind, status, reason, message });

  it('usa o texto do servidor para regras com números (limite e prazo) e textos próprios para o resto', () => {
    expect(appointmentErrorMessage(error(409, 'active_limit', 'Você já tem 2 agendamento(s) ativo(s).'))).toBe('Você já tem 2 agendamento(s) ativo(s).');
    expect(appointmentErrorMessage(error(409, 'change_window_closed', 'Cancelamentos pelo portal/app vão até 2 h antes. Fale com o ASA.'))).toBe('Cancelamentos pelo portal/app vão até 2 h antes. Fale com o ASA.');
    expect(appointmentErrorMessage(error(409, 'student_conflict'))).toBe('Você já tem um atendimento nesse horário. Escolha outro horário.');
    expect(appointmentErrorMessage(error(400, 'too_soon', 'Escolha um horário com pelo menos 2 h de antecedência.', 'validation'))).toBe('Escolha um horário com pelo menos 2 h de antecedência.');
    expect(appointmentErrorMessage(error(403, 'feature_disabled', 'x', 'forbidden'))).toBe('Os agendamentos com o ASA estão desativados no momento.');
    expect(appointmentErrorMessage(error(503, 'database_required', 'x', 'dependency'))).toBe('Os agendamentos não estão disponíveis neste ambiente agora. Tente mais tarde.');
    expect(appointmentErrorMessage(new ApiClientError({ kind: 'network', message: 'Network request failed' }))).not.toMatch(/Network|request|failed/);
  });

  it('recurso desligado ou sem banco: a tela mostra "indisponível" em vez de erro', () => {
    expect(isAppointmentsUnavailable(error(403, 'feature_disabled'))).toBe(true);
    expect(isAppointmentsUnavailable(error(503, 'database_required'))).toBe(true);
    expect(isAppointmentsUnavailable(error(500))).toBe(false);
  });

  it('só recusas definitivas trocam a chave; rede, tempo esgotado e 5xx reaproveitam', () => {
    expect(isDefinitiveRejection(error(409, 'active_limit'))).toBe(true);
    expect(isDefinitiveRejection(error(400, 'too_far'))).toBe(true);
    expect(isDefinitiveRejection(new ApiClientError({ kind: 'network', message: 'x' }))).toBe(false);
    expect(isDefinitiveRejection(new ApiClientError({ kind: 'timeout', message: 'x' }))).toBe(false);
    expect(isDefinitiveRejection(error(502))).toBe(false);
    expect(isDefinitiveRejection(error(429))).toBe(false);
  });
});

describe('datas no horário de Brasília', () => {
  it('converte instantes UTC para o fuso da instituição, independentemente do aparelho', () => {
    expect(zonedParts(new Date('2026-10-16T13:00:00.000Z'))).toMatchObject({ year: 2026, month: 10, day: 16, hour: 10, minute: 0, weekday: 5 });
    expect(formatClock('2026-10-16T13:00:00.000Z')).toBe('10:00');
    expect(formatTimeRange('2026-10-16T13:00:00.000Z', '2026-10-16T13:30:00.000Z')).toBe('10:00 às 10:30');
    expect(formatAppointmentDate('2026-10-16T13:00:00.000Z')).toBe('Sexta-feira, 16 de outubro de 2026');
    expect(formatDeadline('2026-10-16T11:00:00.000Z')).toBe('16/10 às 08:00');
    // 02:30 UTC ainda é o dia anterior em Brasília
    expect(slotRange(new Date('2026-10-15T02:30:00.000Z'))).toEqual({ from: '2026-10-14', to: '2026-10-27' });
    expect(slotRange(NOW)).toEqual({ from: '2026-10-15', to: '2026-10-28' });
    expect(addDaysToIsoDate('2026-12-25', 13)).toBe('2027-01-07');
  });

  it('v1.8: o mesmo horário em duas salas são duas opções; repetições exatas somem', () => {
    const list = uniqueSlots([
      slot('2026-10-19T12:30:00.000Z'),
      slot('2026-10-19T12:00:00.000Z', 30, 'presencial', 'Sala 2'),
      slot('2026-10-19T12:00:00.000Z'),
      slot('2026-10-19T12:00:00.000Z'),
    ]);
    expect(list.map((item) => `${item.startsAt} ${item.location}`)).toEqual([
      '2026-10-19T12:00:00.000Z Central de atendimento ASA',
      '2026-10-19T12:00:00.000Z Sala 2',
      '2026-10-19T12:30:00.000Z Central de atendimento ASA',
    ]);
  });

  it('situação: remarcação aparece como "Remarcado"; resumo para compartilhar não fala em calendário', () => {
    expect(appointmentStatusMeta(makeAppointment()).label).toBe('Confirmado');
    const moved = makeAppointment({ status: 'cancelled', events: [{ id: 'e', type: 'rescheduled', title: 'Remarcado pelo aluno', description: null, actorType: 'student', createdAt: NOW.toISOString() }] });
    expect(appointmentStatusMeta(moved).label).toBe('Remarcado');
    // v1.8: o vínculo com o substituto basta, mesmo sem o evento na lista
    expect(appointmentStatusMeta(makeAppointment({ status: 'cancelled', rescheduledToId: 'appt-2', events: [] })).label).toBe('Remarcado');
    expect(appointmentStatusMeta(makeAppointment({ status: 'cancelled', events: [] })).label).toBe('Cancelado');
    const text = appointmentShareText(makeAppointment());
    expect(text).toContain('Atendimento com o ASA — Documentos');
    expect(text).toContain('Sexta-feira, 16 de outubro de 2026, das 10:00 às 10:30 (horário de Brasília)');
    expect(text).toContain('Protocolo: AGD-2026-00001');
    expect(text.toLowerCase()).not.toContain('calend');
  });
});

describe('estado do agendamento', () => {
  const chosen = slot('2026-10-19T13:00:00.000Z');

  it('trocar a modalidade descarta dia e horário; cada etapa exige sua escolha', () => {
    let state = initialBookingState('appt-req-aaaaaaaa');
    expect(canAdvanceBooking(state)).toBe(false);
    state = bookingReducer(state, { type: 'SELECT_TOPIC', topicId: 'documents' });
    expect(canAdvanceBooking(state)).toBe(true);
    state = bookingReducer(bookingReducer(state, { type: 'SELECT_MODE', mode: 'presencial' }), { type: 'SELECT_DAY', date: '2026-10-19' });
    state = bookingReducer(state, { type: 'SELECT_SLOT', slot: chosen });
    expect(state).toMatchObject({ date: '2026-10-19', slot: chosen });
    state = bookingReducer(state, { type: 'SELECT_MODE', mode: 'online' });
    expect(state).toMatchObject({ mode: 'online', date: null, slot: null });
  });

  it('falha de rede mantém a chave; horário tomado volta à escolha do horário com chave nova', () => {
    let state = bookingReducer({ ...initialBookingState('appt-req-aaaaaaaa'), step: 'review', slot: chosen }, { type: 'SUBMIT_START' });
    state = bookingReducer(state, { type: 'SUBMIT_FAILURE', message: 'sem rede' });
    expect(state).toMatchObject({ clientRequestId: 'appt-req-aaaaaaaa', submitting: false, error: 'sem rede', step: 'review' });
    state = bookingReducer(state, { type: 'SLOT_TAKEN', message: 'reservado', clientRequestId: 'appt-req-bbbbbbbb' });
    expect(state).toMatchObject({ clientRequestId: 'appt-req-bbbbbbbb', step: 'time', slot: null, notice: 'reservado', error: null });
  });

  it('remarcar começa pela modalidade, com assunto e modalidade do agendamento atual', () => {
    expect(initialBookingState('appt-req-cccccccc', makeAppointment({ mode: 'online' }))).toMatchObject({ step: 'mode', topicId: 'documents', mode: 'online' });
  });
});

describe('central de avisos (lógica)', () => {
  afterEach(() => resetApiClientForTests());

  it('GET e PATCH {read: true, ids?} com o mesmo limite', async () => {
    const router = routedFetch({ 'GET /api/notifications': () => ok(inboxFixture()), 'PATCH /api/notifications': () => ok(inboxFixture([])) });
    configureApiClient({ baseUrl: 'http://api.test', getAccessToken: () => 'token', fetchFn: router.fn as unknown as typeof fetch });
    expect((await httpNotificationsApi.list(50)).unreadCount).toBe(2);
    await httpNotificationsApi.markRead(['7d1f2c3a-0000-4000-8000-000000000001']);
    await httpNotificationsApi.markRead();
    expect(router.find('GET', '/api/notifications')[0]?.query).toEqual({ limit: '50' });
    expect(router.find('PATCH', '/api/notifications').map((call) => call.body)).toEqual([{ read: true, ids: ['7d1f2c3a-0000-4000-8000-000000000001'] }, { read: true }]);
    // v1.8: a resposta do PATCH vem no mesmo tamanho da lista da central
    expect(router.find('PATCH', '/api/notifications').map((call) => call.query)).toEqual([{ limit: '50' }, { limit: '50' }]);
  });

  it('agrupa em Hoje/Anteriores e aplica a leitura localmente', () => {
    const groups = groupInbox(inboxFixture().items, new Date('2026-10-15T15:00:00.000Z'));
    expect(groups.map((group) => [group.title, group.items.length])).toEqual([
      ['Hoje', 2],
      ['Anteriores', 1],
    ]);
    const read = markListRead(inboxFixture(), new Set(['7d1f2c3a-0000-4000-8000-000000000001']), NOW.toISOString());
    expect(read.unreadCount).toBe(1);
    expect(markListRead(inboxFixture(), null, NOW.toISOString()).unreadCount).toBe(0);
  });

  it('destino do toque: chamado, agendamento ou nada; push da central com e sem registro', () => {
    expect(inboxTarget(makeNotification())).toEqual({ kind: 'appointment', id: 'appt-1' });
    expect(inboxTarget(makeNotification({ resource: { type: 'ticket', id: 't-1' } }))).toEqual({ kind: 'ticket', id: 't-1' });
    expect(inboxTarget(makeNotification({ resource: { type: 'article', id: 'a-1' } }))).toBeNull();
    expect(inboxTarget(makeNotification({ resource: null }))).toBeNull();
    expect(inboxTargetFromPush({ type: 'inbox', category: 'appointment', resourceType: 'appointment', resourceId: 'appt-7' })).toEqual({ kind: 'appointment', id: 'appt-7' });
    expect(inboxTargetFromPush({ type: 'inbox', category: 'system' })).toEqual({ kind: 'inbox' });
    expect(inboxTargetFromPush({ type: 'support_ticket', ticketId: 't-1' })).toBeNull();
    expect(inboxTargetFromPush({ screen: 'queue' })).toBeNull();
    expect(inboxTargetFromPush(null)).toBeNull();
  });
});
