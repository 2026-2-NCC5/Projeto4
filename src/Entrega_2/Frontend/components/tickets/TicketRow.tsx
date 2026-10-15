import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { formatUpdated } from '../../features/support/format';
import { STATUS_META } from '../../features/support/labels';
import { makeStyles, useTheme } from '../../theme';
import type { SupportTicketSummary } from '../../types/api';
import { Divider } from '../ui/Divider';
import { Skeleton } from '../ui/LoadingSkeleton';
import { AppText } from '../ui/AppText';

import { TicketStatusBadge } from './TicketStatusBadge';
import { toneColors } from './tone';

/** Posição na lista: as linhas formam um único card (bordas arredondadas só nas pontas). */
export type RowPosition = 'first' | 'middle' | 'last' | 'only';

export interface TicketRowProps {
  ticket: SupportTicketSummary;
  onPress: () => void;
  position?: RowPosition;
  now?: Date;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  card: { backgroundColor: theme.colors.surface.primary, borderColor: theme.colors.border.default, borderLeftWidth: 1, borderRightWidth: 1 },
  first: { borderTopWidth: 1, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, overflow: 'hidden' },
  last: { borderBottomWidth: 1, borderBottomLeftRadius: theme.radius.lg, borderBottomRightRadius: theme.radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: theme.spacing.md, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md + 2, minHeight: 72 },
  pressed: { backgroundColor: theme.colors.surface.secondary },
  body: { flex: 1, minWidth: 0, gap: 4 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: 2 },
  unread: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brand.primaryStrong },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  chevron: { alignSelf: 'center' },
}));

/** Linha de "Meus chamados": assunto, protocolo, situação, última atualização e ação pendente, sem poluição. */
export function TicketRow({ ticket, onPress, position = 'only', now, testID }: TicketRowProps) {
  const theme = useTheme();
  const styles = useStyles();
  const status = STATUS_META[ticket.status];
  const warning = toneColors(theme, 'warning');
  const overdue = ticket.sla.status === 'overdue';
  const label = [
    ticket.subject,
    `Protocolo ${ticket.protocol}`,
    status.label,
    formatUpdated(ticket.updatedAt, now),
    ticket.requiresStudentAction ? 'Aguardando uma ação sua' : null,
    ticket.unreadCount > 0 ? `${ticket.unreadCount} ${ticket.unreadCount === 1 ? 'mensagem nova' : 'mensagens novas'}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View style={[styles.card, (position === 'first' || position === 'only') && styles.first, (position === 'last' || position === 'only') && styles.last]}>
      {position === 'middle' || position === 'last' ? <Divider inset={theme.spacing.lg} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Abre o andamento do chamado" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} testID={testID}>
        <View style={styles.body}>
          <View style={styles.top}>
            <AppText variant="bodyStrong" numberOfLines={2} style={{ flex: 1 }}>
              {ticket.subject}
            </AppText>
            {ticket.unreadCount > 0 ? (
              <View style={styles.unread}>
                <AppText variant="caption" tone="onPrimary" style={{ fontWeight: '700' }}>
                  {ticket.unreadCount > 9 ? '9+' : ticket.unreadCount}
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {`${ticket.protocol} · ${ticket.categoryLabel}`}
          </AppText>
          <View style={styles.meta}>
            <TicketStatusBadge status={ticket.status} />
            <AppText variant="caption" tone={overdue ? 'error' : 'muted'}>
              {overdue ? 'Prazo excedido' : formatUpdated(ticket.updatedAt, now)}
            </AppText>
          </View>
          {ticket.requiresStudentAction ? (
            <View style={styles.action}>
              <Ionicons name="hand-left-outline" size={14} color={warning.foreground} />
              <AppText variant="caption" style={{ color: warning.foreground, fontWeight: '600' }}>
                O ASA precisa de uma informação sua
              </AppText>
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.text.muted} style={styles.chevron} />
      </Pressable>
    </View>
  );
}

/** Esqueleto da lista de chamados (neutro, pulso discreto). */
export function TicketListSkeleton({ rows = 4, testID = 'tickets-skeleton' }: { rows?: number; testID?: string }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View testID={testID} accessibilityLabel="Carregando chamados" accessibilityLiveRegion="polite">
      {Array.from({ length: rows }, (_, index) => {
        const position: RowPosition = rows === 1 ? 'only' : index === 0 ? 'first' : index === rows - 1 ? 'last' : 'middle';
        return (
          <View key={index} style={[styles.card, (position === 'first' || position === 'only') && styles.first, (position === 'last' || position === 'only') && styles.last]}>
            {index > 0 ? <Divider inset={theme.spacing.lg} /> : null}
            <View style={[styles.row, { flexDirection: 'column', gap: 8 }]}>
              <Skeleton width="72%" height={14} />
              <Skeleton width="40%" height={11} />
              <Skeleton width={110} height={18} radius={6} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
