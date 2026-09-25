import type { ViewStyle } from 'react-native';

/**
 * Sombras como `boxShadow` (React Native 0.76+, iOS/Android/web). Android recebe sombras mais
 * suaves (renderização por raster); no modo escuro as sombras são quase invisíveis, então o
 * relevo vem principalmente das bordas (`border.subtle`).
 */
export interface ThemeShadows {
  none: ViewStyle;
  sm: ViewStyle;
  md: ViewStyle;
  lg: ViewStyle;
  nav: ViewStyle;
  assistantGlow: ViewStyle;
  assistantGlowStrong: ViewStyle;
  button: ViewStyle;
}

export const lightShadows: ThemeShadows = {
  none: { boxShadow: 'none' },
  sm: { boxShadow: '0px 2px 8px rgba(6, 40, 30, 0.06)' },
  md: { boxShadow: '0px 6px 18px rgba(6, 40, 30, 0.08)' },
  lg: { boxShadow: '0px 18px 40px rgba(1, 31, 24, 0.14)' },
  nav: { boxShadow: '0px 10px 30px rgba(6, 40, 30, 0.14)' },
  assistantGlow: { boxShadow: '0px 8px 24px rgba(0, 171, 126, 0.32)' },
  assistantGlowStrong: { boxShadow: '0px 0px 42px rgba(0, 171, 126, 0.55)' },
  button: { boxShadow: '0px 8px 18px rgba(0, 143, 105, 0.24)' },
};

export const darkShadows: ThemeShadows = {
  none: { boxShadow: 'none' },
  sm: { boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.28)' },
  md: { boxShadow: '0px 6px 18px rgba(0, 0, 0, 0.34)' },
  lg: { boxShadow: '0px 18px 40px rgba(0, 0, 0, 0.45)' },
  nav: { boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.5)' },
  assistantGlow: { boxShadow: '0px 8px 24px rgba(43, 196, 150, 0.38)' },
  assistantGlowStrong: { boxShadow: '0px 0px 42px rgba(43, 196, 150, 0.6)' },
  button: { boxShadow: '0px 8px 18px rgba(0, 0, 0, 0.35)' },
};
