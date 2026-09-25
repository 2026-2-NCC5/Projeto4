import React, { type PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '../../theme';

export interface GradientSurfaceProps {
  /** Paradas do gradiente (2+ cores). Padrão: verde ASA suave → branco → roxo suave (tema claro). */
  colors?: readonly string[];
  /** Brilho radial suave no canto superior direito (assistente). */
  glowColor?: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  testID?: string;
}

/**
 * Card com gradiente desenhado em SVG (sem dependência extra e com o mesmo resultado em iOS,
 * Android e web). O conteúdo é renderizado por cima.
 */
export function GradientSurface({ colors, glowColor, radius, style, padding, children, testID }: PropsWithChildren<GradientSurfaceProps>) {
  const theme = useTheme();
  const stops = colors ?? [theme.colors.brand.primarySoft, theme.colors.surface.primary, theme.colors.brand.accentSoft];
  const glow = glowColor ?? theme.colors.brand.primary;
  const r = radius ?? theme.radius.xxl;
  return (
    <View style={[styles.wrapper, { borderRadius: r, borderColor: theme.colors.border.subtle }, theme.shadows.md, style]} testID={testID}>
      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="gs-bg" x1="0" y1="0" x2="1" y2="1">
              {stops.map((color, index) => (
                <Stop key={`${color}-${index}`} offset={stops.length === 1 ? 0 : index / (stops.length - 1)} stopColor={color} stopOpacity="1" />
              ))}
            </LinearGradient>
            <RadialGradient id="gs-glow" cx="82" cy="18" r="46" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={glow} stopOpacity="0.55" />
              <Stop offset="0.6" stopColor={glow} stopOpacity="0.14" />
              <Stop offset="1" stopColor={glow} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#gs-bg)" />
          <Circle cx="82" cy="18" r="46" fill="url(#gs-glow)" />
        </Svg>
      </View>
      <View style={{ padding: padding ?? theme.spacing.xl }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { overflow: 'hidden', borderWidth: 1 },
});
