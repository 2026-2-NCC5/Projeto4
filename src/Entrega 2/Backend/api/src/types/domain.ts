import type { UserRole, EnrollmentStatus, AssessmentType, PendingItemStatus, AgentRunStatus, AssistantInputType } from '../contracts/mobileApi.v1.js';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
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

export interface AgentRunWithRecommendations extends AgentRunRecord {
  recommendations: AgentRecommendationRecord[];
}

export interface AuthContext {
  userId: string;
  role: UserRole;
  sessionId: string;
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
