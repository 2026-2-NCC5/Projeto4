import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';

import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  Appear,
  BottomSheet,
  FileRow,
  SupportNotice,
  TicketActionRequired,
  TicketComposer,
  TicketMessages,
  TicketProgress,
  TicketRating,
  TicketResolution,
  TicketSla,
  TicketStatusBadge,
  TicketTimeline,
} from '../../components/tickets';
import { AppButton, AppText, Divider, List, ListItem, SectionHeader, Skeleton, Surface } from '../../components/ui';
import {
  buildProgress,
  formatFullDateTime,
  formatUpdated,
  isConnectivityError,
  PRIORITY_LABELS,
  supportErrorMessage,
  useAttachmentUploads,
  useSupportCatalog,
  useTicket,
  useTicketActions,
  useTicketUpdates,
} from '../../features/support';
import { useNavBarInset } from '../../hooks/useNavBarInset';
import { useResponsive } from '../../hooks/useResponsive';
import { useAppNavigation } from '../../navigation/AppNavigator';
import { haptics } from '../../services/haptics';
import { makeStyles, useTheme } from '../../theme';
import type { SupportAttachment, SupportTicket } from '../../types/api';

const useStyles = makeStyles((theme) => ({
  scroll: { paddingBottom: theme.spacing.xxl },
  protocolRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, marginBottom: theme.spacing.xs },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: theme.spacing.xs },
  head: { gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  stack: { gap: theme.spacing.md },
  block: { gap: 2 },
  sheetInput: { ...theme.typography.input, color: theme.colors.text.primary, borderWidth: 1, borderColor: theme.colors.control.inputBorder, borderRadius: theme.radius.md, padding: theme.spacing.md, minHeight: 96, textAlignVertical: 'top' },
  sheetActions: { gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  filesLabel: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
}));

type Sheet = 'cancel' | 'reopen' | null;

