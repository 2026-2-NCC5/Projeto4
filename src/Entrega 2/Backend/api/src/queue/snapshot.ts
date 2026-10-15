import { sameTicket, ticketKey } from './ticket.js';
import { localDate } from './time.js';
import type { QueueCall, QueueSnapshot, QueueWaiting } from './types.js';

export interface BuildSnapshotInput {
  provider: string;
  calls: QueueCall[];
  upcoming: QueueWaiting[];
  upcomingComplete: boolean;
  callsTotal: number | null;
  now: Date;
  timeZone: string;
}

const timeOf = (call: QueueCall) => (call.calledAt ? Date.parse(call.calledAt) : Number.NEGATIVE_INFINITY);

/**
 * Normaliza o que a fonte devolveu em um snapshot do dia:
 * - descarta chamadas com horário de outro dia (senhas recomeçam a cada dia);
 * - ordena chamadas (mais recente primeiro) e próximas senhas (posição crescente);
 * - "PRÓXIMAS SENHAS" vazia NÃO significa fila encerrada: com chamadas no dia o status é "open".
 */
export function buildSnapshot(input: BuildSnapshotInput): QueueSnapshot {
  const today = localDate(input.now, input.timeZone);
  const calls = input.calls
    .filter((call) => !call.calledAt || localDate(new Date(call.calledAt), input.timeZone) === today)
    .map((call, index) => ({ call, index }))
    // sem horário: mantém a ordem da fonte (já vem da mais recente para a mais antiga)
    .sort((a, b) => timeOf(b.call) - timeOf(a.call) || a.index - b.index)
    .map(({ call }) => call);
  const upcoming = [...input.upcoming].sort((a, b) => a.position - b.position);
  const latest = calls.find((call) => call.calledAt);
  return {
    capturedAt: input.now.toISOString(),
    provider: input.provider,
    calls,
    upcoming,
    upcomingComplete: input.upcomingComplete,
    callsTotal: input.callsTotal,
    sourceUpdatedAt: latest?.calledAt ?? null,
    status: calls.length > 0 || upcoming.length > 0 ? 'open' : 'empty',
  };
}

export type TicketLocation =
  | { kind: 'called'; call: QueueCall }
  | { kind: 'waiting'; position: number; ahead: number }
  | { kind: 'not_found' };

/**
 * Onde está a senha no snapshot. A quantidade à frente vem da lista real de próximas senhas
 * (quantas aparecem antes dela), nunca da diferença entre números de senha.
 */
export function locateTicket(snapshot: QueueSnapshot, ticket: string): TicketLocation {
  const call = snapshot.calls.find((item) => sameTicket(item.ticket, ticket));
  if (call) return { kind: 'called', call };
  const index = snapshot.upcoming.findIndex((item) => sameTicket(item.ticket, ticket));
  const waiting = index >= 0 ? snapshot.upcoming[index] : undefined;
  if (waiting) return { kind: 'waiting', position: waiting.position, ahead: index };
  return { kind: 'not_found' };
}

/**
 * Última senha chamada em cada mesa (atendimentos simultâneos), da mais recente para a mais antiga.
 * Chamadas sem mesa só entram quando nenhuma chamada do snapshot informa mesa.
 */
export function currentCallsByDesk(snapshot: QueueSnapshot): QueueCall[] {
  const byDesk = new Map<string, QueueCall>();
  for (const call of snapshot.calls) {
    if (!call.desk) continue;
    if (!byDesk.has(call.desk)) byDesk.set(call.desk, call);
  }
  if (byDesk.size === 0) return snapshot.calls.slice(0, 1);
  return [...byDesk.values()];
}

export interface SnapshotChanges {
  /** chamadas que não existiam no snapshot anterior */
  newCalls: QueueCall[];
  /** senhas que entraram/saíram de "PRÓXIMAS SENHAS" */
  joinedUpcoming: string[];
  leftUpcoming: string[];
  /** true quando algo visível mudou */
  changed: boolean;
}

function callIdentity(call: QueueCall): string {
  return call.sourceId ?? `${ticketKey(call.ticket)}|${call.calledAt ?? ''}|${call.desk ?? ''}`;
}

/**
 * Diferenças entre dois snapshots. Usada para histórico e logs — os alertas NÃO dependem dela:
 * cada acompanhamento é reavaliado contra o snapshot atual (idempotente), então reconexões ou
 * snapshots repetidos não geram alertas duplicados.
 */
export function diffSnapshots(previous: QueueSnapshot | null, next: QueueSnapshot): SnapshotChanges {
  const before = new Set((previous?.calls ?? []).map(callIdentity));
  const newCalls = next.calls.filter((call) => !before.has(callIdentity(call)));
  const previousUpcoming = new Set((previous?.upcoming ?? []).map((item) => ticketKey(item.ticket)));
  const nextUpcoming = new Set(next.upcoming.map((item) => ticketKey(item.ticket)));
  const joinedUpcoming = next.upcoming.filter((item) => !previousUpcoming.has(ticketKey(item.ticket))).map((item) => item.ticket);
  const leftUpcoming = (previous?.upcoming ?? []).filter((item) => !nextUpcoming.has(ticketKey(item.ticket))).map((item) => item.ticket);
  const statusChanged = (previous?.calls ?? []).some((old) => {
    const current = next.calls.find((call) => callIdentity(call) === callIdentity(old));
    return current !== undefined && current.serviceStatus !== old.serviceStatus;
  });
  const positionsChanged =
    previous !== null &&
    next.upcoming.some((item) => previous.upcoming.find((old) => sameTicket(old.ticket, item.ticket))?.position !== item.position);
  return {
    newCalls,
    joinedUpcoming,
    leftUpcoming,
    changed: previous === null || newCalls.length > 0 || joinedUpcoming.length > 0 || leftUpcoming.length > 0 || statusChanged || positionsChanged || previous.status !== next.status,
  };
}
