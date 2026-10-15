import type { QueueAlertMilestone, QueueSubscription } from '../../../types/api';

export const MILESTONE_RANK: Record<QueueAlertMilestone, number> = {
  QUEUE_5_AHEAD: 1,
  QUEUE_3_AHEAD: 2,
  QUEUE_NEXT: 3,
  QUEUE_CALLED: 4,
};

export function milestoneRank(milestone: QueueAlertMilestone | null | undefined): number {
  return milestone ? MILESTONE_RANK[milestone] : 0;
}

export type QueueAlertKind = 'five_ahead' | 'three_ahead' | 'next' | 'called';

export const ALERT_KIND: Record<QueueAlertMilestone, QueueAlertKind> = {
  QUEUE_5_AHEAD: 'five_ahead',
  QUEUE_3_AHEAD: 'three_ahead',
  QUEUE_NEXT: 'next',
  QUEUE_CALLED: 'called',
};

/** Alerta interno a disparar (banner, vibração, voz ou o aviso de "É a sua vez!"). */
export interface QueueInAppAlert {
  kind: QueueAlertKind;
  milestone: QueueAlertMilestone;
  subscriptionId: string;
  ticket: string;
  ahead: number | null;
  /** só quando o painel informou */
  desk: string | null;
}

/**
 * Decide o alerta interno a partir do ESTADO (não de eventos): o marco do servidor é comparado com o
 * último marco já exibido neste aparelho. Funciona igual com SSE, polling, push ou app reaberto, e
 * nunca repete um alerta. Saltos exibem só o mais urgente.
 */
export function pickAlert(sub: QueueSubscription | null, handled: QueueAlertMilestone | null, now: number, maxCalledAgeMs: number): { alert: QueueInAppAlert | null; markHandled: QueueAlertMilestone | null } {
  if (!sub?.lastAlert || milestoneRank(sub.lastAlert) <= milestoneRank(handled)) return { alert: null, markHandled: null };
  const milestone = sub.lastAlert;
  if (milestone === 'QUEUE_CALLED') {
    const age = sub.calledAt ? now - Date.parse(sub.calledAt) : 0;
    // senha antiga (já chamada antes do cadastro) ou chamada há muito tempo: só atualiza a tela
    if (sub.alreadyCalled || age > maxCalledAgeMs) return { alert: null, markHandled: milestone };
  } else if (sub.status === 'called' || sub.status === 'completed') {
    return { alert: null, markHandled: milestone };
  }
  return {
    alert: { kind: ALERT_KIND[milestone], milestone, subscriptionId: sub.id, ticket: sub.ticket, ahead: sub.ahead, desk: sub.calledDesk },
    markHandled: milestone,
  };
}

/**
 * Marco inicial ao começar a acompanhar: o estudante está olhando a tela, então marcos de proximidade
 * já atingidos não viram alerta — só uma chamada recente (não antiga) é anunciada.
 */
export function baselineMilestone(sub: QueueSubscription): QueueAlertMilestone | null {
  if (sub.lastAlert === 'QUEUE_CALLED' && !sub.alreadyCalled) return 'QUEUE_NEXT';
  return sub.lastAlert;
}
