import type { AssistantMode } from '../types/assistant';
import type { AssistantNavigationParams, AssistantNavigationTarget } from '../types/api';

import type { AcademicSegment, DetailRoute, ScreenKey, TabKey } from './routes';

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
  | { type: 'CLEAR_FOCUS' };

export const INITIAL_NAVIGATION_STATE: NavigationState = Object.freeze({
  tab: 'home',
  detail: null,
  focusSubjectId: null,
  academicSegment: null,
  assistantMode: 'conversation',
  revision: 0,
}) as NavigationState;

function bump(state: NavigationState, changes: Partial<NavigationState>): NavigationState {
  return { ...state, ...changes, revision: state.revision + 1 };
}

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
      return state.detail ? bump(state, { detail: null }) : state;
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
    default:
      return null;
  }
}
