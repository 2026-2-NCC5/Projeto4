import { motion } from './animations';
import { darkColors, lightColors, type ThemeColors } from './colors';
import { brandPalette } from './palette';
import { radius } from './radius';
import { darkShadows, lightShadows, type ThemeShadows } from './shadows';
import { hitSlop, MIN_TOUCH_TARGET, spacing } from './spacing';
import { typography } from './typography';

export type ColorScheme = 'light' | 'dark';

export interface Theme {
  scheme: ColorScheme;
  isDark: boolean;
  colors: ThemeColors;
  shadows: ThemeShadows;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  motion: typeof motion;
  palette: typeof brandPalette;
  minTouchTarget: number;
  hitSlop: typeof hitSlop;
}

/** Instâncias únicas por esquema — permitem cache de estilos por identidade (WeakMap). */
export const LIGHT_THEME: Theme = Object.freeze({
  scheme: 'light',
  isDark: false,
  colors: lightColors,
  shadows: lightShadows,
  spacing,
  radius,
  typography,
  motion,
  palette: brandPalette,
  minTouchTarget: MIN_TOUCH_TARGET,
  hitSlop,
});

export const DARK_THEME: Theme = Object.freeze({
  scheme: 'dark',
  isDark: true,
  colors: darkColors,
  shadows: darkShadows,
  spacing,
  radius,
  typography,
  motion,
  palette: brandPalette,
  minTouchTarget: MIN_TOUCH_TARGET,
  hitSlop,
});

export function themeForScheme(scheme: ColorScheme): Theme {
  return scheme === 'dark' ? DARK_THEME : LIGHT_THEME;
}
