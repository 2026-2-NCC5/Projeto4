import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Animated } from 'react-native';

import { VOICE } from '../config/services';
import { createCorrelationId } from '../services/apiClient';
import { assistantService } from '../services/assistantService';
import { createHapticsService } from '../services/voice/haptics';
import { createSpeechRecognitionService } from '../services/voice/speechRecognition';
import { createSpeechSynthesisService } from '../services/voice/speechSynthesis';
import { NATIVE_DRIVER } from '../theme';
import type {
  AssistantScreenContextProvider,
  AssistantTurn,
  SendAssistantMessage,
  VoiceAssistantError,
  VoiceAssistantErrorKind,
  VoiceAssistantEvent,
  VoiceAssistantMetrics,
  VoiceAssistantState,
} from '../types/assistant';
import type { AssistantClientMetrics, AssistantInputType, AssistantMessageRequest, AssistantNavigationAction, AssistantResponse } from '../types/api';
import type {
  HapticsService,
  PermissionState,
  SpeechAvailability,
  SpeechRecognitionResult,
  SpeechRecognitionService,
  SpeechSynthesisService,
  VoiceErrorKind,
} from '../types/voice';
import { MESSAGES, voiceAssistantErrorMessage } from '../utils/messages';

import { usePreferences } from './usePreferences';
import { toApiClientError } from './useResource';
import { CANCELLABLE_PHASES, READY_PHASES, createInitialVoiceAssistantState, voiceAssistantReducer } from './voiceAssistantReducer';

export const EMPTY_VOICE_METRICS: VoiceAssistantMetrics = Object.freeze({
  speechRecognitionMs: null,
  requestMs: null,
  ttsMs: null,
  totalMs: null,
});

type TimerKey = 'listen' | 'transcribe' | 'thinking';

interface ControllerDeps {
  recognition: SpeechRecognitionService;
  synthesis: SpeechSynthesisService;
  sendMessage: SendAssistantMessage;
  haptics: HapticsService;
  now: () => number;
  audioLevel: Animated.Value;
}

/** Opções que mudam durante a vida do provider (preferência de voz, navegação e contexto de tela). */
export interface ControllerOptions {
  ttsEnabled: boolean;
  onGoBack?: () => void;
  /** Executa a navegação pedida pela API (intenção open_screen). */
  onNavigate?: (navigation: AssistantNavigationAction) => void;
  /** Tela atual, enviada como `currentScreen` (contexto; nunca identidade). */
  getCurrentScreen?: AssistantScreenContextProvider;
  /** Chamado a cada turno concluído (histórico local, telemetria). */
  onTurn?: (turn: AssistantTurn, conversationId: string) => void;
  /** Chamado quando a fala (TTS) começa/termina — permite pausar a detecção de "Hey Asa". */
  onSpeakingChange?: (speaking: boolean, text: string | null) => void;
}

interface ControllerListeners {
  onState: (state: VoiceAssistantState) => void;
  onAvailability: (availability: SpeechAvailability) => void;
  onMetrics: (metrics: VoiceAssistantMetrics) => void;
}

interface InteractionTiming {
  startedAt: number;
  speechRecognitionMs: number | null;
  requestMs: number | null;
}

/** Executa uma função possivelmente assíncrona sem deixar exceções/rejeições escaparem. */
function safely(run: () => unknown): void {
  try {
    const result = run() as { then?: unknown } | undefined;
    if (result && typeof result.then === 'function') {
      (result as Promise<unknown>).then(undefined, () => undefined);
    }
  } catch {
    // best-effort
  }
}

/**
 * Orquestra reconhecimento → API → TTS usando o reducer puro como única fonte de verdade.
 * Vive fora do React (métodos estáveis, sem closures de render) e notifica o provider.
 */
class VoiceAssistantController {
  state: VoiceAssistantState = createInitialVoiceAssistantState();
  availability: SpeechAvailability | null = null;

  private listeners: ControllerListeners | null = null;
  private availabilityPromise: Promise<SpeechAvailability> | null = null;
  private timers: Partial<Record<TimerKey, ReturnType<typeof setTimeout>>> = {};
  private starting = false;
  private listenSession = 0;
  private listenHandled = true;
  private listenStartedAt = 0;
  private abortController: AbortController | null = null;
  private speechId = 0;
  private speaking = false;
  /** false depois de releaseMedia(): respostas que chegarem não são faladas até nova interação. */
  private mediaActive = true;
  private interaction: InteractionTiming | null = null;

