import { useEffect } from 'react';

import { useAppNavigation } from '../../navigation/AppNavigator';
import { useDynamicNotifications } from './hooks';
import { loadNativeNotifications } from './nativeNotifications';

type PushPayload = {
  type?: unknown;
  resourceType?: unknown;
  resourceId?: unknown;
  ticketId?: unknown;
  screen?: unknown;
};

function openNotificationTarget(data: PushPayload, navigation: ReturnType<typeof useAppNavigation>): void {
  if (data.screen === 'queue') return;
  if (data.type === 'support_ticket' && typeof data.ticketId === 'string' && data.ticketId.length > 0) {
    navigation.openTicket(data.ticketId);
    return;
  }
  if (data.type === 'inbox') {
    const id = typeof data.resourceId === 'string' && data.resourceId.length > 0 ? data.resourceId : null;
    if (id && data.resourceType === 'ticket') navigation.openTicket(id);
    else if (id && data.resourceType === 'appointment') navigation.openAppointment(id);
    else if (id && data.resourceType === 'recommendation') navigation.openRecommendation(id);
    else navigation.openNotifications();
  }
}

/** Shows foreground push messages in the app's Dynamic Island style overlay. */
export function NativeNotificationBridge() {
  const { trigger } = useDynamicNotifications();
  const navigation = useAppNavigation();

  useEffect(() => {
    let subscription: { remove(): void } | null = null;

    try {
      const notifications = loadNativeNotifications();
      if (notifications) {
        subscription = notifications.addNotificationReceivedListener((notification) => {
          const data = notification.request.content.data as PushPayload;
          if (data.screen === 'queue') return;
          const title = notification.request.content.title || 'ASA Conecta';
          const message = notification.request.content.body || 'Você recebeu um novo aviso.';
          trigger({
            title,
            message,
            symbol: { ios: 'bell.badge.fill', android: 'notifications_active', web: 'notifications_active' },
            accent: '#0D6D53',
            duration: 4200,
            onPress: () => openNotificationTarget(data, navigation),
          });
        });
      }
    } catch (error) {
      console.warn('[notifications] Não foi possível iniciar os avisos em primeiro plano.', error);
    }

    return () => {
      subscription?.remove();
    };
  }, [navigation, trigger]);

  return null;
}
