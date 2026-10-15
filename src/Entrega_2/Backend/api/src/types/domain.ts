import type { UserRole, EnrollmentStatus, AssessmentType, PendingItemStatus, AgentRunStatus, AssistantInputType, SessionChannel } from '../contracts/mobileApi.v1.js';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  /** conta fictícia de demonstração (migration 006); ausente em registros antigos de teste = false */
  isDemo?: boolean;
  lastLoginAt?: Date | null;
  createdAt?: Date;
}

export interface StudentRecord {
  id: string;
  userId: string;
  registrationNumber: string;
  program: string | null;
}

export interface RefreshSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  rememberMe: boolean;
  /** canal da sessão (migration 006); registros anteriores são do app */
  channel?: SessionChannel;
  /** estável entre rotações do refresh token (um aparelho/navegador) */
  familyId?: string;
  deviceLabel?: string | null;
  lastUsedAt?: Date | null;
  createdAt?: Date;
}

/** Sessão agregada por família (aparelho/navegador) para a lista de sessões. */
export interface SessionFamilyRecord {
  familyId: string;
  userId: string;
  channel: SessionChannel;
  deviceLabel: string | null;
  rememberMe: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  /** id da linha ativa (a que o access token atual referencia) */
  activeSessionId: string;
}

export interface ProgramRecord {
  code: string;
  name: string;
}

export interface PasswordResetRecord {
  id: string;
  userId: string;
  codeHash: string;
  codeExpiresAt: Date;
  attempts: number;
  sendCount: number;
  lastSentAt: Date;
  verifiedAt: Date | null;
  resetTokenHash: string | null;
  resetTokenExpiresAt: Date | null;
  usedAt: Date | null;
  invalidatedAt: Date | null;
  createdAt: Date;
}

export interface DeviceCredentialRecord {
  id: string;
  userId: string;
  tokenHash: string;
  deviceLabel: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface EnrollmentRecord {
  enrollmentId: string;
  subjectId: string;
  code: string;
  name: string;
  status: EnrollmentStatus;
}

export interface SubjectRecord {
  id: string;
  code: string;
  name: string;
}

export interface AssessmentRecord {
  id: string;
  subjectId: string;
  subjectName: string;
  title: string;
  type: AssessmentType;
  score: number | null;
  maxScore: number;
  appliedAt: string | null;
}

export interface AttendanceAggregateRecord {
  subjectId: string;
  subjectName: string;
  totalClasses: number;
  attendedClasses: number;
}

export interface PendingItemRecord {
  id: string;
  subjectId: string | null;
  subjectName: string | null;
  type: string;
  description: string;
  dueDate: string | null;
  status: PendingItemStatus;
}

export interface AgentEvidenceRecord {
  position: number;
  evidenceType: string;
  description: string;
  sourceReference: string | null;
}

export interface AgentRecommendationRecord {
  id: string;
  runId: string;
  type: string;
  message: string;
  nextAction: string | null;
  confidence: number | null;
  requiresHumanValidation: boolean;
  priority: number;
  subjectId: string | null;
  evidence: AgentEvidenceRecord[];
}

export interface AgentRunRecord {
  runId: string;
  studentId: string;
  agentName: string;
  agentVersion: string;
  configVersion: string;
  contractVersion: string;
  requestId: string;
  correlationId: string;
  status: AgentRunStatus;
  summary: string;
  confidence: number | null;
  abstained: boolean;
  abstentionReason: string | null;
  requiresHumanValidation: boolean;
  durationMs: number | null;
  evaluatedAt: Date;
  createdAt: Date;
}

export interface AgentFeedbackRecord {
  recommendationId: string;
  studentId: string;
  helpful: boolean;
  comment: string | null;
  createdAt: Date;
}

export interface AgentRunWithRecommendations extends AgentRunRecord {
  recommendations: AgentRecommendationRecord[];
}

export interface AuthContext {
  userId: string;
  role: UserRole;
  sessionId: string;
  /** canal da sessão; `web` quando a credencial veio do cookie do portal */
  channel?: SessionChannel;
  familyId?: string;
}

export interface RequestContext {
  requestId: string;
  correlationId: string;
  startedAt: number;
}

export interface AssistantInteractionRecord {
  interactionId: string;
  studentId: string;
  inputType: AssistantInputType;
  intent: string;
  intentConfidence: number;
  status: string;
  runId: string | null;
  requestId: string;
  correlationId: string;
  speechRecognitionMs: number | null;
  intentDurationMs: number;
  agentDurationMs: number | null;
  totalDurationMs: number;
  createdAt: Date;
}
