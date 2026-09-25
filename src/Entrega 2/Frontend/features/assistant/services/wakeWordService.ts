import { Platform } from 'react-native';

import { WAKE_WORD } from '../../../config/services';
import { buildRecognitionOptions, loadExpoSpeechRecognitionModule, type ExpoSpeechModuleLike, type SpeechModuleLoaderDeps, type SpeechSubscription } from '../../../services/voice/expoSpeechRecognitionAdapter';
import type { PermissionState, SpeechAvailability } from '../../../types/voice';

import { matchWakeWord, type WakeWordMatch } from './wakeWordMatcher';

/**
 * Detecção de "Hey Asa" — LIMITAÇÕES REAIS, documentadas em documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/assistant/wake-word.md:
 *  - Não existe motor de wake word (Porcupine/Snowboy) no Expo sem módulo nativo pago/custom. Usamos o
 *    reconhecedor de fala do sistema em modo contínuo, o que só é possível em development build
 *    (expo-speech-recognition) ou no navegador (Web Speech API). No Expo Go a detecção é indisponível.
 *  - Roda SOMENTE em primeiro plano e SOMENTE quando o aluno ligou a opção. Nunca em background.
 *  - O reconhecedor do sistema para sozinho após silêncio; reiniciamos com pequeno atraso e reciclamos
 *    a sessão periodicamente. Isso consome bateria — por isso a opção nasce desligada.
 *  - No Android a rede pode ser usada pelo serviço de voz do Google (a menos que on-device esteja ativo).
 */

export type WakeWordServiceStatus = 'idle' | 'starting' | 'listening' | 'stopped' | 'unavailable' | 'error';
export type WakeWordFailure = 'permission_denied' | 'unavailable' | 'network' | 'failures' | 'unknown';

export interface WakeWordDetection extends WakeWordMatch {
  transcript: string;
  isFinal: boolean;
}

export interface WakeWordHandlers {
  onDetected(detection: WakeWordDetection): void;
  onStatus?(status: WakeWordServiceStatus, failure?: WakeWordFailure): void;
  /** Transcrição parcial/final ouvida (diagnóstico; nunca é enviada nem persistida). */
  onHeard?(transcript: string): void;
}

export interface WakeWordService {
  readonly provider: 'expo-speech-recognition' | 'unavailable';
  getAvailability(): Promise<SpeechAvailability>;
  getPermission(): Promise<PermissionState>;
  /** Só em resposta a uma ação explícita do aluno (onboarding/toggle). */
  requestPermission(): Promise<PermissionState>;
  start(handlers: WakeWordHandlers): Promise<void>;
  stop(): Promise<void>;
  isActive(): boolean;
}

export interface CreateWakeWordServiceOptions extends SpeechModuleLoaderDeps {
  /** Módulo já carregado (testes); se ausente, carrega via loader. */
  module?: ExpoSpeechModuleLike | null;
  unavailableReason?: SpeechAvailability['reason'];
  featureEnabled?: boolean;
  language?: string;
  now?: () => number;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}

export function createUnavailableWakeWordService(reason: NonNullable<SpeechAvailability['reason']>): WakeWordService {
  return {
    provider: 'unavailable',
    getAvailability: async () => ({ available: false, reason }),
    getPermission: async () => 'denied',
    requestPermission: async () => 'denied',
    start: async (handlers) => {
      handlers.onStatus?.('unavailable', 'unavailable');
    },
    stop: async () => undefined,
    isActive: () => false,
  };
}

function toPermissionState(response: { granted: boolean; status: string; canAskAgain?: boolean } | null | undefined): PermissionState {
  if (!response) return 'undetermined';
  if (response.granted || response.status === 'granted') return 'granted';
  if (response.status === 'denied') return response.canAskAgain ? 'undetermined' : 'denied';
  return 'undetermined';
}

