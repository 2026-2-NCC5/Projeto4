import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, Modal, StyleSheet, View } from 'react-native';

import { AppButton, AppText } from '../../../components/ui';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { makeStyles, NATIVE_DRIVER, useTheme } from '../../../theme';
import { queueMotion } from '../motion';
import type { QueueInAppAlert } from '../state/alerts';

const RING = 112;

const useStyles = makeStyles((theme) => ({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: theme.colors.background.backdrop },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    backgroundColor: theme.colors.surface.primary,
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.xxl,
    paddingTop: theme.spacing.xxxl,
    paddingBottom: theme.spacing.xxl,
    ...theme.shadows.lg,
  },
  badgeArea: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: RING, height: RING, borderRadius: RING / 2, borderWidth: 3, borderColor: theme.colors.status.success },
  check: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.status.success },
  ticket: { fontVariant: ['tabular-nums'], letterSpacing: 2, fontWeight: '700' },
  actions: { alignSelf: 'stretch', marginTop: theme.spacing.xxl },
}));

export interface QueueCalledModalProps {
  alert: QueueInAppAlert | null;
  onAcknowledge: () => void;
}

/**
 * "É a sua vez!" — a única animação mais forte da fila, e ainda assim única (sem loop):
 * fundo esmaece · cartão 0,94 → 1 · anel se expande uma vez · senha cresce · mesa desliza.
 * Com "Reduzir movimento", tudo vira fade. Depois a tela fica estável até o "Entendi".
 */
export function QueueCalledModal({ alert, onAcknowledge }: QueueCalledModalProps) {
  const theme = useTheme();
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const [shown, setShown] = useState<QueueInAppAlert | null>(alert);
  const [backdrop] = useState(() => new Animated.Value(0));
  const [card] = useState(() => new Animated.Value(0));
  const [ring] = useState(() => new Animated.Value(0));
  const [ticket] = useState(() => new Animated.Value(0));
  const [desk] = useState(() => new Animated.Value(0));

  // mantém o conteúdo durante a animação de saída
  if (alert && alert !== shown) setShown(alert);

  useEffect(() => {
    if (alert) {
      for (const value of [backdrop, card, ring, ticket, desk]) value.setValue(0);
      const timing = (value: Animated.Value, duration: number, delay = 0) =>
        Animated.timing(value, { toValue: 1, duration, delay, easing: queueMotion.decelerate, useNativeDriver: NATIVE_DRIVER });
      Animated.parallel([
        timing(backdrop, queueMotion.fast),
        timing(card, queueMotion.emphasized),
        timing(ticket, queueMotion.emphasized, queueMotion.fast),
        timing(desk, queueMotion.normal, queueMotion.emphasized),
        ...(reducedMotion ? [] : [timing(ring, queueMotion.ring, queueMotion.fast)]),
      ]).start();
      return undefined;
    }
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: queueMotion.fast, useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(card, { toValue: 0, duration: queueMotion.fast, useNativeDriver: NATIVE_DRIVER }),
    ]).start(() => setShown(null));
    return undefined;
  }, [alert, reducedMotion, backdrop, card, ring, ticket, desk]);

  if (!shown) return null;
  const scaleFrom = reducedMotion ? 1 : queueMotion.modalFrom;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onAcknowledge}>
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]} />
      <View style={styles.center}>
        <Animated.View
          style={[styles.card, { opacity: card, transform: [{ scale: card.interpolate({ inputRange: [0, 1], outputRange: [scaleFrom, 1] }) }] }]}
          accessibilityViewIsModal
          accessible
          accessibilityRole="alert"
          accessibilityLabel={`É a sua vez! Senha ${shown.ticket}${shown.desk ? `, ${shown.desk}. Dirija-se à mesa indicada.` : '. Confira a mesa indicada no painel do ASA.'}`}
          testID="queue-called-modal"
        >
          <View style={styles.badgeArea}>
            {reducedMotion ? null : (
              <Animated.View
                style={[
                  styles.ring,
                  {
                    opacity: ring.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.45, 0] }),
                    transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.6] }) }],
                  },
                ]}
              />
            )}
            <View style={styles.check}>
              <Ionicons name="checkmark" size={36} color={theme.colors.text.onPrimary} />
            </View>
          </View>
          <AppText variant="h2" align="center" style={{ marginTop: theme.spacing.lg }}>
            É a sua vez!
          </AppText>
          <Animated.View style={{ opacity: ticket, transform: [{ scale: ticket.interpolate({ inputRange: [0, 1], outputRange: [reducedMotion ? 1 : 0.85, 1] }) }] }}>
            <AppText variant="metricLarge" tone="success" align="center" style={[styles.ticket, { marginTop: theme.spacing.sm }]} testID="queue-called-ticket">
              {shown.ticket}
            </AppText>
          </Animated.View>
          <Animated.View style={{ opacity: desk, transform: [{ translateY: desk.interpolate({ inputRange: [0, 1], outputRange: [reducedMotion ? 0 : queueMotion.countShift, 0] }) }] }}>
            <AppText variant="h3" align="center" style={{ marginTop: theme.spacing.xs }} testID="queue-called-desk">
              {shown.desk ?? 'Mesa no painel do ASA'}
            </AppText>
            <AppText variant="body" tone="secondary" align="center" style={{ marginTop: theme.spacing.sm }}>
              {shown.desk ? 'Dirija-se à mesa indicada.' : 'Confira no painel do ASA a mesa da sua senha.'}
            </AppText>
          </Animated.View>
          <View style={styles.actions}>
            <AppButton label="Entendi" onPress={onAcknowledge} fullWidth size="large" testID="queue-called-ack" />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
