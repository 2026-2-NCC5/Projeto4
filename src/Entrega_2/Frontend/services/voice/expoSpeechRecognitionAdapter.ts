import { isRunningInExpoGo, requireOptionalNativeModule } from 'expo';
import type { ExpoSpeechRecognitionErrorCode, ExpoSpeechRecognitionNativeEventMap, ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';
import { Platform } from 'react-native';

import { VOICE } from '../../config/services';
import type {
  PermissionState,
  SpeechAvailability,
  SpeechRecognitionError,
  SpeechRecognitionHandlers,
  SpeechRecognitionResult,
  SpeechRecognitionService,
  SpeechUnavailableReason,
  VoiceErrorKind,
} from '../../types/voice';

import { sharedRecognizerArbiter, type RecognizerArbiter, type RecognizerClaim } from './recognizerArbiter';

/** Nome do módulo nativo registrado por expo-speech-recognition. */
export const NATIVE_MODULE_NAME = 'ExpoSpeechRecognition';

export interface SpeechSubscription {
  remove(): void;
}

interface PermissionResponseLike {
  granted: boolean;
  status: string;
  canAskAgain?: boolean;
}

/** Subconjunto de ExpoSpeechRecognitionModule usado pelo app (facilita mocks nos testes). */
export interface ExpoSpeechModuleLike {
  start(options: ExpoSpeechRecognitionOptions): void;
  stop(): void;
  abort(): void;
  addListener<K extends keyof ExpoSpeechRecognitionNativeEventMap>(
    eventName: K,
    listener: (event: ExpoSpeechRecognitionNativeEventMap[K]) => void,
  ): SpeechSubscription;
  getPermissionsAsync(): Promise<PermissionResponseLike>;
  requestPermissionsAsync(): Promise<PermissionResponseLike>;
  isRecognitionAvailable(): boolean;
}

export type SpeechModuleLoadResult =
  | { module: ExpoSpeechModuleLike; reason?: undefined }
  | { module: null; reason: SpeechUnavailableReason };

export interface SpeechModuleLoaderDeps {
  platformOS?: string;
  requireOptionalNativeModule?: (name: string) => unknown;
  isRunningInExpoGo?: () => boolean;
  requirePackage?: () => { ExpoSpeechRecognitionModule?: unknown };
}

function requireSpeechRecognitionPackage(): { ExpoSpeechRecognitionModule?: unknown } {
  // Carregamento tardio e proposital: o pacote chama requireNativeModule() ao ser avaliado
  // e lançaria erro no Expo Go (que não contém o módulo nativo).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-speech-recognition') as { ExpoSpeechRecognitionModule?: unknown };
}

/**
 * Carrega o módulo de reconhecimento SEM quebrar o Expo Go:
 * - nativo: só avalia o pacote depois que requireOptionalNativeModule confirma o módulo nativo;
 * - web: usa a implementação Web Speech API do próprio pacote.
 */
export function loadExpoSpeechRecognitionModule(deps: SpeechModuleLoaderDeps = {}): SpeechModuleLoadResult {
  const platformOS = deps.platformOS ?? Platform.OS;

  if (platformOS !== 'web') {
    let nativeModule: unknown = null;
    try {
      nativeModule = (deps.requireOptionalNativeModule ?? requireOptionalNativeModule)(NATIVE_MODULE_NAME);
    } catch {
      nativeModule = null;
    }
    if (!nativeModule) {
      let expoGo = false;
      try {
        expoGo = (deps.isRunningInExpoGo ?? isRunningInExpoGo)();
      } catch {
        expoGo = false;
      }
      return { module: null, reason: expoGo ? 'expo_go' : 'not_supported' };
    }
  }

  try {
    const pkg = (deps.requirePackage ?? requireSpeechRecognitionPackage)();
    const speechModule = pkg?.ExpoSpeechRecognitionModule as ExpoSpeechModuleLike | undefined;
    return speechModule ? { module: speechModule } : { module: null, reason: 'not_supported' };
  } catch {
    return { module: null, reason: 'not_supported' };
  }
}

/** Evento `volumechange` (−2..10) → 0..1. Valores abaixo de 0 são inaudíveis. */
export function normalizeVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, (value + 2) / 12));
}

