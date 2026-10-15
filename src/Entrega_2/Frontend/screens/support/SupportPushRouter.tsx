import { useEffect } from 'react';

import { addSupportPushListener } from '../../features/support/push';
import { useAppNavigation } from '../../navigation/AppNavigator';

/** Toque em uma notificação de chamado → abre o detalhe do chamado (montado uma vez na área autenticada). */
export function SupportPushRouter() {
  const { openTicket } = useAppNavigation();
  useEffect(() => addSupportPushListener((ticketId) => openTicket(ticketId)), [openTicket]);
  return null;
}
