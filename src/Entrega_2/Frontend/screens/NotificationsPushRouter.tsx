import { useEffect } from 'react';

import { addInboxPushListener } from '../features/notifications/push';
import { useAppNavigation } from '../navigation/AppNavigator';

/**
 * Toque em um push da central de avisos → abre o registro (agendamento, chamado, recomendação) ou, sem registro, a
 * própria central. Montado uma vez na área autenticada (pushes de chamado e da fila têm roteadores próprios).
 */
export function NotificationsPushRouter() {
  const { openAppointment, openNotifications, openRecommendation, openTicket } = useAppNavigation();
  useEffect(
    () =>
      addInboxPushListener((target) => {
        if (target.kind === 'appointment') openAppointment(target.id);
        else if (target.kind === 'ticket') openTicket(target.id);
        else if (target.kind === 'recommendation') openRecommendation(target.id);
        else openNotifications();
      }),
    [openAppointment, openNotifications, openRecommendation, openTicket],
  );
  return null;
}