export function createWakeWordService(options: CreateWakeWordServiceOptions = {}): WakeWordService {
  const featureEnabled = options.featureEnabled ?? WAKE_WORD.FEATURE_ENABLED;
  if (!featureEnabled) return createUnavailableWakeWordService('provider_disabled');

  let speechModule: ExpoSpeechModuleLike | null = options.module ?? null;
  let unavailableReason = options.unavailableReason;
  if (options.module === undefined) {
    const loaded = loadExpoSpeechRecognitionModule(options);
    speechModule = loaded.module;
    unavailableReason = loaded.reason;
  }
  if (!speechModule) return createUnavailableWakeWordService(unavailableReason ?? 'not_supported');
  const module = speechModule;

  const isWeb = (options.platformOS ?? Platform.OS) === 'web';
  const language = options.language ?? undefined;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
  const clearTimer = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);

  let active = false;
  let generation = 0;
  let handlers: WakeWordHandlers | null = null;
  let subscriptions: SpeechSubscription[] = [];
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let sessionTimer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveFailures = 0;
  let lastDetectionAt = Number.NEGATIVE_INFINITY;
  let status: WakeWordServiceStatus = 'idle';

  function setStatus(next: WakeWordServiceStatus, failure?: WakeWordFailure) {
    if (status === next && !failure) return;
    status = next;
    handlers?.onStatus?.(next, failure);
  }

  function clearTimers() {
    if (restartTimer !== null) clearTimer(restartTimer);
    if (sessionTimer !== null) clearTimer(sessionTimer);
    restartTimer = null;
    sessionTimer = null;
  }

  function removeListeners() {
    const current = subscriptions;
    subscriptions = [];
    for (const subscription of current) {
      try {
        subscription.remove();
      } catch {
        // já removido
      }
    }
  }

  function abortRecognizer() {
    try {
      module.abort();
    } catch {
      // reconhecedor já parado
    }
  }

  function scheduleRestart(delayMs: number) {
    if (!active) return;
    if (restartTimer !== null) clearTimer(restartTimer);
    const myGeneration = generation;
    restartTimer = setTimer(() => {
      restartTimer = null;
      if (active && myGeneration === generation) startSession();
    }, delayMs);
  }

  function fail(failure: WakeWordFailure) {
    consecutiveFailures += 1;
    if (consecutiveFailures >= WAKE_WORD.MAX_CONSECUTIVE_FAILURES) {
      stopInternal();
      setStatus('error', failure === 'unknown' ? 'failures' : failure);
      return;
    }
    scheduleRestart(WAKE_WORD.RETRY_DELAY_MS);
  }

  function handleTranscript(transcript: string, isFinal: boolean) {
    if (!active) return;
    handlers?.onHeard?.(transcript);
    const match = matchWakeWord(transcript);
    if (!match.matched) return;
    const at = now();
    if (at - lastDetectionAt < WAKE_WORD.COOLDOWN_MS) return;
    lastDetectionAt = at;
    consecutiveFailures = 0;
    // Libera o reconhecedor imediatamente: a conversa vai precisar dele.
    removeListeners();
    clearTimers();
    generation += 1;
    abortRecognizer();
    active = false;
    setStatus('stopped');
    handlers?.onDetected({ ...match, transcript, isFinal });
  }

  function startSession() {
    if (!active) return;
    removeListeners();
    const myGeneration = ++generation;
    setStatus('starting');
    try {
      subscriptions.push(
        module.addListener('result', (event) => {
          if (myGeneration !== generation) return;
          const transcript = event?.results?.[0]?.transcript ?? '';
          if (transcript) handleTranscript(transcript, Boolean(event?.isFinal));
        }),
        module.addListener('start', () => {
          if (myGeneration === generation) {
            consecutiveFailures = 0;
            setStatus('listening');
          }
        }),
        module.addListener('error', (event) => {
          if (myGeneration !== generation || !active) return;
          const code = event?.error ?? 'unknown';
          if (code === 'not-allowed' || code === 'service-not-allowed') {
            stopInternal();
            setStatus('unavailable', 'permission_denied');
            return;
          }
          if (code === 'no-speech' || code === 'speech-timeout' || code === 'aborted') {
            // Silêncio ou reciclagem: recomeça sem contar como falha.
            scheduleRestart(WAKE_WORD.RESTART_DELAY_MS);
            return;
          }
          if (code === 'audio-capture' || code === 'language-not-supported') {
            stopInternal();
            setStatus('unavailable', 'unavailable');
            return;
          }
          fail(code === 'network' ? 'network' : 'unknown');
        }),
        module.addListener('end', () => {
          if (myGeneration !== generation || !active) return;
          // O serviço do sistema encerra sozinho após silêncio: religa em seguida.
          scheduleRestart(WAKE_WORD.RESTART_DELAY_MS);
        }),
      );
      module.start(buildRecognitionOptions({ ...(language ? { language } : {}), continuous: true, wakeWord: true }));
      if (sessionTimer !== null) clearTimer(sessionTimer);
      sessionTimer = setTimer(() => {
        sessionTimer = null;
        if (active && myGeneration === generation) {
          // Recicla a sessão para respeitar os limites do sistema e evitar sessões infinitas.
          abortRecognizer();
        }
      }, WAKE_WORD.MAX_SESSION_MS);
    } catch {
      fail('unknown');
    }
  }

  function stopInternal() {
    if (!active && subscriptions.length === 0) return;
    active = false;
    generation += 1;
    clearTimers();
    removeListeners();
    abortRecognizer();
  }

  return {
    provider: 'expo-speech-recognition',

    async getAvailability() {
      try {
        if (module.isRecognitionAvailable()) return { available: true };
        return { available: false, reason: isWeb ? 'not_supported' : 'no_service' };
      } catch {
        return { available: false, reason: 'not_supported' };
      }
    },

    async getPermission() {
      if (isWeb) return 'granted';
      try {
        return toPermissionState(await module.getPermissionsAsync());
      } catch {
        return 'undetermined';
      }
    },

    async requestPermission() {
      if (isWeb) return 'granted';
      try {
        const state = toPermissionState(await module.requestPermissionsAsync());
        return state === 'granted' ? 'granted' : 'denied';
      } catch {
        return 'denied';
      }
    },

    async start(nextHandlers) {
      if (active) await this.stop();
      handlers = nextHandlers;
      active = true;
      consecutiveFailures = 0;
      startSession();
    },

    async stop() {
      stopInternal();
      setStatus('stopped');
    },

    isActive: () => active,
  };
}