  private ttsEnabled: boolean;
  private options: ControllerOptions;

  constructor(
    private readonly deps: ControllerDeps,
    options: ControllerOptions,
  ) {
    this.ttsEnabled = options.ttsEnabled;
    this.options = options;
  }

  configure(options: ControllerOptions) {
    this.ttsEnabled = options.ttsEnabled;
    this.options = options;
  }

  /** true enquanto a resposta está sendo falada. */
  get isSpeaking(): boolean {
    return this.speaking;
  }

  get audioLevel(): Animated.Value {
    return this.deps.audioLevel;
  }

  attach(listeners: ControllerListeners) {
    this.listeners = listeners;
    listeners.onState(this.state);
    if (this.availability) listeners.onAvailability(this.availability);
  }

  /** Desmontagem do provider (logout): aborta tudo e libera microfone/TTS. */
  dispose() {
    this.listeners = null;
    this.clearTimers();
    this.abortController?.abort();
    this.abortController = null;
    if (!this.listenHandled) {
      this.listenHandled = true;
      this.listenSession += 1;
      safely(() => this.deps.recognition.cancel());
    }
    this.speechId += 1;
    if (this.speaking || this.state.phase === 'answering') {
      this.speaking = false;
      safely(() => this.deps.synthesis.stop());
    }
  }

  // ------------------------------------------------------------------ infraestrutura

  private dispatch(event: VoiceAssistantEvent): VoiceAssistantState {
    const next = voiceAssistantReducer(this.state, event);
    if (next !== this.state) {
      this.state = next;
      this.listeners?.onState(next);
    }
    return next;
  }

  private setTimer(key: TimerKey, run: () => void, ms: number) {
    this.clearTimer(key);
    this.timers[key] = setTimeout(() => {
      this.timers[key] = undefined;
      run();
    }, ms);
  }

  private clearTimer(key: TimerKey) {
    const timer = this.timers[key];
    if (timer !== undefined) clearTimeout(timer);
    this.timers[key] = undefined;
  }

  private clearTimers() {
    this.clearTimer('listen');
    this.clearTimer('transcribe');
    this.clearTimer('thinking');
  }

