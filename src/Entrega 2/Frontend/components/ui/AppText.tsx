import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme, type Theme, type TypographyVariant } from '../../theme';

export type TextTone =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'inverse'
  | 'inverseMuted'
  | 'brand'
  | 'accent'
  | 'link'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'onPrimary';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
  uppercase?: boolean;
}

export function toneColor(theme: Theme, tone: TextTone): string {
  const { colors } = theme;
  switch (tone) {
    case 'secondary':
      return colors.text.secondary;
    case 'muted':
      return colors.text.muted;
    case 'inverse':
      return colors.text.inverse;
    case 'inverseMuted':
      return colors.text.inverseMuted;
    case 'brand':
      return colors.brand.primaryStrong;
    case 'accent':
      return colors.brand.accent;
    case 'link':
      return colors.text.link;
    case 'success':
      return colors.status.successText;
    case 'warning':
      return colors.status.warningText;
    case 'error':
      return colors.status.errorText;
    case 'info':
      return colors.status.infoText;
    case 'onPrimary':
      return colors.text.onPrimary;
    default:
      return colors.text.primary;
  }
}

/** Texto tematizado com a hierarquia tipográfica do design system. */
export function AppText({ variant = 'body', tone = 'primary', align, uppercase = false, style, children, ...rest }: AppTextProps) {
  const theme = useTheme();
  const base = theme.typography[variant];
  return (
    <Text
      {...rest}
      style={[
        { fontSize: base.fontSize, lineHeight: base.lineHeight, fontWeight: base.fontWeight, letterSpacing: 'letterSpacing' in base ? base.letterSpacing : undefined, color: toneColor(theme, tone) },
        align ? { textAlign: align } : null,
        uppercase ? { textTransform: 'uppercase' } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}
