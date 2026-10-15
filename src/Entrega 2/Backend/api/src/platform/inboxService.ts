import type {
  InboxNotification,
  InboxNotificationList,
  NotificationCategory,
  NotificationPreferences,
  NotificationPreferencesUpdate,
} from '../contracts/mobileApi.v1.js';
import type { Logger } from '../config/logger.js';
import type { Repositories } from '../repositories/types.js';
import type { NewUserNotification, NotificationResourceType, UserNotificationRecord } from './types.js';

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  support: 'Atendimento (chamados)',
  appointment: 'Agendamentos',
  agent: 'Análises do Agente',
  account: 'Conta e segurança',
  system: 'Avisos da plataforma',
  knowledge: 'Base de conhecimento',
};

const ALL_CATEGORIES = Object.keys(NOTIFICATION_CATEGORY_LABELS) as NotificationCategory[];
export const MAX_INBOX_ITEMS = 100;

/** Entrega por push (módulo de notificações); opcional e best-effort. */
export interface InboxPushSender {
  readonly enabled: boolean;
  sendToUser(input: { userId: string; category: string; idempotencyKey: string; title: string; body: string; data?: Record<string, unknown> }): Promise<unknown>;
}

export interface NotifyInput extends Omit<NewUserNotification, 'now'> {
  /** também envia push quando a pessoa tem aparelho registrado e a preferência da categoria está ativa */
  push?: boolean;
}

const toInbox = (record: UserNotificationRecord): InboxNotification => ({
  id: record.id,
  category: record.category,
  kind: record.kind,
  title: record.title,
  body: record.body,
  resource: record.resourceType && record.resourceId ? { type: record.resourceType, id: record.resourceId } : null,
  createdAt: record.createdAt.toISOString(),
  readAt: record.readAt?.toISOString() ?? null,
});

/**
 * Central de avisos unificada (portal e app). Para o aluno, une os avisos de chamados
 * (support_notifications, já usados pelo app) aos avisos gerais (user_notifications).
 * Marcar como lido atualiza as duas fontes, então app e portal ficam sincronizados.
 */
export class InboxService {
  constructor(
    private readonly repos: Repositories,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
    private readonly push: InboxPushSender | null = null,
  ) {}

  async list(userId: string, limit = 30): Promise<InboxNotificationList> {
    const size = Math.min(Math.max(limit, 1), MAX_INBOX_ITEMS);
    const student = await this.repos.students.findByUserId(userId);
    const [general, generalUnread, support, supportUnread] = await Promise.all([
      this.repos.inbox.list(userId, size),
      this.repos.inbox.countUnread(userId),
      student ? this.repos.support.listNotifications(student.id, size) : Promise.resolve([]),
      student ? this.repos.support.countUnreadNotifications(student.id) : Promise.resolve(0),
    ]);
    const merged: InboxNotification[] = [
      ...general.map(toInbox),
      ...support.map((item) => ({
        id: item.id,
        category: 'support' as const,
        kind: item.kind,
        title: item.title,
        body: `${item.protocol} · ${item.body}`,
        resource: { type: 'ticket' as const, id: item.ticketId },
        createdAt: item.createdAt.toISOString(),
        readAt: item.readAt?.toISOString() ?? null,
      })),
    ];
    merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return { items: merged.slice(0, size), unreadCount: generalUnread + supportUnread };
  }

  /** Marca como lidos os avisos informados (ou todos). Ids de outra pessoa são ignorados pelo filtro de dono. */
  /** Marca como lidos e devolve a lista no mesmo tamanho pedido pelo cliente (`limit`). */
  async markRead(userId: string, ids: string[] | null, limit = 30): Promise<InboxNotificationList> {
    const now = this.now();
    const student = await this.repos.students.findByUserId(userId);
    await Promise.all([
      this.repos.inbox.markRead(userId, ids, now),
      student ? this.repos.support.markNotificationsRead(student.id, ids, now) : Promise.resolve(),
    ]);
    return this.list(userId, limit);
  }

  async preferences(userId: string): Promise<NotificationPreferences> {
    const stored = new Map((await this.repos.inbox.getPreferences(userId)).map((item) => [item.category, item.pushEnabled]));
    const available = Boolean(this.push?.enabled);
    return {
      items: ALL_CATEGORIES.map((category) => ({ category, label: NOTIFICATION_CATEGORY_LABELS[category], pushEnabled: stored.get(category) ?? true })),
      pushDelivery: available ? 'available' : 'unavailable',
      note: available
        ? 'A central de avisos registra tudo. O push chega apenas aos aparelhos com o app instalado (build EAS) e notificações permitidas.'
        : 'Push desativado neste ambiente. Os avisos continuam na central do portal e do app.',
    };
  }

  async updatePreferences(userId: string, update: NotificationPreferencesUpdate): Promise<NotificationPreferences> {
    await this.repos.inbox.setPreferences(userId, update.items, this.now());
    return this.preferences(userId);
  }

  /**
   * Cria avisos para várias pessoas (idempotente pela dedupeKey). Push é best-effort e respeita a
   * preferência da categoria; falhas nunca afetam a operação que gerou o aviso.
   */
  async notify(inputs: NotifyInput[]): Promise<number> {
    if (inputs.length === 0) return 0;
    const now = this.now();
    const created = await this.repos.inbox.createMany(inputs.map(({ push: _push, ...input }) => ({ ...input, now })));
    const push = this.push;
    if (push?.enabled) {
      for (const input of inputs.filter((item) => item.push)) {
        void this.pushAllowed(input.userId, input.category)
          .then((allowed) =>
            allowed
              ? push.sendToUser({
                  userId: input.userId,
                  category: input.category,
                  idempotencyKey: `inbox:${input.userId}:${input.dedupeKey ?? `${input.kind}:${input.resourceId ?? ''}:${now.getTime()}`}`,
                  title: input.title,
                  body: input.body,
                  data: { type: 'inbox', category: input.category, ...(input.resourceType ? { resourceType: input.resourceType, resourceId: input.resourceId } : {}) },
                })
              : undefined,
          )
          .catch((error: unknown) => this.logger.warn({ category: input.category, error_type: error instanceof Error ? error.name : typeof error }, 'inbox push failed'));
      }
    }
    return created;
  }

  private async pushAllowed(userId: string, category: NotificationCategory): Promise<boolean> {
    const preference = (await this.repos.inbox.getPreferences(userId)).find((item) => item.category === category);
    return preference?.pushEnabled ?? true;
  }
}

export type { NotificationResourceType };
