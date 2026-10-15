import type { AssistantMode } from '../types/assistant';
import type { AssistantNavigationParams, AssistantNavigationTarget } from '../types/api';

import type { AcademicSegment, AppointmentRoute, DetailRoute, ScreenKey, SupportListFilter, SupportRoute, TabKey } from './routes';

export interface NavigationState {
  tab: TabKey;
  detail: DetailRoute | null;
  /** Disciplina em destaque na área acadêmica (vinda de uma recomendação/resposta). */
  focusSubjectId: string | null;
  /** Seção acadêmica pedida externamente (assistente/atalhos). */
  academicSegment: AcademicSegment | null;
  assistantMode: AssistantMode;
  /** Incrementa a cada navegação para permitir efeitos "ao chegar" (ex.: rolar até a disciplina). */
  revision: number;
  // ---- support (Atendimento)
  /** Telas de detalhe anteriores (só o fluxo do Atendimento empilha; as demais rotas limpam a pilha). */
  backStack: DetailRoute[];
}

export type NavigationAction =
  | { type: 'CHANGE_TAB'; tab: TabKey }
  | { type: 'VIEW_SUBJECT'; subjectId: string }
  | { type: 'OPEN_ACADEMIC_SEGMENT'; segment: AcademicSegment }
  | { type: 'OPEN_RECOMMENDATION'; id: string }
  | { type: 'OPEN_RUN'; runId: string }
  | { type: 'OPEN_HISTORY' }
  | { type: 'OPEN_ASSISTANT'; mode?: AssistantMode }
  | { type: 'SET_ASSISTANT_MODE'; mode: AssistantMode }
  | { type: 'GO_BACK' }
  | { type: 'CLEAR_FOCUS' }
  // ---- support (Atendimento)
  | { type: 'OPEN_SUPPORT_ROUTE'; route: SupportRoute; replace?: boolean }
  // ---- queue (Fila presencial do ASA)
  | { type: 'OPEN_QUEUE' }
  // ---- appointments (Agendamentos com o ASA)
  /**
   * `replace`: substitui a tela atual (agendamento concluído → detalhe). `dropPreviousDetail`: também tira da pilha
   * o detalhe de agendamento anterior (remarcação concluída → detalhe do novo horário, sem passar pelo antigo).
   */
  | { type: 'OPEN_APPOINTMENT_ROUTE'; route: AppointmentRoute; replace?: boolean; dropPreviousDetail?: boolean }
  // ---- notifications (Central de avisos)
  | { type: 'OPEN_NOTIFICATIONS' };

export const INITIAL_NAVIGATION_STATE: NavigationState = Object.freeze({
  tab: 'home',
  detail: null,
  focusSubjectId: null,
  academicSegment: null,
  assistantMode: 'conversation',
  revision: 0,
  backStack: [],
}) as NavigationState;

/** Navegações fora do Atendimento limpam a pilha: voltar delas retorna à aba, como antes. */
function bump(state: NavigationState, changes: Partial<NavigationState>): NavigationState {
  return { ...state, backStack: [], ...changes, revision: state.revision + 1 };
}

// ---- support (Atendimento)
/** Profundidade máxima da pilha (Atendimento → Meus chamados → Chamado → ... nunca cresce sem limite). */
const MAX_BACK_STACK = 8;

export function isSupportRoute(route: DetailRoute | null | undefined): route is SupportRoute {
  return route?.screen === 'support' || route?.screen === 'support-tickets' || route?.screen === 'support-new' || route?.screen === 'support-ticket';
}

function openSupportRoute(state: NavigationState, route: SupportRoute, replace: boolean): NavigationState {
  const stack = !replace && state.detail ? [...state.backStack, state.detail].slice(-MAX_BACK_STACK) : state.backStack;
  return { ...state, detail: route, backStack: stack, revision: state.revision + 1 };
}

export const supportRoutes = {
  home: (): SupportRoute => ({ screen: 'support' }),
  tickets: (filter?: SupportListFilter): SupportRoute => (filter ? { screen: 'support-tickets', filter } : { screen: 'support-tickets' }),
  newTicket: (categoryId?: string): SupportRoute => (categoryId ? { screen: 'support-new', categoryId } : { screen: 'support-new' }),
  ticket: (id: string): SupportRoute => ({ screen: 'support-ticket', id }),
};
// ---- end support

