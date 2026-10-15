import React from 'react';
import { View } from 'react-native';

import { attendanceTone } from '../../hooks/useAcademicOverview';
import { makeStyles, useTheme } from '../../theme';
import type { StudentAttendance } from '../../types/api';
import { formatPercent } from '../../utils/format';
import { ProgressBar } from '../ProgressBar';
import { AppText } from '../ui/AppText';
import { Badge } from '../ui/Badge';

const useStyles = makeStyles((theme) => ({
  row: { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  body: { flex: 1, minWidth: 0 },
  value: { alignItems: 'flex-end', gap: 2 },
}));

const STATUS = {
  warning: { label: 'Atenção', tone: 'warning', icon: '⚠' },
  danger: { label: 'Abaixo do mínimo', tone: 'danger', icon: '⚠' },
} as const;

/** Frequência de uma disciplina: aulas, percentual e barra (verde saudável, amarelo atenção, vermelho crítico). */
export function AttendanceRow({ item, warningThreshold, testID }: { item: StudentAttendance; warningThreshold: number; testID?: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const rate = item.attendanceRate;
  const tone = attendanceTone(rate, warningThreshold);
  const status = tone === 'default' ? null : STATUS[tone];
  return (
    <View style={styles.row} testID={testID} accessible accessibilityLabel={`${item.subjectName}: ${item.attendedClasses} de ${item.totalClasses} aulas, ${formatPercent(rate)}${status ? `, ${status.label.toLowerCase()}` : ''}`}>
      <View style={styles.top}>
        <View style={styles.body}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {item.subjectName}
          </AppText>
          <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {item.attendedClasses} de {item.totalClasses} aulas
          </AppText>
        </View>
        <View style={styles.value}>
          <AppText variant="h4" tone={tone === 'danger' ? 'error' : tone === 'warning' ? 'warning' : 'primary'}>
            {formatPercent(rate)}
          </AppText>
          {status ? <Badge label={status.label} icon={status.icon} tone={status.tone} /> : null}
        </View>
      </View>
      <View style={{ marginTop: theme.spacing.sm }}>
        <ProgressBar value={rate === null ? 0 : rate * 100} tone={tone} accessibilityLabel={`Frequência de ${item.subjectName}: ${formatPercent(rate)}`} />
      </View>
    </View>
  );
}
