import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { PressableScale } from '../ui/PressableScale';
import { Surface, type SurfaceTone } from '../ui/Surface';

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

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: theme.spacing.sm, minHeight: 32, alignSelf: 'flex-start' },
}));

const TONE_SURFACE: Record<InsightTone, SurfaceTone> = { success: 'success', warning: 'warning', danger: 'error', info: 'info', brand: 'brand' };
const TONE_ICON: Record<InsightTone, IconName> = { success: 'checkmark-circle', warning: 'warning', danger: 'alert-circle', info: 'information-circle', brand: 'sparkles' };
const TONE_MARK: Record<InsightTone, string> = { success: '✓', warning: '⚠', danger: '⚠', info: 'ⓘ', brand: '✦' };

/** Alerta inteligente contextual ("⚠ Frequência em Cálculo está em 76%", "✓ Tudo certo"). */
export function InsightCard({ insight, testID }: { insight: Insight; testID?: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const color = insight.tone === 'success' ? theme.colors.status.successText : insight.tone === 'warning' ? theme.colors.status.warningText : insight.tone === 'danger' ? theme.colors.status.errorText : insight.tone === 'info' ? theme.colors.status.infoText : theme.colors.brand.primaryStrong;
  const textTone = insight.tone === 'success' ? 'success' : insight.tone === 'warning' ? 'warning' : insight.tone === 'danger' ? 'error' : insight.tone === 'info' ? 'info' : 'brand';
  return (
    <Surface tone={TONE_SURFACE[insight.tone]} elevation="none" padding={theme.spacing.md + 2} radius={theme.radius.lg} style={{ marginBottom: theme.spacing.sm + 2 }} accessible accessibilityLabel={`${insight.title}. ${insight.message}`} testID={testID}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: theme.colors.surface.primary }]}>
          <Ionicons name={insight.icon ?? TONE_ICON[insight.tone]} size={20} color={color} />
        </View>
        <View style={styles.body}>
          <AppText variant="bodyStrong" tone={textTone}>
            {TONE_MARK[insight.tone]} {insight.title}
          </AppText>
          <AppText variant="bodySmall" style={{ marginTop: 2 }}>
            {insight.message}
          </AppText>
          {insight.actionLabel && insight.onAction ? (
            <PressableScale accessibilityRole="button" accessibilityLabel={insight.actionLabel} onPress={insight.onAction} style={styles.action}>
              <AppText variant="bodySmallStrong" tone={textTone}>
                {insight.actionLabel}
              </AppText>
              <Ionicons name="chevron-forward" size={14} color={color} />
            </PressableScale>
          ) : null}
        </View>
      </View>
    </Surface>
  );
}
