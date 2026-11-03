import type { DbPool } from '../../db/pool.js';
import { withTransaction } from '../../db/pool.js';
import type { SupportCanonicalEventType, SupportEventAudience, SupportEventEnvelope } from '../../contracts/mobileApi.v1.js';
import { currentCorrelationId } from './correlation.js';

/** Posição no log: (id da transação, id da linha). A ordem é a do commit, não a do bigserial. */
export interface FeedPosition {
  txId: string;
  id: string;
}

export interface FeedRow {
  id: string;
  eventId: string;
  txId: string;
  ticketId: string | null;
  sequence: number | null;
  type: SupportCanonicalEventType;
  audience: SupportEventAudience;
  actorType: string;
  actorUserId: string | null;
  correlationId: string | null;
  data: SupportEventEnvelope['data'];
  occurredAt: Date;
}

export type FeedAudience = { kind: 'student'; studentId: string } | { kind: 'staff' };

export interface SupportFeedRepository {
  /** Limite seguro de leitura: nenhuma transação abaixo dele pode mais gravar eventos. */
  horizon(): Promise<string>;
  /** Eventos depois de `after` e de transações já concluídas (`tx_id < horizon`). */
  read(input: { audience: FeedAudience; after: FeedPosition; horizon: string; limit: number }): Promise<FeedRow[]>;
  /** Até onde a retenção já apagou; cursor até aqui perdeu eventos. */
  purgedThroughTx(): Promise<string | null>;
  appendChannelEvent(input: { type: SupportCanonicalEventType; audience: SupportEventAudience; actorType: string; actorUserId: string | null; data: SupportEventEnvelope['data']; now: Date }): Promise<void>;
  purgeOlderThan(cutoff: Date): Promise<number>;
}

interface Row {
  id: string;
  event_id: string;
  tx_id: string;
  ticket_id: string | null;
  sequence: string | null;
  type: SupportCanonicalEventType;
  audience: SupportEventAudience;
  actor_type: string;
  actor_user_id: string | null;
  correlation_id: string | null;
  data: SupportEventEnvelope['data'];
  occurred_at: Date;
}

const COLUMNS = 'id::text as id, event_id, tx_id::text as tx_id, ticket_id, sequence::text as sequence, type, audience, actor_type, actor_user_id, correlation_id, data, occurred_at';

export class PgSupportFeedRepository implements SupportFeedRepository {
  constructor(private readonly pool: DbPool) {}

  async horizon(): Promise<string> {
    const { rows } = await this.pool.query<{ horizon: string }>('select pg_snapshot_xmin(pg_current_snapshot())::text as horizon');
    return rows[0]!.horizon;
  }

  async read(input: { audience: FeedAudience; after: FeedPosition; horizon: string; limit: number }): Promise<FeedRow[]> {
    const params: unknown[] = [input.after.txId, input.after.id, input.horizon, input.limit];
    let audienceSql: string;
    if (input.audience.kind === 'student') {
      // filtro na consulta: o feed do aluno nunca lê eventos internos nem de outro estudante
      params.push(input.audience.studentId);
      audienceSql = `student_id = $5 and audience = 'STUDENT_VISIBLE'`;
    } else {
      audienceSql = `audience in ('STUDENT_VISIBLE', 'STAFF_ONLY')`;
    }
    const { rows } = await this.pool.query<Row>(
      `select ${COLUMNS} from support_event_log
        where (tx_id, id) > ($1::xid8, $2::bigint) and tx_id < $3::xid8 and ${audienceSql}
        order by tx_id, id limit $4`,
      params,
    );
    return rows.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      txId: row.tx_id,
      ticketId: row.ticket_id,
      sequence: row.sequence === null ? null : Number(row.sequence),
      type: row.type,
      audience: row.audience,
      actorType: row.actor_type,
      actorUserId: row.actor_user_id,
      correlationId: row.correlation_id,
      data: row.data,
      occurredAt: row.occurred_at,
    }));
  }

  async purgedThroughTx(): Promise<string | null> {
    const { rows } = await this.pool.query<{ tx_id: string }>('select purged_through_tx::text as tx_id from support_event_log_state where id');
    return rows[0]?.tx_id ?? null;
  }

  async appendChannelEvent(input: { type: SupportCanonicalEventType; audience: SupportEventAudience; actorType: string; actorUserId: string | null; data: SupportEventEnvelope['data']; now: Date }): Promise<void> {
    await this.pool.query(
      `insert into support_event_log (type, audience, actor_type, actor_user_id, correlation_id, data, occurred_at) values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [input.type, input.audience, input.actorType, input.actorUserId, currentCorrelationId(), JSON.stringify(input.data), input.now],
    );
  }

  async purgeOlderThan(cutoff: Date): Promise<number> {
    return withTransaction(this.pool, async (client) => {
      const newest = await client.query<{ tx_id: string }>('select tx_id::text as tx_id from support_event_log where occurred_at < $1 order by tx_id desc limit 1', [cutoff]);
      const through = newest.rows[0]?.tx_id;
      if (!through) return 0;
      await client.query(
        `insert into support_event_log_state (id, purged_through_tx, updated_at) values (true, $1::xid8, now())
         on conflict (id) do update set purged_through_tx = case when excluded.purged_through_tx > support_event_log_state.purged_through_tx then excluded.purged_through_tx else support_event_log_state.purged_through_tx end, updated_at = now()`,
        [through],
      );
      const result = await client.query('delete from support_event_log where occurred_at < $1', [cutoff]);
      return result.rowCount ?? 0;
    });
  }
}
