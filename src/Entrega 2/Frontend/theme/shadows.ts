import type { ViewStyle } from 'react-native';

/**
 * Sombras neutras e discretas como `boxShadow` (React Native 0.76+, iOS/Android/web). O relevo vem
 * principalmente de bordas e contraste de fundo; sombra fica para o que flutua (folhas, menus).
 * Nunca use sombra colorida ("glow").
 */
export interface ThemeShadows {
  none: ViewStyle;
  sm: ViewStyle;
  md: ViewStyle;
  lg: ViewStyle;
}

export const lightShadows: ThemeShadows = {
  none: { boxShadow: 'none' },
  sm: { boxShadow: '0px 1px 2px rgba(17, 19, 21, 0.05)' },
  md: { boxShadow: '0px 2px 8px rgba(17, 19, 21, 0.06)' },
  lg: { boxShadow: '0px 12px 32px rgba(17, 19, 21, 0.12)' },
};

export const darkShadows: ThemeShadows = {
  none: { boxShadow: 'none' },
  sm: { boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.3)' },
  md: { boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.35)' },
  lg: { boxShadow: '0px 12px 32px rgba(0, 0, 0, 0.5)' },
};
