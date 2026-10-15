import type {
  SupportActorType,
  SupportEventVisibility,
  SupportNotificationKind,
  SupportTicketEventType,
  SupportTicketPriority,
  SupportTicketStatus,
} from '../contracts/mobileApi.v1.js';

/** Prazo do chamado. `status` não é persistido: é calculado a cada leitura (ver sla.ts). */
export interface SupportSlaRecord {
  targetBusinessDays: number;
  startedAt: Date;
  dueAt: Date;
  pausedAt: Date | null;
  resumedAt: Date | null;
  completedAt: Date | null;
}

export interface SupportPendingActionRecord {
  title: string;
  description: string;
  requestedAt: Date;
  expectsAttachment: boolean;
}

export interface SupportTicketRecord {
  id: string;
  protocol: string;
  studentId: string;
  /** canal de abertura (app ou portal web) */
  channel: 'app' | 'web';
  clientRequestId: string;
  categoryId: string;
  subcategoryId: string | null;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  assignedTeam: string;
  assignedAgentId: string | null;
  pendingAction: SupportPendingActionRecord | null;
  resolution: string | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  reopenedCount: number;
  sla: SupportSlaRecord;
  /** prazo da primeira resposta da equipe (gravado na abertura; null em chamados anteriores à meta) */
  firstResponseDueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** controle de concorrência otimista: cada alteração incrementa */
  version: number;
}

export interface SupportTicketListRow extends SupportTicketRecord {
  unreadCount: number;
  lastActivity: { title: string; createdAt: Date } | null;
}

export interface SupportEventDetailRecord {
  label: string;
  value: string;
}

/** Registro de auditoria somente-inserção. Internos (notas, prioridade) nunca chegam ao estudante. */
export interface SupportEventRecord {
  id: string;
  ticketId: string;
  type: SupportTicketEventType;
  visibility: SupportEventVisibility;
  title: string;
  description: string | null;
  actorType: SupportActorType;
  /** usuário que executou a ação (auditoria interna; nunca exposto ao estudante) */
  actorUserId: string | null;
  /** nome público: o estudante ou a equipe */
  actorName: string | null;
  fromStatus: SupportTicketStatus | null;
  toStatus: SupportTicketStatus | null;
  details: SupportEventDetailRecord[];
  createdAt: Date;
}

