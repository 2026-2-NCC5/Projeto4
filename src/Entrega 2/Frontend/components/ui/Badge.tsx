import React from 'react';
import { View } from 'react-native';

import { useTheme } from '../../theme';
import type { PillTone } from '../../types/ui';

import { AppText } from './AppText';

export type BadgeTone = PillTone | 'brand' | 'accent' | 'inverse';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Ícone textual (ex.: "⚠", "✓", "ⓘ") — status nunca é comunicado só por cor. */
  icon?: string;
  size?: 'small' | 'medium';
  accessibilityLabel?: string;
  testID?: string;
}

/** Etiqueta de status/categoria. Sucessor tematizado do `Pill`. */
export function Badge({ label, tone = 'neutral', icon, size = 'medium', accessibilityLabel, testID }: BadgeProps) {
  const theme = useTheme();
  const { colors } = theme;
  const palette: Record<BadgeTone, { background: string; color: string }> = {
    neutral: { background: colors.surface.muted, color: colors.text.secondary },
    success: { background: colors.status.successSoft, color: colors.status.successText },
    warning: { background: colors.status.warningSoft, color: colors.status.warningText },
    info: { background: colors.status.infoSoft, color: colors.status.infoText },
    danger: { background: colors.status.errorSoft, color: colors.status.errorText },
    brand: { background: colors.brand.primarySoft, color: colors.brand.primaryStrong },
    accent: { background: colors.brand.accentSoft, color: colors.brand.accent },
    inverse: { background: colors.surface.onInverse, color: colors.text.inverse },
  };
  const style = palette[tone];
  const text = icon ? `${icon} ${label}` : label;
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: size === 'small' ? theme.spacing.sm : theme.spacing.sm + 2,
        paddingVertical: size === 'small' ? 3 : theme.spacing.xs,
        borderRadius: theme.radius.pill,
        backgroundColor: style.background,
      }}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
    >
      <AppText variant={size === 'small' ? 'caption' : 'bodySmallStrong'} style={{ color: style.color, fontWeight: '700' }}>
        {text}
      </AppText>
    </View>
  );
}
