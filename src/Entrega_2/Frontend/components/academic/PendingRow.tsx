import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import type { StudentPendingItem } from '../../types/api';
import { formatDate, pendingStatusIcon, pendingStatusLabel, pendingStatusTone, pendingTypeLabel } from '../../utils/format';
import { daysUntil, relativeDayLabel } from '../../utils/greeting';
import { AppText } from '../ui/AppText';
import { Badge } from '../ui/Badge';

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  body: { flex: 1, minWidth: 0 },
  due: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs, marginTop: theme.spacing.xs },
}));

/** Pendência objetiva: categoria, o que fazer, disciplina e prazo. Só o atraso aparece em vermelho. */
export function PendingRow({ item, today, testID }: { item: StudentPendingItem; today?: Date; testID?: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const days = daysUntil(item.dueDate, today);
  const overdue = item.status === 'overdue' || (days !== null && days < 0 && item.status !== 'completed');
  const status = overdue ? 'overdue' : item.status;
  const context = [pendingTypeLabel(item.type), item.subjectName].filter(Boolean).join(' · ');
  return (
    <View style={styles.row} testID={testID} accessible accessibilityLabel={`${pendingStatusLabel(status)}: ${item.description}. ${item.subjectName ?? 'Sem disciplina'}. ${item.dueDate ? `Prazo ${formatDate(item.dueDate)}` : 'Sem prazo'}`}>
      <View style={styles.body}>
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {context}
        </AppText>
        <AppText variant="bodyStrong" style={{ marginTop: 2 }}>
          {item.description}
        </AppText>
        <View style={styles.due}>
          <Ionicons name="calendar-outline" size={13} color={overdue ? theme.colors.status.errorText : theme.colors.text.muted} />
          <AppText variant="caption" tone={overdue ? 'error' : 'secondary'}>
            {item.dueDate ? `Prazo: ${formatDate(item.dueDate)} (${relativeDayLabel(days)})` : 'Sem prazo definido'}
          </AppText>
        </View>
      </View>
      <Badge label={pendingStatusLabel(status)} icon={pendingStatusIcon(status)} tone={pendingStatusTone(status)} />
    </View>
  );
}
