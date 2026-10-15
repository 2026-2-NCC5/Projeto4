import { useMemo } from 'react';
import { Easing, LinearTransition, ReduceMotion, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Vocabulário de movimento do Atendimento (Reanimated 4). Movimento comunica estado, progresso ou resposta —
 * nunca decoração: 150–320 ms, sem quicar, sem loops infinitos. "Reduzir movimento" (sistema ou preferência do
 * aluno) troca tudo por mudanças instantâneas.
 */
export const SUPPORT_MOTION = {
  duration: { fast: 150, normal: 220, slow: 320 },
  /** mola amortecida: chega sem rebote visível */
  spring: { damping: 18, stiffness: 180, mass: 1 },
  /** intervalo entre itens de uma lista que entram em sequência */
  stagger: 40,
  /** no máximo estes itens recebem atraso (listas longas não ficam esperando) */
  maxStaggered: 8,
  /** deslocamento de entrada de itens */
  offset: 8,
  pressedScale: 0.97,
} as const;

/** Desaceleração (ease-out) como bezier: na web as animações viram CSS e só aceitam curvas bezier/nomeadas. */
export const EASE_OUT = Easing.bezier(0.33, 1, 0.68, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

export interface SupportMotion {
  reduce: boolean;
  mode: ReduceMotion;
  timing: (duration?: number) => WithTimingConfig;
  spring: WithSpringConfig;
  /** atraso de entrada para o item `index` de uma lista */
  stagger: (index: number) => number;
  /** reacomodação de irmãos quando algo aparece/some/expande */
  layout: LinearTransition;
}

export function useSupportMotion(): SupportMotion {
  const reduce = useReducedMotion();
  return useMemo(() => {
    const mode = reduce ? ReduceMotion.Always : ReduceMotion.System;
    return {
      reduce,
      mode,
      timing: (duration: number = SUPPORT_MOTION.duration.normal) => ({ duration: reduce ? 0 : duration, easing: EASE_OUT, reduceMotion: mode }),
      spring: { ...SUPPORT_MOTION.spring, reduceMotion: mode },
      stagger: (index: number) => (reduce ? 0 : Math.min(index, SUPPORT_MOTION.maxStaggered) * SUPPORT_MOTION.stagger),
      layout: LinearTransition.duration(SUPPORT_MOTION.duration.normal).easing(EASE_OUT).reduceMotion(mode),
    };
  }, [reduce]);
}
