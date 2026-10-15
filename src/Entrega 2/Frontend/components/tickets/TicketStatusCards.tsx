import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { formatBusinessDays, formatDueDate, formatFriendlyDateTime, formatFullDateTime, formatRemaining } from '../../features/support/format';
import { SLA_META } from '../../features/support/labels';
import { useSupportMotion } from '../../features/support/motion';
import { makeStyles, useTheme } from '../../theme';
import type { SupportPendingAction, SupportTicketSla } from '../../types/api';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';

import { AnimatedCheck } from './AnimatedCheck';
import { Appear } from './Appear';
import { toneColors } from './tone';

const useStyles = makeStyles((theme) => ({
  block: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  action: { borderRadius: theme.radius.lg, padding: theme.spacing.lg, borderWidth: 1 },
  actionHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  resolution: { borderRadius: theme.radius.lg, padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.border.default, backgroundColor: theme.colors.surface.primary },
  resolutionHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  quote: { marginTop: theme.spacing.md, paddingLeft: theme.spacing.md, borderLeftWidth: 3, borderLeftColor: theme.colors.status.success },
}));

/**
 * Prazo com transparência e sem alarme: previsão vinda do servidor (nunca inventada), tempo estimado e o que
 * acontece quando o prazo está pausado.
 */
export function TicketSla({ sla, now, testID = 'ticket-sla' }: { sla: SupportTicketSla; now?: Date; testID?: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const meta = SLA_META[sla.status];
  const tone = toneColors(theme, meta.tone);
  const remaining = formatRemaining(sla.dueAt, now);
  const typical = `Normalmente esta solicitação é respondida em ${formatBusinessDays(sla.targetBusinessDays)}.`;

  if (sla.status === 'completed') return null;
  if (sla.status === 'paused') {
    return (
      <View style={styles.row} accessible testID={testID}>
        <Ionicons name={meta.icon} size={18} color={theme.colors.text.secondary} style={{ marginTop: 1 }} />
        <View style={[styles.block, { flex: 1 }]}>
          <AppText variant="bodySmallStrong">Prazo pausado</AppText>
          <AppText variant="bodySmall" tone="secondary">
            O prazo volta a contar assim que você responder ao ASA.
          </AppText>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.row} accessible testID={testID}>
      <Ionicons name={meta.icon} size={18} color={sla.status === 'overdue' || sla.status === 'near_deadline' ? tone.foreground : theme.colors.text.secondary} style={{ marginTop: 1 }} />
      <View style={[styles.block, { flex: 1 }]}>
        <AppText variant="caption" tone="muted">
          Previsão de resposta
        </AppText>
        <AppText variant="bodyStrong">{formatDueDate(sla.dueAt, now)}</AppText>
        {sla.status === 'overdue' ? (
          <AppText variant="bodySmall" style={{ color: tone.foreground }}>
            O prazo previsto já passou. Sua solicitação continua em atendimento.
          </AppText>
        ) : (
          <AppText variant="bodySmall" tone="secondary">
            {remaining ? `Prazo estimado: ${remaining}. ` : ''}
            {typical}
          </AppText>
        )}
      </View>
    </View>
  );
}

/**
 * "Aguardando você": o que exatamente o ASA precisa, em tom de atenção equilibrado (não vermelho). O ícone faz um
 * único gesto ao aparecer — nada pisca continuamente.
 */
export function TicketActionRequired({ action, onRespond, onAttach, now }: { action: SupportPendingAction; onRespond: () => void; onAttach: () => void; now?: Date }) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useSupportMotion();
  const tone = toneColors(theme, 'warning');
  const wave = useSharedValue(0);

  useEffect(() => {
    if (motion.reduce) return;
    wave.set(withDelay(260, withSequence(withTiming(1, { duration: 140 }), withTiming(-1, { duration: 140 }), withTiming(0.5, { duration: 120 }), withTiming(0, { duration: 120 }))));
  }, [motion.reduce, wave]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${wave.get() * 12}deg` }] }));

  return (
    <Appear>
      <View style={[styles.action, { backgroundColor: tone.background, borderColor: theme.colors.status.warning }]} accessibilityRole="alert" testID="ticket-action-required">
        <View style={styles.actionHeader}>
          <Animated.View style={iconStyle}>
            <Ionicons name="hand-left-outline" size={20} color={tone.foreground} />
          </Animated.View>
          <AppText variant="h4" style={{ color: tone.foreground, flex: 1 }}>
            Precisamos de uma informação sua
          </AppText>
        </View>
        <AppText variant="body" style={{ marginTop: theme.spacing.sm }}>
          {action.description}
        </AppText>
        <AppText variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
          {`Pedido ${formatFriendlyDateTime(action.requestedAt, now).toLowerCase()}`}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          {action.expectsAttachment ? <AppButton label="Enviar documento" icon="attach-outline" onPress={onAttach} testID="action-attach" /> : null}
          <AppButton label="Responder" icon="chatbubble-outline" variant={action.expectsAttachment ? 'secondary' : 'primary'} onPress={onRespond} testID="action-respond" />
        </View>
      </View>
    </Appear>
  );
}

export interface TicketResolutionProps {
  resolution: string | null;
  resolvedAt: string | null;
  closed: boolean;
  canReopen: boolean;
  reopenDeadline: string | null;
  onReopen: () => void;
}

/** "Solicitação resolvida": check desenhado, data e a solução registrada pela equipe. */
export function TicketResolution({ resolution, resolvedAt, closed, canReopen, reopenDeadline, onReopen }: TicketResolutionProps) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Appear>
      <View style={styles.resolution} testID="ticket-resolution" accessibilityRole="summary">
        <View style={styles.resolutionHeader}>
          <AnimatedCheck size={40} />
          <View style={{ flex: 1 }}>
            <AppText variant="h4">{closed ? 'Chamado encerrado' : 'Solicitação resolvida'}</AppText>
            {resolvedAt ? (
              <AppText variant="caption" tone="muted">
                {`Resolvida em ${formatFullDateTime(resolvedAt)}`}
              </AppText>
            ) : null}
          </View>
        </View>
        {resolution ? (
          <View style={styles.quote}>
            <AppText variant="caption" tone="muted" style={{ marginBottom: 2 }}>
              Resumo da resolução
            </AppText>
            <AppText variant="body">{resolution}</AppText>
          </View>
        ) : null}
        {canReopen ? (
          <View style={{ marginTop: theme.spacing.md }}>
            <AppButton label="Ainda preciso de ajuda" variant="secondary" icon="refresh-outline" onPress={onReopen} testID="ticket-reopen" />
            {reopenDeadline ? (
              <AppText variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
                {`Você pode reabrir este chamado até ${formatFullDateTime(reopenDeadline)}.`}
              </AppText>
            ) : null}
          </View>
        ) : null}
      </View>
    </Appear>
  );
}