  private animateLevel(level: number) {
    const toValue = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));
    Animated.timing(this.deps.audioLevel, { toValue, duration: VOICE.VOLUME_EVENT_INTERVAL_MS, useNativeDriver: NATIVE_DRIVER }).start();
  }

  private resetLevel() {
    this.deps.audioLevel.stopAnimation();
    this.deps.audioLevel.setValue(0);
  }

  private buildError(kind: VoiceAssistantErrorKind): VoiceAssistantError {
    const detail = kind === 'unavailable' && this.availability?.reason === 'expo_go' ? MESSAGES.voiceUnavailableExpoGo : null;
    return { kind, message: voiceAssistantErrorMessage(kind), detail };
  }

  loadAvailability = (): Promise<SpeechAvailability> => {
    if (this.availability) return Promise.resolve(this.availability);
    if (!this.availabilityPromise) {
      this.availabilityPromise = Promise.resolve()
        .then(() => this.deps.recognition.getAvailability())
        .catch((): SpeechAvailability => ({ available: false, reason: 'not_supported' }))
        .then((availability) => {
          this.availability = availability;
          this.listeners?.onAvailability(availability);
          return availability;
        });
    }
    return this.availabilityPromise;
  };

  // ------------------------------------------------------------------ escuta

  startListening = async (): Promise<void> => {
    if (this.starting || !READY_PHASES.includes(this.state.phase)) return;
    this.starting = true;
    this.mediaActive = true;
    let session = -1;
    try {
      if (this.state.phase === 'answering') this.stopSpeaking();

      const availability = await this.loadAvailability();
      if (!availability.available) {
        this.recognitionFailed('unavailable');
        return;
      }

      // Permissão pedida SOMENTE aqui, em resposta ao toque no microfone.
      let permission: PermissionState = await this.deps.recognition.getPermission().catch((): PermissionState => 'undetermined');
      if (permission === 'undetermined') {
        permission = await this.deps.recognition.requestPermission().catch((): PermissionState => 'denied');
      }
      if (permission !== 'granted') {
        this.recognitionFailed('permission_denied');
        return;
      }

      if (!this.listeners || !READY_PHASES.includes(this.state.phase)) return;
      if (this.dispatch({ type: 'LISTEN_REQUESTED' }).phase !== 'listening') return;

      session = ++this.listenSession;
      this.listenHandled = false;
      this.listenStartedAt = this.deps.now();
      this.interaction = { startedAt: this.listenStartedAt, speechRecognitionMs: null, requestMs: null };
      this.resetLevel();
      this.deps.haptics.listenStart();
      this.setTimer('listen', () => void this.stopListening(), VOICE.LISTEN_MAX_MS);

      const activeSession = session;
      await this.deps.recognition.start({
        onPartialTranscript: (text) => {
          if (this.isCurrentListen(activeSession)) this.dispatch({ type: 'PARTIAL_TRANSCRIPT', text });
        },
        onAudioLevel: (level) => {
          if (this.isCurrentListen(activeSession) && this.state.phase === 'listening') this.animateLevel(level);
        },
        onSpeechEnd: () => {
          if (this.isCurrentListen(activeSession)) this.enterTranscribing(activeSession);
        },
        onFinalResult: (result) => this.handleFinalResult(activeSession, result),
        onError: (error) => this.handleRecognitionError(activeSession, error.kind),
      });
    } catch {
      if (session >= 0) this.handleRecognitionError(session, 'stt_failed');
    } finally {
      this.starting = false;
    }
  };

  /** Finaliza a escuta e envia o que foi dito. */
  stopListening = async (): Promise<void> => {
    if (this.state.phase !== 'listening') return;
    const session = this.listenSession;
    this.enterTranscribing(session);
    let result: SpeechRecognitionResult;
    try {
      result = await this.deps.recognition.stop();
    } catch {
      this.handleRecognitionError(session, 'stt_failed');
      return;
    }
    this.handleFinalResult(session, result);
  };

  private isCurrentListen(session: number) {
    return session === this.listenSession && !this.listenHandled;
  }

  private enterTranscribing(session: number) {
    const before = this.state;
    const next = this.dispatch({ type: 'SPEECH_ENDED' });
    if (next === before) return;
    this.clearTimer('listen');
    this.resetLevel();
    this.deps.haptics.listenEnd();
    this.setTimer(
      'transcribe',
      () => {
        if (this.isCurrentListen(session) && this.state.phase === 'transcribing') this.handleRecognitionError(session, 'stt_failed');
      },
      VOICE.TRANSCRIBE_TIMEOUT_MS,
    );
  }

  private handleFinalResult(session: number, result: SpeechRecognitionResult | null | undefined) {
    if (!this.isCurrentListen(session)) return;
    const wasListening = this.state.phase === 'listening';
    if (!wasListening && this.state.phase !== 'transcribing') return;
    this.listenHandled = true;
    this.clearTimer('listen');
    this.clearTimer('transcribe');
    this.resetLevel();

    const speechRecognitionMs = Math.max(0, this.deps.now() - this.listenStartedAt);
    if (this.interaction) this.interaction.speechRecognitionMs = speechRecognitionMs;

    const text = (result?.transcript ?? '').trim();
    if (text.length < VOICE.MIN_TRANSCRIPT_CHARS) {
      // Nada útil foi ouvido: não chama a API.
      this.interaction = null;
      this.recognitionFailed('no_speech');
      return;
    }
    if (wasListening) this.deps.haptics.listenEnd();
    void this.runInteraction('voice', text, { speechRecognitionMs });
  }

  private handleRecognitionError(session: number, kind: VoiceErrorKind) {
    if (!this.isCurrentListen(session)) return;
    this.listenHandled = true;
    this.clearTimer('listen');
    this.clearTimer('transcribe');
    this.resetLevel();
    this.interaction = null;
    safely(() => this.deps.recognition.cancel());
    this.recognitionFailed(kind);
  }

  private recognitionFailed(kind: VoiceErrorKind) {
    const before = this.state;
    const next = this.dispatch({ type: 'RECOGNITION_FAILED', error: this.buildError(kind) });
    if (next !== before) this.deps.haptics.error();
  }

  // ------------------------------------------------------------------ envio (voz e texto)

  submitText = async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed || !READY_PHASES.includes(this.state.phase)) return;
    this.mediaActive = true;
    if (this.state.phase === 'answering') this.silence();
    this.interaction = { startedAt: this.deps.now(), speechRecognitionMs: null, requestMs: null };
    await this.runInteraction('text', trimmed);
  };

  /**
   * Envia uma transcrição já pronta como fala (ex.: "Hey Asa, qual minha próxima aula?" dita de uma vez
   * durante a detecção da palavra de ativação). Segue o mesmo caminho de qualquer pergunta.
   */
  submitTranscript = async (text: string): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed || !READY_PHASES.includes(this.state.phase)) return;
    this.mediaActive = true;
    if (this.state.phase === 'answering') this.silence();
    this.interaction = { startedAt: this.deps.now(), speechRecognitionMs: null, requestMs: null };
    await this.runInteraction('voice', trimmed);
  };

  /** Única função de envio: fala transcrita e texto digitado seguem exatamente o mesmo caminho. */
  private async runInteraction(inputType: AssistantInputType, rawText: string, clientMetrics?: AssistantClientMetrics): Promise<void> {
    const text = rawText.trim().slice(0, VOICE.MAX_TEXT_CHARS);
    if (!text) return;
    const before = this.state;
    const inListen = before.phase === 'listening' || before.phase === 'transcribing';
    const next = this.dispatch(inputType === 'voice' ? (inListen ? { type: 'TRANSCRIPT_READY', text } : { type: 'VOICE_TRANSCRIPT_SUBMITTED', text }) : { type: 'TEXT_SUBMITTED', text });
    if (next === before) return;

    const seq = next.requestSeq;
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;
    const correlationId = createCorrelationId();
    const startedAt = this.deps.now();
    this.setTimer('thinking', () => this.dispatch({ type: 'THINKING_DELAY_ELAPSED', seq }), VOICE.THINKING_DELAY_MS);

    // Nunca enviar studentId: a identidade vem do token. currentScreen é só contexto de interpretação.
    let currentScreen: AssistantMessageRequest['currentScreen'];
    try {
      currentScreen = this.options.getCurrentScreen?.();
    } catch {
      currentScreen = undefined;
    }
    const body: AssistantMessageRequest = {
      inputType,
      text,
      conversationContext: { ...next.context },
      ...(currentScreen ? { currentScreen } : {}),
      ...(clientMetrics ? { clientMetrics } : {}),
    };

    try {
      const response = await this.deps.sendMessage(body, { correlationId, signal: controller.signal });
      if (controller.signal.aborted || seq !== this.state.requestSeq) return;
      this.clearTimer('thinking');
      if (this.interaction) this.interaction.requestMs = this.deps.now() - startedAt;
      this.handleResponse(seq, response);
    } catch (caught) {
      if (controller.signal.aborted || seq !== this.state.requestSeq) return;
      this.clearTimer('thinking');
      const error = toApiClientError(caught);
      if (error.kind === 'cancelled') return;
      this.interaction = null;
      const beforeFailure = this.state;
      const failed = this.dispatch({ type: 'REQUEST_FAILED', seq, error: this.buildError(error.kind) });
      if (failed !== beforeFailure) this.deps.haptics.error();
    } finally {
      if (this.abortController === controller) this.abortController = null;
    }
  }

  private handleResponse(seq: number, response: AssistantResponse) {
    const previousTurn = this.state.turn;
    const command = response.clientCommand;
    let speechText = '';
    if (command === 'repeat_last') speechText = previousTurn?.response.speech?.text?.trim() ?? '';
    else if (!command) speechText = response.speech?.text?.trim() ?? '';
    const willSpeak = this.ttsEnabled && this.mediaActive && speechText.length > 0;

    const before = this.state;
    const next = this.dispatch({
      type: 'RESPONSE_RECEIVED',
      seq,
      response,
      willSpeak,
      receivedAt: new Date(this.deps.now()).toISOString(),
    });
    if (next === before) return;

    if (command === 'stop_speaking') this.silence();
    if (command === 'go_back') safely(() => this.options.onGoBack?.());
    if (!command && next.turn && next.turn !== previousTurn) {
      const turn = next.turn;
      safely(() => this.options.onTurn?.(turn, next.conversationId));
    }
    if (response.navigation) {
      const navigation = response.navigation;
      safely(() => this.options.onNavigate?.(navigation));
    }

    if (willSpeak && next.phase === 'answering') this.speak(speechText);
    else this.finishInteraction(null);
  }

  // ------------------------------------------------------------------ fala (TTS)

  private speak(text: string) {
    const id = ++this.speechId;
    const startedAt = this.deps.now();
    this.speaking = true;
    safely(() => this.options.onSpeakingChange?.(true, text));
    const done = (notice?: string) => {
      if (id !== this.speechId) return;
      this.speaking = false;
      safely(() => this.options.onSpeakingChange?.(false, null));
      this.finishInteraction(this.deps.now() - startedAt);
      // O texto da resposta continua na tela: só a fase muda.
      this.dispatch(notice ? { type: 'SPEECH_DONE', notice } : { type: 'SPEECH_DONE' });
    };
    try {
      this.deps.synthesis.speak(text, {
        onDone: () => done(),
        onStopped: () => done(),
        onError: () => done(MESSAGES.voiceTtsFailed),
      });
    } catch {
      done(MESSAGES.voiceTtsFailed);
    }
  }

  /** Para o áudio sem mexer na fase (callbacks da fala atual passam a ser ignorados). */
  private silence() {
    this.speechId += 1;
    const wasSpeaking = this.speaking;
    this.speaking = false;
    safely(() => this.deps.synthesis.stop());
    if (wasSpeaking) safely(() => this.options.onSpeakingChange?.(false, null));
  }

  stopSpeaking = (): void => {
    const wasAnswering = this.state.phase === 'answering';
    if (!wasAnswering && !this.speaking) return;
    this.silence();
    if (wasAnswering) {
      this.interaction = null;
      this.dispatch({ type: 'STOP_SPEAKING' });
    }
  };

  repeatLast = (): void => {
    const text = this.state.turn?.response.speech?.text?.trim();
    if (!text || !this.ttsEnabled) return;
    const wasAnswering = this.state.phase === 'answering';
    const before = this.state;
    const next = this.dispatch({ type: 'REPEAT_REQUESTED' });
    if (next === before) return;
    if (wasAnswering) this.silence();
    this.mediaActive = true;
    this.interaction = null;
    this.speak(text);
  };

  // ------------------------------------------------------------------ cancelamento

  cancel = (): void => {
    const phase = this.state.phase;
    if (!CANCELLABLE_PHASES.includes(phase)) return;
    this.clearTimers();
    if (phase === 'listening' || phase === 'transcribing') {
      this.listenHandled = true;
      this.listenSession += 1;
      this.resetLevel();
      safely(() => this.deps.recognition.cancel());
    } else {
      this.abortController?.abort();
      this.abortController = null;
    }
    this.interaction = null;
    this.dispatch({ type: 'CANCEL' });
  };

  resetConversation = (): void => {
    this.cancel();
    if (this.speaking || this.state.phase === 'answering') this.silence();
    this.clearTimers();
    this.abortController?.abort();
    this.abortController = null;
    this.interaction = null;
    this.dispatch({ type: 'RESET_CONVERSATION' });
  };

  /**
   * Chamado quando a tela do assistente sai de cena: cancela a escuta, para o TTS e limpa os timers de voz.
   * Uma pergunta já enviada continua em andamento (a conversa sobrevive à troca de abas),
   * mas a resposta não será falada até o aluno interagir de novo.
   */
  releaseMedia = (): void => {
    this.mediaActive = false;
    const phase = this.state.phase;
    if (phase === 'listening' || phase === 'transcribing') this.cancel();
    if (this.speaking || this.state.phase === 'answering') {
      this.silence();
      this.interaction = null;
      this.dispatch({ type: 'STOP_SPEAKING' });
    }
    this.clearTimer('listen');
    this.clearTimer('transcribe');
  };

  private finishInteraction(ttsMs: number | null) {
    const interaction = this.interaction;
    if (!interaction) return;
    this.interaction = null;
    this.listeners?.onMetrics({
      speechRecognitionMs: interaction.speechRecognitionMs,
      requestMs: interaction.requestMs,
      ttsMs,
      totalMs: Math.max(0, this.deps.now() - interaction.startedAt),
    });
  }
}

