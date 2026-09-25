import { Easing, Platform } from 'react-native';

/**
 * Native driver só onde existe o módulo nativo de animação. Na web o Animated sempre roda em JS;
 * pedir o native driver lá só gera um warning no console.
 */
export const NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * Vocabulário de movimento. Toda microinteração usa estas durações/curvas para o app parecer um só.
 * `reduceMotion` (sistema ou preferência) troca durações por `motion.reduced`.
 */
export const motion = {
  duration: {
    instant: 90,
    fast: 160,
    base: 240,
    slow: 420,
    slower: 640,
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
    /** Toques e cards. */
    press: { friction: 6, tension: 220 },
    /** Aparição de overlays/sheets. */
    sheet: { friction: 9, tension: 90 },
    /** Ativação do assistente ("Hey Asa"). */
    activation: { friction: 5, tension: 160 },
  },
  scale: {
    pressed: 0.97,
    pressedStrong: 0.94,
  },
} as const;
