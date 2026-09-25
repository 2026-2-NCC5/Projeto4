import type { VoicePhase } from '../../../types/voice';

/**
 * Estado visível do Assistente ASA (o que o orb, o overlay e o leitor de tela comunicam).
 * É DERIVADO de três fontes, nunca guardado em booleans soltos:
 *  - a fase da conversa (`VoicePhase`, reducer puro em hooks/voiceAssistantReducer.ts);
 *  - o estado da "casca" (overlay, ativação, wake word — este arquivo);
 *  - a conectividade.
 */
export type AssistantState =
  | 'idle'
  | 'wake-word-listening'
  | 'activating'
  | 'listening'
  | 'processing'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'error'
  | 'offline';

export type OverlayMode = 'hidden' | 'compact';
export type ActivationSource = 'wake_word' | 'button' | 'gesture' | 'home' | 'indicator';

export type WakeWordStatus =
  | 'off'
  | 'starting'
  | 'listening'
  /** Pausado de propósito (conversa em andamento, app em background, TTS falando). */
  | 'paused'
  | 'unavailable'
  | 'error';

export type WakeWordUnavailableReason = 'expo_go' | 'not_supported' | 'no_service' | 'permission_denied' | 'feature_disabled' | 'background' | 'failures';

export interface AssistantShellState {
  overlay: OverlayMode;
  /** 'activating' durante a animação de abertura; 'interrupted' quando "Hey Asa" cortou a fala. */
  activation: 'none' | 'activating' | 'interrupted';
  activationSource: ActivationSource | null;
  wakeWord: { status: WakeWordStatus; reason: WakeWordUnavailableReason | null };
  /** true enquanto o app está em primeiro plano (AppState 'active'). */
  foreground: boolean;
  lastActivationAt: number | null;
}

export type AssistantShellEvent =
  | { type: 'ACTIVATE'; source: ActivationSource; at: number; interrupting?: boolean }
  | { type: 'ACTIVATION_DONE' }
  | { type: 'OPEN_OVERLAY'; source: ActivationSource }
  | { type: 'CLOSE_OVERLAY' }
  | { type: 'WAKE_WORD_STATUS'; status: WakeWordStatus; reason?: WakeWordUnavailableReason | null }
  | { type: 'APP_STATE'; foreground: boolean };

export const INITIAL_SHELL_STATE: AssistantShellState = Object.freeze({
  overlay: 'hidden',
  activation: 'none',
  activationSource: null,
  wakeWord: { status: 'off', reason: null },
  foreground: true,
  lastActivationAt: null,
}) as AssistantShellState;

/** Reducer puro da casca do assistente. Transições sem efeito devolvem o mesmo objeto. */
export function assistantShellReducer(state: AssistantShellState, event: AssistantShellEvent): AssistantShellState {
  switch (event.type) {
    case 'ACTIVATE':
      return {
        ...state,
        overlay: 'compact',
        activation: event.interrupting ? 'interrupted' : 'activating',
        activationSource: event.source,
        lastActivationAt: event.at,
      };
    case 'ACTIVATION_DONE':
      return state.activation === 'none' ? state : { ...state, activation: 'none' };
    case 'OPEN_OVERLAY':
      if (state.overlay === 'compact' && state.activationSource === event.source) return state;
      return { ...state, overlay: 'compact', activationSource: event.source };
    case 'CLOSE_OVERLAY':
      if (state.overlay === 'hidden' && state.activation === 'none') return state;
      return { ...state, overlay: 'hidden', activation: 'none', activationSource: null };
    case 'WAKE_WORD_STATUS': {
      const reason = event.reason ?? null;
      if (state.wakeWord.status === event.status && state.wakeWord.reason === reason) return state;
      return { ...state, wakeWord: { status: event.status, reason } };
    }
    case 'APP_STATE':
      return state.foreground === event.foreground ? state : { ...state, foreground: event.foreground };
    default:
      return state;
  }
}

export interface DeriveInput {
  shell: AssistantShellState;
  phase: VoicePhase;
  offline: boolean;
}

/** Combina fase da conversa + casca + rede no estado único que a interface reage. */
export function deriveAssistantState({ shell, phase, offline }: DeriveInput): AssistantState {
  if (shell.activation === 'interrupted') return 'interrupted';
  if (shell.activation === 'activating') return 'activating';
  switch (phase) {
    case 'listening':
      return 'listening';
    case 'transcribing':
    case 'understanding':
      return 'processing';
    case 'thinking':
      return 'thinking';
    case 'answering':
      return 'speaking';
    case 'error':
      return 'error';
    default:
      break;
  }
  if (offline) return 'offline';
  if (shell.wakeWord.status === 'listening') return 'wake-word-listening';
  return 'idle';
}

/** Texto curto do estado — o estado nunca é comunicado só pela animação. */
export const ASSISTANT_STATE_LABELS: Record<AssistantState, string> = {
  idle: 'Pronto para ajudar',
  'wake-word-listening': 'Diga "Hey Asa" para conversar',
  activating: 'Oi! Estou aqui',
  listening: 'Estou ouvindo...',
  processing: 'Entendi. Só um instante...',
  thinking: 'Analisando suas informações...',
  speaking: 'Respondendo...',
  interrupted: 'Pode falar',
  error: 'Não consegui concluir',
  offline: 'Você está offline',
};

/** Rótulo para leitores de tela. */
export function assistantStateAccessibilityLabel(state: AssistantState): string {
  return `Assistente ASA, ${ASSISTANT_STATE_LABELS[state].toLowerCase().replace(/\.\.\.$/, '')}`;
}

/** Estados em que o microfone da conversa está capturando áudio (indicador obrigatório). */
export function isMicrophoneCapturing(state: AssistantState, wakeWordStatus: WakeWordStatus): boolean {
  return state === 'listening' || state === 'interrupted' || wakeWordStatus === 'listening';
}
