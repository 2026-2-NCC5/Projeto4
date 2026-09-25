import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';

import { AppText } from './AppText';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  /** Rótulo da ação à direita (ex.: "Ver tudo"). Sem onAction, é exibido como texto informativo. */
  action?: string;
  onAction?: () => void;
  actionAccessibilityLabel?: string;
  /** Sem margem superior (primeiro item da tela). */
  flush?: boolean;
}

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: theme.spacing.md, marginTop: theme.spacing.xxl, marginBottom: theme.spacing.md },
  flush: { marginTop: 0 },
  titles: { flex: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32, justifyContent: 'center' },
  pressed: { opacity: 0.7 },
}));

export function SectionHeader({ title, subtitle, action, onAction, actionAccessibilityLabel, flush = false }: SectionHeaderProps) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.row, flush && styles.flush]}>
      <View style={styles.titles}>
        <AppText variant="h3" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="bodySmall" tone="muted" style={{ marginTop: 2 }}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={actionAccessibilityLabel ?? action} hitSlop={theme.hitSlop} onPress={onAction} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <AppText variant="bodySmallStrong" tone="link">
            {action}
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.text.link} />
        </Pressable>
      ) : action ? (
        <AppText variant="bodySmallStrong" tone="muted">
          {action}
        </AppText>
      ) : null}
    </View>
  );
}
