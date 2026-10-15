import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import type { PushPlatform, QueuePushData } from '../../../types/api';
import { QUEUE } from '../config';

/** unavailable: web, Expo Go sem push ou build sem projeto EAS (o app continua funcionando sem push). */
export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export type PushUnavailableReason = 'web' | 'no_project_id' | 'token_failed';

export function pushPlatform(): PushPlatform | null {
  if (Platform.OS === 'ios' || Platform.OS === 'android') return Platform.OS;
  return null;
}

export function isQueuePushData(data: unknown): data is QueuePushData {
  return typeof data === 'object' && data !== null && (data as { screen?: unknown }).screen === 'queue';
}

let handlerInstalled = false;

/**
 * App aberto: a notificação da fila não vira banner do sistema (a tela mostra o próprio aviso), mas a
 * chamada ("É a sua vez!") toca o som curto da notificação. Outras notificações seguem o padrão.
 */
export function installNotificationHandler(): void {
  if (handlerInstalled || !pushPlatform()) return;
  handlerInstalled = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request.content.data;
        if (isQueuePushData(data)) {
          return { shouldShowBanner: false, shouldShowList: true, shouldPlaySound: data.milestone === 'QUEUE_CALLED', shouldSetBadge: false };
        }
        return { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false };
      },
    });
  } catch {
    handlerInstalled = false;
  }
}

/** Canal Android da fila: importância alta, vibração em dois pulsos e som padrão (respeita o modo do aparelho). */
export async function ensureQueueChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(QUEUE.ANDROID_CHANNEL_ID, {
      name: 'Fila presencial do ASA',
      description: 'Avisos quando sua senha está próxima e quando ela é chamada.',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: QUEUE.VIBRATION_PATTERN,
      enableVibrate: true,
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {
    // canal é best-effort: sem ele o Android usa o canal padrão
  }
}

function toPermission(status: { granted?: boolean; status?: string; canAskAgain?: boolean } | null | undefined): PushPermission {
  if (!status) return 'unavailable';
  if (status.granted || status.status === 'granted') return 'granted';
  if (status.status === 'denied' && status.canAskAgain === false) return 'denied';
  if (status.status === 'denied') return 'denied';
  return 'undetermined';
}

export async function getPushPermission(): Promise<PushPermission> {
  if (!pushPlatform()) return 'unavailable';
  try {
    return toPermission(await Notifications.getPermissionsAsync());
  } catch {
    return 'unavailable';
  }
}

/** Pedido de permissão — só depois que o aluno escolhe acompanhar uma senha e toca em "Ativar notificações". */
export async function requestPushPermission(): Promise<PushPermission> {
  if (!pushPlatform()) return 'unavailable';
  try {
    await ensureQueueChannel();
    return toPermission(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }));
  } catch {
    return 'unavailable';
  }
}

function projectId(): string | null {
  const fromConfig = (Constants.expoConfig as { extra?: { eas?: { projectId?: string } } } | null)?.extra?.eas?.projectId;
  const fromEas = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return fromConfig ?? fromEas ?? null;
}

/** Expo push token do aparelho. Exige permissão concedida e um projeto EAS (build de desenvolvimento/produção). */
export async function getExpoPushToken(): Promise<{ token: string | null; reason?: PushUnavailableReason }> {
  if (!pushPlatform()) return { token: null, reason: 'web' };
  const id = projectId();
  if (!id) return { token: null, reason: 'no_project_id' };
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId: id });
    return { token: result.data };
  } catch {
    return { token: null, reason: 'token_failed' };
  }
}

export interface QueueNotificationListeners {
  /** push da fila chegou com o app aberto (atualiza o estado na hora) */
  onReceived: (data: QueuePushData) => void;
  /** o aluno tocou na notificação (abre a tela da fila) */
  onOpened: (data: QueuePushData) => void;
}

/** Ouve pushes da fila e toques nas notificações, inclusive o toque que abriu o app (início a frio). */
export function addQueueNotificationListeners(listeners: QueueNotificationListeners): () => void {
  if (!pushPlatform()) return () => undefined;
  const subscriptions: { remove(): void }[] = [];
  try {
    subscriptions.push(
      Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data;
        if (isQueuePushData(data)) listeners.onReceived(data);
      }),
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        if (isQueuePushData(data)) listeners.onOpened(data);
      }),
    );
    const last = Notifications.getLastNotificationResponse();
    const data = last?.notification.request.content.data;
    if (isQueuePushData(data)) {
      listeners.onOpened(data);
      Notifications.clearLastNotificationResponse();
    }
  } catch {
    // módulo de notificações indisponível (ex.: Expo Go no Android): sem deep link por push
  }
  return () => subscriptions.forEach((subscription) => subscription.remove());
}

/** Configurações do sistema para reativar notificações negadas. */
export function openNotificationSettings(): void {
  Linking.openSettings().catch(() => undefined);
}
