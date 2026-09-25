import {
  ASSISTANT_STATE_LABELS,
  assistantShellReducer,
  assistantStateAccessibilityLabel,
  deriveAssistantState,
  INITIAL_SHELL_STATE,
  isMicrophoneCapturing,
  type AssistantShellState,
  type AssistantState,
} from '../features/assistant/state/assistantStateMachine';
import type { VoicePhase } from '../types/voice';

const listeningWake: AssistantShellState = { ...INITIAL_SHELL_STATE, wakeWord: { status: 'listening', reason: null } };

describe('assistantShellReducer', () => {
  it('ACTIVATE abre o overlay em modo compacto e marca a ativação', () => {
    const next = assistantShellReducer(INITIAL_SHELL_STATE, { type: 'ACTIVATE', source: 'wake_word', at: 1000 });
    expect(next).toMatchObject({ overlay: 'compact', activation: 'activating', activationSource: 'wake_word', lastActivationAt: 1000 });
    expect(assistantShellReducer(next, { type: 'ACTIVATION_DONE' }).activation).toBe('none');
  });

  it('ACTIVATE durante a fala do ASA registra interrupção (barge-in)', () => {
    const next = assistantShellReducer(INITIAL_SHELL_STATE, { type: 'ACTIVATE', source: 'wake_word', at: 1, interrupting: true });
    expect(next.activation).toBe('interrupted');
  });

  it('CLOSE_OVERLAY em estado já fechado devolve o mesmo objeto (no-op)', () => {
    expect(assistantShellReducer(INITIAL_SHELL_STATE, { type: 'CLOSE_OVERLAY' })).toBe(INITIAL_SHELL_STATE);
  });

  it('WAKE_WORD_STATUS ignora repetições idênticas', () => {
    const next = assistantShellReducer(INITIAL_SHELL_STATE, { type: 'WAKE_WORD_STATUS', status: 'listening' });
    expect(next.wakeWord.status).toBe('listening');
    expect(assistantShellReducer(next, { type: 'WAKE_WORD_STATUS', status: 'listening', reason: null })).toBe(next);
  });

  it('APP_STATE registra primeiro plano/background', () => {
    const background = assistantShellReducer(INITIAL_SHELL_STATE, { type: 'APP_STATE', foreground: false });
    expect(background.foreground).toBe(false);
    expect(assistantShellReducer(background, { type: 'APP_STATE', foreground: false })).toBe(background);
  });
});

describe('deriveAssistantState', () => {
  const cases: [VoicePhase, AssistantShellState, boolean, AssistantState][] = [
    ['idle', INITIAL_SHELL_STATE, false, 'idle'],
    ['idle', listeningWake, false, 'wake-word-listening'],
    ['idle', INITIAL_SHELL_STATE, true, 'offline'],
    ['listening', INITIAL_SHELL_STATE, false, 'listening'],
    ['transcribing', INITIAL_SHELL_STATE, false, 'processing'],
    ['understanding', INITIAL_SHELL_STATE, false, 'processing'],
    ['thinking', INITIAL_SHELL_STATE, false, 'thinking'],
    ['answering', INITIAL_SHELL_STATE, false, 'speaking'],
    ['error', INITIAL_SHELL_STATE, false, 'error'],
    ['abstained', listeningWake, false, 'wake-word-listening'],
    ['human_validation', INITIAL_SHELL_STATE, false, 'idle'],
  ];

  it.each(cases)('fase %s → %s', (phase, shell, offline, expected) => {
    expect(deriveAssistantState({ shell, phase, offline })).toBe(expected);
  });

  it('ativação e interrupção têm prioridade sobre a fase', () => {
    const activating = { ...INITIAL_SHELL_STATE, activation: 'activating' as const };
    const interrupted = { ...INITIAL_SHELL_STATE, activation: 'interrupted' as const };
    expect(deriveAssistantState({ shell: activating, phase: 'idle', offline: false })).toBe('activating');
    expect(deriveAssistantState({ shell: interrupted, phase: 'answering', offline: false })).toBe('interrupted');
  });

  it('"Hey Asa" detectado leva o estado a activating e depois listening', () => {
    const activated = assistantShellReducer(INITIAL_SHELL_STATE, { type: 'ACTIVATE', source: 'wake_word', at: 0 });
    expect(deriveAssistantState({ shell: activated, phase: 'idle', offline: false })).toBe('activating');
    const done = assistantShellReducer(activated, { type: 'ACTIVATION_DONE' });
    expect(deriveAssistantState({ shell: done, phase: 'listening', offline: false })).toBe('listening');
  });

  it('todo estado tem rótulo textual e rótulo acessível', () => {
    (Object.keys(ASSISTANT_STATE_LABELS) as AssistantState[]).forEach((state) => {
      expect(ASSISTANT_STATE_LABELS[state].length).toBeGreaterThan(0);
      expect(assistantStateAccessibilityLabel(state)).toMatch(/^Assistente ASA, /);
    });
  });

  it('microfone capturando: escuta da conversa ou detecção de wake word', () => {
    expect(isMicrophoneCapturing('listening', 'off')).toBe(true);
    expect(isMicrophoneCapturing('idle', 'listening')).toBe(true);
    expect(isMicrophoneCapturing('speaking', 'paused')).toBe(false);
    expect(isMicrophoneCapturing('idle', 'off')).toBe(false);
  });
});
