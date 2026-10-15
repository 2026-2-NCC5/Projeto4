import React, { useEffect, useState } from 'react';
import { Animated, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { makeStyles, NATIVE_DRIVER, useTheme } from '../../theme';

import { Divider } from './Divider';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Bloco com pulso lento de opacidade (native driver). Estático com "Reduzir movimento". */
export function Skeleton({ width = '100%', height = 14, radius, style }: SkeletonProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(0.7));

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(0.8);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, easing: theme.motion.easing.gentle, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(opacity, { toValue: 0.6, duration: 800, easing: theme.motion.easing.gentle, useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion, theme.motion.easing.gentle]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius ?? theme.radius.xs, backgroundColor: theme.colors.skeleton.base, opacity }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const useStyles = makeStyles((theme) => ({
  card: { backgroundColor: theme.colors.surface.primary, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border.default, padding: theme.spacing.lg, marginBottom: theme.spacing.md, gap: theme.spacing.sm },
  list: { backgroundColor: theme.colors.surface.primary, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border.default, overflow: 'hidden' },
  metrics: { flexDirection: 'row', backgroundColor: theme.colors.surface.primary, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border.default },
  metric: { flex: 1, padding: theme.spacing.lg, gap: theme.spacing.sm },
  metricDivider: { width: 1, backgroundColor: theme.colors.border.subtle, marginVertical: theme.spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.lg },
  flex: { flex: 1, gap: theme.spacing.sm },
}));

/** Esqueleto de card genérico (título + linhas). */
export function CardSkeleton({ lines = 2, testID, accessibilityLabel = 'Carregando' }: { lines?: number; testID?: string; accessibilityLabel?: string | null }) {
  const styles = useStyles();
  return (
    <View style={styles.card} testID={testID} accessibilityLabel={accessibilityLabel ?? undefined} accessibilityElementsHidden={accessibilityLabel === null} importantForAccessibility={accessibilityLabel === null ? 'no-hide-descendants' : 'auto'} accessibilityLiveRegion="polite">
      <Skeleton width={72} height={12} />
      <Skeleton width="64%" height={16} style={{ marginTop: 4 }} />
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} width={index === lines - 1 ? '50%' : '90%'} height={12} />
      ))}
    </View>
  );
}

/** Esqueleto do resumo acadêmico (três indicadores lado a lado). */
export function AcademicCardSkeleton({ testID }: { testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.metrics} testID={testID} accessibilityLabel="Carregando resumo acadêmico" accessibilityLiveRegion="polite">
      {[0, 1, 2].map((index) => (
        <React.Fragment key={index}>
          {index > 0 ? <View style={styles.metricDivider} /> : null}
          <View style={styles.metric}>
            <Skeleton width={56} height={11} />
            <Skeleton width={48} height={22} />
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

/** Esqueleto de lista (compromissos, avisos) com marcador à esquerda. */
export function ScheduleSkeleton({ rows = 3, testID }: { rows?: number; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.list} testID={testID} accessibilityLabel="Carregando compromissos" accessibilityLiveRegion="polite">
      {Array.from({ length: rows }, (_, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <Divider /> : null}
          <View style={styles.row}>
            <Skeleton width={36} height={36} radius={8} />
            <View style={styles.flex}>
              <Skeleton width="68%" height={13} />
              <Skeleton width="40%" height={11} />
            </View>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

export const NotificationSkeleton = ScheduleSkeleton;
