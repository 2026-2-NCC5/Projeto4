import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '../../theme';

export type AuroraVariant = 'hero' | 'subtle';

export interface AuroraBackgroundProps {
  /**
   * 'hero': gradiente radial completo (telas de autenticação) com 7 paradas roxo → verde → fundo.
   * 'subtle': brilho suave no topo das telas internas (mesma linguagem, sem competir com o conteúdo).
   */
  variant?: AuroraVariant;
  testID?: string;
}

/**
 * Fundo "aurora" desenhado em SVG (react-native-svg já é dependência do app): radial gradient
 * com as cores do logo ASA. Mesmo resultado em iOS, Android e web, sem Skia.
 * É absoluto e ignora toques — sempre renderize o conteúdo por cima.
 */
export function AuroraBackground({ variant = 'hero', testID = 'aurora-background' }: AuroraBackgroundProps) {
  const theme = useTheme();
  const { hero, subtle } = theme.colors.aurora;

  if (variant === 'subtle') {
    return (
      <View style={[styles.fill, { pointerEvents: 'none' }]} testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="aurora-subtle" cx="50" cy="0" r="70" gradientUnits="userSpaceOnUse">
              {subtle.map((color, index) => (
                <Stop key={`${color}-${index}`} offset={index / (subtle.length - 1)} stopColor={color} />
              ))}
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#aurora-subtle)" />
        </Svg>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: hero[hero.length - 1], pointerEvents: 'none' }]} testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="aurora-hero" cx="50" cy="18" r="78" gradientUnits="userSpaceOnUse">
            {hero.map((color, index) => (
              <Stop key={`${color}-${index}`} offset={index / (hero.length - 1)} stopColor={color} />
            ))}
          </RadialGradient>
          <RadialGradient id="aurora-glow-a" cx="18" cy="8" r="34" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={theme.colors.brand.accent} stopOpacity={theme.isDark ? 0.34 : 0.22} />
            <Stop offset="1" stopColor={theme.colors.brand.accent} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="aurora-glow-b" cx="84" cy="30" r="40" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={theme.colors.brand.primary} stopOpacity={theme.isDark ? 0.3 : 0.2} />
            <Stop offset="1" stopColor={theme.colors.brand.primary} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#aurora-hero)" />
        <Circle cx="18" cy="8" r="34" fill="url(#aurora-glow-a)" />
        <Ellipse cx="84" cy="30" rx="40" ry="34" fill="url(#aurora-glow-b)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