export interface VoiceAssistantContextValue {
  state: VoiceAssistantState;
  /** null enquanto a disponibilidade do reconhecimento ainda está sendo verificada. */
  availability: SpeechAvailability | null;
  /** Nível do microfone (0–1) para animações com useNativeDriver — nunca vira state. */
  audioLevel: Animated.Value;
  ttsEnabled: boolean;
  /** Últimas métricas de uma interação (diagnóstico; não exibidas ao aluno). */
  metrics: VoiceAssistantMetrics;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  cancel: () => void;
  submitText: (text: string) => Promise<void>;
  /** Envia uma transcrição pronta como fala (ativação "Hey Asa" com comando na mesma frase). */
  submitTranscript: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  repeatLast: () => void;
  resetConversation: () => void;
  releaseMedia: () => void;
}

const VoiceAssistantContext = createContext<VoiceAssistantContextValue | null>(null);

export interface VoiceAssistantProviderProps {
  children: React.ReactNode;
  /** Serviços injetáveis (testes). São lidos apenas na montagem. */
  recognition?: SpeechRecognitionService;
  synthesis?: SpeechSynthesisService;
  sendMessage?: SendAssistantMessage;
  haptics?: HapticsService;
  /** Sobrescreve a preferência "Resposta por voz". */
  ttsEnabled?: boolean;
  /** Executado quando a API devolve clientCommand 'go_back'. */
  onGoBack?: () => void;
  /** Executa a navegação devolvida pela API (intenção open_screen). */
  onNavigate?: (navigation: AssistantNavigationAction) => void;
  /** Tela atual enviada como contexto de interpretação. */
  getCurrentScreen?: AssistantScreenContextProvider;
  /** Turno concluído (histórico local/telemetria). */
  onTurn?: (turn: AssistantTurn, conversationId: string) => void;
  /** TTS começou/terminou. */
  onSpeakingChange?: (speaking: boolean, text: string | null) => void;
  now?: () => number;
}

