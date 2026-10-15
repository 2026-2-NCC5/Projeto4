import { actionForTarget, currentScreenKey, INITIAL_NAVIGATION_STATE, navigationReducer } from '../navigation/navigationReducer';

describe('navigationReducer', () => {
  it('troca de aba limpa detalhe e seção; academic mantém a disciplina em destaque', () => {
    let state = navigationReducer(INITIAL_NAVIGATION_STATE, { type: 'VIEW_SUBJECT', subjectId: 's1' });
    expect(state).toMatchObject({ tab: 'academic', focusSubjectId: 's1' });
    state = navigationReducer(state, { type: 'OPEN_RUN', runId: 'run-1' });
    expect(state.detail).toEqual({ screen: 'run', runId: 'run-1' });
    state = navigationReducer(state, { type: 'CHANGE_TAB', tab: 'home' });
    expect(state).toMatchObject({ tab: 'home', detail: null, focusSubjectId: null });
  });

  it('GO_BACK sem detalhe é no-op (mesmo objeto)', () => {
    expect(navigationReducer(INITIAL_NAVIGATION_STATE, { type: 'GO_BACK' })).toBe(INITIAL_NAVIGATION_STATE);
  });

  it('currentScreenKey reflete aba, seção e detalhe', () => {
    expect(currentScreenKey(INITIAL_NAVIGATION_STATE)).toBe('home');
    expect(currentScreenKey(navigationReducer(INITIAL_NAVIGATION_STATE, { type: 'OPEN_ACADEMIC_SEGMENT', segment: 'attendance' }))).toBe('academic.attendance');
    expect(currentScreenKey(navigationReducer(INITIAL_NAVIGATION_STATE, { type: 'OPEN_HISTORY' }))).toBe('history');
    expect(currentScreenKey(navigationReducer(INITIAL_NAVIGATION_STATE, { type: 'OPEN_RECOMMENDATION', id: 'r' }))).toBe('recommendation');
    expect(currentScreenKey(navigationReducer(INITIAL_NAVIGATION_STATE, { type: 'OPEN_ASSISTANT', mode: 'analysis' }))).toBe('assistant');
  });

  it('actionForTarget cobre a allow-list e rejeita parâmetros ausentes', () => {
    expect(actionForTarget('academic.assessments')).toEqual({ type: 'OPEN_ACADEMIC_SEGMENT', segment: 'assessments' });
    expect(actionForTarget('subject', { subjectId: 's1' })).toEqual({ type: 'VIEW_SUBJECT', subjectId: 's1' });
    expect(actionForTarget('subject')).toEqual({ type: 'OPEN_ACADEMIC_SEGMENT', segment: 'subjects' });
    expect(actionForTarget('recommendation')).toBeNull();
    expect(actionForTarget('run', { runId: 'x' })).toEqual({ type: 'OPEN_RUN', runId: 'x' });
    expect(actionForTarget('assistant.analysis')).toEqual({ type: 'OPEN_ASSISTANT', mode: 'analysis' });
    expect(actionForTarget('services')).toEqual({ type: 'CHANGE_TAB', tab: 'services' });
    expect(actionForTarget('history')).toEqual({ type: 'OPEN_HISTORY' });
  });
});
