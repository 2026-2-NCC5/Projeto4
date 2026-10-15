import { Easing, Platform } from 'react-native';

/**
 * Native driver só onde existe o módulo nativo de animação. Na web o Animated sempre roda em JS;
 * pedir o native driver lá só gera um warning no console.
 */
export const NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * Vocabulário de movimento. Microinterações ficam entre 150 e 250 ms, sem quicar: o movimento confirma
 * a ação e sai do caminho. `reduceMotion` (sistema ou preferência) troca durações por `motion.reduced`.
 */
export const motion = {
  duration: {
    instant: 100,
    fast: 150,
    base: 200,
    slow: 250,
    /** Transições de estado do orb do assistente. */
    slower: 400,
    reduced: 120,
  },
  easing: {
    standard: Easing.bezier(0.2, 0, 0, 1),
    decelerate: Easing.out(Easing.cubic),
    accelerate: Easing.in(Easing.cubic),
    gentle: Easing.inOut(Easing.sin),
    linear: Easing.linear,
  },
  spring: {
    /** Toques e cards (amortecido: sem rebote visível). */
    press: { friction: 9, tension: 320 },
    /** Aparição de overlays/sheets. */
    sheet: { friction: 11, tension: 110 },
  },
  scale: {
    pressed: 0.98,
    pressedStrong: 0.95,
  },
} as const;
