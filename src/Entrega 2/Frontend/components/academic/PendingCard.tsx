import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import type { StudentPendingItem } from '../../types/api';
import { formatDate, pendingStatusIcon, pendingStatusLabel, pendingStatusTone, pendingTypeLabel } from '../../utils/format';
import { daysUntil, relativeDayLabel } from '../../utils/greeting';
import { Pill } from '../Pill';
import { Surface } from '../ui/Surface';
import { AppText } from '../ui/AppText';

const useStyles = makeStyles((theme) => ({
  card: { marginBottom: theme.spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  date: { flexDirection: 'row', alignItems: 'center', marginTop: theme.spacing.md, gap: 7 },
}));

export function PendingCard({ item, today, testID }: { item: StudentPendingItem; today?: Date; testID?: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const days = daysUntil(item.dueDate, today);
  const overdue = item.status === 'overdue' || (days !== null && days < 0 && item.status !== 'completed');
  return (
    <Surface style={styles.card} testID={testID} accessible accessibilityLabel={`${pendingStatusLabel(item.status)}: ${item.description}. ${item.subjectName ?? 'Sem disciplina'}. ${item.dueDate ? `Prazo ${formatDate(item.dueDate)}` : 'Sem prazo'}`}>
      <View style={styles.rowBetween}>
        <Pill label={pendingStatusLabel(item.status)} icon={pendingStatusIcon(item.status)} tone={pendingStatusTone(item.status)} />
        <AppText variant="caption" tone="muted">
          {pendingTypeLabel(item.type)}
        </AppText>
      </View>
      <AppText variant="h4" style={{ marginTop: theme.spacing.md }}>
        {item.description}
      </AppText>
      {item.subjectName ? (
        <AppText variant="bodySmallStrong" tone="brand" style={{ marginTop: 2 }}>
          {item.subjectName}
        </AppText>
      ) : null}
      <View style={styles.date}>
        <Ionicons name="calendar-outline" size={14} color={overdue ? theme.colors.status.errorText : theme.colors.text.muted} />
        <AppText variant="bodySmall" tone={overdue ? 'error' : 'muted'}>
          {item.dueDate ? `Prazo: ${formatDate(item.dueDate)} (${relativeDayLabel(days)})` : 'Sem prazo definido'}
        </AppText>
      </View>
    </Surface>
  );
}
