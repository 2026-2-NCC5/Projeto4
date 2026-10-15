import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { SupportTone } from '../../features/support/labels';
import { useSupportMotion } from '../../features/support/motion';
import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';

import { toneColors } from './tone';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface SupportNoticeProps {
  /** null esconde (com animação de saída) */
  message: string | null;
  tone?: SupportTone;
  icon?: IconName;
  /** some sozinho depois deste tempo (ms) */
  autoHideMs?: number;
  onHide?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  notice: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.md, minHeight: 40 },
  text: { flex: 1 },
  action: { minHeight: 32, justifyContent: 'center', paddingHorizontal: theme.spacing.xs },
}));

/**
 * Aviso discreto em linha ("Chamado atualizado", "Protocolo copiado", "Você está offline"): fade + slide curto,
 * sem pop-up nem bloqueio. Anunciado pelo leitor de tela (live region).
 */
export function SupportNotice({ message, tone = 'neutral', icon = 'information-circle-outline', autoHideMs, onHide, actionLabel, onAction, testID }: SupportNoticeProps) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useSupportMotion();
  const [shown, setShown] = useState(message);
  const visible = useSharedValue(0);
  const colors = toneColors(theme, tone);

  // Mantém o texto durante a animação de saída.
  if (message && message !== shown) setShown(message);

  useEffect(() => {
    visible.set(withTiming(message ? 1 : 0, motion.timing()));
    if (message) return undefined;
    // Depois da saída, o aviso deixa de ocupar espaço.
    const timer = setTimeout(() => setShown(null), motion.reduce ? 0 : 240);
    return () => clearTimeout(timer);
  }, [message, motion, visible]);

  useEffect(() => {
    if (!message || !autoHideMs || !onHide) return undefined;
    const timer = setTimeout(onHide, autoHideMs);
    return () => clearTimeout(timer);
  }, [autoHideMs, message, onHide]);

  const animated = useAnimatedStyle(() => ({ opacity: visible.get(), transform: [{ translateY: (1 - visible.get()) * -6 }] }));

  if (!message && !shown) return null;
  return (
    <Animated.View style={[styles.notice, { backgroundColor: colors.background }, animated]} accessibilityRole="alert" accessibilityLiveRegion="polite" testID={testID}>
      <Ionicons name={icon} size={18} color={colors.foreground} />
      <View style={styles.text}>
        <AppText variant="bodySmallStrong" style={{ color: colors.foreground }}>
          {message ?? shown}
        </AppText>
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} hitSlop={theme.hitSlop} style={styles.action}>
          <AppText variant="bodySmallStrong" style={{ color: colors.foreground, textDecorationLine: 'underline' }}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}
