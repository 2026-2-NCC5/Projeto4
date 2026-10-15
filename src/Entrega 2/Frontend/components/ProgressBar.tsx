import React, { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';

import { useReducedMotion } from '../hooks/useReducedMotion';
import { makeStyles, useTheme } from '../theme';

export type ProgressTone = 'default' | 'warning' | 'danger';

interface ProgressBarProps {
  /** 0-100 */
  value: number;
  /** default: verde (situação saudável) · warning: atenção · danger: crítico. */
  tone?: ProgressTone;
  height?: number;
  accessibilityLabel?: string;
}

const useStyles = makeStyles((theme) => ({
  track: { backgroundColor: theme.colors.surface.muted, borderRadius: theme.radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: theme.radius.pill },
}));

/** Barra de progresso fina com preenchimento animado (largura anima na thread JS: só no mount/mudança de valor). */
export function ProgressBar({ value, tone = 'default', height = 6, accessibilityLabel }: ProgressBarProps) {
  const theme = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const [width] = useState(() => new Animated.Value(reduceMotion ? clamped : 0));

  useEffect(() => {
    if (reduceMotion) {
      width.setValue(clamped);
      return;
    }
    Animated.timing(width, { toValue: clamped, duration: theme.motion.duration.slow, easing: theme.motion.easing.decelerate, useNativeDriver: false }).start();
  }, [clamped, reduceMotion, theme.motion.duration.slow, theme.motion.easing.decelerate, width]);

  const color = tone === 'danger' ? theme.colors.status.error : tone === 'warning' ? theme.colors.status.warning : theme.colors.brand.primaryStrong;
  return (
    <View
      style={[styles.track, { height }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? `Progresso: ${Math.round(clamped)}%`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <Animated.View style={[styles.fill, { backgroundColor: color, width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
    </View>
  );
}
