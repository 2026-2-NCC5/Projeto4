import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { UseAnalysisResult } from '../hooks/useAnalysis';
import type { ApiClientError } from '../services/apiClient';
import { makeStyles, useTheme } from '../theme';
import { MESSAGES } from '../utils/messages';

import { AnalysisResult } from './AnalysisResult';
import { ErrorBanner } from './ErrorBanner';
import { StateView, messageForError, stateKindFromError } from './StateView';
import { AppButton } from './ui/AppButton';
import { AppText } from './ui/AppText';
import { Surface } from './ui/Surface';

interface AnalysisPanelProps {
  /** Estado da análise (useAnalysis), mantido pelo container da aba Assistente. */
  analysis: UseAnalysisResult;
  onViewSubject: (subjectId: string) => void;
  onOpenRecommendation?: (id: string) => void;
  /** Cabeçalho "Assistente ASA" (oculto quando o container já exibe o seu). */
  showHeader?: boolean;
}

/** Mensagem oficial para falhas na solicitação de análise. */
export function analysisErrorMessage(error: ApiClientError | null): string {
  switch (error?.kind) {
    case 'timeout':
      return MESSAGES.errorAnalysisTimeout;
    case 'dependency':
      return MESSAGES.errorAnalysisDependency;
    case 'contract':
      return MESSAGES.errorAnalysisContract;
    case 'offline':
      return MESSAGES.errorOffline;
    case 'network':
      return MESSAGES.errorNetwork;
    case 'unauthorized':
      return MESSAGES.errorUnauthorized;
    case 'forbidden':
      return MESSAGES.errorForbidden;
    default:
      return MESSAGES.errorAnalysisDependency;
  }
}

const useStyles = makeStyles((theme) => ({
  header: { marginBottom: theme.spacing.lg },
  notice: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start', marginBottom: theme.spacing.lg },
  actionButton: { marginTop: theme.spacing.lg },
  analyzing: { alignItems: 'center', paddingVertical: theme.spacing.xxl, marginTop: theme.spacing.md },
}));

/** Análise estruturada completa do Agente para o Estudante ("Solicitar análise"). */
export function AnalysisPanel({ analysis, onViewSubject, onOpenRecommendation, showHeader = true }: AnalysisPanelProps) {
  const theme = useTheme();
  const styles = useStyles();
  const isAnalyzing = analysis.status === 'loading';
  const isLoadingLatest = analysis.latestStatus === 'loading' && analysis.status === 'idle';

  return (
    <View testID="analysis-panel">
      {showHeader ? (
        <View style={styles.header}>
          <AppText variant="h1" accessibilityRole="header">
            Assistente ASA
          </AppText>
          <AppText variant="body" tone="secondary" style={{ marginTop: theme.spacing.xxs }}>
            Agente para o Estudante · apoio à decisão
          </AppText>
        </View>
      ) : null}

      <View style={styles.notice} accessible accessibilityLabel="As recomendações apoiam sua decisão. Elas não alteram registros acadêmicos oficiais.">
        <Ionicons name="information-circle-outline" size={16} color={theme.colors.text.muted} style={{ marginTop: 1 }} />
        <AppText variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
          As recomendações apoiam sua decisão. Elas não alteram registros acadêmicos oficiais.
        </AppText>
      </View>

      <Surface>
        <AppText variant="h4">Análise da sua situação acadêmica</AppText>
        <AppText variant="bodySmall" tone="secondary" style={{ marginTop: theme.spacing.xxs }}>
          O agente analisa suas disciplinas, avaliações, frequência e pendências e explica cada recomendação com evidências.
        </AppText>
        <View style={styles.actionButton}>
          <AppButton
            label="Solicitar análise"
            icon="sparkles-outline"
            size="large"
            fullWidth
            accessibilityLabel="Solicitar análise"
            accessibilityHint="Envia sua situação acadêmica para o agente analisar"
            loadingLabel={MESSAGES.analyzing}
            onPress={() => void analysis.requestAnalysis()}
            loading={isAnalyzing}
            disabled={isAnalyzing}
            testID="request-analysis"
          />
        </View>
      </Surface>

      {isAnalyzing ? (
        <Surface style={styles.analyzing} accessibilityLiveRegion="polite" testID="analysis-loading">
          <ActivityIndicator size="small" color={theme.colors.brand.primaryStrong} accessibilityLabel={MESSAGES.analyzing} />
          <AppText variant="bodyStrong" align="center" style={{ marginTop: theme.spacing.md }}>
            {MESSAGES.analyzing}
          </AppText>
          <AppText variant="bodySmall" tone="secondary" align="center" style={{ marginTop: theme.spacing.xxs }}>
            Isso pode levar alguns segundos.
          </AppText>
        </Surface>
      ) : null}

      {!isAnalyzing && analysis.status === 'error' ? (
        <ErrorBanner title="Não foi possível concluir a análise" message={analysisErrorMessage(analysis.error)} onRetry={() => void analysis.requestAnalysis()} testID="analysis-error" />
      ) : null}

      {isLoadingLatest ? (
        <View style={{ marginTop: theme.spacing.md }}>
          <StateView kind="loading" />
        </View>
      ) : null}

      {!isAnalyzing && analysis.status === 'idle' && analysis.latestStatus === 'error' ? (
        <View style={{ marginTop: theme.spacing.md }}>
          <StateView kind={stateKindFromError(analysis.latestError)} message={messageForError(analysis.latestError)} onRetry={() => void analysis.loadLatest()} />
        </View>
      ) : null}

      {!isAnalyzing && analysis.status === 'idle' && analysis.latestStatus === 'ready' ? (
        <View style={{ marginTop: theme.spacing.md }}>
          <StateView kind="empty" title="Sem recomendações" message={MESSAGES.emptyRecommendations} />
        </View>
      ) : null}

      {!isAnalyzing && analysis.analysis && analysis.status !== 'error' && analysis.status !== 'idle' ? (
        <AnalysisResult
          analysis={analysis.analysis}
          onViewSubject={onViewSubject}
          onOpenRecommendation={onOpenRecommendation}
          onRequestAgain={() => void analysis.requestAnalysis()}
          requesting={isAnalyzing}
          flowCorrelationId={analysis.correlationId}
        />
      ) : null}
    </View>
  );
}
