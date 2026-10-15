import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';

import type { AssistantMode } from '../types/assistant';
import type { AssistantNavigationParams, AssistantNavigationTarget } from '../types/api';

import { actionForTarget, appointmentRoutes, currentScreenKey, INITIAL_NAVIGATION_STATE, navigationReducer, supportRoutes, type NavigationState } from './navigationReducer';
import type { AcademicSegment, ScreenKey, SupportListFilter, TabKey } from './routes';

export interface AppNavigation extends NavigationState {
  currentScreen: ScreenKey;
  changeTab: (tab: TabKey) => void;
  viewSubject: (subjectId: string) => void;
  openAcademicSegment: (segment: AcademicSegment) => void;
  openRecommendation: (id: string) => void;
  openRun: (runId: string) => void;
  openHistory: () => void;
  openAssistant: (mode?: AssistantMode) => void;
  setAssistantMode: (mode: AssistantMode) => void;
  goBack: () => void;
  goHome: () => void;
  clearFocus: () => void;
  /** Executa um destino da allow-list do contrato; devolve false quando não há o que fazer. */
  navigateTo: (target: AssistantNavigationTarget, params?: AssistantNavigationParams) => boolean;
  // ---- support (Atendimento)
  openSupport: () => void;
  openSupportTickets: (filter?: SupportListFilter) => void;
  openNewTicket: (categoryId?: string) => void;
  /** `replace`: substitui a tela atual (ex.: confirmação da abertura → detalhe do chamado). */
  openTicket: (id: string, options?: { replace?: boolean }) => void;
  // ---- queue (Fila presencial do ASA)
  /** Atendimento → Fila presencial (também usado pelo deep link asaconecta://atendimento/fila). */
  openQueue: () => void;
  // ---- appointments (Agendamentos com o ASA)
  /** "Meus agendamentos" (próximos e histórico). */
  openAppointments: () => void;
  /** Fluxo de agendamento (assunto → modalidade → dia → horário → confirmação). */
  openBookAppointment: () => void;
  /** O mesmo fluxo, remarcando um agendamento existente. */
  openRescheduleAppointment: (id: string) => void;
  /** `replace`: substitui a tela atual; `dropPreviousDetail`: remove também o detalhe anterior (remarcação concluída). */
  openAppointment: (id: string, options?: { replace?: boolean; dropPreviousDetail?: boolean }) => void;
  // ---- notifications (Central de avisos)
  /** Central de avisos (sino do Início e toque em push sem registro). */
  openNotifications: () => void;
}

const NavigationContext = createContext<AppNavigation | null>(null);

export function NavigationProvider({ children, initialState }: { children: React.ReactNode; initialState?: Partial<NavigationState> }) {
  const [state, dispatch] = useReducer(navigationReducer, { ...INITIAL_NAVIGATION_STATE, ...initialState });

  const changeTab = useCallback((tab: TabKey) => dispatch({ type: 'CHANGE_TAB', tab }), []);
  const viewSubject = useCallback((subjectId: string) => dispatch({ type: 'VIEW_SUBJECT', subjectId }), []);
  const openAcademicSegment = useCallback((segment: AcademicSegment) => dispatch({ type: 'OPEN_ACADEMIC_SEGMENT', segment }), []);
  const openRecommendation = useCallback((id: string) => dispatch({ type: 'OPEN_RECOMMENDATION', id }), []);
  const openRun = useCallback((runId: string) => dispatch({ type: 'OPEN_RUN', runId }), []);
  const openHistory = useCallback(() => dispatch({ type: 'OPEN_HISTORY' }), []);
  const openAssistant = useCallback((mode?: AssistantMode) => dispatch(mode ? { type: 'OPEN_ASSISTANT', mode } : { type: 'OPEN_ASSISTANT' }), []);
  const setAssistantMode = useCallback((mode: AssistantMode) => dispatch({ type: 'SET_ASSISTANT_MODE', mode }), []);
  const goBack = useCallback(() => dispatch({ type: 'GO_BACK' }), []);
  const goHome = useCallback(() => dispatch({ type: 'CHANGE_TAB', tab: 'home' }), []);
  const clearFocus = useCallback(() => dispatch({ type: 'CLEAR_FOCUS' }), []);
  const navigateTo = useCallback((target: AssistantNavigationTarget, params?: AssistantNavigationParams) => {
    const action = actionForTarget(target, params);
    if (!action) return false;
    dispatch(action);
    return true;
  }, []);
  // ---- support (Atendimento)
  const openSupport = useCallback(() => dispatch({ type: 'OPEN_SUPPORT_ROUTE', route: supportRoutes.home() }), []);
  const openSupportTickets = useCallback((filter?: SupportListFilter) => dispatch({ type: 'OPEN_SUPPORT_ROUTE', route: supportRoutes.tickets(filter) }), []);
  const openNewTicket = useCallback((categoryId?: string) => dispatch({ type: 'OPEN_SUPPORT_ROUTE', route: supportRoutes.newTicket(categoryId) }), []);
  const openTicket = useCallback((id: string, options?: { replace?: boolean }) => dispatch({ type: 'OPEN_SUPPORT_ROUTE', route: supportRoutes.ticket(id), replace: Boolean(options?.replace) }), []);
  // ---- queue (Fila presencial do ASA)
  const openQueue = useCallback(() => dispatch({ type: 'OPEN_QUEUE' }), []);
  // ---- appointments (Agendamentos com o ASA)
  const openAppointments = useCallback(() => dispatch({ type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.list() }), []);
  const openBookAppointment = useCallback(() => dispatch({ type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.book() }), []);
  const openRescheduleAppointment = useCallback((id: string) => dispatch({ type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.reschedule(id) }), []);
  const openAppointment = useCallback(
    (id: string, options?: { replace?: boolean; dropPreviousDetail?: boolean }) =>
      dispatch({ type: 'OPEN_APPOINTMENT_ROUTE', route: appointmentRoutes.detail(id), replace: Boolean(options?.replace), dropPreviousDetail: Boolean(options?.dropPreviousDetail) }),
    [],
  );
  // ---- notifications (Central de avisos)
  const openNotifications = useCallback(() => dispatch({ type: 'OPEN_NOTIFICATIONS' }), []);

  const value = useMemo<AppNavigation>(
    () => ({
      ...state,
      currentScreen: currentScreenKey(state),
      changeTab,
      viewSubject,
      openAcademicSegment,
      openRecommendation,
      openRun,
      openHistory,
      openAssistant,
      setAssistantMode,
      goBack,
      goHome,
      clearFocus,
      navigateTo,
      openSupport,
      openSupportTickets,
      openNewTicket,
      openTicket,
      openQueue,
      openAppointments,
      openBookAppointment,
      openRescheduleAppointment,
      openAppointment,
      openNotifications,
    }),
    [
      state,
      changeTab,
      viewSubject,
      openAcademicSegment,
      openRecommendation,
      openRun,
      openHistory,
      openAssistant,
      setAssistantMode,
      goBack,
      goHome,
      clearFocus,
      navigateTo,
      openSupport,
      openSupportTickets,
      openNewTicket,
      openTicket,
      openQueue,
      openAppointments,
      openBookAppointment,
      openRescheduleAppointment,
      openAppointment,
      openNotifications,
    ],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useAppNavigation(): AppNavigation {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useAppNavigation deve ser usado dentro de <NavigationProvider>.');
  return context;
}

/** Versão tolerante: null fora do provider (componentes reutilizáveis em testes isolados). */
export function useOptionalAppNavigation(): AppNavigation | null {
  return useContext(NavigationContext);
}
