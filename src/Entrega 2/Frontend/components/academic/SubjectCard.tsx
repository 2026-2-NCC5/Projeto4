import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import type { StudentSubject } from '../../types/api';
import { enrollmentStatusLabel, formatPercent, formatScore, pluralize } from '../../utils/format';
import { Pill } from '../Pill';
import { ProgressBar } from '../ProgressBar';
import { Surface } from '../ui/Surface';
import { AppText } from '../ui/AppText';

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
  focused: { borderColor: theme.colors.brand.primary, borderWidth: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  code: { backgroundColor: theme.colors.status.infoSoft, borderRadius: theme.radius.sm, paddingHorizontal: theme.spacing.sm + 2, paddingVertical: theme.spacing.xs },
  metrics: { flexDirection: 'row', marginVertical: theme.spacing.lg },
  metric: { flex: 1 },
  focusRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  clear: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: theme.spacing.xs },
  pressed: { opacity: 0.7 },
}));

export function SubjectCard({ subject, focused = false, onClearFocus, onLayout, attendanceWarningThreshold, testID }: SubjectCardProps) {
  const theme = useTheme();
  const styles = useStyles();
  const attendancePercent = subject.attendanceRate === null ? 0 : subject.attendanceRate * 100;
  const lowAttendance = subject.attendanceRate !== null && subject.attendanceRate < attendanceWarningThreshold;
  return (
    <Surface
      style={[styles.card, focused && styles.focused]}
      testID={testID}
      onLayout={onLayout}
      accessible
      accessibilityLabel={`${subject.code} ${subject.name}. ${subject.attention ? 'Requer atenção.' : 'Em dia.'} Nota média ${formatScore(subject.averageScore)}, frequência ${formatPercent(subject.attendanceRate)}, ${pluralize(subject.pendingCount, 'pendência', 'pendências')}.`}
    >
      <View style={styles.rowBetween}>
        <View style={styles.code}>
          <AppText variant="label" tone="info">
            {subject.code}
          </AppText>
        </View>
        {subject.attention ? <Pill label="Atenção" icon="⚠" tone="warning" testID={`subject-attention-${subject.id}`} /> : <Pill label="Em dia" icon="✓" tone="success" />}
      </View>
      <AppText variant="h3" style={{ marginTop: theme.spacing.md }}>
        {subject.name}
      </AppText>
      <AppText variant="bodySmall" tone="muted" style={{ marginTop: 2 }}>
        {enrollmentStatusLabel(subject.enrollmentStatus)}
      </AppText>
      <View style={styles.metrics}>
        <Metric label="Nota média" value={formatScore(subject.averageScore)} />
        <Metric label="Frequência" value={formatPercent(subject.attendanceRate)} warning={lowAttendance} />
        <Metric label="Pendências" value={String(subject.pendingCount)} warning={subject.pendingCount > 0} />
      </View>
      <ProgressBar value={attendancePercent} warning={subject.attention || lowAttendance} accessibilityLabel={`Frequência de ${subject.name}: ${formatPercent(subject.attendanceRate)}`} />
      {focused ? (
        <View style={styles.focusRow}>
          <Pill label="Disciplina indicada pela recomendação" icon="✦" tone="info" />
          {onClearFocus ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Remover destaque da disciplina" hitSlop={theme.hitSlop} onPress={onClearFocus} style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
              <Ionicons name="close" size={16} color={theme.colors.text.muted} />
              <AppText variant="caption" tone="muted">
                Remover destaque
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Surface>
  );
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.metric}>
      <AppText variant="h3" tone={warning ? 'warning' : 'primary'}>
        {value}
      </AppText>
      <AppText variant="caption" tone="muted" style={{ fontWeight: '400' }}>
        {label}
      </AppText>
    </View>
  );
}
