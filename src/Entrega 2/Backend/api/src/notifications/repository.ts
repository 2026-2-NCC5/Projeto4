import { randomUUID } from 'node:crypto';
import type { DbPool } from '../db/pool.js';
import type { DeliveryStatus, PushDeviceRecord, PushPlatform } from './types.js';

export interface PushDeviceRepository {
  /** Registra (ou reativa) o token; se ele pertencia a outro usuário no mesmo aparelho, passa a ser do atual. */
  upsert(input: { userId: string; token: string; platform: PushPlatform; now: Date }): Promise<PushDeviceRecord>;
  listActiveByUser(userId: string): Promise<PushDeviceRecord[]>;
  disable(token: string, reason: string, now: Date): Promise<void>;
  /** Remove o token do usuário (logout/desativação no app); false se não era dele. */
  disableForUser(userId: string, token: string, now: Date): Promise<boolean>;
}

export interface DeliveryRepository {
  /** Reserva a chave de idempotência; false quando a notificação já foi registrada antes. */
  begin(input: { userId: string; idempotencyKey: string; category: string; now: Date }): Promise<boolean>;
  finish(idempotencyKey: string, result: { status: DeliveryStatus; attempts: number; devices: number; ticketIds: string[]; error: string | null; now: Date }): Promise<void>;
}

export class MemoryPushDeviceRepository implements PushDeviceRepository {
  readonly devices: PushDeviceRecord[] = [];

  async upsert(input: { userId: string; token: string; platform: PushPlatform; now: Date }) {
    let device = this.devices.find((item) => item.token === input.token);
    if (!device) {
      device = { id: randomUUID(), userId: input.userId, token: input.token, platform: input.platform, createdAt: input.now, lastSeenAt: input.now, disabledAt: null, disabledReason: null };
      this.devices.push(device);
    } else {
      Object.assign(device, { userId: input.userId, platform: input.platform, lastSeenAt: input.now, disabledAt: null, disabledReason: null });
    }
    return { ...device };
  }

  async listActiveByUser(userId: string) {
    return this.devices.filter((item) => item.userId === userId && !item.disabledAt).map((item) => ({ ...item }));
  }

  async disable(token: string, reason: string, now: Date) {
    const device = this.devices.find((item) => item.token === token);
    if (device) Object.assign(device, { disabledAt: now, disabledReason: reason });
  }

  async disableForUser(userId: string, token: string, now: Date) {
    const device = this.devices.find((item) => item.token === token && item.userId === userId && !item.disabledAt);
    if (!device) return false;
    Object.assign(device, { disabledAt: now, disabledReason: 'unregistered_by_user' });
    return true;
  }
}

export class MemoryDeliveryRepository implements DeliveryRepository {
  readonly deliveries = new Map<string, { userId: string; category: string; status: DeliveryStatus; attempts: number; devices: number; ticketIds: string[]; error: string | null }>();

  async begin(input: { userId: string; idempotencyKey: string; category: string; now: Date }) {
    if (this.deliveries.has(input.idempotencyKey)) return false;
    this.deliveries.set(input.idempotencyKey, { userId: input.userId, category: input.category, status: 'pending', attempts: 0, devices: 0, ticketIds: [], error: null });
    return true;
  }

  async finish(idempotencyKey: string, result: { status: DeliveryStatus; attempts: number; devices: number; ticketIds: string[]; error: string | null }) {
    const current = this.deliveries.get(idempotencyKey);
    if (current) Object.assign(current, { status: result.status, attempts: result.attempts, devices: result.devices, ticketIds: result.ticketIds, error: result.error });
  }
}

interface DeviceRow {
  id: string;
  user_id: string;
  token: string;
  platform: PushPlatform;
  created_at: Date;
  last_seen_at: Date;
  disabled_at: Date | null;
  disabled_reason: string | null;
}

const mapDevice = (row: DeviceRow): PushDeviceRecord => ({
  id: row.id,
  userId: row.user_id,
  token: row.token,
  platform: row.platform,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
  disabledAt: row.disabled_at,
  disabledReason: row.disabled_reason,
});

const DEVICE_COLUMNS = 'id, user_id, token, platform, created_at, last_seen_at, disabled_at, disabled_reason';

export class PgPushDeviceRepository implements PushDeviceRepository {
  constructor(private readonly pool: DbPool) {}

  async upsert(input: { userId: string; token: string; platform: PushPlatform; now: Date }) {
    const { rows } = await this.pool.query<DeviceRow>(
      `insert into push_devices (user_id, token, platform, created_at, last_seen_at) values ($1, $2, $3, $4, $4)
       on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = excluded.last_seen_at,
         disabled_at = null, disabled_reason = null
       returning ${DEVICE_COLUMNS}`,
      [input.userId, input.token, input.platform, input.now],
    );
    return mapDevice(rows[0]!);
  }

  async listActiveByUser(userId: string) {
    const { rows } = await this.pool.query<DeviceRow>(`select ${DEVICE_COLUMNS} from push_devices where user_id = $1 and disabled_at is null order by last_seen_at desc limit 10`, [userId]);
    return rows.map(mapDevice);
  }

  async disable(token: string, reason: string, now: Date) {
    await this.pool.query('update push_devices set disabled_at = $2, disabled_reason = $3 where token = $1 and disabled_at is null', [token, now, reason]);
  }

  async disableForUser(userId: string, token: string, now: Date) {
    const result = await this.pool.query(
      `update push_devices set disabled_at = $3, disabled_reason = 'unregistered_by_user' where token = $2 and user_id = $1 and disabled_at is null`,
      [userId, token, now],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export class PgDeliveryRepository implements DeliveryRepository {
  constructor(private readonly pool: DbPool) {}

  async begin(input: { userId: string; idempotencyKey: string; category: string; now: Date }) {
    const result = await this.pool.query(
      `insert into notification_deliveries (user_id, idempotency_key, category, status, created_at, updated_at)
       values ($1, $2, $3, 'pending', $4, $4) on conflict (idempotency_key) do nothing`,
      [input.userId, input.idempotencyKey, input.category, input.now],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async finish(idempotencyKey: string, result: { status: DeliveryStatus; attempts: number; devices: number; ticketIds: string[]; error: string | null; now: Date }) {
    await this.pool.query(
      `update notification_deliveries set status = $2, attempts = $3, devices = $4, provider_ticket_ids = $5, error = $6, updated_at = $7 where idempotency_key = $1`,
      [idempotencyKey, result.status, result.attempts, result.devices, result.ticketIds, result.error, result.now],
    );
  }
}
