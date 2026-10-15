import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Toque em uma notificação de chamado (payload enviado pela API: `{ type: 'support_ticket', ticketId, kind }`).
 * Só o roteamento do toque vive aqui: a exibição com o app aberto já é decidida pelo handler global do módulo de
 * notificações (instalado uma única vez pela fila presencial) — não chame `setNotificationHandler` de novo.
 */
export function supportTicketIdFromPush(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const payload = data as { type?: unknown; ticketId?: unknown };
  return payload.type === 'support_ticket' && typeof payload.ticketId === 'string' && payload.ticketId.length > 0 ? payload.ticketId : null;
}

/** Abre o chamado tocado, inclusive quando o toque abriu o app (início a frio). Devolve a função de remoção. */
export function addSupportPushListener(onOpenTicket: (ticketId: string) => void): () => void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return () => undefined;
  const subscriptions: { remove(): void }[] = [];
  try {
    subscriptions.push(
      Notifications.addNotificationResponseReceivedListener((response) => {
        const ticketId = supportTicketIdFromPush(response.notification.request.content.data);
        if (ticketId) onOpenTicket(ticketId);
      }),
    );
    const last = Notifications.getLastNotificationResponse();
    const ticketId = supportTicketIdFromPush(last?.notification.request.content.data);
    if (ticketId) {
      onOpenTicket(ticketId);
      // Limpa só quando o toque é de um chamado: o da fila presencial é tratado (e limpo) pelo módulo dela.
      Notifications.clearLastNotificationResponse();
    }
  } catch {
    // módulo de notificações indisponível (ex.: Expo Go no Android): o app segue sem abrir pelo push
  }
  return () => subscriptions.forEach((subscription) => subscription.remove());
}
