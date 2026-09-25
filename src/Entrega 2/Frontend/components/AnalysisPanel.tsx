import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { UseAnalysisResult } from '../hooks/useAnalysis';
import type { ApiClientError } from '../services/apiClient';
import { makeStyles, useTheme } from '../theme';
import { MESSAGES } from '../utils/messages';

import { AnalysisResult } from './AnalysisResult';
import { Card } from './Card';
import { ErrorBanner } from './ErrorBanner';
import { PrimaryButton } from './PrimaryButton';
import { StateView, messageForError, stateKindFromError } from './StateView';
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
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.lg },
  aiAvatar: { width: 46, height: 46, borderRadius: theme.radius.lg, backgroundColor: theme.colors.brand.secondary, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  notice: { flexDirection: 'row', gap: theme.spacing.sm + 2, alignItems: 'flex-start', marginBottom: theme.spacing.md },
  actionButton: { marginTop: theme.spacing.lg },
  analyzing: { alignItems: 'center', paddingVertical: theme.spacing.xxxl, paddingHorizontal: theme.spacing.xl, marginTop: theme.spacing.md },
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
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={20} color={theme.colors.brand.highlight} />
          </View>
          <View style={styles.headerText}>
            <AppText variant="h1" accessibilityRole="header">
              Assistente ASA
            </AppText>
            <AppText variant="bodySmall" tone="muted" style={{ marginTop: 2 }}>
              Agente para o Estudante · apoio à decisão
            </AppText>
          </View>
        </View>
      ) : null}

      <Surface tone="brand" padding={theme.spacing.md + 2} radius={theme.radius.lg} style={styles.notice} accessible accessibilityLabel="As recomendações apoiam sua decisão. Elas não alteram registros acadêmicos oficiais.">
        <Ionicons name="sparkles-outline" size={18} color={theme.colors.brand.primaryStrong} />
        <AppText variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
          As recomendações apoiam sua decisão. Elas não alteram registros acadêmicos oficiais.
        </AppText>
      </Surface>

      <Card>
        <AppText variant="h4">Análise da sua situação acadêmica</AppText>
        <AppText variant="bodySmall" tone="muted" style={{ marginTop: theme.spacing.xs }}>
          O agente analisa suas disciplinas, avaliações, frequência e pendências e explica cada recomendação com evidências.
        </AppText>
        <View style={styles.actionButton}>
          <PrimaryButton
            label="Solicitar análise"
            accessibilityLabel="Solicitar análise"
            accessibilityHint="Envia sua situação acadêmica para o agente analisar"
            loadingLabel={MESSAGES.analyzing}
            onPress={() => void analysis.requestAnalysis()}
            loading={isAnalyzing}
            disabled={isAnalyzing}
            testID="request-analysis"
          />
        </View>
      </Card>

      {isAnalyzing ? (
        <Surface style={styles.analyzing} accessibilityLiveRegion="polite" testID="analysis-loading">
          <ActivityIndicator size="large" color={theme.colors.brand.primary} accessibilityLabel={MESSAGES.analyzing} />
          <AppText variant="bodyStrong" align="center" style={{ marginTop: theme.spacing.md }}>
            {MESSAGES.analyzing}
          </AppText>
          <AppText variant="bodySmall" tone="muted" align="center" style={{ marginTop: theme.spacing.xxs }}>
            Isso pode levar alguns segundos.
          </AppText>
        </Surface>
      ) : null}

      {!isAnalyzing && analysis.status === 'error' ? (
        <ErrorBanner title="Não foi possível concluir a análise" message={analysisErrorMessage(analysis.error)} onRetry={() => void analysis.requestAnalysis()} testID="analysis-error" />
      ) : null}

      {isLoadingLatest ? <StateView kind="loading" /> : null}

      {!isAnalyzing && analysis.status === 'idle' && analysis.latestStatus === 'error' ? (
        <StateView kind={stateKindFromError(analysis.latestError)} message={messageForError(analysis.latestError)} onRetry={() => void analysis.loadLatest()} />
      ) : null}

      {!isAnalyzing && analysis.status === 'idle' && analysis.latestStatus === 'ready' ? <StateView kind="empty" title="Sem recomendações" message={MESSAGES.emptyRecommendations} /> : null}

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
