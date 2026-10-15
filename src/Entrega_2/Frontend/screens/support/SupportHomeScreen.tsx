import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Appear, SupportNotice, TicketSummaryCard } from '../../components/tickets';
import { HelpArticleSheet } from '../../components/tickets/HelpArticleSheet';
import { AppButton, List, ListItem, OfflineBanner, ScheduleSkeleton, SectionHeader } from '../../components/ui';
import { useOptionalAssistant } from '../../features/assistant/hooks/useAssistant';
import { categoryIcon, formatRelative, purgeOtherUsers, supportErrorMessage, useSupportCatalog, useSupportNotifications, useSupportOverview, useSupportUserId } from '../../features/support';
import { useAppNavigation } from '../../navigation/AppNavigator';
import { useTheme } from '../../theme';
import type { SupportHelpArticle } from '../../types/api';
import { pluralize } from '../../utils/format';
// ---- queue (Fila presencial do ASA)
import { useOptionalQueue } from '../../features/queue';

/** Quantos artigos aparecem na Central de ajuda do hub. */
const HUB_ARTICLES = 5;

/** Atendimento: ponto de partida para falar com o ASA, acompanhar chamados e tirar dúvidas rápidas. */
export function SupportHomeScreen() {
  const theme = useTheme();
  const navigation = useAppNavigation();
  const assistant = useOptionalAssistant();
  const userId = useSupportUserId();
  const overview = useSupportOverview();
  const catalog = useSupportCatalog();
  const notifications = useSupportNotifications();
  const [article, setArticle] = useState<SupportHelpArticle | null>(null);

  // Ao entrar no Atendimento, o cache de outras contas deste aparelho é descartado.
  useEffect(() => {
    void purgeOtherUsers(userId);
  }, [userId]);

  const data = overview.data;
  const refreshing = overview.refreshing || notifications.refreshing;
  const ticketsDescription = data
    ? data.activeCount > 0
      ? [pluralize(data.activeCount, 'em andamento', 'em andamento'), data.waitingStudentCount > 0 ? `${data.waitingStudentCount} aguardando você` : null].filter(Boolean).join(' · ')
      : 'Nenhum chamado em andamento'
    : 'Acompanhe suas solicitações ao ASA';
  const unread = notifications.data?.items.filter((item) => !item.readAt).slice(0, 3) ?? [];

  return (
    <Screen
      testID="support-home"
      refreshing={refreshing}
      onRefresh={() => {
        overview.refresh();
        notifications.refresh();
      }}
    >
      <ScreenHeader title="Atendimento" subtitle="Fale com o ASA e acompanhe suas solicitações." onBack={navigation.goBack} />
      <OfflineBanner />
      {overview.error && overview.data ? <SupportNotice message="Mostrando a última atualização disponível." icon="cloud-offline-outline" /> : null}

      <AppButton label="Abrir chamado" icon="add" onPress={() => navigation.openNewTicket()} fullWidth testID="support-open-ticket" />

      {overview.status === 'loading' ? (
        <View style={{ marginTop: theme.spacing.xl }}>
          <ScheduleSkeleton rows={1} />
        </View>
      ) : null}
      {data?.highlight ? (
        <Appear style={{ marginTop: theme.spacing.xl }}>
          <TicketSummaryCard ticket={data.highlight} onPress={() => navigation.openTicket(data.highlight?.id ?? '')} />
        </Appear>
      ) : null}
      {overview.status === 'error' ? <SupportNotice message={supportErrorMessage(overview.error, 'Não conseguimos carregar seus chamados.')} tone="danger" icon="alert-circle-outline" actionLabel="Tentar novamente" onAction={overview.reload} /> : null}

      <SectionHeader title="Solicitações" />
      <List inset="icon">
        <ListItem
          icon="file-tray-full-outline"
          title="Meus chamados"
          description={ticketsDescription}
          value={data && data.unreadMessagesCount > 0 ? pluralize(data.unreadMessagesCount, 'nova', 'novas') : undefined}
          onPress={() => navigation.openSupportTickets()}
          testID="support-my-tickets"
        />
        {data && data.waitingStudentCount > 0 ? (
          <ListItem icon="hand-left-outline" iconColor={theme.colors.status.warningText} title="Aguardando você" description="Chamados em que o ASA precisa de uma informação sua" value={String(data.waitingStudentCount)} onPress={() => navigation.openSupportTickets('waiting_student')} testID="support-waiting" />
        ) : null}
        <ListItem icon="create-outline" title="Abrir chamado" description="Documentos, financeiro, matrícula, estágio e mais" onPress={() => navigation.openNewTicket()} testID="support-new" />
      </List>

      {unread.length > 0 ? (
        <>
          <SectionHeader title="Avisos do atendimento" />
          <List inset="icon">
            {unread.map((item) => (
              <ListItem key={item.id} icon="notifications-outline" iconColor={theme.colors.brand.primaryStrong} title={item.title} description={item.body} meta={`${item.protocol} · ${formatRelative(item.createdAt)}`} onPress={() => navigation.openTicket(item.ticketId)} descriptionLines={2} />
            ))}
          </List>
        </>
      ) : null}

      <SectionHeader title="Central de ajuda" subtitle="Talvez a resposta já esteja aqui" />
      {catalog.status === 'loading' ? <ScheduleSkeleton rows={3} /> : null}
      {catalog.data ? (
        <List inset="icon">
          {catalog.data.articles.slice(0, HUB_ARTICLES).map((item) => (
            <ListItem key={item.id} icon={categoryIcon(item.categoryId)} title={item.title} description={item.summary} descriptionLines={2} onPress={() => setArticle(item)} testID={`help-${item.id}`} />
          ))}
        </List>
      ) : null}

      <SectionHeader title="Outros canais" />
      <List inset="icon">
        <ListItem
          icon="sparkles-outline"
          title="Perguntar ao assistente ASA"
          description="Respostas rápidas sobre sua vida acadêmica"
          onPress={() => {
            if (assistant) assistant.openOverlay('button');
            else navigation.openAssistant('conversation');
          }}
          testID="support-assistant"
        />
        {/* ---- queue (Fila presencial do ASA) */}
        <QueueChannelRow onPress={() => navigation.openQueue()} />
      </List>

      <HelpArticleSheet
        article={article}
        onClose={() => setArticle(null)}
        onOpenTicket={(categoryId) => {
          setArticle(null);
          navigation.openNewTicket(categoryId);
        }}
      />
    </Screen>
  );
}

// ---- queue (Fila presencial do ASA)
/** Atendimento → Fila presencial: mostra a senha acompanhada quando houver. */
function QueueChannelRow({ onPress }: { onPress: () => void }) {
  const queue = useOptionalQueue();
  const ticket = queue?.tracking ? queue.status?.subscription?.ticket : null;
  return (
    <ListItem
      icon="people-circle-outline"
      title="Fila presencial do ASA"
      description={ticket ? `Acompanhando a senha ${ticket}` : 'Acompanhe sua senha e seja avisado quando chegar a sua vez'}
      onPress={onPress}
      testID="support-queue"
    />
  );
}
