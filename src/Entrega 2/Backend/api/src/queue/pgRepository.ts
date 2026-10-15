import type { DbPool } from '../db/pool.js';
import { withTransaction } from '../db/pool.js';
import type { CreateSubscriptionInput, EvaluationPatch, QueueMonitorStateRecord, QueueRepository } from './repository.js';
import type {
  QueueAlertMilestone,
  QueueCallHistoryRecord,
  QueuePreferences,
  QueueSnapshot,
  QueueSubscriptionRecord,
  QueueSubscriptionStatus,
  QueueTimelineEventRecord,
  QueueTimelineEventType,
} from './types.js';

const ACTIVE = `('waiting', 'approaching', 'next', 'called')`;

const COLUMNS = `id, user_id, ticket, ticket_key, to_char(service_date, 'YYYY-MM-DD') as service_date, status, position, ahead,
  called_desk, called_at, call_source_id, already_called, last_alert, push_enabled, voice_enabled, vibration_enabled,
  created_at, updated_at, expires_at, ended_at`;

interface SubscriptionRow {
  id: string;
  user_id: string;
  ticket: string;
  ticket_key: string;
  service_date: string;
  status: QueueSubscriptionStatus;
  position: number | null;
  ahead: number | null;
  called_desk: string | null;
  called_at: Date | null;
  call_source_id: string | null;
  already_called: boolean;
  last_alert: QueueAlertMilestone | null;
  push_enabled: boolean;
  voice_enabled: boolean;
  vibration_enabled: boolean;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
  ended_at: Date | null;
}

const mapSubscription = (row: SubscriptionRow): QueueSubscriptionRecord => ({
  id: row.id,
  userId: row.user_id,
  ticket: row.ticket,
  ticketKey: row.ticket_key,
  serviceDate: row.service_date,
  status: row.status,
  position: row.position,
  ahead: row.ahead,
  calledDesk: row.called_desk,
  calledAt: row.called_at,
  callSourceId: row.call_source_id,
  alreadyCalled: row.already_called,
  lastAlert: row.last_alert,
  pushEnabled: row.push_enabled,
  voiceEnabled: row.voice_enabled,
  vibrationEnabled: row.vibration_enabled,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  expiresAt: row.expires_at,
  endedAt: row.ended_at,
});

const PREFERENCE_COLUMNS: Record<keyof QueuePreferences, string> = {
  pushEnabled: 'push_enabled',
  voiceEnabled: 'voice_enabled',
  vibrationEnabled: 'vibration_enabled',
};

export class PgQueueRepository implements QueueRepository {
  constructor(private readonly pool: DbPool) {}

  async createSubscription(input: CreateSubscriptionInput) {
    return withTransaction(this.pool, async (client) => {
      const replaced = await client.query<SubscriptionRow>(
        `update queue_subscriptions set status = 'cancelled', ended_at = $2, updated_at = $2
          where user_id = $1 and status in ${ACTIVE} returning ${COLUMNS}`,
        [input.userId, input.now],
      );
      const { rows } = await client.query<SubscriptionRow>(
        `insert into queue_subscriptions (user_id, ticket, ticket_key, service_date, status, push_enabled, voice_enabled, vibration_enabled, created_at, updated_at, expires_at)
         values ($1, $2, $3, $4, 'waiting', $5, $6, $7, $8, $8, $9) returning ${COLUMNS}`,
        [input.userId, input.ticket, input.ticketKey, input.serviceDate, input.preferences.pushEnabled, input.preferences.voiceEnabled, input.preferences.vibrationEnabled, input.now, input.expiresAt],
      );
      return { subscription: mapSubscription(rows[0]!), replaced: replaced.rows[0] ? mapSubscription(replaced.rows[0]) : null };
    });
  }

  async findCurrent(userId: string, serviceDate: string) {
    const { rows } = await this.pool.query<SubscriptionRow>(
      `select ${COLUMNS} from queue_subscriptions
        where user_id = $1 and service_date = $2 and status <> 'cancelled'
        order by created_at desc limit 1`,
      [userId, serviceDate],
    );
    return rows[0] ? mapSubscription(rows[0]) : null;
  }

  async findById(id: string) {
    const { rows } = await this.pool.query<SubscriptionRow>(`select ${COLUMNS} from queue_subscriptions where id = $1`, [id]);
    return rows[0] ? mapSubscription(rows[0]) : null;
  }

  async listActive() {
    const { rows } = await this.pool.query<SubscriptionRow>(`select ${COLUMNS} from queue_subscriptions where status in ${ACTIVE} order by created_at`);
    return rows.map(mapSubscription);
  }

