import { randomUUID } from 'node:crypto';
import type { NotificationCategory } from '../../src/contracts/mobileApi.v1.js';
import type {
  AuditEventRecord,
  AuditRepository,
  InboxRepository,
  SettingRecord,
  SettingsRepository,
  UserNotificationRecord,
} from '../../src/platform/types.js';

/** Auditoria em memória (somente-inserção, como a tabela). */
export class MemoryAuditRepository implements AuditRepository {
  readonly items: AuditEventRecord[] = [];
  private seq = 0;

  async insert(event: Omit<AuditEventRecord, 'id' | 'seq'>): Promise<void> {
    this.seq += 1;
    this.items.push({ ...event, id: randomUUID(), seq: this.seq, metadata: { ...event.metadata } });
  }

  async list(query: Parameters<AuditRepository['list']>[0]): Promise<{ items: AuditEventRecord[]; total: number }> {
    const filtered = this.items
      .filter((item) => !query.actorUserId || item.actorUserId === query.actorUserId)
      .filter((item) => !query.actionPrefix || item.action.startsWith(query.actionPrefix))
      .filter((item) => !query.resourceType || item.resourceType === query.resourceType)
      .filter((item) => !query.resourceId || item.resourceId === query.resourceId)
      .filter((item) => !query.outcome || item.outcome === query.outcome)
      .filter((item) => !query.from || item.occurredAt >= query.from)
      .filter((item) => !query.to || item.occurredAt < query.to)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.seq - a.seq);
    return { items: filtered.slice(query.offset, query.offset + query.limit), total: filtered.length };
  }
}

export class MemorySettingsRepository implements SettingsRepository {
  readonly items = new Map<string, SettingRecord>();

  async getAll(): Promise<SettingRecord[]> {
    return [...this.items.values()].map((item) => ({ ...item }));
  }

  async upsert(input: { key: string; value: unknown; updatedBy: string | null; now: Date }): Promise<SettingRecord> {
    const record: SettingRecord = { key: input.key, value: structuredClone(input.value), updatedBy: input.updatedBy, updatedAt: input.now };
    this.items.set(input.key, record);
    return { ...record };
  }
}

export class MemoryInboxRepository implements InboxRepository {
  readonly items: UserNotificationRecord[] = [];
  readonly preferences = new Map<string, Map<NotificationCategory, boolean>>();

  async createMany(inputs: Parameters<InboxRepository['createMany']>[0]): Promise<number> {
    let created = 0;
    for (const input of inputs) {
      if (input.dedupeKey && this.items.some((item) => item.userId === input.userId && item.dedupeKey === input.dedupeKey)) continue;
      this.items.push({
        id: randomUUID(),
        userId: input.userId,
        category: input.category,
        kind: input.kind,
        title: input.title,
        body: input.body,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        dedupeKey: input.dedupeKey ?? null,
        createdAt: input.now,
        readAt: null,
      });
      created += 1;
    }
    return created;
  }

  async list(userId: string, limit: number): Promise<UserNotificationRecord[]> {
    return this.items
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((item) => ({ ...item }));
  }

  async countUnread(userId: string): Promise<number> {
    return this.items.filter((item) => item.userId === userId && !item.readAt).length;
  }

  async markRead(userId: string, ids: string[] | null, now: Date): Promise<number> {
    let changed = 0;
    for (const item of this.items) {
      if (item.userId !== userId || item.readAt || (ids && !ids.includes(item.id))) continue;
      item.readAt = now;
      changed += 1;
    }
    return changed;
  }

  async getPreferences(userId: string): Promise<Array<{ category: NotificationCategory; pushEnabled: boolean }>> {
    return [...(this.preferences.get(userId)?.entries() ?? [])].map(([category, pushEnabled]) => ({ category, pushEnabled }));
  }

  async setPreferences(userId: string, items: Array<{ category: NotificationCategory; pushEnabled: boolean }>): Promise<void> {
    const current = this.preferences.get(userId) ?? new Map<NotificationCategory, boolean>();
    for (const item of items) current.set(item.category, item.pushEnabled);
    this.preferences.set(userId, current);
  }
}
