import React from 'react';

import { AppText, List, ListItem } from '../../../components/ui';
import { makeStyles } from '../../../theme';
import type { QueueCallView } from '../../../types/api';
import { formatQueueClock } from '../hooks/useQueue';

const useStyles = makeStyles(() => ({
  ticket: { fontVariant: ['tabular-nums'], letterSpacing: 0.5, minWidth: 48 },
}));

export interface QueueRecentCallsProps {
  calls: QueueCallView[];
  /** destaca a senha do estudante quando ela aparece na lista */
  highlightTicket?: string | null;
}

/** Últimas chamadas do painel: senha · mesa · horário, numa lista (não um card por chamada). */
export function QueueRecentCalls({ calls, highlightTicket }: QueueRecentCallsProps) {
  const styles = useStyles();
  if (calls.length === 0) return null;
  return (
    <List inset="none" testID="queue-recent-calls">
      {calls.map((call, index) => {
        const mine = highlightTicket != null && call.ticket === highlightTicket;
        return (
          <ListItem
            key={`${call.ticket}-${call.calledAt ?? index}`}
            leading={
              <AppText variant="bodyStrong" tone={mine ? 'success' : 'primary'} style={styles.ticket}>
                {call.ticket}
              </AppText>
            }
            title={call.desk ?? 'Mesa não informada'}
            description={mine ? 'Sua senha' : call.serviceStatus === 'in_service' ? 'Em atendimento' : null}
            value={call.calledAt ? formatQueueClock(call.calledAt) : undefined}
            accessibilityLabel={`Senha ${call.ticket}, ${call.desk ?? 'mesa não informada'}${call.calledAt ? `, chamada às ${formatQueueClock(call.calledAt)}` : ''}${mine ? ', sua senha' : ''}`}
          />
        );
      })}
    </List>
  );
}
