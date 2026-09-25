import type {
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
  StudentRecord,
  SubjectRecord,
  UserRecord,
} from '../types/domain.js';

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
}

export interface SessionRepository {
  create(input: { userId: string; tokenHash: string; expiresAt: Date; rememberMe: boolean }): Promise<RefreshSessionRecord>;
  findByTokenHash(tokenHash: string): Promise<RefreshSessionRecord | null>;
  findById(id: string): Promise<RefreshSessionRecord | null>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
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
  /** verificação de saúde da persistência */
  ping(): Promise<boolean>;
}
