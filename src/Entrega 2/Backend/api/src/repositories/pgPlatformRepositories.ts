import type { NotificationCategory, UserRole } from '../contracts/mobileApi.v1.js';
import type { DbPool } from '../db/pool.js';
import type {
  AuditEventRecord,
  AuditQuery,
  AuditRepository,
  InboxRepository,
  NewAuditEvent,
  NewUserNotification,
  SettingRecord,
  SettingsRepository,
  UserNotificationRecord,
} from '../platform/types.js';

// ---------------------------------------------------------------- auditoria

interface AuditRow {
  id: string;
  seq: number;
  occurred_at: Date;
  actor_user_id: string | null;
  actor_role: UserRole | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  outcome: AuditEventRecord['outcome'];
  channel: AuditEventRecord['channel'];
  ip_hash: string | null;
  request_id: string | null;
  correlation_id: string | null;
  metadata: AuditEventRecord['metadata'];
  total?: number;
}

const mapAudit = (row: AuditRow): AuditEventRecord => ({
  id: row.id,
  seq: row.seq,
  occurredAt: row.occurred_at,
  actorUserId: row.actor_user_id,
  actorRole: row.actor_role,
  action: row.action,
  resourceType: row.resource_type,
  resourceId: row.resource_id,
  outcome: row.outcome,
  channel: row.channel,
  ipHash: row.ip_hash,
  requestId: row.request_id,
  correlationId: row.correlation_id,
  metadata: row.metadata ?? {},
});

class PgAuditRepository implements AuditRepository {
  constructor(private readonly pool: DbPool) {}

  async insert(event: NewAuditEvent): Promise<void> {
    await this.pool.query(
      `insert into audit_events (occurred_at, actor_user_id, actor_role, action, resource_type, resource_id, outcome, channel, ip_hash, request_id, correlation_id, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
      [
        event.occurredAt,
        event.actorUserId,
        event.actorRole,
        event.action,
        event.resourceType,
        event.resourceId,
        event.outcome,
        event.channel,
        event.ipHash,
        event.requestId,
        event.correlationId,
        JSON.stringify(event.metadata),
      ],
    );
  }

  async list(query: AuditQuery): Promise<{ items: AuditEventRecord[]; total: number }> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (query.actorUserId) add('actor_user_id = ?', query.actorUserId);
    if (query.actionPrefix) add("action like ? || '%'", query.actionPrefix);
    if (query.resourceType) add('resource_type = ?', query.resourceType);
    if (query.resourceId) add('resource_id = ?', query.resourceId);
    if (query.outcome) add('outcome = ?', query.outcome);
    if (query.from) add('occurred_at >= ?', query.from);
    if (query.to) add('occurred_at < ?', query.to);
    const clause = where.length > 0 ? `where ${where.join(' and ')}` : '';
    params.push(query.limit, query.offset);
    const { rows } = await this.pool.query<AuditRow>(
      `select *, count(*) over ()::int as total from audit_events ${clause}
        order by occurred_at desc, seq desc limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    let total = rows[0]?.total ?? 0;
    if (rows.length === 0 && query.offset > 0) {
      total = (await this.pool.query<{ total: number }>(`select count(*)::int as total from audit_events ${clause}`, params.slice(0, -2))).rows[0]?.total ?? 0;
    }
    return { items: rows.map(mapAudit), total };
  }
}

// ------------------------------------------------------------ configurações

class PgSettingsRepository implements SettingsRepository {
  constructor(private readonly pool: DbPool) {}

  async getAll(): Promise<SettingRecord[]> {
    const { rows } = await this.pool.query<{ key: string; value: unknown; updated_by: string | null; updated_at: Date }>(
      'select key, value, updated_by, updated_at from platform_settings order by key',
    );
    return rows.map((row) => ({ key: row.key, value: row.value, updatedBy: row.updated_by, updatedAt: row.updated_at }));
  }

