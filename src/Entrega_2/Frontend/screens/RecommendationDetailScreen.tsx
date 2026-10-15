import React from 'react';

import { InfoRow, RecommendationCard, Screen, ScreenHeader, StateView, TechnicalDetails, messageForError, stateKindFromError } from '../components';
import { CardSkeleton, List, SectionHeader } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { agentService } from '../services/agentService';
import type { AgentRecommendationDetail } from '../types/api';
import { formatDateTime, recommendationTypeLabel, runStatusLabel } from '../utils/format';

interface RecommendationDetailScreenProps {
  id: string;
  onBack: () => void;
  onViewSubject: (subjectId: string) => void;
}

/** Detalhe completo de uma recomendação (GET /api/agent/recommendations/:id). */
export function RecommendationDetailScreen({ id, onBack, onViewSubject }: RecommendationDetailScreenProps) {
  const detail = useResource<AgentRecommendationDetail>(() => agentService.getRecommendation(id), { key: id, isEmpty: () => false });

  return (
    <Screen testID="recommendation-detail-screen">
      <ScreenHeader title="Recomendação" subtitle={detail.data ? recommendationTypeLabel(detail.data.type) : undefined} onBack={onBack} />
      {detail.status === 'loading' ? <CardSkeleton lines={3} /> : null}
      {detail.status === 'error' ? <StateView kind={stateKindFromError(detail.error)} message={messageForError(detail.error)} onRetry={detail.reload} /> : null}
      {detail.data ? (
        <>
          <RecommendationCard recommendation={detail.data} onViewSubject={onViewSubject} />
          <SectionHeader title="Origem" />
          <List inset="text">
            <InfoRow label="Análise" value={runStatusLabel(detail.data.runStatus)} />
            <InfoRow label="Data" value={formatDateTime(detail.data.createdAt)} />
            <InfoRow label="Prioridade" value={String(detail.data.priority)} />
          </List>
          <TechnicalDetails runId={detail.data.runId} />
        </>
      ) : null}
    </Screen>
  );
}
