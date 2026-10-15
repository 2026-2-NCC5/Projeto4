import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { WAKE_WORD } from '../../../config/services';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { usePreferences } from '../../../hooks/usePreferences';
import { READY_PHASES } from '../../../hooks/voiceAssistantReducer';
import { useVoiceAssistant, VoiceAssistantProvider, type VoiceAssistantContextValue, type VoiceAssistantProviderProps } from '../../../hooks/useVoiceAssistant';
import { useOptionalAppNavigation } from '../../../navigation/AppNavigator';
import { haptics } from '../../../services/haptics';
import type { AssistantTurn } from '../../../types/assistant';
import type { AssistantNavigationAction } from '../../../types/api';
import type { PermissionState, SpeechAvailability } from '../../../types/voice';
import { trackAssistantEvent } from '../services/assistantTelemetry';
import { appendConversationHistory, clearConversationHistory, loadConversationHistory, type ConversationHistoryEntry } from '../services/conversationHistory';
import { isDirectCommand, looksLikeEcho } from '../services/wakeWordMatcher';
import { createWakeWordService, type WakeWordDetection, type WakeWordFailure, type WakeWordService, type WakeWordServiceStatus } from '../services/wakeWordService';
import {
  assistantShellReducer,
  deriveAssistantState,
  INITIAL_SHELL_STATE,
  type ActivationSource,
  type AssistantShellState,
  type AssistantState,
  type WakeWordStatus,
  type WakeWordUnavailableReason,
} from '../state/assistantStateMachine';

export type EnableWakeWordResult = 'enabled' | 'denied' | 'unavailable' | 'onboarding';

