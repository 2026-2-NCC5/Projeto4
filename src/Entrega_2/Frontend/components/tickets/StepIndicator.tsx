import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { SUPPORT_MOTION, useSupportMotion } from '../../features/support/motion';
import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';

export interface StepIndicatorProps {
  steps: readonly string[];
  /** índice (0-based) da etapa atual */
  current: number;
  testID?: string;
}

const NODE = 24;

const useStyles = makeStyles((theme) => ({
  wrapper: { marginBottom: theme.spacing.lg },
  caption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: theme.spacing.sm },
  row: { flexDirection: 'row' },
  column: { flex: 1, alignItems: 'center' },
  track: { position: 'absolute', top: NODE / 2 - 1, height: 2, backgroundColor: theme.colors.border.default, borderRadius: 1 },
  fill: { height: 2, backgroundColor: theme.colors.brand.primaryStrong, borderRadius: 1 },
  node: { width: NODE, height: NODE, borderRadius: NODE / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  check: { position: 'absolute' },
}));

/**
 * Indicador das etapas da abertura: a linha se preenche suavemente, o círculo da etapa atual cresce de leve, o
 * check das concluídas aparece com fade + scale e o rótulo muda de cor.
 */
export function StepIndicator({ steps, current, testID = 'step-indicator' }: StepIndicatorProps) {
  const styles = useStyles();
  const motion = useSupportMotion();
  const [width, setWidth] = useState(0);
  const fill = useSharedValue(0);
  const total = steps.length;
  const position = Math.min(Math.max(current, 0), Math.max(total - 1, 0));
  const column = total > 0 ? width / total : 0;
  const trackWidth = Math.max(0, width - column);
  const target = total > 1 ? (trackWidth * position) / (total - 1) : 0;

  useEffect(() => {
    fill.set(withTiming(target, motion.timing(SUPPORT_MOTION.duration.slow)));
  }, [fill, motion, target]);

  const fillStyle = useAnimatedStyle(() => ({ width: fill.get() }));

  return (
    <View
      style={styles.wrapper}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Etapa ${position + 1} de ${total}: ${steps[position] ?? ''}`}
      accessibilityValue={{ min: 1, max: total, now: position + 1 }}
      testID={testID}
    >
      <View style={styles.caption}>
        <AppText variant="bodySmallStrong" tone="brand">{`Etapa ${position + 1} de ${total}`}</AppText>
        <AppText variant="caption" tone="muted">
          {steps[position]}
        </AppText>
      </View>
      <View style={styles.row} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {width > 0 ? (
          <View style={[styles.track, { left: column / 2, width: trackWidth }]}>
            <Animated.View style={[styles.fill, fillStyle]} />
          </View>
        ) : null}
        {steps.map((label, index) => (
          <StepNode key={label} label={label} number={index + 1} state={index < position ? 'done' : index === position ? 'current' : 'upcoming'} />
        ))}
      </View>
    </View>
  );
}

function StepNode({ label, number, state }: { label: string; number: number; state: 'done' | 'current' | 'upcoming' }) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useSupportMotion();
  const level = useSharedValue(state === 'done' ? 2 : state === 'current' ? 1 : 0);
  const scale = useSharedValue(1);
  const { colors } = theme;

  useEffect(() => {
    const value = state === 'done' ? 2 : state === 'current' ? 1 : 0;
    level.set(withTiming(value, motion.timing(SUPPORT_MOTION.duration.normal)));
    if (state === 'current' && !motion.reduce) {
      scale.set(0.86);
      scale.set(withSpring(1, motion.spring));
    }
  }, [level, motion, scale, state]);

  const surface = colors.surface.primary;
  const soft = colors.brand.primarySoft;
  const strong = colors.brand.primaryStrong;
  const line = colors.border.default;
  const muted = colors.text.muted;
  const primary = colors.text.primary;
  const node = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(level.get(), [0, 1, 2], [surface, soft, strong]),
    borderColor: interpolateColor(level.get(), [0, 1, 2], [line, strong, strong]),
    transform: [{ scale: scale.get() }],
  }));
  const check = useAnimatedStyle(() => {
    const visible = Math.max(0, level.get() - 1);
    return { opacity: visible, transform: [{ scale: 0.5 + visible * 0.5 }] };
  });
  const digit = useAnimatedStyle(() => ({ opacity: 1 - Math.max(0, level.get() - 1), color: interpolateColor(level.get(), [0, 1], [muted, strong]) }));
  const text = useAnimatedStyle(() => ({ color: interpolateColor(level.get(), [0, 1, 2], [muted, primary, primary]) }));

  return (
    <View style={styles.column} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.node, node]}>
        <Animated.Text style={[theme.typography.caption, { fontWeight: '700' }, digit]}>{number}</Animated.Text>
        <Animated.View style={[styles.check, check]}>
          <Ionicons name="checkmark" size={14} color={colors.text.onPrimary} />
        </Animated.View>
      </Animated.View>
      <Animated.Text style={[theme.typography.caption, { marginTop: 6, fontWeight: state === 'current' ? '600' : '400' }, text]} numberOfLines={1}>
        {label}
      </Animated.Text>
    </View>
  );
}
