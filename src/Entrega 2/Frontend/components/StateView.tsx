import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { ApiClientError } from '../services/apiClient';
import { makeStyles, useTheme } from '../theme';
import type { StateKind } from '../types/ui';
import { MESSAGES } from '../utils/messages';

import { PrimaryButton } from './PrimaryButton';
import { AppText } from './ui/AppText';
import { CardSkeleton } from './ui/LoadingSkeleton';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const DEFAULTS: Record<Exclude<StateKind, 'empty'>, { message: string; icon: IconName | null; title?: string }> = {
  loading: { message: MESSAGES.loadingData, icon: null },
  error: { message: MESSAGES.errorGeneric, icon: 'alert-circle-outline', title: 'Não conseguimos carregar suas informações agora' },
  timeout: { message: MESSAGES.errorAnalysisTimeout, icon: 'time-outline', title: 'Tempo esgotado' },
  offline: { message: MESSAGES.errorOffline, icon: 'cloud-offline-outline', title: 'Sem conexão' },
  unauthorized: { message: MESSAGES.errorUnauthorized, icon: 'lock-closed-outline', title: 'Sessão expirada' },
  forbidden: { message: MESSAGES.errorForbidden, icon: 'ban-outline', title: 'Acesso negado' },
};

/** Converte um erro normalizado no estado visual correspondente. */
export function stateKindFromError(error: ApiClientError | null | undefined): StateKind {
  switch (error?.kind) {
    case 'timeout':
      return 'timeout';
    case 'offline':
      return 'offline';
    case 'unauthorized':
      return 'unauthorized';
    case 'forbidden':
      return 'forbidden';
    default:
      return 'error';
  }
}

/** Mensagem oficial para um erro de carregamento de dados. */
export function messageForError(error: ApiClientError | null | undefined): string {
  const kind = stateKindFromError(error);
  if (kind === 'error' && error?.kind === 'network') return MESSAGES.errorNetwork;
  return DEFAULTS[kind === 'empty' ? 'error' : kind].message;
}

interface StateViewProps {
  kind: StateKind;
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Ação adicional (ex.: no estado vazio). */
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  /** Loading em formato de esqueleto (padrão) ou spinner. */
  loadingStyle?: 'skeleton' | 'spinner';
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing.xxxl, paddingHorizontal: theme.spacing.xl, backgroundColor: theme.colors.surface.primary, borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.border.subtle, marginTop: theme.spacing.md },
  compact: { paddingVertical: theme.spacing.xl },
  iconWrap: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brand.primarySoft, marginBottom: theme.spacing.md },
  iconWrapProblem: { backgroundColor: theme.colors.status.errorSoft },
  actions: { marginTop: theme.spacing.lg, alignSelf: 'stretch' },
  spinnerWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
}));

export function StateView({ kind, title, message, onRetry, retryLabel = MESSAGES.retry, actionLabel, onAction, compact = false, loadingStyle = 'skeleton', testID }: StateViewProps) {
  const theme = useTheme();
  const styles = useStyles();

  if (kind === 'loading') {
    const text = message ?? MESSAGES.loadingData;
    if (loadingStyle === 'skeleton') {
      // Esqueleto visual + indicador acessível (leitores de tela continuam ouvindo "Carregando...").
      return (
        <View testID={testID} accessibilityLiveRegion="polite">
          <CardSkeleton lines={compact ? 1 : 3} accessibilityLabel={null} />
          <View style={[styles.spinnerWrap, { pointerEvents: 'none' }]}>
            <ActivityIndicator size="small" color={theme.colors.brand.primary} accessibilityLabel={text} />
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.container, compact && styles.compact]} testID={testID} accessibilityLiveRegion="polite">
        <ActivityIndicator size="large" color={theme.colors.brand.primary} accessibilityLabel={text} />
        <AppText variant="body" tone="muted" align="center" style={{ marginTop: theme.spacing.md }}>
          {text}
        </AppText>
      </View>
    );
  }

  const isProblem = kind !== 'empty';
  const defaults = kind === 'empty' ? { message: 'Nada por aqui ainda.', icon: 'file-tray-outline' as IconName, title: undefined } : DEFAULTS[kind];
  const resolvedMessage = message ?? defaults.message;
  const resolvedTitle = title ?? defaults.title;

  return (
    <View style={[styles.container, compact && styles.compact]} testID={testID} accessibilityRole={isProblem ? 'alert' : undefined} accessibilityLiveRegion={isProblem ? 'assertive' : 'polite'}>
      {defaults.icon ? (
        <View style={[styles.iconWrap, isProblem && styles.iconWrapProblem]}>
          <Ionicons name={defaults.icon} size={26} color={isProblem ? theme.colors.status.error : theme.colors.brand.primaryStrong} />
        </View>
      ) : null}
      {resolvedTitle ? (
        <AppText variant="h4" align="center" style={{ marginBottom: theme.spacing.xs }}>
          {resolvedTitle}
        </AppText>
      ) : null}
      <AppText variant="body" tone="muted" align="center" style={{ maxWidth: 320 }}>
        {resolvedMessage}
      </AppText>
      {onRetry ? (
        <View style={styles.actions}>
          <PrimaryButton label={retryLabel} onPress={onRetry} variant={isProblem ? 'primary' : 'secondary'} />
        </View>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.actions}>
          <PrimaryButton label={actionLabel} onPress={onAction} variant="primary" />
        </View>
      ) : null}
    </View>
  );
}
