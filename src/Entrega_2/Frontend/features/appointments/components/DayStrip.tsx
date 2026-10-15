import React from 'react';
import { Pressable, ScrollView } from 'react-native';

import { AppText } from '../../../components/ui/AppText';
import { useResponsive } from '../../../hooks/useResponsive';
import { makeStyles } from '../../../theme';
import { dayChipParts, formatCalendarDay, formatSlotCount } from '../format';
import type { BookingDay } from '../hooks/useAppointmentBooking';

export interface DayStripProps {
  days: BookingDay[];
  selected: string | null;
  onSelect: (date: string) => void;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  strip: { gap: theme.spacing.sm, paddingVertical: theme.spacing.xxs },
  chip: {
    width: 80,
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xxs,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    backgroundColor: theme.colors.surface.primary,
  },
  selected: { borderColor: theme.colors.brand.primaryStrong, backgroundColor: theme.colors.brand.primarySoft },
  pressed: { backgroundColor: theme.colors.surface.secondary },
  disabled: { backgroundColor: theme.colors.surface.secondary, borderColor: theme.colors.border.subtle },
}));

/** Próximos 14 dias em uma lista horizontal, com quantos horários livres cada dia tem. Dias sem horário ficam inativos. */
export function DayStrip({ days, selected, onSelect, testID = 'day-strip' }: DayStripProps) {
  const styles = useStyles();
  const responsive = useResponsive();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -responsive.gutter }}
      contentContainerStyle={[styles.strip, { paddingHorizontal: responsive.gutter }]}
      accessibilityRole="radiogroup"
      accessibilityLabel="Dias disponíveis"
      testID={testID}
    >
      {days.map((day) => {
        const count = day.slots.length;
        const parts = dayChipParts(day.date);
        const isSelected = day.date === selected;
        const disabled = count === 0;
        return (
          <Pressable
            key={day.date}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected, selected: isSelected, disabled }}
            accessibilityLabel={`${formatCalendarDay(day.date)}: ${count > 0 ? `${formatSlotCount(count)} livres` : 'sem horários livres'}`}
            disabled={disabled}
            onPress={() => onSelect(day.date)}
            style={({ pressed }) => [styles.chip, disabled && styles.disabled, isSelected && styles.selected, pressed && !isSelected && styles.pressed]}
            testID={`${testID}-${day.date}`}
          >
            <AppText variant="caption" tone={disabled ? 'muted' : 'secondary'}>
              {parts.weekday}
            </AppText>
            <AppText variant="h3" tone={disabled ? 'muted' : isSelected ? 'brand' : 'primary'}>
              {parts.day}
            </AppText>
            <AppText variant="caption" tone={disabled ? 'muted' : 'secondary'}>
              {parts.month}
            </AppText>
            <AppText variant="caption" tone={disabled ? 'muted' : isSelected ? 'brand' : 'secondary'} numberOfLines={1} style={{ marginTop: 2 }}>
              {formatSlotCount(count)}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
