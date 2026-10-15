import React from 'react';

import { AppText, List, ListItem } from '../../../components/ui';
import { makeStyles } from '../../../theme';
import type { QueueTimelineEntry } from '../../../types/api';
import { formatQueueClock } from '../hooks/useQueue';

const useStyles = makeStyles(() => ({
  time: { fontVariant: ['tabular-nums'], minWidth: 44 },
}));

function atendimentos(count: number | null): string {
  if (count === null) return 'Poucos atendimentos antes da sua senha';
  return count === 1 ? 'Falta 1 atendimento' : `Faltam ${count} atendimentos`;
}

/** Texto de cada evento do acompanhamento (sem jargão; mesa só quando informada). */
export function timelineText(entry: QueueTimelineEntry, ticket: string): string {
  switch (entry.type) {
    case 'subscribed':
      return `Senha ${ticket} adicionada`;
    case 'QUEUE_5_AHEAD':
    case 'QUEUE_3_AHEAD':
      return atendimentos(entry.ahead);
    case 'QUEUE_NEXT':
      return 'Sua senha é uma das próximas';
    case 'QUEUE_CALLED':
      return entry.desk ? `Senha chamada — ${entry.desk}` : 'Senha chamada';
    case 'completed':
      return 'Atendimento finalizado';
    case 'expired':
      return 'Acompanhamento encerrado no fim do dia';
    case 'cancelled':
      return 'Acompanhamento encerrado';
    default:
      return '';
  }
}

export interface QueueHistoryProps {
  ticket: string;
  timeline: QueueTimelineEntry[];
}

/** "Seu acompanhamento": horário e marco, do mais antigo para o mais recente. */
export function QueueHistory({ ticket, timeline }: QueueHistoryProps) {
  const styles = useStyles();
  if (timeline.length === 0) return null;
  return (
    <List inset="none" testID="queue-history">
      {timeline.map((entry) => (
        <ListItem
          key={`${entry.type}-${entry.at}`}
          leading={
            <AppText variant="bodySmall" tone="secondary" style={styles.time}>
              {formatQueueClock(entry.at)}
            </AppText>
          }
          title={timelineText(entry, ticket)}
        />
      ))}
    </List>
  );
}
