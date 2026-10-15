import { appointmentRoutes, currentScreenKey, INITIAL_NAVIGATION_STATE, isAppointmentRoute, navigationReducer, NOTIFICATIONS_ROUTE, supportRoutes, type NavigationAction, type NavigationState } from '../navigation';

const run = (actions: NavigationAction[], from: NavigationState = INITIAL_NAVIGATION_STATE) => actions.reduce(navigationReducer, from);
const services: NavigationState = { ...INITIAL_NAVIGATION_STATE, tab: 'services' };

describe('rotas dos agendamentos', () => {
  it('Serviços → Meus agendamentos → agendar: empilha; voltar desfaz na ordem e termina na aba', () => {
    const list = run([{ type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.list() }], services);
    expect(list.detail).toEqual({ screen: 'appointments' });
    expect(list.backStack).toEqual([]);
    const book = navigationReducer(list, { type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.book() });
    expect(book.detail).toEqual({ screen: 'appointment-book' });
    expect(book.backStack).toEqual([{ screen: 'appointments' }]);
    const back = navigationReducer(book, { type: 'GO_BACK' });
    expect(back.detail).toEqual({ screen: 'appointments' });
    const tab = navigationReducer(back, { type: 'GO_BACK' });
    expect(tab.detail).toBeNull();
    expect(tab.tab).toBe('services');
  });

  it('agendamento concluído substitui o fluxo pelo detalhe (replace)', () => {
    const book = run([
      { type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.list() },
      { type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.book() },
    ], services);
    const detail = navigationReducer(book, { type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.detail('appt-9'), replace: true });
    expect(detail.detail).toEqual({ screen: 'appointment', id: 'appt-9' });
    expect(detail.backStack).toEqual([{ screen: 'appointments' }]);
  });

  it('remarcação concluída: o detalhe novo substitui o fluxo E o detalhe antigo', () => {
    const reschedule = run([
      { type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.list() },
      { type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.detail('appt-1') },
      { type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.reschedule('appt-1') },
    ], services);
    expect(reschedule.detail).toEqual({ screen: 'appointment-book', rescheduleId: 'appt-1' });
    expect(reschedule.backStack).toEqual([{ screen: 'appointments' }, { screen: 'appointment', id: 'appt-1' }]);
    const moved = navigationReducer(reschedule, { type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.detail('appt-2'), replace: true, dropPreviousDetail: true });
    expect(moved.detail).toEqual({ screen: 'appointment', id: 'appt-2' });
    expect(moved.backStack).toEqual([{ screen: 'appointments' }]);
  });

  it('dropPreviousDetail só remove um detalhe de agendamento (nunca a central ou o Atendimento)', () => {
    const fromInbox = run([{ type: 'OPEN_NOTIFICATIONS' }, { type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.book() }]);
    const opened = navigationReducer(fromInbox, { type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.detail('appt-3'), replace: true, dropPreviousDetail: true });
    expect(opened.backStack).toEqual([{ screen: 'notifications' }]);
  });

  it('trocar de aba limpa a pilha; agendamentos contam como Serviços para o assistente', () => {
    const deep = run([
      { type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.list() },
      { type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.detail('appt-1') },
    ], services);
    expect(currentScreenKey(deep)).toBe('services');
    expect(isAppointmentRoute(deep.detail)).toBe(true);
    expect(isAppointmentRoute({ screen: 'queue' })).toBe(false);
    const home = navigationReducer(deep, { type: 'CHANGE_TAB', tab: 'home' });
    expect(home).toMatchObject({ tab: 'home', detail: null, backStack: [] });
  });
});

describe('rota da central de avisos', () => {
  it('sino do Início abre a central sobre a aba; voltar retorna ao Início', () => {
    const inbox = navigationReducer(INITIAL_NAVIGATION_STATE, { type: 'OPEN_NOTIFICATIONS' });
    expect(inbox.detail).toBe(NOTIFICATIONS_ROUTE);
    expect(inbox.tab).toBe('home');
    expect(currentScreenKey(inbox)).toBe('services');
    expect(navigationReducer(inbox, { type: 'GO_BACK' })).toMatchObject({ tab: 'home', detail: null });
  });

  it('abrir de novo com a central aberta não empilha nada', () => {
    const inbox = navigationReducer(INITIAL_NAVIGATION_STATE, { type: 'OPEN_NOTIFICATIONS' });
    expect(navigationReducer(inbox, { type: 'OPEN_NOTIFICATIONS' })).toBe(inbox);
  });

  it('aviso → chamado ou agendamento: voltar retorna à central', () => {
    const inbox = navigationReducer(INITIAL_NAVIGATION_STATE, { type: 'OPEN_NOTIFICATIONS' });
    const ticket = navigationReducer(inbox, { type: 'OPEN_SUPPORT_ROUTE', route: supportRoutes.ticket('ticket-1') });
    expect(ticket.backStack).toEqual([{ screen: 'notifications' }]);
    expect(navigationReducer(ticket, { type: 'GO_BACK' }).detail).toEqual({ screen: 'notifications' });
    const appointment = navigationReducer(inbox, { type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.detail('appt-1') });
    expect(appointment.backStack).toEqual([{ screen: 'notifications' }]);
    expect(navigationReducer(appointment, { type: 'GO_BACK' }).detail).toEqual({ screen: 'notifications' });
  });

  it('a partir do Atendimento a central também empilha', () => {
    const hub = navigationReducer(services, { type: 'OPEN_SUPPORT_ROUTE', route: supportRoutes.home() });
    const inbox = navigationReducer(hub, { type: 'OPEN_NOTIFICATIONS' });
    expect(inbox.backStack).toEqual([{ screen: 'support' }]);
    expect(navigationReducer(inbox, { type: 'GO_BACK' }).detail).toEqual({ screen: 'support' });
  });
});
