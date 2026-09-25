/**
 * Tipos da camada de voz (reconhecimento de fala, síntese de fala e háptica).
 * A UI nunca fala diretamente com expo-speech-recognition/expo-speech: tudo passa por estas interfaces.
 */

/** Fases da máquina de estados do assistente (hooks/voiceAssistantReducer.ts). */
export type VoicePhase =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'understanding'
  | 'thinking'
  | 'answering'
  | 'abstained'
  | 'human_validation'
  | 'error';

/** Falhas originadas no reconhecimento de fala (antes de qualquer chamada à API). */
export type VoiceErrorKind = 'permission_denied' | 'unavailable' | 'no_speech' | 'network' | 'stt_failed';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export type SpeechUnavailableReason = 'expo_go' | 'provider_disabled' | 'not_supported' | 'no_service';

export interface SpeechAvailability {
  available: boolean;
  reason?: SpeechUnavailableReason;
}

export interface SpeechRecognitionResult {
  transcript: string;
  /** 0–1 quando o serviço informa. */
  confidence?: number;
  language: string;
}

export interface SpeechRecognitionError {
  kind: VoiceErrorKind;
  message?: string;
}

export interface SpeechRecognitionHandlers {
  onPartialTranscript?(transcript: string): void;
  /** Nível do microfone normalizado em 0–1 (chamado em baixa frequência; nunca usar para setState). */
  onAudioLevel?(level01: number): void;
  onSpeechEnd?(): void;
  /** Chamado no máximo uma vez por sessão de escuta. */
  onFinalResult?(result: SpeechRecognitionResult): void;
  /** Chamado no máximo uma vez por sessão de escuta (e nunca após cancel()). */
  onError?(error: SpeechRecognitionError): void;
}

export interface SpeechRecognitionService {
  readonly provider: 'expo-speech-recognition' | 'unavailable';
  getAvailability(): Promise<SpeechAvailability>;
  getPermission(): Promise<PermissionState>;
  /** Só deve ser chamado em resposta a um toque do usuário no microfone — nunca no boot. */
  requestPermission(): Promise<PermissionState>;
  start(handlers: SpeechRecognitionHandlers): Promise<void>;
  /** Finalização pedida pelo usuário; resolve com a transcrição final ('' se nada). */
  stop(): Promise<SpeechRecognitionResult>;
  /** Aborta sem resultado e remove todos os listeners. */
  cancel(): Promise<void>;
}

export interface SpeechSynthesisHandlers {
  onStart?(): void;
  /** Fala concluída; recebe a duração em ms. */
  onDone?(durationMs: number): void;
  /** Fala interrompida por stop(); recebe a duração em ms. */
  onStopped?(durationMs: number): void;
  onError?(error: unknown): void;
}

export interface SpeechSynthesisService {
  readonly provider: 'expo-speech' | 'none';
  speak(text: string, handlers?: SpeechSynthesisHandlers): void;
  stop(): Promise<void>;
}

export interface HapticsService {
  listenStart(): void;
  listenEnd(): void;
  error(): void;
}
