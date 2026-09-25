/** Escala de espaçamento (base 4). */
export const spacing = {
  none: 0,
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 40,
  xxxxxl: 48,
  /** Margem lateral padrão das telas. */
  screen: 20,
  /** Espaço reservado para a barra de navegação inferior flutuante. */
  navSpace: 124,
} as const;

/** Área mínima de toque recomendada (WCAG 2.5.5 / HIG). */
export const MIN_TOUCH_TARGET = 44;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
