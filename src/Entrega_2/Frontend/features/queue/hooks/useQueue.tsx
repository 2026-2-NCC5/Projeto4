import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

import { useOptionalAssistant } from '../../assistant/hooks/useAssistant';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { useOptionalSession } from '../../../hooks/useSession';
import { haptics } from '../../../services/haptics';
import type { QueueAlertPreferences, QueuePreferencesRequest } from '../../../types/api';
import { QUEUE } from '../config';
import { performQueueAlert } from '../services/alertEffects';
import { addQueueDeepLinkListener } from '../services/deepLink';
import {
  addQueueNotificationListeners,
  getExpoPushToken,
  getPushPermission,
  installNotificationHandler,
  pushPlatform,
  requestPushPermission,
  type PushPermission,
} from '../services/pushNotifications';
import { getQueueClient, type MockScenario, type QueueClient } from '../services/queueClient';
import { loadDefaultPreferences, loadHandledAlerts, saveDefaultPreferences, saveHandledAlerts } from '../state/alertStore';
import { deriveExperience, isActiveSubscription, type QueueExperience } from '../state/experience';
import { QueueController, type AlertStore, type PushAdapter, type QueueControllerState, type SubscribeResult } from '../state/queueController';

import { useScreenReaderEnabled } from './useScreenReaderEnabled';

export interface QueueContextValue extends QueueControllerState {
  experience: QueueExperience;
  isOffline: boolean;
  /** há uma senha sendo acompanhada (aguardando ou chamada) */
  tracking: boolean;
  /** controles de simulação visíveis (desenvolvimento) */
  simulationAvailable: boolean;
  subscribe: (ticket: string, preferences?: Partial<QueueAlertPreferences>) => Promise<SubscribeResult>;
  cancel: () => Promise<SubscribeResult>;
  updatePreferences: (changes: QueuePreferencesRequest) => Promise<SubscribeResult>;
  refresh: () => Promise<void>;
  requestNotifications: () => Promise<PushPermission>;
  dismissBanner: () => void;
  acknowledgeCalled: () => void;
  simulate: (control: { scenario?: MockScenario; advance?: boolean }) => Promise<boolean>;
  /** a tela da fila mantém a conexão em tempo real enquanto estiver aberta */
  retainInterest: () => () => void;
}

const QueueContext = createContext<QueueContextValue | null>(null);

const defaultPush: PushAdapter = {
  getPermission: getPushPermission,
  requestPermission: requestPushPermission,
  getToken: getExpoPushToken,
  platform: pushPlatform,
};

const defaultStore: AlertStore = {
  loadHandled: loadHandledAlerts,
  saveHandled: saveHandledAlerts,
  loadDefaults: loadDefaultPreferences,
  saveDefaults: saveDefaultPreferences,
};

const clockFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** "20:43" no horário do aparelho. */
export function formatQueueClock(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : clockFormatter.format(date);
}

function speechFirstName(fullName: string | null | undefined): string | null {
  const name = (fullName ?? '').trim().split(/\s+/)[0];
  return name ? name : null;
}

export interface QueueProviderProps {
  children: React.ReactNode;
  /** abre a tela da fila (toque no push, deep link) */
  onOpenQueue?: () => void;
  /** injetáveis em testes */
  client?: QueueClient;
  push?: PushAdapter;
  store?: AlertStore;
}

/**
 * Fila presencial do ASA na área autenticada: estado, tempo real, alertas e push.
 * Fica dentro do AssistantProvider para falar pelo mesmo TTS do ASA IA.
 */
export function QueueProvider({ children, onOpenQueue, client, push, store }: QueueProviderProps) {
  const [controller] = useState(() => new QueueController({ client: client ?? getQueueClient(), push: push ?? defaultPush, store: store ?? defaultStore }));
  const [state, setState] = useState<QueueControllerState>(controller.state);
  const network = useNetworkStatus();
  const assistant = useOptionalAssistant();
  const session = useOptionalSession();
  const screenReaderEnabled = useScreenReaderEnabled();
  const speak = assistant?.voice.announce ?? null;
  const firstName = speechFirstName(session?.user?.fullName);

  const onAlert = useCallback(
    (alert: Parameters<typeof performQueueAlert>[0], preferences: QueueAlertPreferences) => {
      performQueueAlert(alert, preferences, {
        haptics,
        speak,
        announceAccessibility: (text) => AccessibilityInfo.announceForAccessibility(text),
        screenReaderEnabled,
        firstName,
      });
    },
    [speak, screenReaderEnabled, firstName],
  );

  useEffect(() => {
    controller.configure({ onAlert });
  }, [controller, onAlert]);

  useEffect(() => {
    controller.attach(setState);
    installNotificationHandler();
    void controller.start();
    return () => controller.dispose();
  }, [controller]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => controller.setForeground(next === 'active'));
    return () => subscription.remove();
  }, [controller]);

  useEffect(() => {
    controller.setOffline(network.isOffline);
  }, [controller, network.isOffline]);

  useEffect(
    () =>
      addQueueNotificationListeners({
        onReceived: () => void controller.refresh(),
        onOpened: () => {
          onOpenQueue?.();
          void controller.refresh();
        },
      }),
    [controller, onOpenQueue],
  );

  useEffect(() => (onOpenQueue ? addQueueDeepLinkListener(onOpenQueue) : undefined), [onOpenQueue]);

  const value = useMemo<QueueContextValue>(() => {
    const experience = deriveExperience({ status: state.status, isOffline: network.isOffline, hasError: state.error !== null, formatTime: formatQueueClock });
    return {
      ...state,
      experience,
      isOffline: network.isOffline,
      tracking: isActiveSubscription(state.status?.subscription),
      simulationAvailable: __DEV__ || QUEUE.USE_MOCK,
      subscribe: controller.subscribe,
      cancel: controller.cancel,
      updatePreferences: controller.updatePreferences,
      refresh: controller.refresh,
      requestNotifications: controller.requestNotifications,
      dismissBanner: controller.dismissBanner,
      acknowledgeCalled: controller.acknowledgeCalled,
      simulate: controller.simulate,
      retainInterest: controller.retainInterest,
    };
  }, [state, network.isOffline, controller]);

  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

export function useQueue(): QueueContextValue {
  const context = useContext(QueueContext);
  if (!context) throw new Error('useQueue deve ser usado dentro de <QueueProvider>.');
  return context;
}

/** null fora do provider (componentes reutilizáveis, testes isolados). */
export function useOptionalQueue(): QueueContextValue | null {
  return useContext(QueueContext);
}

/** Senha acompanhada agora (ou null) e o estado de experiência correspondente. */
export function useTrackedTicket() {
  const queue = useOptionalQueue();
  const subscription = queue?.status?.subscription ?? null;
  return { subscription, tracking: queue?.tracking ?? false, experience: queue?.experience ?? null };
}

/** Mantém o canal em tempo real aberto enquanto a tela que chama estiver montada. */
export function useQueueInterest(): void {
  const queue = useOptionalQueue();
  const retain = queue?.retainInterest;
  useEffect(() => (retain ? retain() : undefined), [retain]);
}
