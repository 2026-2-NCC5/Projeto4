import { locateTicket } from './snapshot.js';
import { localDate } from './time.js';
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  MILESTONE_RANK,
  type QueueAlertMilestone,
  type QueueSnapshot,
  type QueueSubscriptionRecord,
  type QueueSubscriptionStatus,
} from './types.js';

/** Limiares dos alertas progressivos (senhas À FRENTE do estudante). */
export const AHEAD_THRESHOLDS = { five: 5, three: 3, next: 1 } as const;

export function milestoneForAhead(ahead: number): QueueAlertMilestone | null {
  if (ahead <= AHEAD_THRESHOLDS.next) return 'QUEUE_NEXT';
  if (ahead <= AHEAD_THRESHOLDS.three) return 'QUEUE_3_AHEAD';
  if (ahead <= AHEAD_THRESHOLDS.five) return 'QUEUE_5_AHEAD';
  return null;
}

export function statusForAhead(ahead: number): Extract<QueueSubscriptionStatus, 'waiting' | 'approaching' | 'next'> {
  if (ahead <= AHEAD_THRESHOLDS.next) return 'next';
  if (ahead <= AHEAD_THRESHOLDS.five) return 'approaching';
  return 'waiting';
}

/** true quando `candidate` é mais urgente que o último alerta já disparado. */
export function isNewerMilestone(candidate: QueueAlertMilestone | null, last: QueueAlertMilestone | null): candidate is QueueAlertMilestone {
  if (!candidate) return false;
  return MILESTONE_RANK[candidate] > (last ? MILESTONE_RANK[last] : 0);
}

export interface EvaluationOptions {
  now: Date;
  timeZone: string;
  /** tempo mínimo em "chamada" antes de exibir "atendimento concluído" (a fonte conclui senhas em segundos) */
  completionGraceMs?: number;
  /** chamada anterior ao cadastro (com esta tolerância) = senha antiga: sem alerta de "é a sua vez" */
  alreadyCalledGraceMs?: number;
}

export interface Evaluation {
  status: QueueSubscriptionStatus;
  position: number | null;
  ahead: number | null;
  /** a posição veio do snapshot atual (false = última conhecida ou desconhecida) */
  positionKnown: boolean;
  calledDesk: string | null;
  calledAt: Date | null;
  callSourceId: string | null;
  alreadyCalled: boolean;
  /** marco mais urgente atingido agora (o tracker decide se ele é novo) */
  milestone: QueueAlertMilestone | null;
}

/**
 * Avalia um acompanhamento contra o snapshot atual. Função pura e idempotente: o mesmo snapshot
 * produz sempre o mesmo resultado, então repetições e reconexões não geram eventos novos.
 */
export function evaluateSubscription(sub: QueueSubscriptionRecord, snapshot: QueueSnapshot | null, options: EvaluationOptions): Evaluation {
  const base: Evaluation = {
    status: sub.status,
    position: sub.position,
    ahead: sub.ahead,
    positionKnown: false,
    calledDesk: sub.calledDesk,
    calledAt: sub.calledAt,
    callSourceId: sub.callSourceId,
    alreadyCalled: sub.alreadyCalled,
    milestone: null,
  };
  if (!ACTIVE_SUBSCRIPTION_STATUSES.includes(sub.status)) return base;
  if (sub.serviceDate < localDate(options.now, options.timeZone)) return { ...base, status: 'expired' };
  if (!snapshot) return base;

  const location = locateTicket(snapshot, sub.ticket);
  if (location.kind === 'called') {
    const { call } = location;
    const calledAt = call.calledAt ? new Date(call.calledAt) : (sub.calledAt ?? options.now);
    const graceMs = options.alreadyCalledGraceMs ?? 2 * 60_000;
    const alreadyCalled = sub.status === 'called' ? sub.alreadyCalled : Boolean(call.calledAt) && calledAt.getTime() < sub.createdAt.getTime() - graceMs;
    const calledSince = sub.status === 'called' && sub.calledAt ? sub.calledAt : null;
    const completed =
      call.serviceStatus === 'completed' &&
      calledSince !== null &&
      options.now.getTime() - calledSince.getTime() >= (options.completionGraceMs ?? 2 * 60_000);
    return {
      ...base,
      status: completed ? 'completed' : 'called',
      calledDesk: call.desk,
      calledAt,
      callSourceId: call.sourceId,
      alreadyCalled,
      milestone: 'QUEUE_CALLED',
    };
  }
  if (location.kind === 'waiting') {
    // uma senha já chamada que reaparece na lista continua "chamada"
    if (sub.status === 'called') return base;
    return {
      ...base,
      status: statusForAhead(location.ahead),
      position: location.position,
      ahead: location.ahead,
      positionKnown: true,
      milestone: milestoneForAhead(location.ahead),
    };
  }
  // Fora das listas: mantém o último estado conhecido (sem regredir nem inventar posição).
  return base;
}
