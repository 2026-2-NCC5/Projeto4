import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { formatFriendlyDateTime } from '../../features/support/format';
import { SUPPORT_MOTION, useSupportMotion } from '../../features/support/motion';
import type { ProgressStep, TicketProgress as Progress } from '../../features/support/progress';
import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';

const NODE = 22;
/** intervalo entre checkpoints na revelação progressiva */
const STEP_DELAY = 130;

const useStyles = makeStyles((theme) => ({
  step: { flexDirection: 'row', gap: theme.spacing.md },
  rail: { width: NODE, alignItems: 'center' },
  node: { width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  pulse: { position: 'absolute', width: NODE, height: NODE, borderRadius: NODE / 2, borderWidth: 2, borderColor: theme.colors.brand.primaryStrong },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.brand.primaryStrong },
  connector: { flex: 1, width: 2, minHeight: 18, marginVertical: 2, backgroundColor: theme.colors.border.default, overflow: 'hidden', borderRadius: 1 },
  connectorFill: { flex: 1, backgroundColor: theme.colors.brand.primaryStrong, transformOrigin: 'top' },
  content: { flex: 1, paddingBottom: theme.spacing.lg, minHeight: NODE },
}));

export interface TicketProgressProps {
  progress: Progress;
  now?: Date;
  testID?: string;
}

/**
 * Progresso do chamado: ✓ Solicitação recebida │ ✓ Triagem │ ● Em análise │ ○ Resolução.
 * Ao entrar, a linha vertical se desenha e os checkpoints aparecem em sequência; a etapa atual pulsa de leve
 * algumas vezes e para (sem loop infinito). Com "Reduzir movimento", tudo aparece pronto.
 */
export function TicketProgress({ progress, now, testID = 'ticket-progress' }: TicketProgressProps) {
  const current = progress.steps.find((step) => step.state === 'current');
  const summary = progress.cancelled
    ? 'Chamado cancelado'
    : progress.steps
        .map((step) => `${step.label}: ${step.state === 'done' ? 'concluído' : step.state === 'current' ? 'etapa atual' : 'próxima'}`)
        .join('. ');
  return (
    <View accessible accessibilityRole="summary" accessibilityLabel={`Progresso do chamado. ${summary}${current?.description ? `. ${current.description}` : ''}`} testID={testID}>
      {progress.steps.map((step, index) => (
        <Step key={step.key} step={step} index={index} last={index === progress.steps.length - 1 && !progress.cancelled} nextDone={progress.steps[index + 1]?.state === 'done' || progress.steps[index + 1]?.state === 'current'} now={now} />
      ))}
      {progress.cancelled ? <CancelledStep index={progress.steps.length} /> : null}
    </View>
  );
}

function Step({ step, index, last, nextDone, now }: { step: ProgressStep; index: number; last: boolean; nextDone: boolean; now?: Date | undefined }) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useSupportMotion();
  const appear = useSharedValue(motion.reduce ? 1 : 0);
  const line = useSharedValue(motion.reduce ? 1 : 0);
  const pulse = useSharedValue(0);
  const { colors } = theme;
  const done = step.state === 'done';
  const currentStep = step.state === 'current';
  const filledLine = done && nextDone;

  useEffect(() => {
    if (motion.reduce) {
      appear.set(1);
      line.set(filledLine ? 1 : 0);
      return;
    }
    const delay = index * STEP_DELAY;
    appear.set(withDelay(delay, withSpring(1, motion.spring)));
    line.set(filledLine ? withDelay(delay + 80, withTiming(1, motion.timing(SUPPORT_MOTION.duration.normal))) : 0);
    if (currentStep) {
      // Pulso extremamente sutil: três ciclos e para.
      pulse.set(withDelay(delay + 200, withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 0 })), 3, false)));
    }
  }, [appear, currentStep, filledLine, index, line, motion, pulse]);

  const nodeStyle = useAnimatedStyle(() => ({ opacity: appear.get(), transform: [{ scale: 0.6 + appear.get() * 0.4 }] }));
  const textStyle = useAnimatedStyle(() => ({ opacity: appear.get(), transform: [{ translateX: (1 - appear.get()) * 6 }] }));
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: line.get() }] }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.get() > 0 ? 0.35 * (1 - pulse.get()) : 0, transform: [{ scale: 1 + pulse.get() * 0.7 }] }));

  const nodeColors = done
    ? { backgroundColor: colors.brand.primaryStrong, borderColor: colors.brand.primaryStrong }
    : currentStep
      ? { backgroundColor: colors.brand.primarySoft, borderColor: colors.brand.primaryStrong }
      : { backgroundColor: colors.surface.primary, borderColor: step.state === 'skipped' ? colors.border.subtle : colors.border.strong };

  return (
    <View style={styles.step} testID={`progress-step-${step.key}`}>
      <View style={styles.rail}>
        <View>
          {currentStep ? <Animated.View style={[styles.pulse, pulseStyle, { pointerEvents: 'none' }]} /> : null}
          <Animated.View style={[styles.node, nodeColors, nodeStyle]}>
            {done ? <Ionicons name="checkmark" size={13} color={colors.text.onPrimary} /> : currentStep ? <View style={styles.dot} /> : null}
          </Animated.View>
        </View>
        {!last ? (
          <View style={styles.connector}>
            <Animated.View style={[styles.connectorFill, lineStyle]} />
          </View>
        ) : null}
      </View>
      <Animated.View style={[styles.content, textStyle]}>
        <AppText variant={currentStep ? 'bodyStrong' : 'body'} tone={step.state === 'upcoming' || step.state === 'skipped' ? 'muted' : 'primary'}>
          {step.label}
        </AppText>
        {step.description ? (
          <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
            {step.description}
          </AppText>
        ) : null}
        {done && step.completedAt ? (
          <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {formatFriendlyDateTime(step.completedAt, now)}
          </AppText>
        ) : null}
      </Animated.View>
    </View>
  );
}

function CancelledStep({ index }: { index: number }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.step}>
      <View style={styles.rail}>
        <View style={[styles.node, { backgroundColor: theme.colors.surface.muted, borderColor: theme.colors.border.strong }]}>
          <Ionicons name="close" size={13} color={theme.colors.text.secondary} />
        </View>
      </View>
      <View style={[styles.content, { paddingBottom: 0 }]} testID={`progress-cancelled-${index}`}>
        <AppText variant="bodyStrong">Chamado cancelado</AppText>
        <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
          O histórico continua disponível abaixo.
        </AppText>
      </View>
    </View>
  );
}
