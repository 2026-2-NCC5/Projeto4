import type { SupportEventEnvelope, SupportEventFeed } from '../../contracts/mobileApi.v1.js';
import { ValidationError } from '../../errors/AppError.js';
import type { FeedAudience, FeedPosition, FeedRow, SupportFeedRepository } from './feedRepository.js';

export const MAX_WAIT_SECONDS = 25;
const PAGE_SIZE = 100;
const MAX_XID8 = 18446744073709551615n;
const MAX_BIGINT = 9223372036854775807n;

export function encodeFeedCursor(position: FeedPosition): string {
  return Buffer.from(`${position.txId}.${position.id}`, 'utf8').toString('base64url');
}

export function decodeFeedCursor(cursor: string): FeedPosition {
  const match = /^(\d{1,20})\.(\d{1,20})$/.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  // os limites de xid8 e bigint: fora deles o banco recusaria a comparação
  if (!match || BigInt(match[1]!) > MAX_XID8 || BigInt(match[2]!) > MAX_BIGINT) throw new ValidationError('Cursor de eventos inválido.', [{ field: 'since', message: 'cursor inválido' }]);
  return { txId: match[1]!, id: match[2]! };
}

/** O aluno nunca recebe o id de quem agiu; a equipe recebe. */
export function toEnvelope(row: FeedRow, audience: FeedAudience): SupportEventEnvelope {
  return {
    schemaVersion: '1.0',
    eventId: row.eventId,
    correlationId: audience.kind === 'staff' ? row.correlationId : null,
    ticketId: row.ticketId,
    sequence: row.sequence,
    type: row.type,
    occurredAt: row.occurredAt.toISOString(),
    actor: audience.kind === 'staff' ? { type: row.actorType, id: row.actorUserId } : { type: row.actorType },
    audience: row.audience,
    data: row.data,
  };
}

/** Compara ids de transação (decimais de até 20 dígitos, maiores que Number.MAX_SAFE_INTEGER). */
const txBefore = (a: string, b: string) => BigInt(a) < BigInt(b);

/**
 * Feed por cursor. A mesma chamada serve de reconciliação (sem espera) e de tempo real (long polling): funciona em
 * função serverless, no app e no navegador, sem conexão persistente. Como cada chamada passa pela autenticação, revogar
 * sessão ou papel corta o acesso na chamada seguinte, sem precisar derrubar sockets.
 */
export class SupportFeedService {
  constructor(
    private readonly repo: SupportFeedRepository,
    private readonly now: () => Date,
    private readonly options: { pollIntervalMs: number } = { pollIntervalMs: 1500 },
  ) {}

  /** Uma leitura: `nextCursor` só avança até onde há certeza de que nada ficou para trás. */
  private async once(audience: FeedAudience, after: FeedPosition): Promise<{ rows: FeedRow[]; next: FeedPosition; hasMore: boolean }> {
    // horizonte ANTES da leitura: tudo abaixo dele já terminou e estará visível na leitura seguinte
    const horizon = await this.repo.horizon();
    const rows = await this.repo.read({ audience, after, horizon, limit: PAGE_SIZE + 1 });
    const page = rows.slice(0, PAGE_SIZE);
    const hasMore = rows.length > PAGE_SIZE;
    const last = page[page.length - 1];
    if (hasMore && last) return { rows: page, next: { txId: last.txId, id: last.id }, hasMore };
    // sem mais linhas: pode avançar até o horizonte (nunca para trás)
    const floor = last ? { txId: last.txId, id: last.id } : after;
    return { rows: page, next: txBefore(floor.txId, horizon) ? { txId: horizon, id: '0' } : floor, hasMore };
  }

  async read(audience: FeedAudience, input: { since?: string | undefined; waitSeconds?: number | undefined; signal?: AbortSignal | undefined }): Promise<SupportEventFeed> {
    const serverTime = () => this.now().toISOString();
    // sem cursor: o cliente acabou de carregar os dados; os eventos passam a contar a partir de agora
    if (!input.since) {
      return { events: [], nextCursor: encodeFeedCursor({ txId: await this.repo.horizon(), id: '0' }), hasMore: false, resyncRequired: false, serverTime: serverTime() };
    }
    let position = decodeFeedCursor(input.since);
    const purged = await this.repo.purgedThroughTx();
    const resyncRequired = purged !== null && !txBefore(purged, position.txId);
    const waitMs = Math.max(0, Math.min(input.waitSeconds ?? 0, MAX_WAIT_SECONDS)) * 1000;
    const deadline = Date.now() + waitMs;
    for (;;) {
      const result = await this.once(audience, position);
      position = result.next;
      if (result.rows.length > 0 || Date.now() >= deadline || input.signal?.aborted) {
        return { events: result.rows.map((row) => toEnvelope(row, audience)), nextCursor: encodeFeedCursor(position), hasMore: result.hasMore, resyncRequired, serverTime: serverTime() };
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(this.options.pollIntervalMs, Math.max(deadline - Date.now(), 0))));
    }
  }
}
