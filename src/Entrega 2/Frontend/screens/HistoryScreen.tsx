import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { Card } from '../components/Card';
import { Pill } from '../components/Pill';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateView, messageForError, stateKindFromError } from '../components/StateView';
import { AppText, CardSkeleton, EmptyState, PressableScale, SectionHeader } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { agentService } from '../services/agentService';
import { makeStyles, useTheme } from '../theme';
import type { AgentHistoryItem } from '../types/api';
import { formatDateTime, pluralize, runStatusIcon, runStatusLabel, runStatusTone } from '../utils/format';
import { MESSAGES } from '../utils/messages';

interface HistoryScreenProps {
  onOpenRun: (runId: string) => void;
  onBack?: () => void;
}

const useStyles = makeStyles((theme) => ({
  pressable: { marginBottom: theme.spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing.md, gap: theme.spacing.sm },
}));

export function HistoryScreen({ onOpenRun, onBack }: HistoryScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const history = useResource<AgentHistoryItem[]>(() => agentService.getHistory());

  return (
    <Screen testID="history-screen">
      <ScreenHeader title="Histórico" subtitle="Análises anteriores do agente, da mais recente para a mais antiga." onBack={onBack} />

      {history.status === 'loading' ? (
        <View accessibilityLiveRegion="polite" accessibilityLabel={MESSAGES.loadingData}>
          <CardSkeleton />
          <CardSkeleton lines={1} />
        </View>
      ) : null}
      {history.status === 'error' ? <StateView kind={stateKindFromError(history.error)} message={messageForError(history.error)} onRetry={history.reload} /> : null}
      {history.status === 'empty' ? <EmptyState title="Nenhuma análise" message={MESSAGES.emptyHistory} icon="time-outline" /> : null}

      {history.status === 'success' && history.data ? (
        <>
          <SectionHeader title="Análises" action={pluralize(history.data.length, 'registro', 'registros')} />
          {history.data.map((item) => (
            <PressableScale
              key={item.runId}
              accessibilityRole="button"
              accessibilityLabel={`Análise de ${formatDateTime(item.createdAt)}, ${runStatusLabel(item.status)}`}
              accessibilityHint="Abre o detalhe desta análise"
              onPress={() => onOpenRun(item.runId)}
              style={styles.pressable}
              testID={`history-${item.runId}`}
            >
              <Card>
                <View style={styles.rowBetween}>
                  <Pill label={runStatusLabel(item.status)} icon={runStatusIcon(item.status)} tone={runStatusTone(item.status)} />
                  <AppText variant="caption" tone="muted">
                    {formatDateTime(item.createdAt)}
                  </AppText>
                </View>
                <AppText variant="bodyStrong" numberOfLines={3} style={{ marginTop: theme.spacing.md }}>
                  {item.summary}
                </AppText>
                <View style={styles.tags}>
                  <Pill label={pluralize(item.recommendationsCount, 'recomendação', 'recomendações')} tone="neutral" />
                  {item.requiresHumanValidation ? <Pill label="Validação humana" icon="ⓘ" tone="info" /> : null}
                  {item.abstained ? <Pill label="Abstenção" icon="ⓘ" tone="neutral" /> : null}
                </View>
                <View style={styles.footer}>
                  <AppText variant="mono" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
                    runId: {item.runId}
                  </AppText>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.text.muted} />
                </View>
              </Card>
            </PressableScale>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
