import React, { type PropsWithChildren } from 'react';
import { View, type ViewProps } from 'react-native';

import { makeStyles, useTheme } from '../../theme';

export type SurfaceTone = 'default' | 'secondary' | 'muted' | 'brand' | 'success' | 'warning' | 'error' | 'info';
export type SurfaceElevation = 'none' | 'sm' | 'md' | 'lg';

export interface SurfaceProps extends ViewProps {
  tone?: SurfaceTone;
  /** Padrão: sem sombra (o relevo vem da borda). Use 'lg' só para o que flutua. */
  elevation?: SurfaceElevation;
  padding?: number;
  radius?: number;
  borderless?: boolean;
}

const useStyles = makeStyles(() => ({
  base: { borderWidth: 1, overflow: 'hidden' },
}));

/**
 * Card padrão: fundo branco, borda neutra, raio 12, padding 16, sem sombra. Use para agrupar
 * informações relacionadas; informação simples vive em listas e texto, não em cards próprios.
 */
export function Surface({ children, style, tone = 'default', elevation = 'none', padding, radius, borderless = false, ...rest }: PropsWithChildren<SurfaceProps>) {
  const theme = useTheme();
  const styles = useStyles();
  const { colors } = theme;
  const tones: Record<SurfaceTone, { backgroundColor: string; borderColor: string }> = {
    default: { backgroundColor: colors.surface.primary, borderColor: colors.border.default },
    secondary: { backgroundColor: colors.surface.secondary, borderColor: colors.border.subtle },
    muted: { backgroundColor: colors.surface.muted, borderColor: colors.surface.muted },
    brand: { backgroundColor: colors.brand.primarySoft, borderColor: colors.brand.primarySoft },
    success: { backgroundColor: colors.status.successSoft, borderColor: colors.status.successSoft },
    warning: { backgroundColor: colors.status.warningSoft, borderColor: colors.status.warningSoft },
    error: { backgroundColor: colors.status.errorSoft, borderColor: colors.status.errorSoft },
    info: { backgroundColor: colors.status.infoSoft, borderColor: colors.status.infoSoft },
  };
  return (
    <View
      {...rest}
      style={[
        styles.base,
        tones[tone],
        { borderRadius: radius ?? theme.radius.lg, padding: padding ?? theme.spacing.lg },
        borderless ? { borderWidth: 0 } : null,
        theme.shadows[elevation],
        style,
      ]}
    >
      {children}
    </View>
  );
}
