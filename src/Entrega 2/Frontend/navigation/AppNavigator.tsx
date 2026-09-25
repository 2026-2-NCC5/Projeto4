import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';

import type { AssistantMode } from '../types/assistant';
import type { AssistantNavigationParams, AssistantNavigationTarget } from '../types/api';

import { actionForTarget, currentScreenKey, INITIAL_NAVIGATION_STATE, navigationReducer, type NavigationState } from './navigationReducer';
import type { AcademicSegment, ScreenKey, TabKey } from './routes';

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
    }),
    [state, changeTab, viewSubject, openAcademicSegment, openRecommendation, openRun, openHistory, openAssistant, setAssistantMode, goBack, goHome, clearFocus, navigateTo],
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