// ---- queue (Fila presencial do ASA)
export const QUEUE_ROUTE: DetailRoute = Object.freeze({ screen: 'queue' }) as DetailRoute;

/**
 * A partir do Atendimento, voltar retorna ao hub (empilha como as rotas do Atendimento); de outros
 * lugares (Início, notificação push, assistente) a fila abre sobre a aba atual e voltar retorna a ela.
 */
function openQueue(state: NavigationState): NavigationState {
  if (state.detail?.screen === 'queue') return state;
  if (isSupportRoute(state.detail)) {
    return { ...state, detail: QUEUE_ROUTE, backStack: [...state.backStack, state.detail].slice(-MAX_BACK_STACK), revision: state.revision + 1 };
  }
  return bump(state, { detail: QUEUE_ROUTE });
}
// ---- end queue

// ---- appointments (Agendamentos com o ASA) · notifications (Central de avisos)
export function isAppointmentRoute(route: DetailRoute | null | undefined): route is AppointmentRoute {
  return route?.screen === 'appointments' || route?.screen === 'appointment-book' || route?.screen === 'appointment';
}

export const appointmentRoutes = {
  list: (): AppointmentRoute => ({ screen: 'appointments' }),
  book: (): AppointmentRoute => ({ screen: 'appointment-book' }),
  reschedule: (id: string): AppointmentRoute => ({ screen: 'appointment-book', rescheduleId: id }),
  detail: (id: string): AppointmentRoute => ({ screen: 'appointment', id }),
};

export const NOTIFICATIONS_ROUTE: DetailRoute = Object.freeze({ screen: 'notifications' }) as DetailRoute;

/** Mesma pilha do Atendimento: a tela atual vai para a pilha e voltar retorna a ela (de uma aba, volta à aba). */
function openStackedRoute(state: NavigationState, route: DetailRoute, options: { replace?: boolean; dropPreviousDetail?: boolean } = {}): NavigationState {
  if (options.replace) {
    const top = state.backStack[state.backStack.length - 1];
    const backStack = options.dropPreviousDetail && top?.screen === 'appointment' ? state.backStack.slice(0, -1) : state.backStack;
    return { ...state, detail: route, backStack, revision: state.revision + 1 };
  }
  const backStack = state.detail ? [...state.backStack, state.detail].slice(-MAX_BACK_STACK) : state.backStack;
  return { ...state, detail: route, backStack, revision: state.revision + 1 };
}

/** O sino pode ser tocado de novo com a central aberta: nada é empilhado. */
function openNotifications(state: NavigationState): NavigationState {
  if (state.detail?.screen === 'notifications') return state;
  return openStackedRoute(state, NOTIFICATIONS_ROUTE);
}
// ---- end appointments · notifications

/** Máquina de navegação pura (estado local, sem react-navigation). */
export function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
  switch (action.type) {
    case 'CHANGE_TAB':
      return bump(state, { tab: action.tab, detail: null, academicSegment: null, focusSubjectId: action.tab === 'academic' ? state.focusSubjectId : null });
    case 'VIEW_SUBJECT':
      return bump(state, { tab: 'academic', detail: null, academicSegment: null, focusSubjectId: action.subjectId });
    case 'OPEN_ACADEMIC_SEGMENT':
      return bump(state, { tab: 'academic', detail: null, focusSubjectId: null, academicSegment: action.segment });
    case 'OPEN_RECOMMENDATION':
      return bump(state, { detail: { screen: 'recommendation', id: action.id } });
    case 'OPEN_RUN':
      return bump(state, { detail: { screen: 'run', runId: action.runId } });
    case 'OPEN_HISTORY':
      return bump(state, { tab: 'services', detail: { screen: 'history' } });
    case 'OPEN_ASSISTANT':
      return bump(state, { tab: 'assistant', detail: null, assistantMode: action.mode ?? state.assistantMode });
    case 'SET_ASSISTANT_MODE':
      return state.assistantMode === action.mode ? state : { ...state, assistantMode: action.mode };
    case 'GO_BACK':
      if (state.backStack.length > 0) {
        return { ...state, detail: state.backStack[state.backStack.length - 1] ?? null, backStack: state.backStack.slice(0, -1), revision: state.revision + 1 };
      }
      return state.detail ? bump(state, { detail: null }) : state;
    // ---- support (Atendimento)
    case 'OPEN_SUPPORT_ROUTE':
      return openSupportRoute(state, action.route, Boolean(action.replace));
    // ---- queue (Fila presencial do ASA)
    case 'OPEN_QUEUE':
      return openQueue(state);
    // ---- appointments (Agendamentos com o ASA)
    case 'OPEN_APPOINTMENT_ROUTE':
      return openStackedRoute(state, action.route, { replace: Boolean(action.replace), dropPreviousDetail: Boolean(action.dropPreviousDetail) });
    // ---- notifications (Central de avisos)
    case 'OPEN_NOTIFICATIONS':
      return openNotifications(state);
    case 'CLEAR_FOCUS':
      return state.focusSubjectId ? { ...state, focusSubjectId: null } : state;
    default:
      return state;
  }
}

