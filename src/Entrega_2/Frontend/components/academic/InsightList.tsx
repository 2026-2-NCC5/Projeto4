import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { makeStyles, useTheme, type Theme } from '../../theme';
import { AppText } from '../ui/AppText';
import { List } from '../ui/ListItem';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type InsightTone = 'success' | 'warning' | 'danger' | 'info' | 'brand';

export interface Insight {
  id: string;
  tone: InsightTone;
  title: string;
  message: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
}

const TONE_ICON: Record<InsightTone, IconName> = { success: 'checkmark-circle-outline', warning: 'alert-circle-outline', danger: 'alert-circle-outline', info: 'information-circle-outline', brand: 'sparkles-outline' };

function toneColor(theme: Theme, tone: InsightTone): string {
  switch (tone) {
    case 'success':
      return theme.colors.status.success;
    case 'warning':
      return theme.colors.status.warning;
    case 'danger':
      return theme.colors.status.error;
    case 'info':
      return theme.colors.status.info;
    default:
      return theme.colors.brand.primaryStrong;
  }
}

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  pressed: { backgroundColor: theme.colors.surface.secondary },
  icon: { width: 24, alignItems: 'center', paddingTop: 1 },
  body: { flex: 1, minWidth: 0 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: theme.spacing.xs },
}));

/** Avisos e recomendações em uma lista com divisores (o tom vem do ícone, não de um card colorido). */
export function InsightList({ insights, testID }: { insights: Insight[]; testID?: string }) {
  return (
    <List inset="icon" testID={testID}>
      {insights.map((insight) => (
        <InsightRow key={insight.id} insight={insight} testID={`insight-${insight.id}`} />
      ))}
    </List>
  );
}

function InsightRow({ insight, testID }: { insight: Insight; testID?: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const content = (
    <>
      <View style={styles.icon}>
        <Ionicons name={insight.icon ?? TONE_ICON[insight.tone]} size={20} color={toneColor(theme, insight.tone)} />
      </View>
      <View style={styles.body}>
        <AppText variant="bodyStrong">{insight.title}</AppText>
        <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
          {insight.message}
        </AppText>
        {insight.actionLabel && insight.onAction ? (
          <View style={styles.action}>
            <AppText variant="bodySmallStrong" tone="link">
              {insight.actionLabel}
            </AppText>
            <Ionicons name="chevron-forward" size={14} color={theme.colors.text.link} />
          </View>
        ) : null}
      </View>
    </>
  );
  if (insight.onAction) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${insight.title}. ${insight.message}`} accessibilityHint={insight.actionLabel} onPress={insight.onAction} style={({ pressed }) => [styles.row, pressed && styles.pressed]} testID={testID}>
        {content}
      </Pressable>
    );
  }
  return (
    <View style={styles.row} accessible accessibilityLabel={`${insight.title}. ${insight.message}`} testID={testID}>
      {content}
    </View>
  );
}
