import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { formatUpdated } from '../../features/support/format';
import { STATUS_META } from '../../features/support/labels';
import { SUPPORT_MOTION, useSupportMotion } from '../../features/support/motion';
import { makeStyles, useTheme } from '../../theme';
import type { SupportTicketSummary } from '../../types/api';
import { AppText } from '../ui/AppText';

import { toneColors } from './tone';

export interface TicketSummaryCardProps {
  ticket: SupportTicketSummary;
  onPress: () => void;
  now?: Date;
  testID?: string;
}

/** Frase do topo do card: o que o estudante precisa saber em uma linha. */
export function headlineFor(ticket: Pick<SupportTicketSummary, 'status' | 'unreadCount'>): string {
  switch (ticket.status) {
    case 'waiting_student':
      return 'O ASA precisa de uma informação sua';
    case 'resolved':
      return 'Seu chamado foi resolvido';
    case 'received':
    case 'submitted':
      return 'Seu chamado foi recebido';
    case 'triage':
      return 'Seu chamado está em triagem';
    case 'in_progress':
      return 'Seu chamado está em atendimento';
    case 'waiting_department':
    case 'waiting_external':
      return 'Aguardando retorno de outro setor';
    default:
      return ticket.unreadCount > 0 ? 'Você tem uma nova mensagem do ASA' : 'Seu chamado está em análise';
  }
}

const useStyles = makeStyles((theme) => ({
  card: { backgroundColor: theme.colors.surface.primary, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border.default },
  pressed: { backgroundColor: theme.colors.surface.secondary },
  body: { flexDirection: 'row', gap: theme.spacing.md, padding: theme.spacing.lg },
  text: { flex: 1, minWidth: 0 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: theme.colors.border.subtle, paddingHorizontal: theme.spacing.lg, minHeight: 44 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  marker: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
}));

/**
 * Resumo compacto de um chamado relevante (Home e Atendimento). Quando chega uma atualização com o card na tela,
 * ele faz um destaque discreto e único (fade + scale 0.98 → 1) — nunca pisca continuamente.
 */
export function TicketSummaryCard({ ticket, onPress, now, testID = 'ticket-summary' }: TicketSummaryCardProps) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useSupportMotion();
  const meta = STATUS_META[ticket.status];
  const tone = toneColors(theme, meta.tone);
  const [seenUpdate, setSeenUpdate] = useState(ticket.updatedAt);
  const emphasis = useSharedValue(1);
  const updated = seenUpdate !== ticket.updatedAt;

  if (updated) setSeenUpdate(ticket.updatedAt);

  useEffect(() => {
    if (!updated || motion.reduce) return;
    emphasis.set(withSequence(withTiming(0.98, motion.timing(SUPPORT_MOTION.duration.fast)), withTiming(1, motion.timing(SUPPORT_MOTION.duration.slow))));
  }, [emphasis, motion, updated]);

  const animated = useAnimatedStyle(() => ({ opacity: 0.6 + (emphasis.get() - 0.98) * 20, transform: [{ scale: emphasis.get() }] }));
  const headline = headlineFor(ticket);

  return (
    <Animated.View style={animated}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${headline}. ${ticket.subject}. Protocolo ${ticket.protocol}. ${formatUpdated(ticket.updatedAt, now)}`}
        accessibilityHint="Abre o andamento do chamado"
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        testID={testID}
      >
        <View style={styles.body}>
          <View style={[styles.marker, { backgroundColor: tone.accent }]} />
          <View style={styles.text}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name={meta.icon} size={16} color={tone.foreground} />
              <AppText variant="bodySmallStrong" style={{ color: tone.foreground, flex: 1 }} numberOfLines={2}>
                {headline}
              </AppText>
            </View>
            <AppText variant="bodyStrong" style={{ marginTop: theme.spacing.xs }} numberOfLines={2}>
              {ticket.subject}
            </AppText>
            <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {`${ticket.protocol} · ${formatUpdated(ticket.updatedAt, now)}`}
            </AppText>
          </View>
        </View>
        <View style={styles.footer}>
          <AppText variant="caption" tone="secondary">
            {ticket.unreadCount > 0 ? `${ticket.unreadCount} ${ticket.unreadCount === 1 ? 'mensagem nova' : 'mensagens novas'}` : meta.short}
          </AppText>
          <View style={styles.link}>
            <AppText variant="bodySmallStrong" tone="link">
              {ticket.status === 'waiting_student' ? 'Responder' : 'Ver andamento'}
            </AppText>
            <Ionicons name="chevron-forward" size={14} color={theme.colors.text.link} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
