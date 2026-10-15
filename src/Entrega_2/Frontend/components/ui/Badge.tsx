import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import type { PillTone } from '../../types/ui';

import { AppText } from './AppText';

export type BadgeTone = PillTone | 'brand';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Os utilitários de formatação descrevem o status com um glifo ("⚠", "✓", "ⓘ"...). Na tela ele vira um
 * ícone vetorial: o status nunca depende só da cor e não aparece como emoji.
 */
const GLYPH_ICONS: Record<string, IconName> = {
  '⚠': 'alert-circle-outline',
  'ⓘ': 'information-circle-outline',
  '✓': 'checkmark-circle-outline',
  '◷': 'time-outline',
  '?': 'help-circle-outline',
  '⊘': 'remove-circle-outline',
  '✦': 'sparkles-outline',
};

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Glifo de status vindo dos utilitários de formatação (ex.: "⚠", "✓", "ⓘ"). */
  icon?: string;
  accessibilityLabel?: string;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs, paddingHorizontal: theme.spacing.sm, paddingVertical: 2, borderRadius: theme.radius.sm },
}));

/** Etiqueta compacta de status/categoria: fundo suave do tom, ícone e texto. */
export function Badge({ label, tone = 'neutral', icon, accessibilityLabel, testID }: BadgeProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { colors } = theme;
  const palette: Record<BadgeTone, { background: string; color: string }> = {
    neutral: { background: colors.surface.muted, color: colors.text.secondary },
    success: { background: colors.status.successSoft, color: colors.status.successText },
    warning: { background: colors.status.warningSoft, color: colors.status.warningText },
    info: { background: colors.status.infoSoft, color: colors.status.infoText },
    danger: { background: colors.status.errorSoft, color: colors.status.errorText },
    brand: { background: colors.brand.primarySoft, color: colors.brand.primaryStrong },
  };
  const style = palette[tone];
  const iconName = icon ? GLYPH_ICONS[icon] : undefined;
  return (
    <View style={[styles.badge, { backgroundColor: style.background }]} accessible accessibilityRole="text" accessibilityLabel={accessibilityLabel ?? label} testID={testID}>
      {iconName ? <Ionicons name={iconName} size={13} color={style.color} /> : null}
      <AppText variant="caption" style={{ color: style.color, fontWeight: '500' }}>
        {label}
      </AppText>
    </View>
  );
}
