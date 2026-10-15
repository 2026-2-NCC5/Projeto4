import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { AppButton, AppText, Divider, EmptyState, OfflineBanner, ScheduleSkeleton, SectionHeader, Surface } from '../components/ui';
import { InlineNotice } from '../features/appointments/components/InlineNotice';
import { categoryMeta, groupInbox, inboxErrorMessage, inboxTarget, targetHint, useInbox } from '../features/notifications';
import { formatRelative } from '../features/support/format';
import { isConnectivityError } from '../features/support/errors';
import { useAppNavigation } from '../navigation/AppNavigator';
import { makeStyles, useTheme } from '../theme';
import type { InboxNotification } from '../types/api';
import { pluralize } from '../utils/format';

const ICON_SLOT = 24;

const useStyles = makeStyles((theme) => ({
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md, marginBottom: theme.spacing.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg, minHeight: 64 },
  pressed: { backgroundColor: theme.colors.surface.secondary },
  icon: { width: ICON_SLOT, alignItems: 'center', paddingTop: 1 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.status.info },
  chevron: { alignSelf: 'center' },
}));

export interface NotificationsScreenProps {
  /** Injetável em testes ("Hoje" e horários relativos determinísticos). */
  now?: Date;
}

/**
 * Central de avisos: chamados, agendamentos e avisos do ASA em um só lugar. Tocar marca como lido (também no
 * Atendimento, pelo servidor) e abre o registro do aviso.
 */
export function NotificationsScreen({ now }: NotificationsScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const navigation = useAppNavigation();
  const inbox = useInbox({ poll: true });
  const { resource } = inbox;
  const [problem, setProblem] = useState<string | null>(null);
  const today = now ?? new Date();
  const groups = groupInbox(inbox.items, today);
  const unread = inbox.unreadCount ?? 0;
  const offline = Boolean(resource.error && resource.data && isConnectivityError(resource.error));

  const open = (item: InboxNotification) => {
    if (!item.readAt) {
      inbox
        .markRead([item.id])
        .then((message) => {
          if (message) setProblem(message);
        })
        .catch(() => undefined);
    }
    const target = inboxTarget(item);
    if (target?.kind === 'ticket') navigation.openTicket(target.id);
    else if (target?.kind === 'appointment') navigation.openAppointment(target.id);
    else if (target?.kind === 'recommendation') navigation.openRecommendation(target.id);
  };

  const markAll = () => {
    setProblem(null);
    inbox
      .markAllRead()
      .then((message) => setProblem(message))
      .catch(() => undefined);
  };

  return (
    <Screen testID="notifications-screen" refreshing={resource.refreshing} onRefresh={resource.refresh}>
      <ScreenHeader title="Avisos" subtitle="Chamados, agendamentos e avisos do ASA." onBack={navigation.goBack} />
      <OfflineBanner />

      {resource.data ? (
        <View style={styles.summary}>
          <AppText variant="bodySmall" tone="secondary" accessibilityLiveRegion="polite" testID="notifications-unread">
            {unread > 0 ? pluralize(unread, 'aviso não lido', 'avisos não lidos') : 'Tudo lido por aqui'}
          </AppText>
          {unread > 0 ? <AppButton label="Marcar todas como lidas" variant="ghost" size="small" icon="checkmark-done-outline" onPress={markAll} loading={inbox.busy} testID="notifications-mark-all" /> : null}
        </View>
      ) : null}

      <View style={{ gap: theme.spacing.sm }}>
        <InlineNotice message={problem} tone="danger" testID="notifications-problem" />
        {offline ? <InlineNotice message="Você está offline. Mostrando a última atualização disponível." tone="warning" icon="cloud-offline-outline" /> : null}
      </View>

      {resource.status === 'loading' ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <ScheduleSkeleton rows={4} testID="notifications-skeleton" />
        </View>
      ) : null}
      {resource.status === 'error' ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <EmptyState
            title="Não conseguimos carregar seus avisos"
            message={inboxErrorMessage(resource.error)}
            icon="cloud-offline-outline"
            actionLabel="Tentar novamente"
            onAction={resource.reload}
            testID="notifications-error"
          />
        </View>
      ) : null}
      {resource.data && inbox.items.length === 0 ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <EmptyState title="Nenhum aviso por aqui" message="Atualizações dos seus chamados e agendamentos aparecem aqui." icon="notifications-outline" testID="notifications-empty" />
        </View>
      ) : null}

      {groups.map((group, groupIndex) => (
        <View key={group.key}>
          <SectionHeader title={group.title} flush={groupIndex === 0 && !resource.data} />
          <Surface padding={0} testID={`notifications-${group.key}`}>
            {group.items.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <Divider inset={theme.spacing.lg + ICON_SLOT + theme.spacing.md} /> : null}
                <InboxRow item={item} now={today} onPress={() => open(item)} />
              </View>
            ))}
          </Surface>
        </View>
      ))}
    </Screen>
  );
}

function InboxRow({ item, now, onPress }: { item: InboxNotification; now: Date; onPress: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  const unread = !item.readAt;
  const meta = categoryMeta(item.category);
  const target = inboxTarget(item);
  const when = formatRelative(item.createdAt, now);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Não lido. ' : ''}${item.title}. ${item.body}. ${meta.label}, ${when}`}
      accessibilityHint={targetHint(target)}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`notification-${item.id}`}
    >
      <View style={styles.icon}>
        <Ionicons name={meta.icon} size={20} color={unread ? theme.colors.text.primary : theme.colors.text.muted} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <AppText variant={unread ? 'bodyStrong' : 'body'} tone={unread ? 'primary' : 'secondary'} numberOfLines={2} style={{ flex: 1 }}>
            {item.title}
          </AppText>
          {unread ? <View style={styles.dot} testID={`notification-unread-${item.id}`} /> : null}
        </View>
        <AppText variant="bodySmall" tone="secondary" numberOfLines={3}>
          {item.body}
        </AppText>
        <AppText variant="caption" tone="muted">
          {`${meta.label} · ${when}`}
        </AppText>
      </View>
      {target ? <Ionicons name="chevron-forward" size={16} color={theme.colors.text.muted} style={styles.chevron} /> : null}
    </Pressable>
  );
}
