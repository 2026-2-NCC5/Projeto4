import React from 'react';

import type { SupportRoute } from '../../types/ui';

import { CreateTicketScreen } from './CreateTicketScreen';
import { SupportHomeScreen } from './SupportHomeScreen';
import { TicketDetailScreen } from './TicketDetailScreen';
import { TicketsScreen } from './TicketsScreen';

/** Telas do Atendimento: hub, "Meus chamados", abertura e detalhe do chamado. */
export function SupportRouter({ route }: { route: SupportRoute }) {
  switch (route.screen) {
    case 'support-tickets':
      return <TicketsScreen initialFilter={route.filter} />;
    case 'support-new':
      return <CreateTicketScreen initialCategoryId={route.categoryId} />;
    case 'support-ticket':
      // key: trocar de chamado (ex.: aviso de outro chamado) remonta a tela do zero.
      return <TicketDetailScreen key={route.id} ticketId={route.id} />;
    default:
      return <SupportHomeScreen />;
  }
}
