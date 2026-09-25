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
  container: { alignItems: 'center', paddingVertical: theme.spacing.xxxl, paddingHorizontal: theme.spacing.xl, marginTop: theme.spacing.md },
  compact: { paddingVertical: theme.spacing.xl },
  iconWrap: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.md },
  actions: { marginTop: theme.spacing.lg, alignSelf: 'stretch' },
}));

/** Estado vazio amigável: "Nenhuma pendência encontrada. Tudo certo por aqui. ✓" */
export function EmptyState({ title, message, icon, tone = 'neutral', actionLabel, onAction, compact = false, testID }: EmptyStateProps) {
  const theme = useTheme();
  const styles = useStyles();
  const positive = tone === 'positive';
  const iconName: IconName = icon ?? (positive ? 'checkmark-circle-outline' : 'file-tray-outline');
  return (
    <Surface style={[styles.container, compact && styles.compact]} testID={testID} accessibilityLiveRegion="polite">
      <View style={[styles.iconWrap, { backgroundColor: positive ? theme.colors.status.successSoft : theme.colors.brand.primarySoft }]}>
        <Ionicons name={iconName} size={28} color={positive ? theme.colors.status.success : theme.colors.brand.primaryStrong} />
      </View>
      <AppText variant="h4" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText variant="bodySmall" tone="muted" align="center" style={{ marginTop: theme.spacing.xs, maxWidth: 320 }}>
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
