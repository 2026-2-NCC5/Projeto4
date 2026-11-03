import React from 'react';

import type { Insight } from '../../components/academic';
import { Appear, TicketSummaryCard } from '../../components/tickets';
import { SectionHeader } from '../../components/ui';
import { useSupportNotifications, useSupportOverview } from '../../features/support';
import type { AppNavigation } from '../../navigation/AppNavigator';
import { useOptionalAppNavigation } from '../../navigation/AppNavigator';
import type { SupportNotificationKind, SupportOverview } from '../../types/api';

/** "2 em andamento · 1 aguardando você" (vazio quando só há um chamado recém-resolvido em destaque). */
function openTicketsSummary(overview: SupportOverview): string | undefined {
  const parts = [overview.activeCount > 0 ? `${overview.activeCount} em andamento` : null, overview.waitingStudentCount > 0 ? `${overview.waitingStudentCount} aguardando você` : null];
  return parts.filter(Boolean).join(' · ') || undefined;
}

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
  if (!overview.data || !highlight) return null;
  return (
    <>
      <SectionHeader title="Atendimento" subtitle={openTicketsSummary(overview.data)} action="Meus chamados" onAction={() => navigation.openSupportTickets()} />
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