/** Tela visível (contexto enviado ao assistente). */
export function currentScreenKey(state: NavigationState): ScreenKey {
  if (state.detail?.screen === 'recommendation') return 'recommendation';
  if (state.detail?.screen === 'run') return 'run';
  if (state.detail?.screen === 'history') return 'history';
  // ---- support (Atendimento): o Atendimento vive em Serviços (vocabulário do contrato do assistente)
  if (isSupportRoute(state.detail)) return 'services';
  // ---- queue (Fila presencial do ASA)
  if (state.detail?.screen === 'queue') return 'queue';
  // ---- appointments · notifications: vivem em Serviços (vocabulário do contrato do assistente)
  if (isAppointmentRoute(state.detail) || state.detail?.screen === 'notifications') return 'services';
  switch (state.tab) {
    case 'academic':
      return `academic.${state.academicSegment ?? 'subjects'}`;
    case 'assistant':
      return 'assistant';
    case 'services':
      return 'services';
    case 'profile':
      return 'profile';
    default:
      return 'home';
  }
}

/**
 * Converte um destino da allow-list do contrato em uma ação de navegação.
 * Destinos desconhecidos ou sem parâmetro obrigatório devolvem null (nada é executado).
 */
export function actionForTarget(target: AssistantNavigationTarget, params?: AssistantNavigationParams): NavigationAction | null {
  switch (target) {
    case 'home':
      return { type: 'CHANGE_TAB', tab: 'home' };
    case 'profile':
      return { type: 'CHANGE_TAB', tab: 'profile' };
    case 'services':
      return { type: 'CHANGE_TAB', tab: 'services' };
    case 'history':
      return { type: 'OPEN_HISTORY' };
    case 'academic.subjects':
      return { type: 'OPEN_ACADEMIC_SEGMENT', segment: 'subjects' };
    case 'academic.assessments':
      return { type: 'OPEN_ACADEMIC_SEGMENT', segment: 'assessments' };
    case 'academic.attendance':
      return { type: 'OPEN_ACADEMIC_SEGMENT', segment: 'attendance' };
    case 'academic.pending':
      return { type: 'OPEN_ACADEMIC_SEGMENT', segment: 'pending' };
    case 'subject':
      return params?.subjectId ? { type: 'VIEW_SUBJECT', subjectId: params.subjectId } : { type: 'OPEN_ACADEMIC_SEGMENT', segment: 'subjects' };
    case 'recommendation':
      return params?.recommendationId ? { type: 'OPEN_RECOMMENDATION', id: params.recommendationId } : null;
    case 'run':
      return params?.runId ? { type: 'OPEN_RUN', runId: params.runId } : null;
    case 'assistant.analysis':
      return { type: 'OPEN_ASSISTANT', mode: 'analysis' };
    case 'assistant':
      return { type: 'OPEN_ASSISTANT', mode: 'conversation' };
    // ---- queue (Fila presencial do ASA)
    case 'queue':
      return { type: 'OPEN_QUEUE' };
    default:
      return null;
  }
}