/** Detalhe do chamado: tudo o que o estudante precisa saber sem perguntar ao ASA. */
export function TicketDetailScreen({ ticketId }: { ticketId: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const navigation = useAppNavigation();
  const navInset = useNavBarInset();
  const responsive = useResponsive();
  const resource = useTicket(ticketId);
  const catalog = useSupportCatalog();
  const actions = useTicketActions(ticketId, resource);
  const uploads = useAttachmentUploads(catalog.data?.limits ?? null);
  const updates = useTicketUpdates(resource.data);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'danger' | 'neutral' } | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [reason, setReason] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [firstUnread, setFirstUnread] = useState<{ ticketId: string; messageId: string | null } | null>(null);
  const [messagesY, setMessagesY] = useState<number | null>(null);
  const [unreadY, setUnreadY] = useState<number | null>(null);
  const [scrolledToUnread, setScrolledToUnread] = useState(false);
  const ticket = resource.data;
  const { markRead } = actions;

  // Primeira mensagem não lida quando a tela abriu: recebe o divisor "Novas mensagens" e a rolagem automática.
  if (ticket && (!firstUnread || firstUnread.ticketId !== ticket.id)) {
    setFirstUnread({ ticketId: ticket.id, messageId: ticket.messages.find((item) => item.senderType === 'agent' && !item.readAt)?.id ?? null });
  }
  const hasUnread = Boolean(ticket && ticket.unreadCount > 0);

  // Abrir o chamado marca as mensagens e os avisos dele como lidos.
  useEffect(() => {
    if (hasUnread) markRead();
  }, [hasUnread, markRead]);

  // Rola até a primeira mensagem nova (uma vez), quando faz sentido.
  useEffect(() => {
    if (scrolledToUnread || messagesY === null || unreadY === null || !firstUnread?.messageId) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, messagesY + unreadY - 96), animated: true });
    const timer = setTimeout(() => setScrolledToUnread(true), 0);
    return () => clearTimeout(timer);
  }, [firstUnread, messagesY, scrolledToUnread, unreadY]);

  // Mudança importante vinda do ASA com a tela aberta: aviso tátil discreto.
  const importantUpdate = updates.notice === 'Chamado atualizado' && (ticket?.status === 'waiting_student' || ticket?.status === 'resolved');
  useEffect(() => {
    if (importantUpdate) haptics.warning();
  }, [importantUpdate]);

  const openAttachment = (attachment: SupportAttachment) => {
    actions
      .openAttachment(attachment)
      .then((problem) => {
        if (problem) setNotice({ message: problem, tone: 'neutral' });
      })
      .catch(() => undefined);
  };

  const pickForReply = () => {
    uploads
      .pick()
      .then((problem) => {
        if (problem) setNotice({ message: problem, tone: 'danger' });
      })
      .catch(() => undefined);
  };

  const copyProtocol = (protocol: string) => {
    Clipboard.setStringAsync(protocol)
      .then(() => {
        haptics.selection();
        setNotice({ message: 'Protocolo copiado', tone: 'success' });
      })
      .catch(() => setNotice({ message: 'Não foi possível copiar o protocolo.', tone: 'danger' }));
  };

  const closeSheet = () => {
    setSheet(null);
    setReason('');
    setSheetError(null);
  };

  const confirmSheet = () => {
    const run = sheet === 'cancel' ? actions.cancel(reason) : actions.reopen(reason);
    run
      .then((problem) => {
        if (problem) {
          setSheetError(problem);
          return;
        }
        setNotice({ message: sheet === 'cancel' ? 'Chamado cancelado. O histórico continua disponível.' : 'Chamado reaberto. O ASA vai analisar de novo.', tone: 'success' });
        closeSheet();
      })
      .catch(() => undefined);
  };

  if (!ticket) {
    return (
      <Screen testID="ticket-detail">
        <ScreenHeader title="Chamado" onBack={navigation.goBack} />
        {resource.status === 'error' ? (
          <Appear>
            <Surface style={{ alignItems: 'center', paddingVertical: theme.spacing.xxl }} testID="ticket-error">
              <Ionicons name={isConnectivityError(resource.error) ? 'cloud-offline-outline' : 'alert-circle-outline'} size={28} color={theme.colors.text.muted} />
              <AppText variant="h4" align="center" style={{ marginTop: theme.spacing.md }}>
                Não conseguimos carregar este chamado.
              </AppText>
              <AppText variant="bodySmall" tone="secondary" align="center" style={{ marginTop: 4, maxWidth: 300 }}>
                {supportErrorMessage(resource.error, 'Verifique sua conexão e tente novamente.')}
              </AppText>
              <View style={{ marginTop: theme.spacing.lg }}>
                <AppButton label="Tentar novamente" onPress={resource.reload} testID="ticket-retry" />
              </View>
            </Surface>
          </Appear>
        ) : (
          <DetailSkeleton />
        )}
      </Screen>
    );
  }

  const progress = buildProgress(ticket);
  const latest = ticket.events[ticket.events.length - 1] ?? null;
  const studentFiles = ticket.attachments.filter((item) => item.uploadedBy === 'student');
  const asaFiles = ticket.attachments.filter((item) => item.uploadedBy === 'agent');
  const offline = Boolean(resource.error && isConnectivityError(resource.error));
  const showResolution = ticket.status === 'resolved' || ticket.status === 'closed';
  const messageCount = ticket.messages.length + actions.pending.length;

  return (
    <Screen scroll={false} withNavSpace={false} keyboardAvoiding contentStyle={{ paddingBottom: 0 }} testID="ticket-detail">
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, !ticket.canReply ? { paddingBottom: navInset + theme.spacing.xxl } : null]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={resource.refreshing} onRefresh={resource.refresh} tintColor={theme.colors.brand.primaryStrong} colors={[theme.colors.brand.primaryStrong]} />}
      >
        <ScreenHeader title="Chamado" onBack={navigation.goBack} />

        <View style={styles.head}>
          <View style={styles.protocolRow}>
            <AppText variant="bodySmallStrong" tone="secondary" selectable testID="ticket-protocol">
              {`#${ticket.protocol}`}
            </AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Copiar protocolo" onPress={() => copyProtocol(ticket.protocol)} hitSlop={theme.hitSlop} style={styles.copy} testID="ticket-copy-protocol">
              <Ionicons name="copy-outline" size={14} color={theme.colors.text.link} />
              <AppText variant="caption" tone="link" style={{ fontWeight: '600' }}>
                Copiar
              </AppText>
            </Pressable>
          </View>
          <AppText variant="h2" accessibilityRole="header">
            {ticket.subject}
          </AppText>
          <TicketStatusBadge status={ticket.status} full testID="ticket-status" />
          <AppText variant="caption" tone="muted">
            {`Aberto em ${formatFullDateTime(ticket.createdAt)} · ${formatUpdated(ticket.updatedAt)}`}
          </AppText>
        </View>

        <View style={styles.stack}>
          <SupportNotice message={updates.notice} tone="neutral" icon="sparkles-outline" autoHideMs={4000} onHide={updates.dismissNotice} testID="ticket-update-notice" />
          <SupportNotice message={notice?.message ?? null} tone={notice?.tone ?? 'neutral'} icon={notice?.tone === 'success' ? 'checkmark-circle-outline' : notice?.tone === 'danger' ? 'alert-circle-outline' : 'information-circle-outline'} autoHideMs={3200} onHide={() => setNotice(null)} />
          {offline ? <SupportNotice message="Você está offline. Mostrando a última atualização disponível." tone="warning" icon="cloud-offline-outline" testID="ticket-offline" /> : null}

          {ticket.pendingAction ? (
            <TicketActionRequired
              action={ticket.pendingAction}
              onAttach={pickForReply}
              onRespond={() => {
                inputRef.current?.focus();
              }}
            />
          ) : null}

          {showResolution ? (
            <TicketResolution resolution={ticket.resolution} resolvedAt={ticket.resolvedAt} closed={ticket.status === 'closed'} canReopen={ticket.canReopen} reopenDeadline={ticket.reopenDeadline} onReopen={() => setSheet('reopen')} />
          ) : null}
          {showResolution ? <TicketRating rating={ticket.rating} canRate={ticket.canRate} submitting={actions.busy === 'rate'} onSubmit={(value, comment) => actions.rate(value, comment)} /> : null}
        </View>

        <SectionHeader title="Andamento" />
        <Surface>
          <TicketProgress progress={progress} />
          {progress.next ? (
            <>
              <Divider spacing={theme.spacing.md} />
              <View style={styles.block} testID="ticket-next-step">
                <AppText variant="caption" tone="muted">
                  Próxima etapa
                </AppText>
                <AppText variant="bodyStrong">{progress.next.label}</AppText>
                <AppText variant="bodySmall" tone="secondary">
                  {progress.next.description}
                </AppText>
              </View>
            </>
          ) : null}
          {ticket.sla.status !== 'completed' ? (
            <>
              <Divider spacing={theme.spacing.md} />
              <TicketSla sla={ticket.sla} />
            </>
          ) : null}
        </Surface>

        {latest ? (
          <>
            <SectionHeader title="Atualização mais recente" />
            <Surface testID="ticket-latest">
              <AppText variant="bodyStrong">{latest.title}</AppText>
              {latest.description ? (
                <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
                  {latest.description}
                </AppText>
              ) : null}
              <AppText variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
                {formatUpdated(latest.createdAt)}
              </AppText>
            </Surface>
          </>
        ) : null}

        <SectionHeader title="Mensagens" subtitle={messageCount > 0 ? undefined : 'Converse com a equipe sobre este chamado.'} />
        <View onLayout={(event) => setMessagesY(event.nativeEvent.layout.y)}>
          {messageCount > 0 ? (
            <TicketMessages
              messages={ticket.messages}
              pending={actions.pending}
              firstUnreadId={firstUnread?.messageId ?? null}
              onOpenAttachment={openAttachment}
              onRetry={actions.retry}
              onDiscard={actions.discard}
              onFirstUnreadLayout={setUnreadY}
            />
          ) : (
            <AppText variant="bodySmall" tone="muted">
              {ticket.canReply ? 'Nenhuma mensagem ainda. Use o campo abaixo se quiser complementar sua solicitação.' : 'Nenhuma mensagem neste chamado.'}
            </AppText>
          )}
        </View>

        <SectionHeader title="Histórico" subtitle="Tudo o que aconteceu, do mais recente ao mais antigo." />
        <Surface padding={0} style={{ paddingBottom: theme.spacing.sm }}>
          <TicketTimeline events={ticket.events} freshIds={updates.freshEventIds} />
        </Surface>

        <SectionHeader title="Arquivos" />
        {ticket.attachments.length === 0 ? (
          <AppText variant="bodySmall" tone="muted">
            Nenhum arquivo anexado.
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {studentFiles.length > 0 ? <FileGroup title="Enviados por você" files={studentFiles} onOpen={openAttachment} /> : null}
            {asaFiles.length > 0 ? <FileGroup title="Enviados pelo ASA" files={asaFiles} onOpen={openAttachment} /> : null}
          </View>
        )}

        <SectionHeader title="Detalhes" />
        <TicketDetails ticket={ticket} />

        {ticket.canCancel ? (
          <View style={{ marginTop: theme.spacing.xl }}>
            <AppButton label="Cancelar chamado" variant="danger" icon="close-circle-outline" onPress={() => setSheet('cancel')} testID="ticket-cancel" />
          </View>
        ) : null}
      </ScrollView>

      {ticket.canReply && catalog.data ? (
        <View style={{ marginHorizontal: -responsive.gutter }}>
          <TicketComposer
            uploads={uploads}
            maxLength={catalog.data.limits.messageMaxLength}
            bottomInset={navInset}
            emphasizeAttach={Boolean(ticket.pendingAction?.expectsAttachment)}
            inputRef={inputRef}
            onAttachError={(message) => setNotice({ message, tone: 'danger' })}
            onSend={(content) => {
              const sent = uploads.items.filter((item) => item.status === 'uploaded' && item.uploadId);
              actions.send(content, { ids: sent.map((item) => item.uploadId as string), names: sent.map((item) => item.file.name) });
              uploads.clear();
            }}
          />
        </View>
      ) : null}

      <BottomSheet
        visible={sheet !== null}
        onClose={closeSheet}
        title={sheet === 'cancel' ? 'Deseja cancelar esta solicitação?' : 'Ainda precisa de ajuda?'}
        description={sheet === 'cancel' ? 'O histórico permanecerá disponível. Se precisar, você pode abrir um novo chamado depois.' : 'Conte o que ainda não foi resolvido. O chamado volta para a equipe e a resolução anterior fica no histórico.'}
        testID={`ticket-${sheet ?? 'none'}-sheet`}
      >
        <TextInput
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={sheet === 'cancel' ? 500 : 2000}
          placeholder={sheet === 'cancel' ? 'Motivo (opcional)' : 'O que ainda precisa ser resolvido?'}
          placeholderTextColor={theme.colors.text.placeholder}
          style={styles.sheetInput}
          accessibilityLabel={sheet === 'cancel' ? 'Motivo do cancelamento (opcional)' : 'O que ainda precisa ser resolvido'}
          testID="ticket-sheet-reason"
        />
        {sheetError ? (
          <AppText variant="bodySmall" tone="error" style={{ marginTop: theme.spacing.sm }} accessibilityRole="alert">
            {sheetError}
          </AppText>
        ) : null}
        <View style={styles.sheetActions}>
          <AppButton
            label={sheet === 'cancel' ? 'Cancelar chamado' : 'Reabrir chamado'}
            variant={sheet === 'cancel' ? 'danger' : 'primary'}
            onPress={confirmSheet}
            loading={actions.busy === 'cancel' || actions.busy === 'reopen'}
            disabled={sheet === 'reopen' && reason.trim().length < 10}
            testID="ticket-sheet-confirm"
          />
          <AppButton label={sheet === 'cancel' ? 'Manter chamado' : 'Agora não'} variant="ghost" onPress={closeSheet} />
          {sheet === 'reopen' && reason.trim().length > 0 && reason.trim().length < 10 ? (
            <AppText variant="caption" tone="muted" align="center">
              Escreva um pouco mais (pelo menos 10 caracteres).
            </AppText>
          ) : null}
        </View>
      </BottomSheet>
    </Screen>
  );
}

