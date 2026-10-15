import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateView, messageForError, stateKindFromError } from '../components/StateView';
import { AppText, Badge, CardSkeleton, EmptyState, List, SectionHeader } from '../components/ui';
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
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  pressed: { backgroundColor: theme.colors.surface.secondary },
  body: { flex: 1, minWidth: 0 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: theme.spacing.xs },
}));

export function HistoryScreen({ onOpenRun, onBack }: HistoryScreenProps) {
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
          <SectionHeader title="Análises" action={pluralize(history.data.length, 'registro', 'registros')} flush />
          <List>
            {history.data.map((item) => (
              <HistoryRow key={item.runId} item={item} onPress={() => onOpenRun(item.runId)} />
            ))}
          </List>
        </>
      ) : null}
    </Screen>
  );
}

function HistoryRow({ item, onPress }: { item: AgentHistoryItem; onPress: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  const meta = [pluralize(item.recommendationsCount, 'recomendação', 'recomendações'), item.requiresHumanValidation ? 'Validação humana' : null, item.abstained ? 'Abstenção' : null].filter((value): value is string => Boolean(value));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Análise de ${formatDateTime(item.createdAt)}, ${runStatusLabel(item.status)}`}
      accessibilityHint="Abre o detalhe desta análise"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`history-${item.runId}`}
    >
      <View style={styles.body}>
        <View style={styles.top}>
          <Badge label={runStatusLabel(item.status)} icon={runStatusIcon(item.status)} tone={runStatusTone(item.status)} />
          <AppText variant="caption" tone="muted">
            {formatDateTime(item.createdAt)}
          </AppText>
        </View>
        <AppText variant="bodyStrong" numberOfLines={2} style={{ marginTop: theme.spacing.sm }}>
          {item.summary}
        </AppText>
        <View style={styles.meta}>
          {meta.map((text, index) => (
            <React.Fragment key={text}>
              {index > 0 ? (
                <AppText variant="caption" tone="muted">
                  {' · '}
                </AppText>
              ) : null}
              <AppText variant="caption" tone="secondary">
                {text}
              </AppText>
            </React.Fragment>
          ))}
        </View>
        <AppText variant="mono" tone="muted" numberOfLines={1} style={{ marginTop: theme.spacing.xxs }}>
          runId: {item.runId}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.text.muted} />
    </Pressable>
  );
}
