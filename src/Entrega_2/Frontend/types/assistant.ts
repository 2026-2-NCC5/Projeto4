import type { ApiErrorKind } from '../services/apiClient';

import type {
  AssistantConversationContext,
  AssistantInputType,
  AssistantMessageRequest,
  AssistantResponse,
  AssistantScreenContext,
} from './api';
import type { VoiceErrorKind, VoicePhase } from './voice';

/** Uma interação concluída (pergunta + resposta da API). Permanece visível até a próxima resposta. */
export interface AssistantTurn {
  id: string;
  inputType: AssistantInputType;
  transcript: string;
  response: AssistantResponse;
  receivedAt: string;
}

/** Erros exibidos pelo assistente: falhas de voz ou falhas da API ('cancelled' nunca vira erro). */
export type VoiceAssistantErrorKind = VoiceErrorKind | Exclude<ApiErrorKind, 'cancelled'>;

export interface VoiceAssistantError {
  kind: VoiceAssistantErrorKind;
  message: string;
  /** Texto complementar menor (ex.: dica de development build no Expo Go). */
  detail?: string | null;
}

export interface VoiceAssistantState {
  phase: VoicePhase;
  inputType: AssistantInputType | null;
  /** Transcrição parcial enquanto o aluno fala. */
  partialTranscript: string;
  /** Última pergunta enviada (fala transcrita ou texto digitado). */
  transcript: string | null;
  /** Última resposta concluída — continua visível durante novas escutas, erros e após o áudio terminar. */
  turn: AssistantTurn | null;
  /** Conversa da sessão (pergunta + resposta), da mais antiga para a mais recente. Limpa em "Nova conversa". */
  thread: AssistantTurn[];
  /** Identificador local da conversa atual (agrupa o histórico); renovado em "Nova conversa". */
  conversationId: string;
  error: VoiceAssistantError | null;
  /** Aviso curto (ex.: resultado de um comando "repete"/"para de falar"). */
  notice: string | null;
  /** Contexto devolvido pela API e reenviado na próxima mensagem. */
  context: AssistantConversationContext;
  /** Número da interação atual; respostas de interações antigas são ignoradas. */
  requestSeq: number;
}

export type VoiceAssistantEvent =
  | { type: 'LISTEN_REQUESTED' }
  | { type: 'PARTIAL_TRANSCRIPT'; text: string }
  | { type: 'SPEECH_ENDED' }
  | { type: 'TRANSCRIPT_READY'; text: string }
  | { type: 'TEXT_SUBMITTED'; text: string }
  /** Transcrição pronta enviada fora de uma escuta (comando dito junto com "Hey Asa"). */
  | { type: 'VOICE_TRANSCRIPT_SUBMITTED'; text: string }
  | { type: 'THINKING_DELAY_ELAPSED'; seq: number }
  | { type: 'RESPONSE_RECEIVED'; seq: number; response: AssistantResponse; willSpeak: boolean; receivedAt: string }
  | { type: 'REPEAT_REQUESTED' }
  | { type: 'SPEECH_DONE'; notice?: string | null }
  | { type: 'STOP_SPEAKING' }
  | { type: 'REQUEST_FAILED'; seq: number; error: VoiceAssistantError }
  | { type: 'RECOGNITION_FAILED'; error: VoiceAssistantError }
  | { type: 'CANCEL' }
  | { type: 'RESET_CONVERSATION' };

export interface VoiceAssistantMetrics {
  speechRecognitionMs: number | null;
  requestMs: number | null;
  ttsMs: number | null;
  totalMs: number | null;
}

export interface SendAssistantMessageOptions {
  correlationId: string;
  signal: AbortSignal;
}

/** Contexto que o app conhece e pode compartilhar com o assistente (nada além do necessário). */
export interface AssistantScreenContextProvider {
  (): AssistantScreenContext | undefined;
}

export type SendAssistantMessage = (request: AssistantMessageRequest, options: SendAssistantMessageOptions) => Promise<AssistantResponse>;

/** Modos da aba Assistente. */
export type AssistantMode = 'conversation' | 'analysis';