/** Mantém a conversa com o ASA viva entre trocas de aba; é desmontado no logout. */
export function VoiceAssistantProvider({ children, recognition, synthesis, sendMessage, haptics, ttsEnabled, onGoBack, onNavigate, getCurrentScreen, onTurn, onSpeakingChange, now }: VoiceAssistantProviderProps) {
  const { preferences } = usePreferences();
  const effectiveTts = ttsEnabled ?? preferences.ttsEnabled;

  const [controller] = useState(
    () =>
      new VoiceAssistantController(
        {
          recognition: recognition ?? createSpeechRecognitionService(),
          synthesis: synthesis ?? createSpeechSynthesisService(),
          sendMessage: sendMessage ?? assistantService.sendMessage,
          haptics: haptics ?? createHapticsService(),
          now: now ?? Date.now,
          audioLevel: new Animated.Value(0),
        },
        { ttsEnabled: effectiveTts, onGoBack, onNavigate, getCurrentScreen, onTurn, onSpeakingChange },
      ),
  );

  useEffect(() => {
    controller.configure({ ttsEnabled: effectiveTts, onGoBack, onNavigate, getCurrentScreen, onTurn, onSpeakingChange });
  }, [controller, effectiveTts, onGoBack, onNavigate, getCurrentScreen, onTurn, onSpeakingChange]);
  const audioLevel = controller.audioLevel;
  const [state, setState] = useState<VoiceAssistantState>(controller.state);
  const [availability, setAvailability] = useState<SpeechAvailability | null>(controller.availability);
  const [metrics, setMetrics] = useState<VoiceAssistantMetrics>(EMPTY_VOICE_METRICS);

  useEffect(() => {
    controller.attach({ onState: setState, onAvailability: setAvailability, onMetrics: setMetrics });
    void controller.loadAvailability();
    return () => controller.dispose();
  }, [controller]);

  const value = useMemo<VoiceAssistantContextValue>(
    () => ({
      state,
      availability,
      audioLevel,
      ttsEnabled: effectiveTts,
      metrics,
      startListening: controller.startListening,
      stopListening: controller.stopListening,
      cancel: controller.cancel,
      submitText: controller.submitText,
      submitTranscript: controller.submitTranscript,
      stopSpeaking: controller.stopSpeaking,
      repeatLast: controller.repeatLast,
      resetConversation: controller.resetConversation,
      releaseMedia: controller.releaseMedia,
    }),
    [state, availability, audioLevel, effectiveTts, metrics, controller],
  );

  return <VoiceAssistantContext.Provider value={value}>{children}</VoiceAssistantContext.Provider>;
}

export function useVoiceAssistant(): VoiceAssistantContextValue {
  const context = useContext(VoiceAssistantContext);
  if (!context) {
    throw new Error('useVoiceAssistant deve ser usado dentro de <VoiceAssistantProvider>.');
  }
  return context;
}