/** Converte o código de erro do serviço de voz; null = ignorar (abort pedido pelo app). */
export function mapRecognitionError(code: ExpoSpeechRecognitionErrorCode | string, cancelled = false): VoiceErrorKind | null {
  switch (code) {
    case 'not-allowed':
      return 'permission_denied';
    case 'no-speech':
    case 'speech-timeout':
      return 'no_speech';
    case 'network':
      return 'network';
    case 'audio-capture':
    case 'service-not-allowed':
    case 'language-not-supported':
      return 'unavailable';
    case 'aborted':
      return cancelled ? null : 'stt_failed';
    default:
      return 'stt_failed';
  }
}

export interface RecognitionOptionsInput {
  language?: string;
  onDeviceOnly?: boolean;
  volumeIntervalMs?: number;
  contextualStrings?: readonly string[];
  /** Sessão contínua (detecção de "Hey Asa"); o padrão é uma única fala. */
  continuous?: boolean;
  /** Modo wake word: sem eventos de volume e sem pontuação (menos trabalho para o sistema). */
  wakeWord?: boolean;
}

/** Junta trechos reconhecidos com um espaço (sem espaços duplicados). */
export function joinTranscript(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

/** Opções de start() — áudio nunca é persistido (recordingOptions.persist = false). */
export function buildRecognitionOptions(input: RecognitionOptionsInput = {}): ExpoSpeechRecognitionOptions {
  const wakeWord = input.wakeWord === true;
  return {
    lang: input.language ?? VOICE.LANGUAGE,
    interimResults: true,
    continuous: input.continuous ?? false,
    maxAlternatives: 1,
    addsPunctuation: !wakeWord,
    requiresOnDeviceRecognition: input.onDeviceOnly ?? VOICE.ON_DEVICE_ONLY,
    contextualStrings: [...(input.contextualStrings ?? VOICE.CONTEXTUAL_STRINGS)],
    recordingOptions: { persist: false },
    volumeChangeEventOptions: { enabled: !wakeWord, intervalMillis: input.volumeIntervalMs ?? VOICE.VOLUME_EVENT_INTERVAL_MS },
    iosCategory: { category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetooth'], mode: 'measurement' },
    // Ditado (frases longas e naturais) na conversa; o "Hey Asa" só procura uma frase curta.
    ...(wakeWord ? {} : { iosTaskHint: 'dictation' as const }),
    androidIntentOptions: { EXTRA_LANGUAGE_MODEL: 'free_form' },
  };
}

function toPermissionState(response: PermissionResponseLike | null | undefined): PermissionState {
  if (!response) return 'undetermined';
  if (response.granted || response.status === 'granted') return 'granted';
  // Negado mas ainda pode perguntar (Android): trata como indeterminado para pedir de novo no toque.
  if (response.status === 'denied') return response.canAskAgain ? 'undetermined' : 'denied';
  return 'undetermined';
}

interface ListenSession {
  handlers: SpeechRecognitionHandlers;
  subscriptions: SpeechSubscription[];
  settled: boolean;
  cancelled: boolean;
  lastPartial: string;
  result: SpeechRecognitionResult | null;
  waiters: ((result: SpeechRecognitionResult) => void)[];
  /** Posse do reconhecedor compartilhado (ver recognizerArbiter). */
  claim: RecognizerClaim | null;
  /** O sistema confirmou que está ouvindo (evento `start`). */
  started: boolean;
  stopRequested: boolean;
  startCalledAt: number;
  busyRetries: number;
  /** Religando após `busy`/`client` na abertura: o `end` dessa tentativa não encerra a escuta. */
  restarting: boolean;
  /** Escuta contínua: trechos já finalizados pelo reconhecedor (a fala inteira é a soma deles). */
  committed: string;
}

/** Espera máxima pelo `end` da sessão do "Hey Asa" antes de abrir a da conversa. */
export const HANDOFF_TIMEOUT_MS = 600;
/** Atraso para tentar abrir de novo quando o serviço de voz ainda está ocupado. */
export const BUSY_RETRY_DELAY_MS = 300;
const MAX_BUSY_RETRIES = 1;
/** Um `end` sem `start` logo após abrir a escuta é resto da sessão anterior (abort), não desta. */
const STALE_END_WINDOW_MS = 250;
/** Erros em que a última parcial ouvida vale como resposta (o Android costuma fechar assim). */
const PARTIAL_FALLBACK_KINDS: readonly VoiceErrorKind[] = ['no_speech', 'stt_failed', 'network'];

export interface ExpoSpeechRecognitionAdapterOptions {
  module: ExpoSpeechModuleLike | null;
  unavailableReason?: SpeechUnavailableReason;
  platformOS?: string;
  language?: string;
  onDeviceOnly?: boolean;
  /** Árbitro do reconhecedor compartilhado com o "Hey Asa" (padrão: o do app). */
  arbiter?: RecognizerArbiter;
  handoffTimeoutMs?: number;
  busyRetryDelayMs?: number;
  now?: () => number;
  /**
   * Escuta contínua: o reconhecedor NÃO encerra na primeira pausa (o Android corta a frase em ~1 s de
   * silêncio). Cada trecho finalizado é acumulado; quem decide o fim é o app (silêncio prolongado,
   * toque no botão ou tempo máximo), chamando stop().
   */
  continuous?: boolean;
}

/**
 * Adapter de expo-speech-recognition (nativo iOS/Android e Web Speech API).
 * Garante: um único resultado por escuta, listeners sempre removidos no `end`/`cancel`,
 * nenhum áudio persistido e convivência com o "Hey Asa" no mesmo reconhecedor.
 */
export function createExpoSpeechRecognitionAdapter(options: ExpoSpeechRecognitionAdapterOptions): SpeechRecognitionService {
  const speechModule = options.module;
  const language = options.language ?? VOICE.LANGUAGE;
  const isWeb = (options.platformOS ?? Platform.OS) === 'web';
  const arbiter = options.arbiter ?? sharedRecognizerArbiter;
  const handoffTimeoutMs = options.handoffTimeoutMs ?? HANDOFF_TIMEOUT_MS;
  const busyRetryDelayMs = options.busyRetryDelayMs ?? BUSY_RETRY_DELAY_MS;
  const now = options.now ?? Date.now;
  const continuous = options.continuous === true;
  let session: ListenSession | null = null;

  const emptyResult = (): SpeechRecognitionResult => ({ transcript: '', language });

  function cleanup(target: ListenSession) {
    const subscriptions = target.subscriptions;
    target.subscriptions = [];
    for (const subscription of subscriptions) {
      try {
        subscription.remove();
      } catch {
        // listener já removido
      }
    }
    target.claim?.release();
    if (session === target) session = null;
  }

  function resolveWaiters(target: ListenSession, result: SpeechRecognitionResult) {
    const waiters = target.waiters;
    target.waiters = [];
    waiters.forEach((resolve) => resolve(result));
  }

  function settleFinal(target: ListenSession, result: SpeechRecognitionResult) {
    if (target.settled) return;
    target.settled = true;
    target.result = result;
    // A escuta acabou: o reconhecedor fica livre para o "Hey Asa" (os listeners saem no `end`).
    target.claim?.release();
    try {
      target.handlers.onFinalResult?.(result);
    } finally {
      resolveWaiters(target, result);
    }
  }

  function settleError(target: ListenSession, error: SpeechRecognitionError) {
    if (target.settled) return;
    target.settled = true;
    target.result = emptyResult();
    target.claim?.release();
    try {
      target.handlers.onError?.(error);
    } finally {
      resolveWaiters(target, target.result);
    }
  }

  /** O "Hey Asa" ou outra escuta tomou o reconhecedor: solta tudo sem abort() (a sessão nativa já é de outro). */
  function preempted(target: ListenSession) {
    if (target.settled || target.cancelled) {
      cleanup(target);
      return;
    }
    const partial = target.lastPartial.trim();
    cleanup(target);
    if (partial) settleFinal(target, { transcript: partial, language });
    else settleError(target, { kind: 'stt_failed' });
  }

  /** abort() da sessão de outro cliente e espera o `end` que o Android emite em seguida (com limite). */
  function abortAndWaitForEnd(module: ExpoSpeechModuleLike): Promise<void> {
    return new Promise<void>((resolve) => {
      let finished = false;
      let subscription: SpeechSubscription | null = null;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try {
          subscription?.remove();
        } catch {
          // já removido
        }
        resolve();
      };
      const timer = setTimeout(finish, handoffTimeoutMs);
      try {
        subscription = module.addListener('end', finish);
      } catch {
        // sem eventos: resta o limite de tempo
      }
      try {
        module.abort();
      } catch {
        finish();
      }
    });
  }

  async function cancel(): Promise<void> {
    const target = session;
    if (!target) return;
    target.cancelled = true;
    if (!target.settled) {
      target.settled = true;
      target.result = emptyResult();
      resolveWaiters(target, target.result);
    }
    // Só aborta se a sessão nativa ainda é desta escuta; senão derrubaria a do "Hey Asa"/da próxima escuta.
    if (target.claim?.isCurrent()) {
      try {
        speechModule?.abort();
      } catch {
        // serviço já parado
      }
    }
    cleanup(target);
  }

  return {
    provider: 'expo-speech-recognition',

    async getAvailability(): Promise<SpeechAvailability> {
      if (!speechModule) return { available: false, reason: options.unavailableReason ?? 'not_supported' };
      try {
        if (speechModule.isRecognitionAvailable()) return { available: true };
        return { available: false, reason: isWeb ? 'not_supported' : 'no_service' };
      } catch {
        return { available: false, reason: 'not_supported' };
      }
    },

    async getPermission(): Promise<PermissionState> {
      if (!speechModule) return 'denied';
      // Web: o navegador pede a permissão no start(); uma recusa chega como erro 'not-allowed'.
      if (isWeb) return 'granted';
      try {
        return toPermissionState(await speechModule.getPermissionsAsync());
      } catch {
        return 'undetermined';
      }
    },

    async requestPermission(): Promise<PermissionState> {
      if (!speechModule) return 'denied';
      if (isWeb) return 'granted';
      try {
        const state = toPermissionState(await speechModule.requestPermissionsAsync());
        return state === 'granted' ? 'granted' : 'denied';
      } catch {
        return 'denied';
      }
    },

    async start(handlers: SpeechRecognitionHandlers): Promise<void> {
      if (!speechModule) {
        handlers.onError?.({ kind: 'unavailable' });
        return;
      }
      if (session) await cancel();

      const target: ListenSession = {
        handlers,
        subscriptions: [],
        settled: false,
        cancelled: false,
        lastPartial: '',
        result: null,
        waiters: [],
        claim: null,
        started: false,
        stopRequested: false,
        startCalledAt: 0,
        busyRetries: 0,
        restarting: false,
        committed: '',
      };
      session = target;
      const isActive = () => session === target && !target.settled && !target.cancelled;

      const taken = arbiter.claim('conversation', () => preempted(target));
      target.claim = taken.claim;
      if (taken.preempted === 'wake_word') {
        // O "Hey Asa" estava ouvindo: encerra a sessão dele e espera o `end` antes de abrir a nossa.
        // Sem isso, o `end` dele (ou o serviço ainda ocupado) derrubaria a pergunta logo ao abrir.
        await abortAndWaitForEnd(speechModule);
        if (!isActive()) return;
      }

      const recognitionOptions = buildRecognitionOptions({ language, onDeviceOnly: options.onDeviceOnly, continuous });
      const openNative = () => {
        target.startCalledAt = now();
        speechModule.start(recognitionOptions);
      };

      const listen = <K extends keyof ExpoSpeechRecognitionNativeEventMap>(
        eventName: K,
        listener: (event: ExpoSpeechRecognitionNativeEventMap[K]) => void,
      ) => {
        target.subscriptions.push(speechModule.addListener(eventName, listener));
      };

      try {
        listen('start', () => {
          if (isActive()) target.started = true;
        });
        listen('result', (event) => {
          if (!isActive()) return;
          const best = event?.results?.[0];
          const transcript = best?.transcript ?? '';
          if (continuous) {
            if (event.isFinal) {
              const segment = transcript.trim();
              // Alguns aparelhos repetem o último trecho finalizado: não duplica.
              if (segment && !target.committed.endsWith(segment)) target.committed = joinTranscript(target.committed, segment);
              target.lastPartial = target.committed;
              if (target.stopRequested) {
                settleFinal(target, { transcript: target.committed, language });
                return;
              }
            } else {
              target.lastPartial = joinTranscript(target.committed, transcript);
            }
            if (target.lastPartial) target.handlers.onPartialTranscript?.(target.lastPartial);
            return;
          }
          if (event.isFinal) {
            const confidence = typeof best?.confidence === 'number' && best.confidence >= 0 ? best.confidence : undefined;
            settleFinal(target, { transcript: transcript.trim(), language, ...(confidence !== undefined ? { confidence } : {}) });
          } else {
            target.lastPartial = transcript;
            target.handlers.onPartialTranscript?.(transcript);
          }
        });
        listen('speechend', () => {
          // Na escuta contínua uma pausa não encerra a pergunta: o fim é decidido pelo app.
          if (isActive() && !continuous) target.handlers.onSpeechEnd?.();
        });
        listen('volumechange', (event) => {
          if (isActive()) target.handlers.onAudioLevel?.(normalizeVolume(event?.value ?? -2));
        });
        listen('error', (event) => {
          if (target.cancelled || session !== target || target.settled) return;
          const code = event?.error ?? 'unknown';
          // Serviço de voz ainda ocupado com a sessão anterior: tenta abrir de novo uma vez.
          if ((code === 'busy' || code === 'client') && !target.started && !target.stopRequested && target.busyRetries < MAX_BUSY_RETRIES) {
            target.busyRetries += 1;
            target.restarting = true;
            setTimeout(() => {
              target.restarting = false;
              if (!isActive()) return;
              try {
                openNative();
              } catch (error) {
                settleError(target, { kind: 'stt_failed', message: error instanceof Error ? error.message : undefined });
                cleanup(target);
              }
            }, busyRetryDelayMs);
            return;
          }
          const kind = mapRecognitionError(code, target.cancelled);
          if (!kind) return;
          const partial = target.lastPartial.trim();
          // O Android encerra com no-speech/client mesmo depois de mostrar o texto: aproveita a parcial.
          if (partial && PARTIAL_FALLBACK_KINDS.includes(kind)) {
            settleFinal(target, { transcript: partial, language });
            return;
          }
          settleError(target, { kind, message: event?.message });
        });
        listen('end', () => {
          if (target.restarting) return;
          if (!target.settled && !target.cancelled && !target.started && !target.stopRequested && now() - target.startCalledAt < STALE_END_WINDOW_MS) return;
          // Sem resultado final explícito (ex.: iOS encerrou por silêncio): usa a última parcial.
          if (!target.cancelled && !target.settled) settleFinal(target, { transcript: target.lastPartial.trim(), language });
          cleanup(target);
        });

        openNative();
      } catch (error) {
        settleError(target, { kind: 'stt_failed', message: error instanceof Error ? error.message : undefined });
        cleanup(target);
      }
    },

    async stop(): Promise<SpeechRecognitionResult> {
      const target = session;
      if (!speechModule || !target) return emptyResult();
      if (target.settled) return target.result ?? emptyResult();
      target.stopRequested = true;
      const result = new Promise<SpeechRecognitionResult>((resolve) => target.waiters.push(resolve));
      if (!target.claim?.isCurrent()) {
        // Outro cliente tomou o reconhecedor: fica com o que já foi ouvido.
        settleFinal(target, { transcript: target.lastPartial.trim(), language });
        cleanup(target);
        return result;
      }
      try {
        speechModule.stop();
      } catch {
        settleFinal(target, { transcript: target.lastPartial.trim(), language });
        cleanup(target);
      }
      return result;
    },

    cancel,
  };
}
