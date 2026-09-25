import type { SendAssistantMessage } from '../../types/assistant';
import type { AssistantMessageRequest, AssistantResponse } from '../../types/api';
import type {
  HapticsService,
  PermissionState,
  SpeechAvailability,
  SpeechRecognitionHandlers,
  SpeechRecognitionResult,
  SpeechRecognitionService,
  SpeechSynthesisHandlers,
  SpeechSynthesisService,
  VoiceErrorKind,
} from '../../types/voice';

/** Reconhecimento de fala controlável pelo teste. */
export class FakeRecognition implements SpeechRecognitionService {
  readonly provider = 'expo-speech-recognition' as const;
  availability: SpeechAvailability = { available: true };
  permission: PermissionState = 'granted';
  requestResult: PermissionState = 'granted';
  handlers: SpeechRecognitionHandlers | null = null;
  /** Transcrição devolvida por stop(); null = stop() fica pendente até emitFinal. */
  stopTranscript: string | null = '';
  private pendingStop: ((result: SpeechRecognitionResult) => void) | null = null;

  getAvailability = jest.fn(async () => this.availability);
  getPermission = jest.fn(async () => this.permission);
  requestPermission = jest.fn(async () => this.requestResult);
  start = jest.fn(async (handlers: SpeechRecognitionHandlers) => {
    this.handlers = handlers;
  });
  stop = jest.fn(
    () =>
      new Promise<SpeechRecognitionResult>((resolve) => {
        if (this.stopTranscript === null) {
          this.pendingStop = resolve;
          return;
        }
        resolve({ transcript: this.stopTranscript, language: 'pt-BR' });
      }),
  );
  cancel = jest.fn(async () => {
    this.handlers = null;
  });

  emitPartial(text: string) {
    this.handlers?.onPartialTranscript?.(text);
  }
  emitLevel(level: number) {
    this.handlers?.onAudioLevel?.(level);
  }
  emitSpeechEnd() {
    this.handlers?.onSpeechEnd?.();
  }
  emitFinal(transcript: string) {
    const result = { transcript, language: 'pt-BR' };
    this.handlers?.onFinalResult?.(result);
    this.pendingStop?.(result);
    this.pendingStop = null;
  }
  emitError(kind: VoiceErrorKind) {
    this.handlers?.onError?.({ kind });
  }
}

/** TTS controlável: a fala só termina quando o teste chama finish()/fail(). */
export class FakeSynthesis implements SpeechSynthesisService {
  readonly provider = 'expo-speech' as const;
  handlers: SpeechSynthesisHandlers | null = null;
  spoken: string[] = [];
  speak = jest.fn((text: string, handlers?: SpeechSynthesisHandlers) => {
    this.spoken.push(text);
    this.handlers = handlers ?? null;
    handlers?.onStart?.();
  });
  stop = jest.fn(async () => {
    const handlers = this.handlers;
    this.handlers = null;
    handlers?.onStopped?.(10);
  });
  finish() {
    const handlers = this.handlers;
    this.handlers = null;
    handlers?.onDone?.(1200);
  }
  fail() {
    const handlers = this.handlers;
    this.handlers = null;
    handlers?.onError?.(new Error('tts'));
  }
}

export function fakeHaptics(): jest.Mocked<HapticsService> {
  return { listenStart: jest.fn(), listenEnd: jest.fn(), error: jest.fn() };
}

export interface PendingRequest {
  body: AssistantMessageRequest;
  correlationId: string;
  signal: AbortSignal;
  resolve: (response: AssistantResponse) => void;
  reject: (error: unknown) => void;
}

/** sendMessage que só resolve quando o teste mandar (permite observar understanding/thinking). */
export function controllableSend() {
  const requests: PendingRequest[] = [];
  const send = jest.fn<ReturnType<SendAssistantMessage>, Parameters<SendAssistantMessage>>(
    (body, { correlationId, signal }) =>
      new Promise<AssistantResponse>((resolve, reject) => {
        requests.push({ body, correlationId, signal, resolve, reject });
      }),
  );
  return { send, requests };
}
