import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { makeStyles, useTheme } from '../../theme';
import type { PasswordPolicy } from '../../types/api';
import { evaluatePassword, PASSWORD_STRENGTH_LABELS, passwordStrength } from '../../utils/authValidation';
import { AppText } from '../ui/AppText';

import { useAuthMotion } from './authMotion';

interface PasswordRequirementsProps {
  password: string;
  policy: PasswordPolicy;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  wrapper: { marginTop: theme.spacing.sm, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface.glass, borderWidth: 1, borderColor: theme.colors.surface.glassBorder },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  meter: { flexDirection: 'row', gap: theme.spacing.xxs, marginTop: theme.spacing.xs },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, marginTop: theme.spacing.xs },
}));

interface MeterBarProps {
  index: number;
  progress: SharedValue<number>;
  idleColor: string;
  fillColor: string;
}

/** Uma das três barras do medidor: preenche (0 → 1) conforme o nível ultrapassa o seu índice. */
function MeterBar({ index, progress, idleColor, fillColor }: MeterBarProps) {
  const styles = useStyles();
  const animated = useAnimatedStyle(() => {
    const fill = Math.min(1, Math.max(0, progress.get() - index));
    return { backgroundColor: interpolateColor(fill, [0, 1], [idleColor, fillColor]) };
  });
  return <Animated.View style={[styles.bar, animated]} />;
}

/** Checklist dinâmico dos requisitos da política de senha + medidor de força animado (apenas UX; a API revalida). */
export function PasswordRequirements({ password, policy, testID = 'password-requirements' }: PasswordRequirementsProps) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useAuthMotion();
  const evaluation = evaluatePassword(password, policy);
  const strength = password ? passwordStrength(password, policy) : null;
  const level = strength === 'strong' ? 3 : strength === 'medium' ? 2 : strength === 'weak' ? 1 : 0;
  const color = level === 3 ? theme.colors.status.success : level === 2 ? theme.colors.brand.primary : theme.colors.status.warning;
  const progress = useSharedValue(level);
  const baseMs = theme.motion.duration.base;

  useEffect(() => {
    progress.set(motion.reduce ? level : withTiming(level, { duration: baseMs }));
  }, [level, motion.reduce, baseMs, progress]);

  return (
    <Animated.View entering={motion.fade()} layout={motion.layout} style={styles.wrapper} testID={testID}>
      <View style={styles.header}>
        <AppText variant="caption" tone="secondary">
          Força da senha
        </AppText>
        {strength ? (
          <AppText variant="caption" style={{ color }} accessibilityLiveRegion="polite">
            {PASSWORD_STRENGTH_LABELS[strength]}
          </AppText>
        ) : null}
      </View>
      <View style={styles.meter} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0, 1, 2].map((index) => (
          <MeterBar key={index} index={index} progress={progress} idleColor={theme.colors.border.default} fillColor={color} />
        ))}
      </View>
      {evaluation.requirements.map((requirement) => (
        <View key={requirement.key} style={styles.item} accessible accessibilityLabel={`${requirement.label}: ${requirement.met ? 'atendido' : 'pendente'}`}>
          <Ionicons name={requirement.met ? 'checkmark-circle' : 'ellipse-outline'} size={15} color={requirement.met ? theme.colors.status.success : theme.colors.text.muted} />
          <AppText variant="caption" tone={requirement.met ? 'success' : 'muted'} style={{ fontWeight: '500' }}>
            {requirement.label}
          </AppText>
        </View>
      ))}
      {evaluation.tooLong ? (
        <AppText variant="caption" tone="error" style={{ marginTop: theme.spacing.xs }}>
          {`A senha deve ter no máximo ${policy.maxLength} caracteres.`}
        </AppText>
      ) : null}
    </Animated.View>
  );
}
