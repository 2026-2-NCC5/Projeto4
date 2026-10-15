import React, { useState } from 'react';
import { View } from 'react-native';

import { AppButton, AppText, Surface } from '../../../components/ui';
import { makeStyles, useTheme } from '../../../theme';
import type { MockScenario } from '../services/queueClient';

const SCENARIOS: { id: MockScenario; label: string }[] = [
  { id: 'waiting', label: '7 à frente' },
  { id: '5_ahead', label: '5 à frente' },
  { id: '3_ahead', label: '3 à frente' },
  { id: 'next', label: 'Próxima' },
  { id: 'called', label: 'Chamada' },
  { id: 'completed', label: 'Concluída' },
  { id: 'empty', label: 'Fila vazia' },
  { id: 'offline', label: 'Fonte fora' },
  { id: 'progression', label: 'Progressão' },
];

const useStyles = makeStyles((theme) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md },
}));

export interface QueueDevPanelProps {
  local: boolean;
  onSimulate: (control: { scenario?: MockScenario; advance?: boolean }) => Promise<boolean>;
}

/**
 * Simulação para desenvolvimento (validar UI, push, voz, vibração e animações com a senha 0029).
 * Fila local (EXPO_PUBLIC_USE_MOCK_QUEUE=true) ou provider mock do backend (ASA_QUEUE_PROVIDER=mock).
 */
export function QueueDevPanel({ local, onSimulate }: QueueDevPanelProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [message, setMessage] = useState<string | null>(null);
  const run = async (control: { scenario?: MockScenario; advance?: boolean }) => {
    const ok = await onSimulate(control);
    setMessage(ok ? null : 'Simulação indisponível: use ASA_QUEUE_PROVIDER=mock na API ou EXPO_PUBLIC_USE_MOCK_QUEUE=true no app.');
  };
  return (
    <Surface tone="secondary" testID="queue-dev-panel">
      <AppText variant="label" tone="secondary">
        Simulação (desenvolvimento) · {local ? 'fila local' : 'API'}
      </AppText>
      <AppText variant="caption" tone="muted" style={{ marginTop: theme.spacing.xxs }}>
        Cenários relativos à senha 0029. Acompanhe a 0029 para ver alertas, voz e vibração.
      </AppText>
      <View style={styles.grid}>
        <AppButton label="Chamar próxima" size="small" onPress={() => void run({ advance: true })} testID="queue-dev-advance" />
        {SCENARIOS.map((scenario) => (
          <AppButton key={scenario.id} label={scenario.label} size="small" variant="secondary" onPress={() => void run({ scenario: scenario.id })} testID={`queue-dev-${scenario.id}`} />
        ))}
      </View>
      {message ? (
        <AppText variant="caption" tone="warning" style={{ marginTop: theme.spacing.sm }}>
          {message}
        </AppText>
      ) : null}
    </Surface>
  );
}
