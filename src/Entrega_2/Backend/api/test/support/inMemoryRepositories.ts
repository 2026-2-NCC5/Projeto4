import { randomUUID } from 'node:crypto';
import { ConflictError } from '../../src/errors/AppError.js';
import type { Repositories } from '../../src/repositories/types.js';
import type {
  AgentFeedbackRecord,
  AgentRecommendationRecord,
  AgentRunRecord,
  AgentRunWithRecommendations,
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
} from '../../src/types/domain.js';
// ---- support (Atendimento)
import { createInMemorySupportRepository } from './inMemorySupportRepository.js';
// ---- platform (portal web, auditoria, avisos)
import type { NewSessionInput } from '../../src/repositories/types.js';
import type { UserAdminRecord } from '../../src/platform/types.js';
import type { SessionFamilyRecord } from '../../src/types/domain.js';
import { MemoryAuditRepository, MemoryInboxRepository, MemorySettingsRepository } from './inMemoryPlatform.js';

export interface InMemoryData {
  users: UserRecord[];
  students: StudentRecord[];
  enrollments: Record<string, EnrollmentRecord[]>;
  assessments: Record<string, AssessmentRecord[]>;
  attendance: Record<string, AttendanceAggregateRecord[]>;
  pendingItems: Record<string, PendingItemRecord[]>;
  subjectCatalog?: SubjectRecord[];
  programs?: ProgramRecord[];
}

export interface InMemoryExtras {
  runs: AgentRunWithRecommendations[];
  sessions: SessionStore;
  audit: MemoryAuditRepository;
  settings: MemorySettingsRepository;
  inbox: MemoryInboxRepository;
  interactions: AssistantInteractionRecord[];
  resets: PasswordResetRecord[];
  credentials: DeviceCredentialRecord[];
  data: InMemoryData;
}

