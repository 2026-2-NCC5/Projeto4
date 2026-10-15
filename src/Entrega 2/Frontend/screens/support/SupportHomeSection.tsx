import React from 'react';

import type { Insight } from '../../components/academic';
import { Appear, TicketSummaryCard } from '../../components/tickets';
import { SectionHeader } from '../../components/ui';
import { useSupportNotifications, useSupportOverview } from '../../features/support';
import type { AppNavigation } from '../../navigation/AppNavigator';
import { useOptionalAppNavigation } from '../../navigation/AppNavigator';
import type { SupportNotificationKind } from '../../types/api';

/**
 * Bloco "Atendimento" da Home: um card compacto com o chamado mais relevante (ação pendente, mensagem nova ou
 * atualização recente). Não aparece quando não há chamado relevante — nem fora da navegação (testes isolados).
 */
export function SupportHomeSection({ now }: { now?: Date | undefined }) {
  const navigation = useOptionalAppNavigation();
  return navigation ? <SupportHomeCard navigation={navigation} now={now} /> : null;
}

function SupportHomeCard({ navigation, now }: { navigation: AppNavigation; now?: Date | undefined }) {
  const overview = useSupportOverview();
  const highlight = overview.data?.highlight;
  if (!highlight) return null;
  return (
    <>
      <SectionHeader title="Atendimento" action="Meus chamados" onAction={() => navigation.openSupportTickets()} />
      <Appear>
        <TicketSummaryCard ticket={highlight} onPress={() => navigation.openTicket(highlight.id)} now={now} testID="home-support-card" />
      </Appear>
    </>
  );
}

const KIND_TONE: Record<SupportNotificationKind, Insight['tone']> = {
  ticket_received: 'info',
  status_changed: 'info',
  new_message: 'brand',
  action_required: 'warning',
  file_available: 'info',
  ticket_resolved: 'success',
  ticket_closed: 'info',
};

/** Avisos não lidos do Atendimento, no formato da lista "Avisos" de Serviços (centro de avisos do app). */
export function useSupportInsights(navigation: AppNavigation | null, limit = 3): Insight[] {
  const notifications = useSupportNotifications({ enabled: Boolean(navigation) });
  if (!navigation) return [];
  return (notifications.data?.items ?? [])
    .filter((item) => !item.readAt)
    .slice(0, limit)
    .map((item) => ({
      id: `support-${item.id}`,
      tone: KIND_TONE[item.kind],
      title: `Atendimento · ${item.protocol}`,
      message: `${item.title}. ${item.body}`,
      icon: item.kind === 'action_required' ? 'hand-left-outline' : 'chatbubbles-outline',
      actionLabel: item.kind === 'action_required' ? 'Responder' : 'Ver chamado',
      onAction: () => navigation.openTicket(item.ticketId),
    }));
}
