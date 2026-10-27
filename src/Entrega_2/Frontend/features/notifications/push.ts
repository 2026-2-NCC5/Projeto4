import { Platform } from 'react-native';
import { loadNativeNotifications } from '../dynamicNotifications/nativeNotifications';

/** Para onde o toque em um aviso leva: o registro do aviso ou, sem registro, a própria central. */
export type InboxTarget = { kind: 'ticket'; id: string } | { kind: 'appointment'; id: string } | { kind: 'recommendation'; id: string } | { kind: 'inbox' };

/**
 * Payload do push da central de avisos enviado pela API: `{ type: 'inbox', category, resourceType?, resourceId? }`.
 * Chamados (`type: 'support_ticket'`) e fila (`screen: 'queue'`) têm roteadores próprios e são ignorados aqui.
 */
export function inboxTargetFromPush(data: unknown): InboxTarget | null {
  if (typeof data !== 'object' || data === null) return null;
  const payload = data as { type?: unknown; resourceType?: unknown; resourceId?: unknown };
  if (payload.type !== 'inbox') return null;
  const id = typeof payload.resourceId === 'string' && payload.resourceId.length > 0 ? payload.resourceId : null;
  if (id && (payload.resourceType === 'ticket' || payload.resourceType === 'appointment' || payload.resourceType === 'recommendation')) {
    return { kind: payload.resourceType, id };
  }
  return { kind: 'inbox' };
}

/**
 * Abre o destino do aviso tocado, inclusive quando o toque abriu o app (início a frio). Só o roteamento vive aqui:
 * a exibição com o app aberto é decidida pelo handler global instalado pela fila presencial.
 */
export function addInboxPushListener(onOpen: (target: InboxTarget) => void): () => void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return () => undefined;
  const subscriptions: { remove(): void }[] = [];
  try {
    const Notifications = loadNativeNotifications();
    if (Notifications) {
      subscriptions.push(
        Notifications.addNotificationResponseReceivedListener((response) => {
          const target = inboxTargetFromPush(response.notification.request.content.data);
          if (target) onOpen(target);
        }),
      );
      const last = Notifications.getLastNotificationResponse();
      const target = inboxTargetFromPush(last?.notification.request.content.data);
      if (target) {
        onOpen(target);
        // Limpa só o toque da central: chamados e fila tratam (e limpam) os próprios toques.
        Notifications.clearLastNotificationResponse();
      }
    }
  } catch (error) {
    console.warn('[notifications] Falha ao configurar o roteamento da central.', error);
  }
  return () => {
    subscriptions.forEach((subscription) => subscription.remove());
  };
}
