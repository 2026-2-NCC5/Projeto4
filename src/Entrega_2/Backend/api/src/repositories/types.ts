import type {
  AgentFeedbackRecord,
  AgentRunRecord,
  AgentRunWithRecommendations,
  AgentRecommendationRecord,
  AssessmentRecord,
  AssistantInteractionRecord,
  AttendanceAggregateRecord,
  DeviceCredentialRecord,
  EnrollmentRecord,
  PasswordResetRecord,
  PendingItemRecord,
  ProgramRecord,
  RefreshSessionRecord,
  SessionFamilyRecord,
  StudentRecord,
  SubjectRecord,
  UserRecord,
} from '../types/domain.js';
import type { SessionChannel, UserRole } from '../contracts/mobileApi.v1.js';
// ---- support (Atendimento)
import type { SupportRepository } from '../support/types.js';
// ---- platform (portal web, auditoria, avisos)
import type { AuditRepository, InboxRepository, SettingsRepository, UserAdminRecord, UserListQuery } from '../platform/types.js';
import type { AnalyticsRepository } from '../operations/analyticsRepository.js';
import type { AppointmentRepository } from '../appointments/types.js';
import type { KnowledgeRepository } from '../knowledge/types.js';
import type { AdminRepository } from '../admin/repository.js';

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  // ---- platform (portal web, administração)
  touchLogin(userId: string, at: Date): Promise<void>;
  list(query: UserListQuery): Promise<{ items: UserAdminRecord[]; total: number }>;
  findAdminById(id: string): Promise<UserAdminRecord | null>;
  /** Conta da equipe/administração criada por convite. Lança ConflictError('account_exists') se o e-mail existir. */
  createInvited(input: { email: string; fullName: string; role: UserRole; passwordHash: string; invitedBy: string; isDemo: boolean; now: Date }): Promise<UserRecord>;
  /**
   * Papel/ativação. Com `keepActiveAdmin`, a checagem "sobra ao menos uma administração ativa" e a escrita
   * acontecem na mesma transação, com as contas de administração travadas (sem corrida entre duas pessoas
   * desativando uma à outra). Lança ConflictError('last_admin').
   */
  update(id: string, patch: { role?: UserRole; isActive?: boolean }, options?: { keepActiveAdmin?: boolean }): Promise<UserRecord | null>;
  countActiveByRole(role: UserRole): Promise<number>;
  /** ids das contas ativas de um papel (avisos para a equipe); contas demo só quando `includeDemo` */
  listActiveIdsByRole(role: UserRole, includeDemo: boolean): Promise<string[]>;
}

export interface NewSessionInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  rememberMe: boolean;
  /** padrão: mobile (compatível com o app) */
  channel?: SessionChannel;
  /** mantém a família na rotação do refresh token; ausente = nova família */
  familyId?: string;
  deviceLabel?: string | null;
}

export interface SessionRepository {
  create(input: NewSessionInput): Promise<RefreshSessionRecord>;
  findByTokenHash(tokenHash: string): Promise<RefreshSessionRecord | null>;
  findById(id: string): Promise<RefreshSessionRecord | null>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  // ---- platform (sessões por aparelho/navegador)
  /** Famílias com uma linha ainda válida (não revogada e não expirada). */
  listFamilies(userId: string, now: Date): Promise<SessionFamilyRecord[]>;
  /** Revoga a família inteira do próprio usuário. Devolve quantas linhas mudaram. */
  revokeFamily(userId: string, familyId: string): Promise<number>;
  /** Revoga todas as famílias do usuário, exceto `keepFamilyId`. Devolve quantas famílias foram encerradas. */
  revokeAllExcept(userId: string, keepFamilyId: string | null): Promise<number>;
  /** Encerra sessões de contas de demonstração (modo demonstração desligado). */
  revokeAllForDemoUsers(): Promise<number>;
}

export interface ProgramRepository {
  list(): Promise<ProgramRecord[]>;
  findByCode(code: string): Promise<ProgramRecord | null>;
}

/** Criação transacional de conta de estudante (users + students). */
export interface AccountRepository {
  /** Lança ConflictError('account_exists') quando e-mail ou RA já existem. */
  createStudentAccount(input: {
    user: { email: string; passwordHash: string; fullName: string };
    student: { id: string; registrationNumber: string; program: string | null };
  }): Promise<{ user: UserRecord; student: StudentRecord }>;
}

