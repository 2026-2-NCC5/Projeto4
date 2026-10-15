import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import { formatDayOfMonth, formatMonthShort } from '../../utils/format';
import { daysUntil, relativeDayLabel } from '../../utils/greeting';
import { AppText } from '../ui/AppText';
import { List } from '../ui/ListItem';

// ---- appointments: `appointment` = atendimento agendado com o ASA (Próximos compromissos do Início)
export type UpcomingKind = 'exam' | 'assignment' | 'project' | 'pending' | 'other' | 'appointment';

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

const KIND_LABEL: Record<UpcomingKind, string> = { exam: 'Prova', assignment: 'Entrega', project: 'Projeto', pending: 'Pendência', other: 'Compromisso', appointment: 'Atendimento ASA' };

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  pressed: { backgroundColor: theme.colors.surface.secondary },
  date: { width: 40, alignItems: 'center' },
  body: { flex: 1, minWidth: 0 },
}));

/** "Próximos compromissos" (provas, entregas e pendências com data). Dados vêm da API; nada é inventado. */
export function UpcomingList({ items, today, testID }: { items: UpcomingItem[]; today?: Date; testID?: string }) {
  return (
    <List testID={testID}>
      {items.map((item) => (
        <UpcomingRow key={item.id} item={item} today={today} />
      ))}
    </List>
  );
}

function UpcomingRow({ item, today }: { item: UpcomingItem; today?: Date }) {
  const theme = useTheme();
  const styles = useStyles();
  const days = daysUntil(item.date, today);
  const overdue = item.overdue || (days !== null && days < 0);
  const soon = !overdue && days !== null && days <= 3;
  const when = overdue ? `venceu ${relativeDayLabel(days)}` : relativeDayLabel(days);
  const content = (
    <>
      <View style={styles.date}>
        <AppText variant="h4" tone={overdue ? 'error' : 'primary'}>
          {formatDayOfMonth(item.date)}
        </AppText>
        <AppText variant="caption" tone={overdue ? 'error' : 'muted'} uppercase>
          {formatMonthShort(item.date)}
        </AppText>
      </View>
      <View style={styles.body}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {item.title}
        </AppText>
        <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
          {[KIND_LABEL[item.kind], item.subtitle].filter(Boolean).join(' · ')}
        </AppText>
        <AppText variant="caption" tone={overdue ? 'error' : soon ? 'warning' : 'muted'} style={{ marginTop: 2 }}>
          {overdue ? `Atrasado · ${when}` : when}
        </AppText>
      </View>
      {item.onPress ? <Ionicons name="chevron-forward" size={16} color={theme.colors.text.muted} /> : null}
    </>
  );
  const a11y = `${KIND_LABEL[item.kind]}: ${item.title}${item.subtitle ? `, ${item.subtitle}` : ''}, ${when}`;
  if (item.onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={item.onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }
  return (
    <View style={styles.row} accessible accessibilityLabel={a11y}>
      {content}
    </View>
  );
}
