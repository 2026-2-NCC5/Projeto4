import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import { formatDayOfMonth, formatMonthShort } from '../../utils/format';
import { daysUntil, relativeDayLabel } from '../../utils/greeting';
import { Badge } from '../ui/Badge';
import { AppText } from '../ui/AppText';
import { PressableScale } from '../ui/PressableScale';
import { Surface } from '../ui/Surface';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type UpcomingKind = 'exam' | 'assignment' | 'project' | 'pending' | 'other';

export interface UpcomingItem {
  id: string;
  kind: UpcomingKind;
  title: string;
  subtitle: string | null;
  /** YYYY-MM-DD (ou ISO) */
  date: string;
  overdue?: boolean;
  onPress?: () => void;
}

const KIND_LABEL: Record<UpcomingKind, string> = { exam: 'Prova', assignment: 'Entrega', project: 'Projeto', pending: 'Pendência', other: 'Compromisso' };
const KIND_ICON: Record<UpcomingKind, IconName> = { exam: 'school-outline', assignment: 'document-text-outline', project: 'construct-outline', pending: 'alert-circle-outline', other: 'calendar-outline' };

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.sm + 2 },
  dateBox: { width: 48, height: 52, borderRadius: theme.radius.md, backgroundColor: theme.colors.brand.primarySoft, alignItems: 'center', justifyContent: 'center' },
  dateBoxOverdue: { backgroundColor: theme.colors.status.errorSoft },
  body: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: 4, flexWrap: 'wrap' },
  divider: { height: 1, backgroundColor: theme.colors.border.subtle },
}));

/** Lista "Próximos compromissos" (provas, entregas e pendências com data). Dados vêm da API; nada é inventado. */
export function ScheduleCard({ items, today, testID }: { items: UpcomingItem[]; today?: Date; testID?: string }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Surface padding={theme.spacing.md} testID={testID}>
      {items.map((item, index) => {
        const days = daysUntil(item.date, today);
        const overdue = item.overdue || (days !== null && days < 0);
        const soon = !overdue && days !== null && days <= 3;
        const content = (
          <View style={styles.row}>
            <View style={[styles.dateBox, overdue && styles.dateBoxOverdue]}>
              <AppText variant="h4" tone={overdue ? 'error' : 'brand'}>
                {formatDayOfMonth(item.date)}
              </AppText>
              <AppText variant="label" tone={overdue ? 'error' : 'brand'} uppercase>
                {formatMonthShort(item.date)}
              </AppText>
            </View>
            <View style={styles.body}>
              <AppText variant="bodyStrong" numberOfLines={2}>
                {item.title}
              </AppText>
              {item.subtitle ? (
                <AppText variant="bodySmall" tone="muted" numberOfLines={1}>
                  {item.subtitle}
                </AppText>
              ) : null}
              <View style={styles.meta}>
                <Badge label={KIND_LABEL[item.kind]} tone={item.kind === 'exam' ? 'info' : item.kind === 'pending' ? 'warning' : 'neutral'} size="small" />
                <AppText variant="caption" tone={overdue ? 'error' : soon ? 'warning' : 'muted'}>
                  {overdue ? `⚠ venceu ${relativeDayLabel(days)}` : relativeDayLabel(days)}
                </AppText>
              </View>
            </View>
            <Ionicons name={item.onPress ? 'chevron-forward' : KIND_ICON[item.kind]} size={18} color={theme.colors.text.muted} />
          </View>
        );
        const a11y = `${KIND_LABEL[item.kind]}: ${item.title}${item.subtitle ? `, ${item.subtitle}` : ''}, ${overdue ? `venceu ${relativeDayLabel(days)}` : relativeDayLabel(days)}`;
        return (
          <React.Fragment key={item.id}>
            {index > 0 ? <View style={styles.divider} /> : null}
            {item.onPress ? (
              <PressableScale accessibilityRole="button" accessibilityLabel={a11y} onPress={item.onPress}>
                {content}
              </PressableScale>
            ) : (
              <View accessible accessibilityLabel={a11y}>
                {content}
              </View>
            )}
          </React.Fragment>
        );
      })}
    </Surface>
  );
}
