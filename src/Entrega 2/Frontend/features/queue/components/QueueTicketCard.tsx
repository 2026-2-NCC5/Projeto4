import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';

import { AppText, Badge, Divider, Surface } from '../../../components/ui';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { makeStyles, NATIVE_DRIVER, useTheme } from '../../../theme';
import type { QueueSubscription } from '../../../types/api';
import { queueMotion } from '../motion';
import type { QueueExperience, QueueExperienceState } from '../state/experience';

import { QueueAheadDots, QueueProgress } from './QueueProgress';

const STATUS_BADGE: Partial<Record<QueueExperienceState, { label: string; tone: 'neutral' | 'warning' | 'success' }>> = {
  waiting: { label: 'Aguardando atendimento', tone: 'neutral' },
  approaching: { label: 'Sua vez está chegando', tone: 'warning' },
  next: { label: 'Entre as próximas', tone: 'warning' },
  called: { label: 'Chamada', tone: 'success' },
  completed: { label: 'Finalizado', tone: 'neutral' },
};

const useStyles = makeStyles((theme) => ({
  card: { borderTopWidth: 3 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing.md },
  ticket: { fontVariant: ['tabular-nums'], letterSpacing: 1, fontWeight: '700' },
  section: { marginTop: theme.spacing.lg },
  estimate: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: theme.spacing.md, flexWrap: 'wrap' },
}));

export interface QueueTicketCardProps {
  subscription: QueueSubscription;
  experience: QueueExperience;
}

/**
 * Cartão principal: a senha, o que está acontecendo e quanto falta — numa única hierarquia
 * (não um card por informação). Posição e estimativa só aparecem quando vêm de dados reais.
 */
export function QueueTicketCard({ subscription, experience }: QueueTicketCardProps) {
  const theme = useTheme();
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const [messageOpacity] = useState(() => new Animated.Value(1));
  const [messageShift] = useState(() => new Animated.Value(0));
  const previousState = useRef<QueueExperienceState>(experience.state);
  const previousMessage = useRef(experience.message);

  // destaque único na mudança de estado (chegando / prepare-se / chamada)
  useEffect(() => {
    const from = previousState.current;
    previousState.current = experience.state;
    if (from === experience.state || reducedMotion) return;
    const start = experience.state === 'approaching' ? queueMotion.highlightFrom.approaching : experience.state === 'next' || experience.state === 'called' ? queueMotion.highlightFrom.next : null;
    if (start === null) return;
    scale.setValue(start);
    Animated.timing(scale, { toValue: 1, duration: queueMotion.emphasized, easing: queueMotion.decelerate, useNativeDriver: NATIVE_DRIVER }).start();
  }, [experience.state, reducedMotion, scale]);

  // "4 pessoas → 3 pessoas": fade + deslocamento curto (só fade com movimento reduzido)
  useEffect(() => {
    if (previousMessage.current === experience.message) return;
    previousMessage.current = experience.message;
    messageOpacity.setValue(0);
    messageShift.setValue(reducedMotion ? 0 : queueMotion.countShift);
    Animated.parallel([
      Animated.timing(messageOpacity, { toValue: 1, duration: queueMotion.normal, easing: queueMotion.easing, useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(messageShift, { toValue: 0, duration: queueMotion.normal, easing: queueMotion.decelerate, useNativeDriver: NATIVE_DRIVER }),
    ]).start();
  }, [experience.message, reducedMotion, messageOpacity, messageShift]);

  const accent = experience.tone === 'success' ? theme.colors.status.success : experience.tone === 'attention' ? theme.colors.status.warning : theme.colors.border.default;
  const badge = STATUS_BADGE[experience.state];
  const showAhead = (experience.state === 'waiting' || experience.state === 'approaching' || experience.state === 'next') && subscription.positionKnown && subscription.ahead !== null;
  const estimate = subscription.estimate;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Surface style={[styles.card, { borderTopColor: accent }]} testID="queue-ticket-card">
        <View accessible accessibilityRole="summary" accessibilityLiveRegion="polite" accessibilityLabel={`Sua senha ${subscription.ticket}. ${experience.accessibilityLabel}`}>
          <View style={styles.top}>
            <View>
              <AppText variant="label" tone="secondary">
                Sua senha
              </AppText>
              <AppText variant="metricLarge" tone={experience.tone === 'success' ? 'success' : 'primary'} style={styles.ticket} testID="queue-ticket-number">
                {subscription.ticket}
              </AppText>
            </View>
            {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
          </View>

          <View style={styles.section}>
            <AppText variant="h3">{experience.title}</AppText>
            <Animated.View style={{ opacity: messageOpacity, transform: [{ translateY: messageShift }] }}>
              <AppText variant="body" tone="secondary" style={{ marginTop: theme.spacing.xxs }} testID="queue-ticket-message">
                {experience.message}
              </AppText>
            </Animated.View>
            {experience.hint ? (
              <AppText variant="bodySmall" tone="secondary" style={{ marginTop: theme.spacing.xxs }}>
                {experience.hint}
              </AppText>
            ) : null}
            {showAhead && subscription.position !== null ? (
              <AppText variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
                Posição {subscription.position} na lista de próximas senhas
              </AppText>
            ) : null}
          </View>
        </View>

        {showAhead ? (
          <View style={styles.section}>
            <QueueAheadDots ahead={subscription.ahead!} tone={experience.tone} />
          </View>
        ) : null}

        <Divider spacing={theme.spacing.lg} />
        <QueueProgress experience={experience} />

        {showAhead ? (
          <>
            <Divider spacing={theme.spacing.lg} />
            {estimate ? (
              <View style={styles.estimate} accessible accessibilityLabel={`Estimativa aproximada: de ${estimate.minMinutes} a ${estimate.maxMinutes} minutos`} testID="queue-estimate">
                <AppText variant="bodySmall" tone="secondary">
                  Estimativa aproximada
                </AppText>
                <AppText variant="bodyStrong">
                  {estimate.minMinutes}–{estimate.maxMinutes} min
                </AppText>
              </View>
            ) : (
              <AppText variant="bodySmall" tone="muted" testID="queue-estimate-unavailable">
                Ainda não dá para estimar o tempo com segurança. Acompanhamos sua posição por você.
              </AppText>
            )}
            {estimate ? (
              <AppText variant="caption" tone="muted" style={{ marginTop: theme.spacing.xxs }}>
                Calculada pelo ritmo recente de chamadas{estimate.activeDesks > 1 ? ` em ${estimate.activeDesks} mesas` : ''}. Pode mudar.
              </AppText>
            ) : null}
          </>
        ) : null}
      </Surface>
    </Animated.View>
  );
}
