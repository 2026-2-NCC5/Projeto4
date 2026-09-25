import React, { type PropsWithChildren } from 'react';
import { View, type ViewProps } from 'react-native';

import { makeStyles, useTheme } from '../../theme';

export type SurfaceTone = 'default' | 'secondary' | 'muted' | 'inverse' | 'brand' | 'accent' | 'success' | 'warning' | 'error' | 'info' | 'glass' | 'assistant';
export type SurfaceElevation = 'none' | 'sm' | 'md' | 'lg';

export interface SurfaceProps extends ViewProps {
  tone?: SurfaceTone;
  elevation?: SurfaceElevation;
  padding?: number;
  radius?: number;
  /** Sem borda (por padrão superfícies têm borda sutil para relevo no modo escuro). */
  borderless?: boolean;
}

const useStyles = makeStyles((theme) => ({
  base: { borderWidth: 1, overflow: 'hidden' },
}));

/** Superfície base dos cards: fundo semântico + borda sutil + sombra tematizada. */
export function Surface({ children, style, tone = 'default', elevation = 'sm', padding, radius, borderless = false, ...rest }: PropsWithChildren<SurfaceProps>) {
  const theme = useTheme();
  const styles = useStyles();
  const { colors } = theme;
  const tones: Record<SurfaceTone, { backgroundColor: string; borderColor: string }> = {
    default: { backgroundColor: colors.surface.primary, borderColor: colors.border.subtle },
    secondary: { backgroundColor: colors.surface.secondary, borderColor: colors.border.subtle },
    muted: { backgroundColor: colors.surface.muted, borderColor: colors.surface.muted },
    inverse: { backgroundColor: colors.background.inverse, borderColor: colors.background.inverse },
    brand: { backgroundColor: colors.brand.primarySoft, borderColor: colors.brand.primarySoft },
    accent: { backgroundColor: colors.brand.accentSoft, borderColor: colors.brand.accentSoft },
    success: { backgroundColor: colors.status.successSoft, borderColor: colors.status.successSoft },
    warning: { backgroundColor: colors.status.warningSoft, borderColor: colors.status.warningSoft },
    error: { backgroundColor: colors.status.errorSoft, borderColor: colors.status.errorSoft },
    info: { backgroundColor: colors.status.infoSoft, borderColor: colors.status.infoSoft },
    glass: { backgroundColor: colors.surface.glass, borderColor: colors.surface.glassBorder },
    assistant: { backgroundColor: colors.assistant.surface, borderColor: colors.assistant.surfaceElevated },
  };
  const shadow = elevation === 'none' ? theme.shadows.none : theme.shadows[elevation];
  return (
    <View
      {...rest}
      style={[
        styles.base,
        tones[tone],
        { borderRadius: radius ?? theme.radius.xl, padding: padding ?? theme.spacing.lg + 2 },
        borderless ? { borderWidth: 0 } : null,
        shadow,
        style,
      ]}
    >
      {children}
    </View>
  );
}