export interface PasswordResetRepository {
  findActiveByUser(userId: string): Promise<PasswordResetRecord | null>;
  /** Invalida a solicitação ativa anterior (se houver) e cria uma nova. */
  create(input: { userId: string; codeHash: string; codeExpiresAt: Date; now: Date }): Promise<PasswordResetRecord>;
  /** Novo código na mesma solicitação: zera tentativas, incrementa envios. */
  replaceCode(id: string, input: { codeHash: string; codeExpiresAt: Date; now: Date }): Promise<void>;
  /** Registra tentativa incorreta e devolve o total de tentativas. */
  recordFailedAttempt(id: string): Promise<number>;
  markVerified(id: string, input: { resetTokenHash: string; resetTokenExpiresAt: Date; now: Date }): Promise<void>;
  findByResetTokenHash(tokenHash: string): Promise<PasswordResetRecord | null>;
  /**
   * Em uma transação: consome a solicitação (uso único), troca o hash da senha e revoga
   * sessões e credenciais biométricas do usuário. Retorna false se já foi usada/invalidada.
   */
  completeReset(input: { resetId: string; userId: string; passwordHash: string; now: Date }): Promise<boolean>;
}

export interface DeviceCredentialRepository {
  create(input: { userId: string; tokenHash: string; deviceLabel: string | null; expiresAt: Date }): Promise<DeviceCredentialRecord>;
  findById(id: string): Promise<DeviceCredentialRecord | null>;
  touch(id: string, input: { lastUsedAt: Date; expiresAt: Date }): Promise<void>;
  revoke(id: string, userId: string): Promise<void>;
  /** Mantém no máximo `max` credenciais ativas por usuário (revoga as mais antigas). */
  revokeOldestBeyond(userId: string, max: number): Promise<void>;
}

export interface StudentRepository {
  findByUserId(userId: string): Promise<StudentRecord | null>;
  findByRegistrationNumber(registrationNumber: string): Promise<StudentRecord | null>;
  findById(studentId: string): Promise<StudentRecord | null>;
  listEnrollments(studentId: string): Promise<EnrollmentRecord[]>;
  listAssessments(studentId: string): Promise<AssessmentRecord[]>;
  listAttendance(studentId: string): Promise<AttendanceAggregateRecord[]>;
  listPendingItems(studentId: string): Promise<PendingItemRecord[]>;
  /** Catálogo público de disciplinas (código e nome), sem dados de estudantes. */
  listSubjectCatalog(): Promise<SubjectRecord[]>;
}

/** Metadados das interações do assistente — nunca texto nem áudio. */
export interface AssistantInteractionRepository {
  save(record: AssistantInteractionRecord): Promise<void>;
}

export interface AgentRunRepository {
  save(run: AgentRunWithRecommendations): Promise<void>;
  findLatestByStudent(studentId: string): Promise<AgentRunWithRecommendations | null>;
  findByRunId(runId: string): Promise<AgentRunWithRecommendations | null>;
  findRecommendation(recommendationId: string): Promise<{ run: AgentRunRecord; recommendation: AgentRecommendationRecord } | null>;
  listByStudent(studentId: string, limit: number): Promise<Array<AgentRunRecord & { recommendationsCount: number }>>;
  // ---- platform (feedback do estudante sobre recomendações)
  findFeedback(recommendationId: string, studentId: string): Promise<AgentFeedbackRecord | null>;
  saveFeedback(input: { recommendationId: string; studentId: string; helpful: boolean; comment: string | null; now: Date }): Promise<AgentFeedbackRecord>;
}

export interface Repositories {
  users: UserRepository;
  sessions: SessionRepository;
  students: StudentRepository;
  agentRuns: AgentRunRepository;
  assistantInteractions: AssistantInteractionRepository;
  programs: ProgramRepository;
  accounts: AccountRepository;
  passwordResets: PasswordResetRepository;
  deviceCredentials: DeviceCredentialRepository;
  // ---- support (Atendimento): chamados, mensagens, anexos e avisos
  support: SupportRepository;
  // ---- platform (portal web, auditoria, avisos)
  audit: AuditRepository;
  settings: SettingsRepository;
  inbox: InboxRepository;
  /** consultas agregadas (só PostgreSQL); ausente nos testes em memória → 503 explícito */
  analytics?: AnalyticsRepository;
  /** agendamentos (só PostgreSQL: restrições de exclusão impedem reserva dupla) */
  appointments?: AppointmentRepository;
  /** base de conhecimento (só PostgreSQL: busca full-text em português) */
  knowledge?: KnowledgeRepository;
  /** administração: metas de SLA, automações e consultas de saúde (só PostgreSQL) */
  admin?: AdminRepository;
  /** verificação de saúde da persistência */
  ping(): Promise<boolean>;
}
