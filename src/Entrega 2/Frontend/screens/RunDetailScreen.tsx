import React from 'react';

import { AnalysisResult, Screen, ScreenHeader, StateView, messageForError, stateKindFromError } from '../components';
import { CardSkeleton } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { agentService } from '../services/agentService';
import type { AgentAnalysis } from '../types/api';
import { formatDateTime } from '../utils/format';

interface RunDetailScreenProps {
  runId: string;
  onBack: () => void;
  onViewSubject: (subjectId: string) => void;
  onOpenRecommendation?: (id: string) => void;
}

/** Detalhe de uma análise do histórico (GET /api/agent/history/:runId). */
export function RunDetailScreen({ runId, onBack, onViewSubject, onOpenRecommendation }: RunDetailScreenProps) {
  const run = useResource<AgentAnalysis>(() => agentService.getRun(runId), { key: runId, isEmpty: () => false });

  return (
    <Screen testID="run-detail-screen">
      <ScreenHeader title="Detalhe da análise" subtitle={run.data ? `Realizada em ${formatDateTime(run.data.createdAt)}` : undefined} onBack={onBack} />
      {run.status === 'loading' ? <CardSkeleton lines={3} /> : null}
      {run.status === 'error' ? <StateView kind={stateKindFromError(run.error)} message={messageForError(run.error)} onRetry={run.reload} /> : null}
      {run.data ? <AnalysisResult analysis={run.data} onViewSubject={onViewSubject} onOpenRecommendation={onOpenRecommendation} /> : null}
    </Screen>
  );
}