export interface AssistantContextValue {
  /** Estado único derivado (orb, overlay, leitor de tela). */
  state: AssistantState;
  shell: AssistantShellState;
  voice: VoiceAssistantContextValue;
  isOffline: boolean;
  overlayVisible: boolean;
  wakeWord: {
    status: WakeWordStatus;
    reason: WakeWordUnavailableReason | null;
    /** null enquanto verifica; `available: false` no Expo Go / sem serviço de voz. */
    availability: SpeechAvailability | null;
    /** A funcionalidade existe neste build (não significa que está ligada). */
    supported: boolean;
    enabled: boolean;
  };
  microphonePermission: PermissionState | null;
  /** Abre o assistente sobre a tela atual e começa a ouvir (fallback: modo texto). */
  activate: (source: ActivationSource, options?: { listen?: boolean }) => Promise<void>;
  openOverlay: (source: ActivationSource) => void;
  closeOverlay: () => void;
  /** Vai para a experiência completa (aba Assistente) mantendo a conversa. */
  expand: () => void;
  enableWakeWord: () => Promise<EnableWakeWordResult>;
  disableWakeWord: () => void;
  onboardingVisible: boolean;
  /** Fecha o onboarding; `accept` pede a permissão e liga o "Hey Asa". */
  completeOnboarding: (accept: boolean) => Promise<EnableWakeWordResult>;
  history: ConversationHistoryEntry[];
  clearHistory: () => Promise<void>;
  /** Texto sendo falado agora (para o overlay destacar) ou null. */
  speakingText: string | null;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export interface AssistantProviderProps extends Omit<VoiceAssistantProviderProps, 'children' | 'onNavigate' | 'getCurrentScreen' | 'onTurn' | 'onSpeakingChange'> {
  children: React.ReactNode;
  /** Serviço de wake word injetável (testes). */
  wakeWordService?: WakeWordService;
}

function toShellStatus(status: WakeWordServiceStatus, failure: WakeWordFailure | undefined, enabled: boolean): { status: WakeWordStatus; reason: WakeWordUnavailableReason | null } {
  switch (status) {
    case 'starting':
      return { status: 'starting', reason: null };
    case 'listening':
      return { status: 'listening', reason: null };
    case 'unavailable':
      return { status: 'unavailable', reason: failure === 'permission_denied' ? 'permission_denied' : 'not_supported' };
    case 'error':
      return { status: 'error', reason: failure === 'failures' || failure === 'network' ? 'failures' : 'not_supported' };
    default:
      return { status: enabled ? 'paused' : 'off', reason: null };
  }
}

/**
 * Provider global do Assistente ASA. Envolve o VoiceAssistantProvider (conversa) e acrescenta:
 * overlay sobre qualquer tela, ativação por "Hey Asa" (primeiro plano), contexto da tela atual,
 * navegação por intenção, histórico local e telemetria sem conteúdo sensível.
 */
export function AssistantProvider({ children, wakeWordService, ...voiceProps }: AssistantProviderProps) {
  const navigation = useOptionalAppNavigation();
  const navigationRef = useRef(navigation);
  useEffect(() => {
    navigationRef.current = navigation;
  }, [navigation]);

  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const [lastTurn, setLastTurn] = useState<{ turn: AssistantTurn; conversationId: string } | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<AssistantNavigationAction | null>(null);

  const getCurrentScreen = useCallback(() => navigationRef.current?.currentScreen, []);
  const onNavigate = useCallback((action: AssistantNavigationAction) => setPendingNavigation(action), []);
  const onTurn = useCallback((turn: AssistantTurn, conversationId: string) => setLastTurn({ turn, conversationId }), []);
  const onSpeakingChange = useCallback((speaking: boolean, text: string | null) => setSpeakingText(speaking ? text : null), []);

  return (
    <VoiceAssistantProvider {...voiceProps} getCurrentScreen={getCurrentScreen} onNavigate={onNavigate} onTurn={onTurn} onSpeakingChange={onSpeakingChange}>
      <AssistantShell
        wakeWordService={wakeWordService}
        speakingText={speakingText}
        lastTurn={lastTurn}
        pendingNavigation={pendingNavigation}
        onNavigationHandled={() => setPendingNavigation(null)}
      >
        {children}
      </AssistantShell>
    </VoiceAssistantProvider>
  );
}

interface ShellProps {
  children: React.ReactNode;
  wakeWordService?: WakeWordService;
  speakingText: string | null;
  lastTurn: { turn: AssistantTurn; conversationId: string } | null;
  pendingNavigation: AssistantNavigationAction | null;
  onNavigationHandled: () => void;
}

function AssistantShell({ children, wakeWordService, speakingText, lastTurn, pendingNavigation, onNavigationHandled }: ShellProps) {
  const voice = useVoiceAssistant();
  const navigation = useOptionalAppNavigation();
  const { preferences, updatePreferences } = usePreferences();
  const { isOffline } = useNetworkStatus();
  const [shell, dispatch] = useReducer(assistantShellReducer, INITIAL_SHELL_STATE);
  const [service] = useState<WakeWordService>(() => wakeWordService ?? createWakeWordService());
  const [availability, setAvailability] = useState<SpeechAvailability | null>(null);
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [history, setHistory] = useState<ConversationHistoryEntry[]>([]);
  /** Incrementa para religar a detecção depois de uma ativação/eco. */
  const [wakeGeneration, setWakeGeneration] = useState(0);

  const voiceRef = useRef(voice);
  const speakingTextRef = useRef(speakingText);
  useEffect(() => {
    voiceRef.current = voice;
    speakingTextRef.current = speakingText;
  }, [voice, speakingText]);
  const activationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyLoaded = useRef(false);

  const wakeEnabled = preferences.wakeWordEnabled;
  const supported = service.provider !== 'unavailable' && WAKE_WORD.FEATURE_ENABLED;

  // Disponibilidade e permissão atuais (sem pedir nada ao aluno).
  useEffect(() => {
    let active = true;
    Promise.all([service.getAvailability().catch((): SpeechAvailability => ({ available: false, reason: 'not_supported' })), service.getPermission().catch((): PermissionState => 'undetermined')]).then(([nextAvailability, nextPermission]) => {
      if (!active) return;
      setAvailability(nextAvailability);
      setPermission(nextPermission);
    });
    return () => {
      active = false;
    };
  }, [service]);

  // Primeiro plano / background: a detecção NUNCA roda em background.
  useEffect(() => {
    const onChange = (status: AppStateStatus) => dispatch({ type: 'APP_STATE', foreground: status === 'active' });
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, []);

  // Histórico local (carregado uma vez; somente quando a preferência está ligada).
  useEffect(() => {
    if (!preferences.historyEnabled || historyLoaded.current) return;
    historyLoaded.current = true;
    let active = true;
    loadConversationHistory().then((entries) => {
      if (active) setHistory(entries);
    });
    return () => {
      active = false;
    };
  }, [preferences.historyEnabled]);

  // Turno concluído → histórico (se permitido) + telemetria (sem texto).
  const handledTurn = useRef<string | null>(null);
  useEffect(() => {
    if (!lastTurn || handledTurn.current === lastTurn.turn.id) return;
    handledTurn.current = lastTurn.turn.id;
    const { turn, conversationId } = lastTurn;
    trackAssistantEvent('assistant_response', { intent: turn.response.intent, status: turn.response.status, input_type: turn.inputType, interaction_id: turn.response.interactionId });
    if (!preferences.historyEnabled) return;
    void appendConversationHistory({
      id: turn.id,
      conversationId,
      question: turn.transcript,
      answerTitle: turn.response.display.title,
      answer: turn.response.display.message,
      intent: turn.response.intent,
      status: turn.response.status,
      createdAt: turn.receivedAt,
    }).then(setHistory);
  }, [lastTurn, preferences.historyEnabled]);

  // Navegação pedida pela API (open_screen): executa e recolhe o overlay (a fala continua).
  useEffect(() => {
    if (!pendingNavigation) return;
    const done = navigation?.navigateTo(pendingNavigation.target, pendingNavigation.params) ?? false;
    trackAssistantEvent('assistant_navigation', { target: pendingNavigation.target, executed: done });
    if (done) dispatch({ type: 'CLOSE_OVERLAY' });
    onNavigationHandled();
  }, [pendingNavigation, navigation, onNavigationHandled]);

  const phase = voice.state.phase;
  const conversationIdle = READY_PHASES.includes(phase) && phase !== 'answering';
  const speaking = phase === 'answering';
  const bargeIn = preferences.bargeInEnabled && WAKE_WORD.BARGE_IN_FEATURE_ENABLED;
  const shouldListen =
    supported && wakeEnabled && shell.foreground && availability?.available === true && permission === 'granted' && shell.activation === 'none' && (conversationIdle || (speaking && bargeIn));

  const clearActivationTimer = useCallback(() => {
    if (activationTimer.current !== null) clearTimeout(activationTimer.current);
    activationTimer.current = null;
  }, []);

  /** Ativação (wake word, botão, gesto): overlay + animação + microfone. */
  const beginActivation = useCallback(
    (source: ActivationSource, options: { listen: boolean; transcript?: string; interrupting?: boolean }) => {
      clearActivationTimer();
      const now = Date.now();
      dispatch({ type: 'ACTIVATE', source, at: now, interrupting: options.interrupting });
      trackAssistantEvent('assistant_activation', { source, listen: options.listen, interrupting: Boolean(options.interrupting) });
      if (preferences.hapticsEnabled) haptics.impactLight();
      activationTimer.current = setTimeout(() => {
        activationTimer.current = null;
        dispatch({ type: 'ACTIVATION_DONE' });
        const current = voiceRef.current;
        if (options.transcript) {
          void current.submitTranscript(options.transcript);
        } else if (options.listen) {
          trackAssistantEvent('assistant_voice_started', { source });
          void current.startListening();
        }
      }, WAKE_WORD.ACTIVATION_MS);
    },
    [clearActivationTimer, preferences.hapticsEnabled],
  );

  const handleDetection = useCallback(
    (detection: WakeWordDetection) => {
      if (looksLikeEcho(detection.transcript, speakingTextRef.current)) {
        // O próprio TTS foi ouvido ("… o ASA …"): ignora e religa a detecção.
        setWakeGeneration((value) => value + 1);
        return;
      }
      const direct = detection.isFinal && isDirectCommand(detection.remainder);
      trackAssistantEvent('wake_word_detected', { direct, interrupting: voiceRef.current.state.phase === 'answering' });
      beginActivation('wake_word', { listen: true, transcript: direct ? detection.remainder : undefined, interrupting: voiceRef.current.state.phase === 'answering' });
    },
    [beginActivation],
  );

  // Liga/desliga a detecção conforme as condições acima.
  useEffect(() => {
    if (!shouldListen) {
      void service.stop();
      dispatch({ type: 'WAKE_WORD_STATUS', status: wakeEnabled && supported ? (availability?.available === false ? 'unavailable' : permission === 'denied' ? 'unavailable' : 'paused') : 'off', reason: availability?.available === false ? (availability.reason === 'expo_go' ? 'expo_go' : availability.reason === 'no_service' ? 'no_service' : 'not_supported') : permission === 'denied' ? 'permission_denied' : null });
      return undefined;
    }
    let active = true;
    void service.start({
      onDetected: (detection) => {
        if (active) handleDetection(detection);
      },
      onStatus: (status, failure) => {
        if (!active) return;
        const next = toShellStatus(status, failure, true);
        dispatch({ type: 'WAKE_WORD_STATUS', ...next });
        trackAssistantEvent('wake_word_status', { status: next.status, reason: next.reason });
        if (next.status === 'unavailable' && next.reason === 'permission_denied') setPermission('denied');
      },
    });
    return () => {
      active = false;
      void service.stop();
    };
  }, [shouldListen, service, handleDetection, wakeGeneration, wakeEnabled, supported, availability, permission]);

  useEffect(() => () => clearActivationTimer(), [clearActivationTimer]);

  const activate = useCallback(
    async (source: ActivationSource, options: { listen?: boolean } = {}) => {
      const listen = options.listen ?? true;
      if (!listen) {
        dispatch({ type: 'OPEN_OVERLAY', source });
        trackAssistantEvent('assistant_opened', { source, mode: 'overlay' });
        return;
      }
      beginActivation(source, { listen: true, interrupting: voiceRef.current.state.phase === 'answering' });
    },
    [beginActivation],
  );

  const openOverlay = useCallback((source: ActivationSource) => {
    dispatch({ type: 'OPEN_OVERLAY', source });
    trackAssistantEvent('assistant_opened', { source, mode: 'overlay' });
  }, []);

  const closeOverlay = useCallback(() => {
    clearActivationTimer();
    const current = voiceRef.current;
    if (current.state.phase === 'listening' || current.state.phase === 'transcribing') current.cancel();
    if (current.state.phase === 'answering') current.stopSpeaking();
    dispatch({ type: 'CLOSE_OVERLAY' });
    trackAssistantEvent('assistant_closed', { mode: 'overlay' });
  }, [clearActivationTimer]);

  const expand = useCallback(() => {
    clearActivationTimer();
    dispatch({ type: 'CLOSE_OVERLAY' });
    navigation?.openAssistant('conversation');
    trackAssistantEvent('assistant_opened', { source: 'overlay', mode: 'full' });
  }, [clearActivationTimer, navigation]);

  const requestPermissionAndEnable = useCallback(async (): Promise<EnableWakeWordResult> => {
    let state = await service.getPermission().catch((): PermissionState => 'undetermined');
    if (state === 'undetermined') state = await service.requestPermission().catch((): PermissionState => 'denied');
    setPermission(state);
    trackAssistantEvent('microphone_permission', { state, purpose: 'wake_word' });
    if (state !== 'granted') return 'denied';
    updatePreferences({ wakeWordEnabled: true });
    return 'enabled';
  }, [service, updatePreferences]);

  const enableWakeWord = useCallback(async (): Promise<EnableWakeWordResult> => {
    if (!supported || availability?.available === false) return 'unavailable';
    if (!preferences.heyAsaOnboardingSeen) {
      setOnboardingVisible(true);
      return 'onboarding';
    }
    return requestPermissionAndEnable();
  }, [supported, availability, preferences.heyAsaOnboardingSeen, requestPermissionAndEnable]);

  const disableWakeWord = useCallback(() => {
    updatePreferences({ wakeWordEnabled: false });
  }, [updatePreferences]);

  const completeOnboarding = useCallback(
    async (accept: boolean): Promise<EnableWakeWordResult> => {
      updatePreferences({ heyAsaOnboardingSeen: true });
      setOnboardingVisible(false);
      if (!accept) return 'denied';
      if (!supported || availability?.available === false) return 'unavailable';
      return requestPermissionAndEnable();
    },
    [updatePreferences, supported, availability, requestPermissionAndEnable],
  );

  const clearHistory = useCallback(async () => {
    await clearConversationHistory();
    setHistory([]);
  }, []);

  // Desligar "Salvar histórico" apaga o que já existe (a opção é sobre guardar, não só sobre mostrar).
  const previousHistoryEnabled = useRef(preferences.historyEnabled);
  useEffect(() => {
    if (previousHistoryEnabled.current && !preferences.historyEnabled) void clearHistory();
    previousHistoryEnabled.current = preferences.historyEnabled;
  }, [preferences.historyEnabled, clearHistory]);

  const state = deriveAssistantState({ shell, phase, offline: isOffline });

  const value = useMemo<AssistantContextValue>(
    () => ({
      state,
      shell,
      voice,
      isOffline,
      overlayVisible: shell.overlay === 'compact',
      wakeWord: { status: shell.wakeWord.status, reason: shell.wakeWord.reason, availability, supported, enabled: wakeEnabled },
      microphonePermission: permission,
      activate,
      openOverlay,
      closeOverlay,
      expand,
      enableWakeWord,
      disableWakeWord,
      onboardingVisible,
      completeOnboarding,
      history,
      clearHistory,
      speakingText,
    }),
    [state, shell, voice, isOffline, availability, supported, wakeEnabled, permission, activate, openOverlay, closeOverlay, expand, enableWakeWord, disableWakeWord, onboardingVisible, completeOnboarding, history, clearHistory, speakingText],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const context = useContext(AssistantContext);
  if (!context) throw new Error('useAssistant deve ser usado dentro de <AssistantProvider>.');
  return context;
}

/** null fora do provider (componentes que funcionam com ou sem o assistente global). */
export function useOptionalAssistant(): AssistantContextValue | null {
  return useContext(AssistantContext);
}