  async upsert(input: { key: string; value: unknown; updatedBy: string | null; now: Date }): Promise<SettingRecord> {
    const { rows } = await this.pool.query<{ key: string; value: unknown; updated_by: string | null; updated_at: Date }>(
      `insert into platform_settings (key, value, updated_by, updated_at) values ($1, $2::jsonb, $3, $4)
       on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at
       returning key, value, updated_by, updated_at`,
      [input.key, JSON.stringify(input.value), input.updatedBy, input.now],
    );
    const row = rows[0]!;
    return { key: row.key, value: row.value, updatedBy: row.updated_by, updatedAt: row.updated_at };
  }
}

// ------------------------------------------------------- central de avisos

interface NotificationRow {
  id: string;
  user_id: string;
  category: NotificationCategory;
  kind: string;
  title: string;
  body: string;
  resource_type: UserNotificationRecord['resourceType'];
  resource_id: string | null;
  dedupe_key: string | null;
  created_at: Date;
  read_at: Date | null;
}

const mapNotification = (row: NotificationRow): UserNotificationRecord => ({
  id: row.id,
  userId: row.user_id,
  category: row.category,
  kind: row.kind,
  title: row.title,
  body: row.body,
  resourceType: row.resource_type,
  resourceId: row.resource_id,
  dedupeKey: row.dedupe_key,
  createdAt: row.created_at,
  readAt: row.read_at,
});

class PgInboxRepository implements InboxRepository {
  constructor(private readonly pool: DbPool) {}

  async createMany(inputs: NewUserNotification[]): Promise<number> {
    if (inputs.length === 0) return 0;
    const values: string[] = [];
    const params: unknown[] = [];
    for (const input of inputs) {
      const base = params.length;
      params.push(input.userId, input.category, input.kind, input.title, input.body, input.resourceType ?? null, input.resourceId ?? null, input.dedupeKey ?? null, input.now);
      values.push(`(${Array.from({ length: 9 }, (_, index) => `$${base + index + 1}`).join(', ')})`);
    }
    const result = await this.pool.query(
      `insert into user_notifications (user_id, category, kind, title, body, resource_type, resource_id, dedupe_key, created_at)
       values ${values.join(', ')}
       on conflict (user_id, dedupe_key) do nothing`,
      params,
    );
    return result.rowCount ?? 0;
  }

  async list(userId: string, limit: number): Promise<UserNotificationRecord[]> {
    const { rows } = await this.pool.query<NotificationRow>(
      'select * from user_notifications where user_id = $1 order by created_at desc, id desc limit $2',
      [userId, limit],
    );
    return rows.map(mapNotification);
  }

  async countUnread(userId: string): Promise<number> {
    const { rows } = await this.pool.query<{ total: number }>('select count(*)::int as total from user_notifications where user_id = $1 and read_at is null', [userId]);
    return rows[0]?.total ?? 0;
  }

  async markRead(userId: string, ids: string[] | null, now: Date): Promise<number> {
    const result = ids
      ? await this.pool.query('update user_notifications set read_at = $3 where user_id = $1 and id = any($2::uuid[]) and read_at is null', [userId, ids, now])
      : await this.pool.query('update user_notifications set read_at = $2 where user_id = $1 and read_at is null', [userId, now]);
    return result.rowCount ?? 0;
  }

  async getPreferences(userId: string): Promise<Array<{ category: NotificationCategory; pushEnabled: boolean }>> {
    const { rows } = await this.pool.query<{ category: NotificationCategory; push_enabled: boolean }>(
      'select category, push_enabled from notification_preferences where user_id = $1',
      [userId],
    );
    return rows.map((row) => ({ category: row.category, pushEnabled: row.push_enabled }));
  }

  async setPreferences(userId: string, items: Array<{ category: NotificationCategory; pushEnabled: boolean }>, now: Date): Promise<void> {
    for (const item of items) {
      await this.pool.query(
        `insert into notification_preferences (user_id, category, push_enabled, updated_at) values ($1, $2, $3, $4)
         on conflict (user_id, category) do update set push_enabled = excluded.push_enabled, updated_at = excluded.updated_at`,
        [userId, item.category, item.pushEnabled, now],
      );
    }
  }
}

export function createPgPlatformRepositories(pool: DbPool): { audit: AuditRepository; settings: SettingsRepository; inbox: InboxRepository } {
  return { audit: new PgAuditRepository(pool), settings: new PgSettingsRepository(pool), inbox: new PgInboxRepository(pool) };
}
