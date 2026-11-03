import type { SupportMessageDeliveryState } from '../../contracts/mobileApi.v1.js';

const RANK: Record<SupportMessageDeliveryState, number> = { not_applicable: -1, queued: 0, sending: 1, unknown: 2, failed: 2, sent: 3, delivered: 4, read: 5 };

/**
 * Webhooks chegam fora de ordem e repetidos: o estado de entrega só avança. `read` é final; `failed` não desfaz
 * `delivered`/`read`; `unknown` aceita qualquer confirmação posterior (é a reconciliação); uma confirmação real do
 * provedor vale mesmo depois de uma falha. Voltar para `queued` só acontece na nova tentativa pedida pela equipe.
 */
export function canAdvanceDelivery(current: SupportMessageDeliveryState, next: SupportMessageDeliveryState): boolean {
  if (current === next || current === 'read' || current === 'not_applicable') return false;
  if (next === 'failed') return current !== 'delivered';
  if (current === 'failed' || current === 'unknown') return RANK[next] >= RANK.sent;
  return RANK[next] > RANK[current];
}

/**
 * Mudanças feitas pela própria fila, fora da confirmação do provedor. Nunca desfazem uma confirmação: depois de
 * `sent`, `delivered` ou `read`, só o provedor muda o estado (queda do worker ou erro de banco não apagam o que já se sabe).
 */
export function canForceDelivery(current: SupportMessageDeliveryState, next: SupportMessageDeliveryState): boolean {
  if (next === 'queued') return current === 'sending' || current === 'failed' || current === 'unknown';
  if (next === 'unknown') return current === 'queued' || current === 'sending';
  if (next === 'failed') return current === 'queued' || current === 'sending' || current === 'unknown';
  return false;
}

export const MAX_SEND_ATTEMPTS = 5;
export const CIRCUIT_FAILURE_THRESHOLD = 5;
export const CIRCUIT_OPEN_MS = 60_000;
/**
 * Envio em andamento há mais tempo que isto foi interrompido (queda do processo): o resultado é desconhecido.
 * Cada item é reservado sozinho, e o tempo limite do provedor (máximo de 60 s) cabe folgado aqui.
 */
export const SEND_LOCK_MS = 120_000;

/** Espera exponencial com variação aleatória (±20%), até 5 minutos. */
export function nextAttemptDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(5_000 * 2 ** Math.max(attempt - 1, 0), 300_000);
  return Math.round(base * (0.8 + random() * 0.4));
}
