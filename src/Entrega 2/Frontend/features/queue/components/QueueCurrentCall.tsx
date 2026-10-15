import React from 'react';
import { View } from 'react-native';

import { AppText, Divider, Surface } from '../../../components/ui';
import { makeStyles, useTheme } from '../../../theme';
import type { QueueCallView, QueueOverview } from '../../../types/api';
import { formatQueueClock } from '../hooks/useQueue';

const useStyles = makeStyles((theme) => ({
  main: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: theme.spacing.md },
  ticket: { fontVariant: ['tabular-nums'], letterSpacing: 1 },
  desk: { alignItems: 'flex-end' },
  other: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: theme.spacing.sm },
}));

function headline(call: QueueCallView): string {
  return call.serviceStatus === 'in_service' ? 'Sendo atendida agora' : 'Última senha chamada';
}

export interface QueueCurrentCallProps {
  overview: QueueOverview;
}

/**
 * Senha em atendimento com a mesa (quando o painel informa) e a última chamada das demais mesas —
 * várias mesas atendem ao mesmo tempo, então "a senha atual" não é um número só.
 */
export function QueueCurrentCall({ overview }: QueueCurrentCallProps) {
  const theme = useTheme();
  const styles = useStyles();
  const latest = overview.latestCall;
  if (!latest) {
    return (
      <Surface testID="queue-current-call">
        <AppText variant="bodyStrong">{overview.status === 'empty' ? 'Nenhuma senha chamada hoje' : 'Sem chamadas para mostrar'}</AppText>
        <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
          {overview.status === 'empty' ? 'Assim que o ASA chamar a primeira senha, ela aparece aqui.' : 'Ainda não recebemos as chamadas do painel do ASA.'}
        </AppText>
      </Surface>
    );
  }
  const others = overview.currentCalls.filter((call) => call.ticket !== latest.ticket && call.desk && call.desk !== latest.desk);
  return (
    <Surface testID="queue-current-call">
      <View style={styles.main} accessible accessibilityLabel={`${headline(latest)}: senha ${latest.ticket}${latest.desk ? `, ${latest.desk}` : ''}`}>
        <View>
          <AppText variant="label" tone="secondary">
            {headline(latest)}
          </AppText>
          <AppText variant="metric" style={styles.ticket}>
            {latest.ticket}
          </AppText>
        </View>
        <View style={styles.desk}>
          {latest.desk ? <AppText variant="h4">{latest.desk}</AppText> : <AppText variant="bodySmall" tone="muted">Mesa não informada</AppText>}
          {latest.calledAt ? (
            <AppText variant="caption" tone="muted">
              chamada às {formatQueueClock(latest.calledAt)}
            </AppText>
          ) : null}
        </View>
      </View>
      {others.length > 0 ? (
        <>
          <Divider spacing={theme.spacing.md} />
          {others.map((call) => (
            <View key={`${call.desk}-${call.ticket}`} style={styles.other} accessible accessibilityLabel={`${call.desk}: última chamada ${call.ticket}`}>
              <AppText variant="bodySmall" tone="secondary">
                {call.desk} · última chamada
              </AppText>
              <AppText variant="bodyStrong" style={styles.ticket}>
                {call.ticket}
              </AppText>
            </View>
          ))}
        </>
      ) : null}
    </Surface>
  );
}
