import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';

import { attendanceTone } from '../../hooks/useAcademicOverview';
import { makeStyles, useTheme } from '../../theme';
import type { StudentSubject } from '../../types/api';
import { enrollmentStatusLabel, formatPercent, formatScore, pluralize } from '../../utils/format';
import { ProgressBar } from '../ProgressBar';
import { AppText } from '../ui/AppText';
import { Badge } from '../ui/Badge';
import { Surface } from '../ui/Surface';

export interface SubjectCardProps {
  subject: StudentSubject;
  focused?: boolean;
  onClearFocus?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  attendanceWarningThreshold: number;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  card: { marginBottom: theme.spacing.md },
  focused: { borderColor: theme.colors.brand.primaryStrong, borderWidth: 1.5 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  metrics: { flexDirection: 'row', gap: theme.spacing.xl, marginTop: theme.spacing.md, marginBottom: theme.spacing.md },
  focusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm, marginTop: theme.spacing.md, paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border.subtle },
  focusLabel: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexShrink: 1 },
  clear: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs, minHeight: 36 },
  pressed: { opacity: 0.6 },
}));

/** Disciplina em card compacto: código e situação, nome, três números e a frequência em barra. */
export function SubjectCard({ subject, focused = false, onClearFocus, onLayout, attendanceWarningThreshold, testID }: SubjectCardProps) {
  const theme = useTheme();
  const styles = useStyles();
  const attendancePercent = subject.attendanceRate === null ? 0 : subject.attendanceRate * 100;
  const tone = attendanceTone(subject.attendanceRate, attendanceWarningThreshold);
  return (
    <Surface
      style={[styles.card, focused && styles.focused]}
      testID={testID}
      onLayout={onLayout}
      accessible
      accessibilityLabel={`${subject.code} ${subject.name}. ${subject.attention ? 'Requer atenção.' : 'Em dia.'} Nota média ${formatScore(subject.averageScore)}, frequência ${formatPercent(subject.attendanceRate)}, ${pluralize(subject.pendingCount, 'pendência', 'pendências')}.`}
    >
      <View style={styles.top}>
        <AppText variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {subject.code} · {enrollmentStatusLabel(subject.enrollmentStatus)}
        </AppText>
        {subject.attention ? <Badge label="Atenção" icon="⚠" tone="warning" testID={`subject-attention-${subject.id}`} /> : null}
      </View>
      <AppText variant="h4" style={{ marginTop: theme.spacing.xxs }}>
        {subject.name}
      </AppText>
      <View style={styles.metrics}>
        <Metric label="Média" value={formatScore(subject.averageScore)} />
        <Metric label="Frequência" value={formatPercent(subject.attendanceRate)} tone={tone} />
        <Metric label="Pendências" value={String(subject.pendingCount)} />
      </View>
      <ProgressBar value={attendancePercent} tone={tone} accessibilityLabel={`Frequência de ${subject.name}: ${formatPercent(subject.attendanceRate)}`} />
      {focused ? (
        <View style={styles.focusRow}>
          <View style={styles.focusLabel}>
            <Ionicons name="sparkles-outline" size={14} color={theme.colors.brand.primaryStrong} />
            <AppText variant="caption" tone="brand">
              Disciplina indicada pela recomendação
            </AppText>
          </View>
          {onClearFocus ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Remover destaque da disciplina" hitSlop={theme.hitSlop} onPress={onClearFocus} style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
              <Ionicons name="close" size={14} color={theme.colors.text.secondary} />
              <AppText variant="caption" tone="secondary">
                Remover destaque
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Surface>
  );
}

function Metric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warning' | 'danger' }) {
  return (
    <View>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
      <AppText variant="bodyStrong" tone={tone === 'danger' ? 'error' : tone === 'warning' ? 'warning' : 'primary'}>
        {value}
      </AppText>
    </View>
  );
}
