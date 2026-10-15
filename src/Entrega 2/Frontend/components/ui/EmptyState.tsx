import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { Surface } from './Surface';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: IconName;
  /** 'positive' = "tudo certo" (✓ verde); 'neutral' = nada por aqui. */
  tone?: 'positive' | 'neutral';
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  container: { alignItems: 'center', paddingVertical: theme.spacing.xxl, paddingHorizontal: theme.spacing.xl },
  compact: { paddingVertical: theme.spacing.lg, flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
  compactText: { flex: 1 },
  actions: { marginTop: theme.spacing.lg },
}));

/** Estado vazio: ícone simples, título e orientação. A versão compacta é uma linha (listas curtas). */
export function EmptyState({ title, message, icon, tone = 'neutral', actionLabel, onAction, compact = false, testID }: EmptyStateProps) {
  const theme = useTheme();
  const styles = useStyles();
  const positive = tone === 'positive';
  const iconName: IconName = icon ?? (positive ? 'checkmark-circle-outline' : 'file-tray-outline');
  const iconColor = positive ? theme.colors.status.success : theme.colors.text.muted;

  if (compact) {
    return (
      <Surface style={styles.compact} testID={testID} accessibilityLiveRegion="polite">
        <Ionicons name={iconName} size={20} color={iconColor} />
        <View style={styles.compactText}>
          <AppText variant="bodyStrong">{title}</AppText>
          {message ? (
            <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
              {message}
            </AppText>
          ) : null}
        </View>
      </Surface>
    );
  }

  return (
    <Surface style={styles.container} testID={testID} accessibilityLiveRegion="polite">
      <Ionicons name={iconName} size={28} color={iconColor} />
      <AppText variant="h4" align="center" style={{ marginTop: theme.spacing.md }}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="bodySmall" tone="secondary" align="center" style={{ marginTop: theme.spacing.xxs, maxWidth: 320 }}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.actions}>
          <AppButton label={actionLabel} onPress={onAction} variant="secondary" />
        </View>
      ) : null}
    </Surface>
  );
}
