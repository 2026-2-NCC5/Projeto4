import { motion } from '../../theme';

/**
 * Tokens de movimento da fila (sobre o vocabulário do tema). Cada animação acontece UMA vez por
 * transição — nada de pisca-pisca, pulso infinito ou tremor; com "Reduzir movimento" vira só fade.
 */
export const queueMotion = {
  fast: motion.duration.fast,
  normal: 220,
  emphasized: 320,
  /** anel que se expande quando a senha é chamada */
  ring: 900,
  easing: motion.easing.standard,
  decelerate: motion.easing.decelerate,
  /** deslocamento curto da troca "4 pessoas → 3 pessoas" */
  countShift: 8,
  /** destaque único ao entrar em "chegando"/"prepare-se" */
  highlightFrom: { approaching: 0.98, next: 0.97 },
  /** entrada do aviso de chamada */
  modalFrom: 0.94,
} as const;
