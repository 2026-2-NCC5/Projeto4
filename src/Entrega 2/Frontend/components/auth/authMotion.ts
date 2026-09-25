import { useMemo } from 'react';
import { Easing, FadeIn, FadeInDown, FadeInUp, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useTheme } from '../../theme';

/** Intervalo entre blocos da cascata de entrada (logo → título → formulário → rodapé). */
const STAGGER_MS = 70;

/**
 * Vocabulário de movimento das telas de autenticação (Reanimated 4, animações de layout).
 * Respeita "Reduzir movimento" do sistema (ReduceMotion.System) e a preferência do aluno
 * ("Sempre" → ReduceMotion.Always: o estado final é aplicado sem animar).
 */
export function useAuthMotion() {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const { duration } = theme.motion;

  return useMemo(() => {
    const mode = reduce ? ReduceMotion.Always : ReduceMotion.System;
    // Mesma curva de Easing.out(Easing.cubic), mas como bezier: na web as animações de layout viram CSS
    // e só aceitam curvas nomeadas ou Easing.bezier (as demais caem para linear com warning).
    const decelerate = Easing.bezier(0.33, 1, 0.68, 1);
    return {
      /** true quando o sistema ou o aluno pediram menos movimento (para animações imperativas). */
      reduce,
      /** Bloco que desce suavemente até a posição (hero, cards). */
      enter: (order = 0) => FadeInDown.duration(duration.slow).delay(order * STAGGER_MS).easing(decelerate).reduceMotion(mode),
      /** Bloco que sobe até a posição (etapas de formulário, banners). */
      rise: (order = 0) => FadeInUp.duration(duration.base).delay(order * STAGGER_MS).easing(decelerate).reduceMotion(mode),
      /** Apenas opacidade (rodapés, textos legais). */
      fade: (order = 0) => FadeIn.duration(duration.base).delay(order * STAGGER_MS).reduceMotion(mode),
      /** Reacomodação de irmãos quando um bloco aparece/some. */
      layout: LinearTransition.duration(duration.base).easing(decelerate).reduceMotion(mode),
    };
  }, [reduce, duration]);
}

export type AuthMotion = ReturnType<typeof useAuthMotion>;
