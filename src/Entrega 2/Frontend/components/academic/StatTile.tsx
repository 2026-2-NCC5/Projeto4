import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { PressableScale } from '../ui/PressableScale';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface StatTileProps {
  label: string;
  value: string;
  detail?: string;
  icon?: IconName;
  tone?: 'default' | 'attention' | 'danger' | 'success';
  onPress?: () => void;
  accessibilityHint?: string;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  tile: { flexGrow: 1, flexBasis: 100, minWidth: 96, backgroundColor: theme.colors.surface.primary, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border.subtle, padding: theme.spacing.md + 2, ...theme.shadows.sm },
  attention: { backgroundColor: theme.colors.status.warningSoft, borderColor: theme.colors.status.warning },
  danger: { backgroundColor: theme.colors.status.errorSoft, borderColor: theme.colors.status.error },
  success: { backgroundColor: theme.colors.status.successSoft, borderColor: theme.colors.status.success },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
}));

/** Métrica do resumo acadêmico (Frequência · Média · Pendências). Tom comunicado também por ícone/texto. */
export function StatTile({ label, value, detail, icon, tone = 'default', onPress, accessibilityHint, testID }: StatTileProps) {
  const theme = useTheme();
  const styles = useStyles();
  const toneText = tone === 'attention' ? 'warning' : tone === 'danger' ? 'error' : tone === 'success' ? 'success' : 'primary';
  const iconColor = tone === 'attention' ? theme.colors.status.warningText : tone === 'danger' ? theme.colors.status.errorText : tone === 'success' ? theme.colors.status.successText : theme.colors.brand.primaryStrong;
  const marker = tone === 'attention' ? '⚠ ' : tone === 'danger' ? '⚠ ' : '';
  const label2 = `${marker}${label}`;
  const content = (
    <>
      <View style={styles.header}>
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {label2}
        </AppText>
        {icon ? <Ionicons name={icon} size={16} color={iconColor} /> : null}
      </View>
      <AppText variant="metric" tone={toneText} style={{ marginTop: 6 }}>
        {value}
      </AppText>
      {detail ? (
        <AppText variant="caption" tone="muted" style={{ marginTop: 2, fontWeight: '400' }} numberOfLines={1}>
          {detail}
        </AppText>
      ) : null}
    </>
  );
  const a11y = `${label}: ${value}${detail ? `, ${detail}` : ''}${tone === 'attention' || tone === 'danger' ? ', requer atenção' : ''}`;
  const toneStyle = tone === 'attention' ? styles.attention : tone === 'danger' ? styles.danger : tone === 'success' ? styles.success : null;
  if (onPress) {
    return (
      <PressableScale accessibilityRole="button" accessibilityLabel={a11y} accessibilityHint={accessibilityHint} onPress={onPress} style={[styles.tile, toneStyle]} testID={testID}>
        {content}
      </PressableScale>
    );
  }
  return (
    <View style={[styles.tile, toneStyle]} accessible accessibilityLabel={a11y} testID={testID}>
      {content}
    </View>
  );
}
