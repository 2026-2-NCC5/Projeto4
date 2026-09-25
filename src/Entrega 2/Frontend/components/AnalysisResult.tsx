import React, { useMemo } from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../theme';
import type { AgentAnalysis } from '../types/api';
import { formatConfidence, formatDateTime, pluralize, runStatusIcon, runStatusLabel, runStatusTone } from '../utils/format';
import { MESSAGES } from '../utils/messages';

import { AbstentionCard } from './AbstentionCard';
import { Card } from './Card';
import { HumanValidationBanner } from './HumanValidationBanner';
import { Pill } from './Pill';
import { RecommendationCard } from './RecommendationCard';
import { TechnicalDetails } from './TechnicalDetails';
import { AppText } from './ui/AppText';

interface AnalysisResultProps {
  analysis: AgentAnalysis;
  onViewSubject?: (subjectId: string) => void;
  onOpenRecommendation?: (id: string) => void;
  onRequestAgain?: () => void;
  requesting?: boolean;
  /** Correlation id do fluxo atual (quando diferente do registrado na análise). */
  flowCorrelationId?: string | null;
}

const useStyles = makeStyles((theme) => ({
  summaryCard: { marginTop: theme.spacing.md },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  noActionCard: { marginTop: theme.spacing.md },
  list: { marginTop: theme.spacing.xl },
}));

/** Renderização completa de uma análise: resumo, abstenção, validação humana e recomendações. */
export function AnalysisResult({ analysis, onViewSubject, onOpenRecommendation, onRequestAgain, requesting = false, flowCorrelationId }: AnalysisResultProps) {
  const theme = useTheme();
  const styles = useStyles();
  const recommendations = useMemo(() => [...analysis.recommendations].sort((a, b) => a.priority - b.priority), [analysis.recommendations]);
  const isAbstained = analysis.abstained || analysis.status === 'abstained';
  const confidence = formatConfidence(analysis.confidence);
  const validationNextAction = recommendations.find((item) => item.requiresHumanValidation)?.nextAction ?? recommendations[0]?.nextAction ?? null;

  return (
    <View>
      <Card style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <Pill label={runStatusLabel(analysis.status)} icon={runStatusIcon(analysis.status)} tone={runStatusTone(analysis.status)} />
          {confidence ? (
            <AppText variant="caption" tone="muted">
              {confidence}
            </AppText>
          ) : null}
        </View>
        <AppText variant="label" tone="brand" uppercase style={{ marginTop: theme.spacing.lg }}>
          Resumo da análise
        </AppText>
        <AppText variant="bodyStrong" accessibilityLiveRegion="polite" style={{ marginTop: theme.spacing.xs }}>
          {analysis.summary}
        </AppText>
        <AppText variant="bodySmall" tone="muted" style={{ marginTop: theme.spacing.sm + 2 }}>
          {formatDateTime(analysis.createdAt)} · {pluralize(recommendations.length, 'recomendação', 'recomendações')}
        </AppText>
      </Card>

      {isAbstained ? <AbstentionCard reason={analysis.abstentionReason} onRequestAgain={onRequestAgain} requesting={requesting} /> : null}

      {!isAbstained && analysis.requiresHumanValidation ? <HumanValidationBanner nextAction={validationNextAction} /> : null}

      {!isAbstained && analysis.status === 'no_action' && recommendations.length === 0 ? (
        <Card tone="mint" style={styles.noActionCard} accessibilityLiveRegion="polite">
          <Pill label="Em dia" icon="✓" tone="success" />
          <AppText variant="h4" style={{ marginTop: theme.spacing.md }}>
            {MESSAGES.noAction}
          </AppText>
          <AppText variant="bodySmall" tone="muted" style={{ marginTop: theme.spacing.xs }}>
            Continue acompanhando suas disciplinas. Você pode solicitar uma nova análise a qualquer momento.
          </AppText>
        </Card>
      ) : null}

      {recommendations.length > 0 ? (
        <View style={styles.list}>
          <AppText variant="h3" accessibilityRole="header" style={{ marginBottom: theme.spacing.md }}>
            Recomendações
          </AppText>
          {recommendations.map((recommendation) => (
            <RecommendationCard
              key={recommendation.id}
              recommendation={recommendation}
              onViewSubject={onViewSubject}
              onOpenDetail={onOpenRecommendation}
              hideValidationBanner={analysis.requiresHumanValidation}
              testID={`recommendation-${recommendation.id}`}
            />
          ))}
        </View>
      ) : null}

      <TechnicalDetails runId={analysis.runId} correlationId={analysis.correlationId} version={analysis.version} />
      {flowCorrelationId && flowCorrelationId !== analysis.correlationId ? (
        <AppText variant="mono" tone="muted" style={{ paddingHorizontal: theme.spacing.xxs }}>
          correlationId (fluxo): {flowCorrelationId}
        </AppText>
      ) : null}
    </View>
  );
}
