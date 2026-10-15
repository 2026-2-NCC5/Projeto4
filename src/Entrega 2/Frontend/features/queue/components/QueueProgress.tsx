import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { AppText } from '../../../components/ui';
import { makeStyles, useTheme } from '../../../theme';
import type { QueueExperience } from '../state/experience';

const STEPS = ['Senha registrada', 'Aguardando', 'Sua vez está chegando', 'Atendimento'] as const;
/** pontos de "pessoas à frente" desenhados antes de resumir em "+N" */
const MAX_DOTS = 8;

const useStyles = makeStyles((theme) => ({
  steps: { gap: theme.spacing.sm },
  step: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  marker: { width: 20, height: 20, borderRadius: theme.radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  dot: { width: 10, height: 10, borderRadius: theme.radius.pill },
  me: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: theme.spacing.sm, paddingVertical: 2, borderRadius: theme.radius.pill, borderWidth: 1 },
}));

export interface QueueProgressProps {
  experience: QueueExperience;
}

/** Etapas do acompanhamento (✓ concluída · ● atual · ○ seguinte), sempre com texto. */
export function QueueProgress({ experience }: QueueProgressProps) {
  const theme = useTheme();
  const styles = useStyles();
  const accent = experience.tone === 'success' ? theme.colors.status.success : experience.tone === 'attention' ? theme.colors.status.warning : theme.colors.brand.primaryStrong;
  return (
    <View style={styles.steps} accessible accessibilityRole="text" accessibilityLabel={`Etapa ${experience.step + 1} de ${STEPS.length}: ${STEPS[experience.step]}`} testID="queue-progress">
      {STEPS.map((label, index) => {
        const done = index < experience.step || (index === experience.step && experience.state === 'completed');
        const current = index === experience.step && !done;
        return (
          <View key={label} style={styles.step}>
            <View
              style={[
                styles.marker,
                { borderColor: done || current ? accent : theme.colors.border.strong, backgroundColor: done ? accent : current ? theme.colors.surface.primary : 'transparent' },
              ]}
            >
              {done ? <Ionicons name="checkmark" size={13} color={theme.colors.text.onPrimary} /> : current ? <View style={[styles.dot, { width: 8, height: 8, backgroundColor: accent }]} /> : null}
            </View>
            <AppText variant={current ? 'bodySmallStrong' : 'bodySmall'} tone={done || current ? 'primary' : 'muted'}>
              {label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

export interface QueueAheadDotsProps {
  ahead: number;
  tone: QueueExperience['tone'];
}

/** "●●● você": uma bolinha por senha à frente (até 8), só quando a posição é conhecida. */
export function QueueAheadDots({ ahead, tone }: QueueAheadDotsProps) {
  const theme = useTheme();
  const styles = useStyles();
  const color = tone === 'attention' ? theme.colors.status.warning : theme.colors.border.strong;
  const shown = Math.min(ahead, MAX_DOTS);
  return (
    <View style={styles.dotsRow} accessible accessibilityLabel={ahead === 0 ? 'Ninguém à sua frente' : `${ahead} ${ahead === 1 ? 'pessoa' : 'pessoas'} à sua frente`} testID="queue-ahead-dots">
      {Array.from({ length: shown }, (_, index) => (
        <View key={index} style={[styles.dot, { backgroundColor: color }]} />
      ))}
      {ahead > MAX_DOTS ? (
        <AppText variant="caption" tone="muted">
          +{ahead - MAX_DOTS}
        </AppText>
      ) : null}
      <View style={[styles.me, { borderColor: theme.colors.brand.primaryStrong }]}>
        <Ionicons name="person" size={11} color={theme.colors.brand.primaryStrong} />
        <AppText variant="caption" tone="brand" style={{ fontWeight: '600' }}>
          Você
        </AppText>
      </View>
    </View>
  );
}
