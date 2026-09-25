import React, { useEffect, useState } from 'react';
import { Animated, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { makeStyles, NATIVE_DRIVER, useTheme } from '../../theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Bloco pulsante (opacidade via native driver). Estático com "Reduzir movimento". */
export function Skeleton({ width = '100%', height = 14, radius, style }: SkeletonProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(0.6));

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(0.7);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 720, easing: theme.motion.easing.gentle, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(opacity, { toValue: 0.55, duration: 720, easing: theme.motion.easing.gentle, useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion, theme.motion.easing.gentle]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius ?? theme.radius.sm, backgroundColor: theme.colors.skeleton.base, opacity }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const useStyles = makeStyles((theme) => ({
  card: { backgroundColor: theme.colors.surface.primary, borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.border.subtle, padding: theme.spacing.lg + 2, marginTop: theme.spacing.md, gap: theme.spacing.sm },
  row: { flexDirection: 'row', gap: theme.spacing.sm + 2, marginTop: theme.spacing.md },
  stat: { flex: 1, backgroundColor: theme.colors.surface.primary, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border.subtle, padding: theme.spacing.lg, gap: theme.spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  flex: { flex: 1, gap: theme.spacing.sm },
}));

/** Esqueleto de card genérico (título + duas linhas). */
export function CardSkeleton({ lines = 2, testID, accessibilityLabel = 'Carregando' }: { lines?: number; testID?: string; accessibilityLabel?: string | null }) {
  const styles = useStyles();
  return (
    <View style={styles.card} testID={testID} accessibilityLabel={accessibilityLabel ?? undefined} accessibilityElementsHidden={accessibilityLabel === null} importantForAccessibility={accessibilityLabel === null ? 'no-hide-descendants' : 'auto'} accessibilityLiveRegion="polite">
      <Skeleton width={96} height={20} radius={999} />
      <Skeleton width="72%" height={18} style={{ marginTop: 6 }} />
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} width={index === lines - 1 ? '55%' : '92%'} height={12} />
      ))}
    </View>
  );
}

/** Esqueleto dos cartões de resumo acadêmico (três métricas). */
export function AcademicCardSkeleton({ testID }: { testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.row} testID={testID} accessibilityLabel="Carregando resumo acadêmico" accessibilityLiveRegion="polite">
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.stat}>
          <Skeleton width={40} height={12} />
          <Skeleton width={64} height={26} />
          <Skeleton width={54} height={10} />
        </View>
      ))}
    </View>
  );
}

/** Esqueleto de lista de compromissos/itens com ícone à esquerda. */
export function ScheduleSkeleton({ rows = 3, testID }: { rows?: number; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.card} testID={testID} accessibilityLabel="Carregando compromissos" accessibilityLiveRegion="polite">
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={[styles.header, index > 0 && { marginTop: 8 }]}>
          <Skeleton width={44} height={44} radius={14} />
          <View style={styles.flex}>
            <Skeleton width="70%" height={14} />
            <Skeleton width="45%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

export const NotificationSkeleton = ScheduleSkeleton;