export interface SupportMessageRecord {
  id: string;
  ticketId: string;
  senderType: 'student' | 'agent';
  senderUserId: string | null;
  senderName: string;
  content: string;
  clientMessageId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

/** Metadados do anexo (o conteúdo binário só é lido no download). `ticketId` null = envio pendente. */
export interface SupportAttachmentRecord {
  id: string;
  ticketId: string | null;
  messageId: string | null;
  uploadedByType: 'student' | 'agent';
  uploadedByUserId: string | null;
  uploaderName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
  /** só para envios pendentes; vinculados ao chamado não expiram */
  expiresAt: Date | null;
}

export interface SupportRatingRecord {
  ticketId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  createdAt: Date;
}

export interface SupportNotificationRecord {
  id: string;
  studentId: string;
  ticketId: string;
  protocol: string;
  kind: SupportNotificationKind;
  title: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
}

export interface NewSupportEvent {
  type: SupportTicketEventType;
  visibility: SupportEventVisibility;
  title: string;
  description: string | null;
  actorType: SupportActorType;
  actorUserId: string | null;
  actorName: string | null;
  fromStatus: SupportTicketStatus | null;
  toStatus: SupportTicketStatus | null;
  details: SupportEventDetailRecord[];
}

export interface NewSupportMessage {
  /** gerado no serviço para que anexos possam ser vinculados na mesma transação */
  id: string;
  senderType: 'student' | 'agent';
  senderUserId: string | null;
  senderName: string;
  content: string;
  clientMessageId: string | null;
}

export interface NewSupportNotification {
  kind: SupportNotificationKind;
  title: string;
  body: string;
}

/** Vincula envios pendentes do `ownerUserId` ao chamado (e opcionalmente a uma mensagem). */
export interface SupportAttachmentLink {
  ids: string[];
  ownerUserId: string;
  messageId: string | null;
}

export type SupportTicketPatch = Partial<
  Pick<
    SupportTicketRecord,
    | 'status'
    | 'priority'
    | 'assignedTeam'
    | 'assignedAgentId'
    | 'pendingAction'
    | 'resolution'
    | 'resolvedAt'
    | 'closedAt'
    | 'cancelledAt'
    | 'cancelReason'
    | 'reopenedCount'
    | 'sla'
  >
>;

/** Uma alteração atômica do chamado: estado + eventos + mensagens + anexos + notificações + avaliação. */
export interface SupportTicketChanges {
  ticketId: string;
  /** a alteração só é aplicada se o chamado ainda estiver nesta versão (senão ConflictError) */
  expectedVersion: number;
  patch: SupportTicketPatch;
  events: NewSupportEvent[];
  messages: NewSupportMessage[];
  attachments: SupportAttachmentLink[];
  notifications: NewSupportNotification[];
  rating?: { rating: 1 | 2 | 3 | 4 | 5; comment: string | null };
  now: Date;
}

export interface NewSupportTicket {
  id: string;
  studentId: string;
  channel: 'app' | 'web';
  clientRequestId: string;
  categoryId: string;
  subcategoryId: string | null;
  subject: string;
  description: string;
  /** texto normalizado (minúsculo, sem acentos) para a busca */
  searchText: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  assignedTeam: string;
  sla: SupportSlaRecord;
  firstResponseDueAt: Date | null;
  events: NewSupportEvent[];
  attachments: SupportAttachmentLink | null;
  notifications: NewSupportNotification[];
  now: Date;
}

export interface SupportTicketQuery {
  /** ausente = todos os estudantes (somente equipe) */
  studentId?: string;
  statuses?: SupportTicketStatus[];
  /** termo já normalizado (minúsculo, sem acentos) */
  search?: string;
  /** categorias cujo nome corresponde ao termo de busca */
  searchCategoryIds?: string[];
  limit: number;
  /** chave de ordenação + id (updated_at, ou sla_due_at quando `orderBy = 'due'`) */
  cursor?: { updatedAt: Date; id: string } | null;
  // ---- platform (fila da equipe no portal web)
  /** de quem são as "não lidas": student = mensagens da equipe; staff = mensagens do aluno */
  perspective?: 'student' | 'staff';
  /** mine = atribuídos ao usuário; unassigned = sem atendente */
  assignment?: { kind: 'mine'; userId: string } | { kind: 'unassigned' };
  teams?: string[];
  categoryIds?: string[];
  priorities?: SupportTicketPriority[];
  /** at_risk = prazo próximo ou excedido; near_deadline = só prazo próximo; overdue = só excedido (mesma regra de sla.ts) */
  slaRisk?: 'at_risk' | 'near_deadline' | 'overdue';
  /** com mensagem do aluno ainda não lida pela equipe */
  unreadByStaff?: boolean;
  /** modo demonstração desligado: chamados de contas fictícias ficam fora da fila */
  excludeDemo?: boolean;
  orderBy?: 'updated' | 'due';
  /** relógio da consulta (prazo) */
  now?: Date;
}

export interface NewSupportUpload {
  id: string;
  uploadedByType: 'student' | 'agent';
  uploadedByUserId: string;
  uploaderName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  content: Buffer;
  expiresAt: Date;
  now: Date;
}

export interface SupportRepository {
  /**
   * Cria o chamado com protocolo sequencial (ASA-AAAA-NNNNN), eventos, vínculos de anexos e notificações em uma
   * transação. Se `clientRequestId` já existir para o estudante (corrida de envio duplo), devolve o existente.
   */
  createTicket(input: NewSupportTicket): Promise<{ ticket: SupportTicketRecord; created: boolean }>;
  findTicket(id: string): Promise<SupportTicketRecord | null>;
  findTicketByClientRequest(studentId: string, clientRequestId: string): Promise<SupportTicketRecord | null>;
  /** Ordenado por última atualização (desc, id desc); paginação por cursor. */
  listTickets(query: SupportTicketQuery): Promise<SupportTicketListRow[]>;
  countByStatus(studentId: string): Promise<Partial<Record<SupportTicketStatus, number>>>;
  listEvents(ticketId: string, options: { includeInternal: boolean }): Promise<SupportEventRecord[]>;
  listMessages(ticketId: string): Promise<SupportMessageRecord[]>;
  findMessageByClientId(ticketId: string, clientMessageId: string): Promise<SupportMessageRecord | null>;
  listAttachments(ticketId: string): Promise<SupportAttachmentRecord[]>;
  findRating(ticketId: string): Promise<SupportRatingRecord | null>;
  /** Lança ConflictError('ticket_changed') se a versão mudou e ValidationError se um anexo não puder ser vinculado. */
  applyChanges(changes: SupportTicketChanges): Promise<SupportTicketRecord>;
  /** Marca como lidas as mensagens da equipe e as notificações do chamado. Devolve quantas mensagens mudaram. */
  markRead(ticketId: string, studentId: string, now: Date): Promise<number>;
  /** Equipe abriu o chamado: mensagens do aluno ficam lidas (confirmação de leitura para o aluno). */
  markReadByStaff(ticketId: string, now: Date): Promise<number>;
  /** Também remove envios pendentes expirados (limpeza preguiçosa). */
  createUpload(input: NewSupportUpload): Promise<SupportAttachmentRecord>;
  findAttachment(id: string): Promise<SupportAttachmentRecord | null>;
  readAttachmentContent(id: string): Promise<Buffer | null>;
  /** Remove um envio ainda pendente do próprio usuário. */
  deletePendingUpload(id: string, ownerUserId: string): Promise<boolean>;
  listNotifications(studentId: string, limit: number): Promise<SupportNotificationRecord[]>;
  countUnreadNotifications(studentId: string): Promise<number>;
  markNotificationsRead(studentId: string, ids: string[] | null, now: Date): Promise<void>;
}