/** Repositórios em memória para testes unitários (sem PostgreSQL). */
export function createInMemoryRepositories(data: InMemoryData): Repositories & InMemoryExtras {
  const sessions = new SessionStore(data);
  const runs: AgentRunWithRecommendations[] = [];
  const interactions: AssistantInteractionRecord[] = [];
  const resets: PasswordResetRecord[] = [];
  const credentials: DeviceCredentialRecord[] = [];
  const feedback: AgentFeedbackRecord[] = [];
  const isActiveReset = (reset: PasswordResetRecord) => !reset.usedAt && !reset.invalidatedAt;
  return {
    data,
    runs,
    sessions,
    interactions,
    resets,
    credentials,
    programs: {
      list: async () => [...(data.programs ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
      findByCode: async (code) => data.programs?.find((program) => program.code === code) ?? null,
    },
    accounts: {
      createStudentAccount: async (input) => {
        const emailTaken = data.users.some((user) => user.email.toLowerCase() === input.user.email.toLowerCase());
        const raTaken = data.students.some((student) => student.registrationNumber === input.student.registrationNumber);
        if (emailTaken || raTaken) throw new ConflictError('Não foi possível criar a conta com esses dados.', 'account_exists');
        const user: UserRecord = { id: randomUUID(), email: input.user.email, passwordHash: input.user.passwordHash, fullName: input.user.fullName, role: 'student', isActive: true };
        const student: StudentRecord = { id: input.student.id, userId: user.id, registrationNumber: input.student.registrationNumber, program: input.student.program };
        data.users.push(user);
        data.students.push(student);
        return { user: { ...user }, student: { ...student } };
      },
    },
    passwordResets: {
      findActiveByUser: async (userId) => {
        const found = resets.find((reset) => reset.userId === userId && isActiveReset(reset));
        return found ? { ...found } : null;
      },
      create: async (input) => {
        for (const reset of resets) if (reset.userId === input.userId && isActiveReset(reset)) reset.invalidatedAt = input.now;
        const record: PasswordResetRecord = {
          id: randomUUID(), userId: input.userId, codeHash: input.codeHash, codeExpiresAt: input.codeExpiresAt, attempts: 0, sendCount: 1,
          lastSentAt: input.now, verifiedAt: null, resetTokenHash: null, resetTokenExpiresAt: null, usedAt: null, invalidatedAt: null, createdAt: input.now,
        };
        resets.push(record);
        return { ...record };
      },
      replaceCode: async (id, input) => {
        const reset = resets.find((item) => item.id === id && isActiveReset(item) && !item.verifiedAt);
        if (!reset) return;
        Object.assign(reset, { codeHash: input.codeHash, codeExpiresAt: input.codeExpiresAt, attempts: 0, sendCount: reset.sendCount + 1, lastSentAt: input.now });
      },
      recordFailedAttempt: async (id) => {
        const reset = resets.find((item) => item.id === id);
        if (!reset) return Number.MAX_SAFE_INTEGER;
        reset.attempts += 1;
        return reset.attempts;
      },
      markVerified: async (id, input) => {
        const reset = resets.find((item) => item.id === id);
        if (reset) Object.assign(reset, { verifiedAt: input.now, resetTokenHash: input.resetTokenHash, resetTokenExpiresAt: input.resetTokenExpiresAt });
      },
      findByResetTokenHash: async (hash) => {
        const found = resets.find((reset) => reset.resetTokenHash === hash);
        return found ? { ...found } : null;
      },
      completeReset: async (input) => {
        const reset = resets.find((item) => item.id === input.resetId && item.userId === input.userId && isActiveReset(item));
        if (!reset) return false;
        reset.usedAt = input.now;
        const user = data.users.find((item) => item.id === input.userId);
        if (user) user.passwordHash = input.passwordHash;
        for (const session of sessions.items) if (session.userId === input.userId && !session.revokedAt) session.revokedAt = input.now;
        for (const credential of credentials) if (credential.userId === input.userId && !credential.revokedAt) credential.revokedAt = input.now;
        return true;
      },
    },
    deviceCredentials: {
      create: async (input) => {
        const record: DeviceCredentialRecord = { id: randomUUID(), userId: input.userId, tokenHash: input.tokenHash, deviceLabel: input.deviceLabel, createdAt: new Date(), lastUsedAt: null, expiresAt: input.expiresAt, revokedAt: null };
        credentials.push(record);
        return { ...record };
      },
      findById: async (id) => {
        const found = credentials.find((credential) => credential.id === id);
        return found ? { ...found } : null;
      },
      touch: async (id, input) => {
        const credential = credentials.find((item) => item.id === id);
        if (credential) Object.assign(credential, { lastUsedAt: input.lastUsedAt, expiresAt: input.expiresAt });
      },
      revoke: async (id, userId) => {
        const credential = credentials.find((item) => item.id === id && item.userId === userId);
        if (credential && !credential.revokedAt) credential.revokedAt = new Date();
      },
      revokeOldestBeyond: async (userId, max) => {
        const active = credentials.filter((item) => item.userId === userId && !item.revokedAt).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        for (const credential of active.slice(max)) credential.revokedAt = new Date();
      },
    },
    assistantInteractions: {
      save: async (record) => {
        interactions.push({ ...record });
      },
    },
    users: {
      findByEmail: async (email) => data.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null,
      findById: async (id) => data.users.find((user) => user.id === id) ?? null,
      // ---- platform (portal web, administração)
      touchLogin: async (userId, at) => {
        const user = data.users.find((item) => item.id === userId);
        if (user) user.lastLoginAt = at;
      },
      list: async (query) => {
        const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const filtered = data.users
          .filter((user) => !query.search || fold(user.fullName).includes(query.search) || user.email.toLowerCase().includes(query.search))
          .filter((user) => !query.role || user.role === query.role)
          .filter((user) => !query.status || (query.status === 'active') === user.isActive)
          .filter((user) => query.includeDemo || !isDemoUser(user));
        return { items: filtered.slice(query.offset, query.offset + query.limit).map((user) => toAdminRecord(user)), total: filtered.length };
      },
      findAdminById: async (id) => {
        const user = data.users.find((item) => item.id === id);
        return user ? toAdminRecord(user) : null;
      },
      createInvited: async (input) => {
        if (data.users.some((user) => user.email.toLowerCase() === input.email.toLowerCase())) throw new ConflictError('Já existe uma conta com este e-mail.', 'account_exists');
        const user: UserRecord = { id: randomUUID(), email: input.email, passwordHash: input.passwordHash, fullName: input.fullName, role: input.role, isActive: true, isDemo: input.isDemo, lastLoginAt: null, createdAt: input.now };
        data.users.push(user);
        return { ...user };
      },
      update: async (id, patch, options = {}) => {
        const user = data.users.find((item) => item.id === id);
        if (!user) return null;
        if (options.keepActiveAdmin && !data.users.some((item) => item.id !== id && item.role === 'technical_admin' && item.isActive)) {
          throw new ConflictError('É preciso manter pelo menos uma conta de administração ativa.', 'last_admin');
        }
        if (patch.role) user.role = patch.role;
        if (patch.isActive !== undefined) user.isActive = patch.isActive;
        return { ...user };
      },
      countActiveByRole: async (role) => data.users.filter((user) => user.role === role && user.isActive).length,
      listActiveIdsByRole: async (role, includeDemo) => data.users.filter((user) => user.role === role && user.isActive && (includeDemo || !isDemoUser(user))).map((user) => user.id),
    },
    students: {
      findByUserId: async (userId) => data.students.find((student) => student.userId === userId) ?? null,
      findByRegistrationNumber: async (registrationNumber) => data.students.find((student) => student.registrationNumber === registrationNumber) ?? null,
      findById: async (id) => data.students.find((student) => student.id === id) ?? null,
      listEnrollments: async (studentId) => data.enrollments[studentId] ?? [],
      listAssessments: async (studentId) => data.assessments[studentId] ?? [],
      listAttendance: async (studentId) => data.attendance[studentId] ?? [],
      listPendingItems: async (studentId) => data.pendingItems[studentId] ?? [],
      listSubjectCatalog: async () => data.subjectCatalog ?? [],
    },
    agentRuns: {
      save: async (run) => {
        runs.push(structuredClone(run));
      },
      findLatestByStudent: async (studentId) => {
        const list = runs.filter((run) => run.studentId === studentId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return list[0] ? structuredClone(list[0]) : null;
      },
      findByRunId: async (runId) => {
        const run = runs.find((item) => item.runId === runId);
        return run ? structuredClone(run) : null;
      },
      findRecommendation: async (recommendationId) => {
        for (const run of runs) {
          const recommendation = run.recommendations.find((rec) => rec.id === recommendationId);
          if (recommendation) return { run: structuredClone(run) as AgentRunRecord, recommendation: structuredClone(recommendation) as AgentRecommendationRecord };
        }
        return null;
      },
      findFeedback: async (recommendationId, studentId) => feedback.find((item) => item.recommendationId === recommendationId && item.studentId === studentId) ?? null,
      saveFeedback: async (input) => {
        const record = { recommendationId: input.recommendationId, studentId: input.studentId, helpful: input.helpful, comment: input.comment, createdAt: input.now };
        feedback.push(record);
        return { ...record };
      },
      listByStudent: async (studentId, limit) =>
        runs
          .filter((run) => run.studentId === studentId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit)
          .map((run) => ({ ...structuredClone(run), recommendationsCount: run.recommendations.length })),
    },
    // ---- support (Atendimento)
    support: createInMemorySupportRepository(),
    // ---- platform (portal web, auditoria, avisos)
    audit: new MemoryAuditRepository(),
    settings: new MemorySettingsRepository(),
    inbox: new MemoryInboxRepository(),
    ping: async () => true,
  };

  function toAdminRecord(user: UserRecord): UserAdminRecord {
    const student = data.students.find((item) => item.userId === user.id) ?? null;
    const families = new Set(sessions.items.filter((item) => item.userId === user.id && !item.revokedAt && item.expiresAt > new Date()).map((item) => item.familyId));
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      isDemo: isDemoUser(user),
      createdAt: user.createdAt ?? new Date(0),
      lastLoginAt: user.lastLoginAt ?? null,
      invitedAt: null,
      studentId: student?.id ?? null,
      registrationNumber: student?.registrationNumber ?? null,
      activeSessions: families.size,
    };
  }
}

/** Contas sem a marcação explícita seguem o domínio reservado de demonstração (como a migration 006). */
export function isDemoUser(user: UserRecord): boolean {
  return user.isDemo ?? user.email.toLowerCase().endsWith('@demo.asa');
}

class SessionStore {
  readonly items: RefreshSessionRecord[] = [];

  constructor(private readonly data: InMemoryData) {}

  async create(input: NewSessionInput): Promise<RefreshSessionRecord> {
    const now = new Date();
    const record: RefreshSessionRecord = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      rememberMe: input.rememberMe,
      channel: input.channel ?? 'mobile',
      familyId: input.familyId ?? randomUUID(),
      deviceLabel: input.deviceLabel ?? null,
      lastUsedAt: now,
      createdAt: now,
    };
    this.items.push(record);
    return { ...record };
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshSessionRecord | null> {
    const found = this.items.find((item) => item.tokenHash === tokenHash);
    return found ? { ...found } : null;
  }

  async findById(id: string): Promise<RefreshSessionRecord | null> {
    const found = this.items.find((item) => item.id === id);
    return found ? { ...found } : null;
  }

  async revoke(id: string): Promise<void> {
    const found = this.items.find((item) => item.id === id);
    if (found && !found.revokedAt) found.revokedAt = new Date();
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const item of this.items) if (item.userId === userId && !item.revokedAt) item.revokedAt = new Date();
  }

  async listFamilies(userId: string, now: Date): Promise<SessionFamilyRecord[]> {
    return this.items
      .filter((item) => item.userId === userId && !item.revokedAt && item.expiresAt > now)
      .map((item) => {
        const first = this.items.filter((row) => row.familyId === item.familyId).sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))[0];
        return {
          familyId: item.familyId!,
          userId: item.userId,
          channel: item.channel ?? 'mobile',
          deviceLabel: item.deviceLabel ?? null,
          rememberMe: item.rememberMe,
          createdAt: first?.createdAt ?? item.createdAt ?? now,
          lastUsedAt: item.lastUsedAt ?? null,
          expiresAt: item.expiresAt,
          activeSessionId: item.id,
        };
      });
  }

  async revokeFamily(userId: string, familyId: string): Promise<number> {
    let changed = 0;
    for (const item of this.items) {
      if (item.userId === userId && item.familyId === familyId && !item.revokedAt) {
        item.revokedAt = new Date();
        changed += 1;
      }
    }
    return changed;
  }

  async revokeAllExcept(userId: string, keepFamilyId: string | null): Promise<number> {
    const families = new Set<string>();
    for (const item of this.items) {
      if (item.userId === userId && !item.revokedAt && item.familyId !== keepFamilyId) {
        item.revokedAt = new Date();
        families.add(item.familyId!);
      }
    }
    return families.size;
  }

  async revokeAllForDemoUsers(): Promise<number> {
    const demoIds = new Set(this.data.users.filter((user) => isDemoUser(user)).map((user) => user.id));
    let changed = 0;
    for (const item of this.items) {
      if (demoIds.has(item.userId) && !item.revokedAt) {
        item.revokedAt = new Date();
        changed += 1;
      }
    }
    return changed;
  }
}
