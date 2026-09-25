import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';

import { useAuthMotion } from './authMotion';

interface AuthStepperProps {
  steps: readonly string[];
  /** Índice (0-based) da etapa atual. */
  current: number;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  wrapper: { marginBottom: theme.spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  track: { height: 6, borderRadius: 3, backgroundColor: theme.colors.border.subtle, marginTop: theme.spacing.sm, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: theme.colors.brand.accent },
}));

/** Indicador de progresso das etapas (ex.: recuperação de senha) com barra animada pelo Reanimated. */
export function AuthStepper({ steps, current, testID = 'auth-stepper' }: AuthStepperProps) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useAuthMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const width = useSharedValue(0);
  const total = steps.length;
  const position = Math.min(Math.max(current, 0), Math.max(total - 1, 0));
  const fraction = total === 0 ? 0 : (position + 1) / total;
  const target = trackWidth * fraction;
  const slowMs = theme.motion.duration.slow;

  useEffect(() => {
    width.set(motion.reduce ? target : withTiming(target, { duration: slowMs }));
  }, [target, motion.reduce, slowMs, width]);

  const fill = useAnimatedStyle(() => ({ width: width.get() }));
  const label = steps[position] ?? '';

  return (
    <View style={styles.wrapper} accessible accessibilityRole="progressbar" accessibilityLabel={`Etapa ${position + 1} de ${total}: ${label}`} accessibilityValue={{ min: 0, max: total, now: position + 1 }} testID={testID}>
      <View style={styles.row}>
        <AppText variant="label" tone="accent" uppercase>
          {`Etapa ${position + 1} de ${total}`}
        </AppText>
        <AppText variant="caption" tone="secondary">
          {label}
        </AppText>
      </View>
      <View style={styles.track} onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}>
        <Animated.View style={[styles.fill, fill]} />
      </View>
    </View>
  );
}
