import type { NotificationCategory, SessionChannel, UserRole } from '../contracts/mobileApi.v1.js';

// ---------------------------------------------------------------- auditoria

export type AuditOutcome = 'success' | 'failure' | 'denied';
export type AuditChannel = SessionChannel | 'system';
/** Metadados mínimos (sem senhas, tokens, e-mails ou conteúdo de mensagens). */
export type AuditMetadata = Record<string, string | number | boolean | null>;

export interface AuditEventRecord {
  id: string;
  seq: number;
  occurredAt: Date;
  actorUserId: string | null;
  actorRole: UserRole | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  outcome: AuditOutcome;
  channel: AuditChannel;
  ipHash: string | null;
  requestId: string | null;
  correlationId: string | null;
  metadata: AuditMetadata;
}

export type NewAuditEvent = Omit<AuditEventRecord, 'id' | 'seq'>;

export interface AuditQuery {
  actorUserId?: string;
  /** prefixo da ação (ex.: "auth." ou "user.role_changed") */
  actionPrefix?: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: AuditOutcome;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface AuditRepository {
  insert(event: NewAuditEvent): Promise<void>;
  list(query: AuditQuery): Promise<{ items: AuditEventRecord[]; total: number }>;
}

// ------------------------------------------------------------ configurações

export interface SettingRecord {
  key: string;
  value: unknown;
  updatedBy: string | null;
  updatedAt: Date;
}

export interface SettingsRepository {
  getAll(): Promise<SettingRecord[]>;
  upsert(input: { key: string; value: unknown; updatedBy: string | null; now: Date }): Promise<SettingRecord>;
}

// ------------------------------------------------------- central de avisos

export type NotificationResourceType = 'ticket' | 'appointment' | 'recommendation' | 'article';

export interface UserNotificationRecord {
  id: string;
  userId: string;
  category: NotificationCategory;
  kind: string;
  title: string;
  body: string;
  resourceType: NotificationResourceType | null;
  resourceId: string | null;
  dedupeKey: string | null;
  createdAt: Date;
  readAt: Date | null;
}

export interface NewUserNotification {
  userId: string;
  category: NotificationCategory;
  kind: string;
  title: string;
  body: string;
  resourceType?: NotificationResourceType | null;
  resourceId?: string | null;
  /** o mesmo evento nunca gera dois avisos para a mesma pessoa */
  dedupeKey?: string | null;
  now: Date;
}

export interface InboxRepository {
  /** Devolve quantos avisos foram criados (repetidos pela dedupeKey são ignorados). */
  createMany(inputs: NewUserNotification[]): Promise<number>;
  list(userId: string, limit: number): Promise<UserNotificationRecord[]>;
  countUnread(userId: string): Promise<number>;
  /** Marca como lidos os avisos do próprio usuário (todos quando `ids` é null). */
  markRead(userId: string, ids: string[] | null, now: Date): Promise<number>;
  getPreferences(userId: string): Promise<Array<{ category: NotificationCategory; pushEnabled: boolean }>>;
  setPreferences(userId: string, items: Array<{ category: NotificationCategory; pushEnabled: boolean }>, now: Date): Promise<void>;
}

// -------------------------------------------------- administração de contas

export interface UserListQuery {
  /** nome ou e-mail (sem acento/maiúsculas) */
  search?: string;
  role?: UserRole;
  status?: 'active' | 'inactive';
  /** false exclui contas de demonstração */
  includeDemo: boolean;
  limit: number;
  offset: number;
}

export interface UserAdminRecord {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  isDemo: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  invitedAt: Date | null;
  /** conta com vínculo acadêmico (students) */
  studentId: string | null;
  registrationNumber: string | null;
  activeSessions: number;
}
