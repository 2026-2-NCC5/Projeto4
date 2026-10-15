import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, IconButton } from '../../../components/ui';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useResponsive } from '../../../hooks/useResponsive';
import { makeStyles, NATIVE_DRIVER, useTheme } from '../../../theme';
import { queueMotion } from '../motion';
import type { QueueInAppAlert } from '../state/alerts';
import { alertBannerCopy } from '../voice/queueSpeech';

const useStyles = makeStyles((theme) => ({
  wrapper: { position: 'absolute', left: 0, right: 0, zIndex: 200, alignItems: 'center' },
  banner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface.primary,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    borderLeftWidth: 4,
    paddingLeft: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.lg,
  },
  body: { flex: 1, paddingVertical: theme.spacing.xs },
}));

export interface QueueAlertBannerProps {
  alert: QueueInAppAlert | null;
  onPress: () => void;
  onDismiss: () => void;
}

/** Aviso interno de proximidade (app aberto, com ou sem push): entra uma vez e sai sozinho. */
export function QueueAlertBanner({ alert, onPress, onDismiss }: QueueAlertBannerProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();
  const reducedMotion = useReducedMotion();
  const [shown, setShown] = useState<QueueInAppAlert | null>(alert);
  const [progress] = useState(() => new Animated.Value(0));

  if (alert && alert !== shown) setShown(alert);

  useEffect(() => {
    Animated.timing(progress, { toValue: alert ? 1 : 0, duration: alert ? queueMotion.normal : queueMotion.fast, easing: queueMotion.decelerate, useNativeDriver: NATIVE_DRIVER }).start(({ finished }) => {
      if (finished && !alert) setShown(null);
    });
  }, [alert, progress]);

  if (!shown) return null;
  const copy = alertBannerCopy(shown.kind, shown);
  const accent = shown.kind === 'called' ? theme.colors.status.success : theme.colors.status.warning;
  return (
    <View style={[styles.wrapper, { top: insets.top + theme.spacing.sm, paddingHorizontal: responsive.gutter, pointerEvents: 'box-none' }]}>
      <Animated.View
        style={{
          width: '100%',
          maxWidth: responsive.contentMaxWidth,
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [reducedMotion ? 0 : -16, 0] }) }],
        }}
      >
        <View style={[styles.banner, { borderLeftColor: accent }]} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="queue-alert-banner">
          <Ionicons name={shown.kind === 'next' ? 'alert-circle-outline' : 'time-outline'} size={22} color={accent} />
          <Pressable accessibilityRole="button" accessibilityLabel={`${copy.title}. ${copy.message}`} accessibilityHint="Abre a fila presencial" onPress={onPress} style={styles.body}>
            <AppText variant="bodyStrong">{copy.title}</AppText>
            <AppText variant="bodySmall" tone="secondary">
              {copy.message}
            </AppText>
          </Pressable>
          <IconButton icon="close" accessibilityLabel="Fechar aviso" onPress={onDismiss} tone="muted" size={40} />
        </View>
      </Animated.View>
    </View>
  );
}