  async applyEvaluation(id: string, patch: EvaluationPatch) {
    await this.pool.query(
      `update queue_subscriptions
          set status = $2, position = $3, ahead = $4, called_desk = $5, called_at = $6, call_source_id = $7,
              already_called = $8, ended_at = $9, updated_at = $10
        where id = $1`,
      [id, patch.status, patch.position, patch.ahead, patch.calledDesk, patch.calledAt, patch.callSourceId, patch.alreadyCalled, patch.endedAt, patch.now],
    );
  }

  async advanceAlert(id: string, from: QueueAlertMilestone | null, to: QueueAlertMilestone, now: Date) {
    const result = await this.pool.query(
      'update queue_subscriptions set last_alert = $3, updated_at = $4 where id = $1 and last_alert is not distinct from $2',
      [id, from, to, now],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async updatePreferences(userId: string, serviceDate: string, preferences: Partial<QueuePreferences>, now: Date) {
    const entries = (Object.keys(PREFERENCE_COLUMNS) as Array<keyof QueuePreferences>).filter((key) => typeof preferences[key] === 'boolean');
    const current = await this.findCurrent(userId, serviceDate);
    if (!current) return null;
    if (entries.length === 0) return current;
    const sets = entries.map((key, index) => `${PREFERENCE_COLUMNS[key]} = $${index + 3}`).join(', ');
    const { rows } = await this.pool.query<SubscriptionRow>(
      `update queue_subscriptions set ${sets}, updated_at = $2 where id = $1 returning ${COLUMNS}`,
      [current.id, now, ...entries.map((key) => preferences[key])],
    );
    return rows[0] ? mapSubscription(rows[0]) : null;
  }

  async cancelActive(userId: string, now: Date) {
    const { rows } = await this.pool.query<SubscriptionRow>(
      `update queue_subscriptions set status = 'cancelled', ended_at = $2, updated_at = $2
        where user_id = $1 and status in ${ACTIVE} returning ${COLUMNS}`,
      [userId, now],
    );
    return rows[0] ? mapSubscription(rows[0]) : null;
  }

  async addTimelineEvent(event: QueueTimelineEventRecord) {
    const result = await this.pool.query(
      `insert into queue_subscription_events (subscription_id, event_type, ahead, desk, occurred_at)
       values ($1, $2, $3, $4, $5) on conflict (subscription_id, event_type) do nothing`,
      [event.subscriptionId, event.type, event.ahead, event.desk, event.occurredAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listTimeline(subscriptionId: string) {
    const { rows } = await this.pool.query<{ subscription_id: string; event_type: QueueTimelineEventType; ahead: number | null; desk: string | null; occurred_at: Date }>(
      'select subscription_id, event_type, ahead, desk, occurred_at from queue_subscription_events where subscription_id = $1 order by occurred_at, id',
      [subscriptionId],
    );
    return rows.map((row) => ({ subscriptionId: row.subscription_id, type: row.event_type, ahead: row.ahead, desk: row.desk, occurredAt: row.occurred_at }));
  }

  async recordCalls(calls: QueueCallHistoryRecord[]) {
    if (calls.length === 0) return 0;
    const values: unknown[] = [];
    const tuples = calls.map((call, index) => {
      values.push(call.callKey, call.serviceDate, call.ticket, call.desk, call.calledAt, call.observedAt);
      const base = index * 6;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
    });
    const result = await this.pool.query(
      `insert into queue_calls (call_key, service_date, ticket, desk, called_at, observed_at) values ${tuples.join(', ')} on conflict (call_key) do nothing`,
      values,
    );
    return result.rowCount ?? 0;
  }

  async saveState(state: QueueMonitorStateRecord) {
    await this.pool.query(
      `insert into queue_monitor_state (id, snapshot, last_success_at, last_error, consecutive_failures, updated_at)
       values (1, $1, $2, $3, $4, $5)
       on conflict (id) do update set snapshot = excluded.snapshot, last_success_at = excluded.last_success_at,
         last_error = excluded.last_error, consecutive_failures = excluded.consecutive_failures, updated_at = excluded.updated_at`,
      [state.snapshot ? JSON.stringify(state.snapshot) : null, state.lastSuccessAt, state.lastError, state.consecutiveFailures, state.updatedAt],
    );
  }

  async loadState() {
    const { rows } = await this.pool.query<{ snapshot: QueueSnapshot | null; last_success_at: Date | null; last_error: string | null; consecutive_failures: number; updated_at: Date }>(
      'select snapshot, last_success_at, last_error, consecutive_failures, updated_at from queue_monitor_state where id = 1',
    );
    const row = rows[0];
    if (!row) return null;
    return { snapshot: row.snapshot, lastSuccessAt: row.last_success_at, lastError: row.last_error, consecutiveFailures: row.consecutive_failures, updatedAt: row.updated_at };
  }
}
