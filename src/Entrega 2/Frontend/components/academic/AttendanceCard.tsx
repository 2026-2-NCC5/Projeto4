import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import type { StudentAttendance } from '../../types/api';
import { formatPercent } from '../../utils/format';
import { Pill } from '../Pill';
import { ProgressBar } from '../ProgressBar';
import { Surface } from '../ui/Surface';
import { AppText } from '../ui/AppText';

const useStyles = makeStyles((theme) => ({
  card: { marginBottom: theme.spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: theme.spacing.md },
}));

export function AttendanceCard({ item, warningThreshold, testID }: { item: StudentAttendance; warningThreshold: number; testID?: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const rate = item.attendanceRate;
  const warning = rate !== null && rate < warningThreshold;
  return (
    <Surface style={styles.card} testID={testID} accessible accessibilityLabel={`${item.subjectName}: ${item.attendedClasses} de ${item.totalClasses} aulas, ${formatPercent(rate)}${warning ? ', frequência em atenção' : ''}`}>
      <View style={styles.rowBetween}>
        <AppText variant="h4" style={{ flex: 1 }}>
          {item.subjectName}
        </AppText>
        {warning ? <Pill label="Atenção" icon="⚠" tone="warning" /> : <Pill label="Em dia" icon="✓" tone="success" />}
      </View>
      <View style={styles.bottom}>
        <AppText variant="bodySmall" tone="muted">
          {item.attendedClasses} de {item.totalClasses} aulas
        </AppText>
        <AppText variant="metric" tone={warning ? 'warning' : 'primary'}>
          {formatPercent(rate)}
        </AppText>
      </View>
      <View style={{ marginTop: theme.spacing.sm }}>
        <ProgressBar value={rate === null ? 0 : rate * 100} warning={warning} accessibilityLabel={`Frequência de ${item.subjectName}: ${formatPercent(rate)}`} />
      </View>
    </Surface>
  );
}
