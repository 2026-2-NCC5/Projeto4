import React from 'react';
import { View } from 'react-native';

import { AppText } from '../../../components/ui/AppText';
import { ListItem } from '../../../components/ui/ListItem';
import { makeStyles } from '../../../theme';
import type { Appointment } from '../../../types/api';
import { APPOINTMENTS } from '../config';
import { appointmentDay, dayChipParts, formatAppointmentDate, formatTimeRange } from '../format';
import { appointmentStatusMeta, modeLabel, placeLabel } from '../labels';

import { AppointmentStatusBadge } from './AppointmentStatusBadge';

const useStyles = makeStyles(() => ({
  date: { width: 40, alignItems: 'center' },
}));

const capitalize = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** Linha de "Meus agendamentos": dia, assunto, horário, modalidade e situação (uma lista, divisores entre itens). */
export function AppointmentRow({ appointment, onPress, timeZone = APPOINTMENTS.TIMEZONE, testID }: { appointment: Appointment; onPress: () => void; timeZone?: string; testID?: string }) {
  const styles = useStyles();
  const day = appointmentDay(appointment.startsAt, timeZone);
  const chip = day ? dayChipParts(day) : { weekday: '', day: '—', month: '' };
  const status = appointmentStatusMeta(appointment);
  const range = formatTimeRange(appointment.startsAt, appointment.endsAt, timeZone);
  const label = [
    appointment.topicLabel,
    formatAppointmentDate(appointment.startsAt, timeZone),
    `das ${range}`,
    placeLabel(appointment.mode, appointment.location),
    `Situação: ${status.label}`,
  ].join(', ');

  return (
    <ListItem
      leading={
        <View style={styles.date}>
          <AppText variant="h4">{chip.day}</AppText>
          <AppText variant="caption" tone="muted">
            {chip.month}
          </AppText>
        </View>
      }
      title={appointment.topicLabel}
      description={`${capitalize(chip.weekday)} · ${range} · ${modeLabel(appointment.mode)}`}
      trailing={<AppointmentStatusBadge appointment={appointment} />}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityHint="Abre os detalhes do agendamento"
      titleLines={2}
      testID={testID}
    />
  );
}
