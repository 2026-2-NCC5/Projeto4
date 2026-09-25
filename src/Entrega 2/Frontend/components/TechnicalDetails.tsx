import React from 'react';
import { View } from 'react-native';

import { makeStyles } from '../theme';

import { AppText } from './ui/AppText';

interface TechnicalDetailsProps {
  interactionId?: string | null;
  runId?: string | null;
  correlationId?: string | null;
  requestId?: string | null;
  version?: string | null;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  wrapper: { marginTop: theme.spacing.lg, paddingHorizontal: theme.spacing.xxs },
}));

/** Identificadores de rastreabilidade, discretos, para suporte e auditoria. Nunca inclui tokens. */
export function TechnicalDetails({ interactionId, runId, correlationId, requestId, version, testID }: TechnicalDetailsProps) {
  const styles = useStyles();
  const rows: { label: string; value: string }[] = [];
  if (interactionId) rows.push({ label: 'interactionId', value: interactionId });
  if (runId) rows.push({ label: 'runId', value: runId });
  if (correlationId) rows.push({ label: 'correlationId', value: correlationId });
  if (requestId) rows.push({ label: 'requestId', value: requestId });
  if (version) rows.push({ label: 'versão do agente', value: version });
  if (rows.length === 0) return null;

  return (
    <View style={styles.wrapper} testID={testID} accessible accessibilityLabel={`Detalhes técnicos: ${rows.map((r) => `${r.label} ${r.value}`).join(', ')}`}>
      <AppText variant="caption" tone="muted" style={{ marginBottom: 2 }}>
        Detalhes técnicos
      </AppText>
      {rows.map((row) => (
        <AppText key={row.label} variant="mono" tone="muted" selectable>
          {row.label}: {row.value}
        </AppText>
      ))}
    </View>
  );
}
