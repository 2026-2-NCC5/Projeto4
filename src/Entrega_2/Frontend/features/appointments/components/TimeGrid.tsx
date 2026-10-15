import React from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '../../../components/ui/AppText';
import { makeStyles } from '../../../theme';
import type { AppointmentSlot } from '../../../types/api';
import { formatClock, formatTimeRange } from '../format';
import { placeLabel, sameSlot, slotKey } from '../labels';

export interface TimeGridProps {
  slots: AppointmentSlot[];
  selected: AppointmentSlot | null;
  onSelect: (slot: AppointmentSlot) => void;
  timeZone: string;
  /**
   * Início do agendamento sendo remarcado: aparece como "Atual" e não pode ser escolhido de novo (a API recusa o mesmo
   * início na mesma modalidade, em qualquer local).
   */
  currentStartsAt?: string | null;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  groups: { gap: theme.spacing.lg },
  group: { gap: theme.spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  slot: {
    width: 84,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    backgroundColor: theme.colors.surface.primary,
  },
  selected: { borderColor: theme.colors.brand.primaryStrong, backgroundColor: theme.colors.brand.primaryStrong },
  pressed: { backgroundColor: theme.colors.surface.secondary },
  current: { backgroundColor: theme.colors.surface.secondary, borderColor: theme.colors.border.subtle },
}));

interface LocationGroup {
  location: string | null;
  slots: AppointmentSlot[];
}

function groupByLocation(slots: readonly AppointmentSlot[]): LocationGroup[] {
  const groups: LocationGroup[] = [];
  for (const slot of slots) {
    const location = slot.location ?? null;
    const group = groups.find((item) => item.location === location);
    if (group) group.slots.push(slot);
    else groups.push({ location, slots: [slot] });
  }
  return groups;
}

/**
 * Horários livres do dia em uma grade de botões (toque grande, horário de Brasília). Quando o mesmo dia tem horários
 * em mais de um local, a grade é dividida por local: cada botão é uma opção (horário + local).
 */
export function TimeGrid({ slots, selected, onSelect, timeZone, currentStartsAt = null, testID = 'time-grid' }: TimeGridProps) {
  const styles = useStyles();
  const groups = groupByLocation(slots);
  const byLocation = groups.length > 1;
  const clockUses = new Map<string, number>();
  for (const slot of slots) {
    const clock = formatClock(slot.startsAt, timeZone);
    clockUses.set(clock, (clockUses.get(clock) ?? 0) + 1);
  }

  return (
    <View style={styles.groups} testID={testID}>
      {groups.map((group) => {
        const place = group.location ?? 'Local informado pelo ASA na confirmação';
        return (
          <View key={group.location ?? '—'} style={styles.group}>
            {byLocation ? (
              <AppText variant="bodySmallStrong" tone="secondary" accessibilityRole="header">
                {place}
              </AppText>
            ) : null}
            <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={byLocation ? `Horários em ${place}` : 'Horários disponíveis'}>
              {group.slots.map((slot) => {
                const isSelected = sameSlot(selected, slot);
                const isCurrent = currentStartsAt === slot.startsAt;
                const clock = formatClock(slot.startsAt, timeZone);
                // o mesmo horário em dois locais: o testID também diz o local
                const suffix = (clockUses.get(clock) ?? 0) > 1 ? `@${slot.location ?? 'sem-local'}` : '';
                const label = isCurrent ? `${clock}, seu horário atual` : `${formatTimeRange(slot.startsAt, slot.endsAt, timeZone)}, ${placeLabel(slot.mode, slot.location)}`;
                return (
                  <Pressable
                    key={slotKey(slot)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected, selected: isSelected, disabled: isCurrent }}
                    accessibilityLabel={label}
                    disabled={isCurrent}
                    onPress={() => onSelect(slot)}
                    style={({ pressed }) => [styles.slot, isCurrent && styles.current, isSelected && styles.selected, pressed && !isSelected && styles.pressed]}
                    testID={`${testID}-${clock}${suffix}`}
                  >
                    <AppText variant="bodyStrong" tone={isSelected ? 'onPrimary' : isCurrent ? 'muted' : 'primary'}>
                      {clock}
                    </AppText>
                    {isCurrent ? (
                      <AppText variant="caption" tone="muted">
                        Atual
                      </AppText>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}