function FileGroup({ title, files, onOpen }: { title: string; files: SupportAttachment[]; onOpen: (attachment: SupportAttachment) => void }) {
  const styles = useStyles();
  return (
    <Surface padding={0}>
      <AppText variant="caption" tone="muted" style={styles.filesLabel}>
        {title}
      </AppText>
      {files.map((file, index) => (
        <View key={file.id}>
          {index > 0 ? <Divider inset={16} /> : null}
          <FileRow attachment={file} onOpen={() => onOpen(file)} testID={`file-${file.id}`} />
        </View>
      ))}
    </Surface>
  );
}

function TicketDetails({ ticket }: { ticket: SupportTicket }) {
  return (
    <List testID="ticket-details">
      <ListItem title="Protocolo" value={ticket.protocol} />
      <ListItem title="Categoria" value={ticket.categoryLabel} />
      {ticket.subcategoryLabel ? <ListItem title="Tipo" value={ticket.subcategoryLabel} /> : null}
      <ListItem title="Data de abertura" value={formatFullDateTime(ticket.createdAt)} />
      <ListItem title="Última atualização" value={formatFullDateTime(ticket.updatedAt)} />
      <ListItem title="Equipe responsável" value={ticket.assignedTeam} />
      <ListItem title="Canal" value="Aplicativo ASA Conecta" />
      {ticket.priority !== 'normal' ? <ListItem title="Prioridade" value={PRIORITY_LABELS[ticket.priority]} /> : null}
      {ticket.reopenedCount > 0 ? <ListItem title="Reaberturas" value={String(ticket.reopenedCount)} /> : null}
    </List>
  );
}

function DetailSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }} testID="ticket-skeleton" accessibilityLabel="Carregando chamado" accessibilityLiveRegion="polite">
      <Skeleton width={120} height={12} />
      <Skeleton width="80%" height={22} />
      <Skeleton width={110} height={20} radius={6} />
      <Surface style={{ gap: theme.spacing.lg, marginTop: theme.spacing.lg }}>
        {[0, 1, 2, 3].map((index) => (
          <View key={index} style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
            <Skeleton width={22} height={22} radius={11} />
            <Skeleton width={index === 2 ? '55%' : '40%'} height={13} />
          </View>
        ))}
      </Surface>
      <Surface style={{ gap: theme.spacing.sm }}>
        <Skeleton width="50%" height={13} />
        <Skeleton width="90%" height={11} />
      </Surface>
    </View>
  );
}
