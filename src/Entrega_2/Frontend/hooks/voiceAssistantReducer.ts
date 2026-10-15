import type { AssistantTurn, VoiceAssistantEvent, VoiceAssistantState } from '../types/assistant';
import type { AssistantResponse } from '../types/api';
import type { VoicePhase } from '../types/voice';

/**
 * Máquina de estados PURA do assistente por voz/texto.
 * Transições inválidas devolvem o MESMO objeto de estado (permite detectar no-op por identidade).
 */

/** Quantidade máxima de turnos mantidos em memória na conversa atual. */
export const MAX_THREAD_TURNS = 30;

let conversationCounter = 0;
export function createConversationId(now: number = Date.now()): string {
  conversationCounter += 1;
  return `conv-${now.toString(36)}-${conversationCounter.toString(36)}`;
}

export const INITIAL_VOICE_ASSISTANT_STATE: VoiceAssistantState = Object.freeze({
  phase: 'idle',
  inputType: null,
  partialTranscript: '',
  transcript: null,
  turn: null,
  thread: Object.freeze([]) as unknown as AssistantTurn[],
  conversationId: 'conv-initial',
  error: null,
  notice: null,
  context: Object.freeze({}),
  requestSeq: 0,
}) as VoiceAssistantState;

export function createInitialVoiceAssistantState(): VoiceAssistantState {
  return { ...INITIAL_VOICE_ASSISTANT_STATE, context: {}, thread: [], conversationId: createConversationId() };
}

/** Fases em que o aluno pode iniciar uma nova interação (voz ou texto). */
export const READY_PHASES: readonly VoicePhase[] = ['idle', 'abstained', 'human_validation', 'error', 'answering'];

/** Fases com trabalho em andamento que podem ser canceladas. */
export const CANCELLABLE_PHASES: readonly VoicePhase[] = ['listening', 'transcribing', 'understanding', 'thinking'];

/** Fases aguardando a resposta da API. */
export const REQUEST_PHASES: readonly VoicePhase[] = ['understanding', 'thinking'];

/** Fase de repouso correspondente a uma resposta. */
export function terminalPhase(response: AssistantResponse | null | undefined): VoicePhase {
  if (!response) return 'idle';
  if (response.status === 'abstained' || response.abstained) return 'abstained';
  if (response.status === 'human_validation' || response.requiresHumanValidation) return 'human_validation';
  return 'idle';
}

function isIn(phase: VoicePhase, phases: readonly VoicePhase[]): boolean {
  return phases.includes(phase);
}

function restingPhase(state: VoiceAssistantState): VoicePhase {
  return terminalPhase(state.turn?.response);
}

export function voiceAssistantReducer(state: VoiceAssistantState, event: VoiceAssistantEvent): VoiceAssistantState {
  switch (event.type) {
    case 'LISTEN_REQUESTED':
      if (!isIn(state.phase, READY_PHASES)) return state;
      return { ...state, phase: 'listening', partialTranscript: '', error: null, notice: null };

    case 'PARTIAL_TRANSCRIPT':
      if (state.phase !== 'listening') return state;
      if (state.partialTranscript === event.text) return state;
      return { ...state, partialTranscript: event.text };

    case 'SPEECH_ENDED':
      if (state.phase !== 'listening') return state;
      return { ...state, phase: 'transcribing' };

    case 'TRANSCRIPT_READY':
      if (state.phase !== 'listening' && state.phase !== 'transcribing') return state;
      return {
        ...state,
        phase: 'understanding',
        inputType: 'voice',
        transcript: event.text,
        partialTranscript: '',
        error: null,
        notice: null,
        requestSeq: state.requestSeq + 1,
      };

    case 'TEXT_SUBMITTED':
    case 'VOICE_TRANSCRIPT_SUBMITTED':
      if (!isIn(state.phase, READY_PHASES)) return state;
      return {
        ...state,
        phase: 'understanding',
        inputType: event.type === 'TEXT_SUBMITTED' ? 'text' : 'voice',
        transcript: event.text,
        partialTranscript: '',
        error: null,
        notice: null,
        requestSeq: state.requestSeq + 1,
      };

    case 'THINKING_DELAY_ELAPSED':
      if (state.phase !== 'understanding' || event.seq !== state.requestSeq) return state;
      return { ...state, phase: 'thinking' };

    case 'RESPONSE_RECEIVED': {
      if (!isIn(state.phase, REQUEST_PHASES) || event.seq !== state.requestSeq) return state;
      const { response } = event;
      const context = response.context ?? state.context;

      if (response.clientCommand) {
        // Comando local (repete / para de falar / volta): a resposta anterior continua na tela.
        return {
          ...state,
          phase: event.willSpeak && state.turn ? 'answering' : restingPhase(state),
          notice: response.display?.message || null,
          error: null,
          context,
        };
      }

      const turn: AssistantTurn = {
        id: response.interactionId,
        inputType: state.inputType ?? response.inputType,
        transcript: state.transcript ?? '',
        response,
        receivedAt: event.receivedAt,
      };
      const thread = [...state.thread, turn].slice(-MAX_THREAD_TURNS);
      return {
        ...state,
        phase: event.willSpeak ? 'answering' : terminalPhase(response),
        turn,
        thread,
        notice: null,
        error: null,
        context,
      };
    }

    case 'REPEAT_REQUESTED':
      if (!isIn(state.phase, READY_PHASES) || !state.turn?.response.speech?.text?.trim()) return state;
      return { ...state, phase: 'answering', error: null, notice: null };

    case 'SPEECH_DONE':
      if (state.phase !== 'answering') return state;
      return { ...state, phase: restingPhase(state), notice: event.notice ?? state.notice };

    case 'STOP_SPEAKING':
      if (state.phase !== 'answering') return state;
      return { ...state, phase: restingPhase(state) };

    case 'REQUEST_FAILED':
      if (!isIn(state.phase, REQUEST_PHASES) || event.seq !== state.requestSeq) return state;
      return { ...state, phase: 'error', error: event.error, notice: null };

    case 'RECOGNITION_FAILED':
      if (state.phase !== 'listening' && state.phase !== 'transcribing' && !isIn(state.phase, READY_PHASES)) return state;
      return { ...state, phase: 'error', error: event.error, partialTranscript: '', notice: null };

    case 'CANCEL':
      if (!isIn(state.phase, CANCELLABLE_PHASES)) return state;
      return { ...state, phase: restingPhase(state), partialTranscript: '', error: null };

    case 'RESET_CONVERSATION':
      return createInitialVoiceAssistantState();

    default:
      return state;
  }
}
