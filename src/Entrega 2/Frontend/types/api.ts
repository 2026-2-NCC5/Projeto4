/**
 * Contrato Mobile ↔ Node.js API — v1 (camelCase).
 *
 * FONTE CANÔNICA: src/Entrega 2/Backend/contracts/api/mobile-api.v1.ts
 * Cópias sincronizadas (verificadas em CI por src/Entrega 2/Backend/scripts/check-contracts-sync.sh):
 *   - src/Entrega 2/Backend/api/src/contracts/mobileApi.v1.ts
 *   - src/Entrega 2/Frontend/types/api.ts
 *
 * Alinhado à TASK-003 §35-36 e TASK-004 §23.
 */

export type UserRole = 'student' | 'institutional_staff' | 'technical_admin';

export interface ApiMeta {
  requestId: string;
  correlationId: string;
}

export interface ApiSuccess<T> {
  data: T;
  meta: ApiMeta;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DEPENDENCY_ERROR'
  | 'CONTRACT_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ApiErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  /** motivo estável para o app decidir a mensagem (ver AuthErrorReason) */
  reason?: string;
  details?: ApiErrorDetail[];
  /** presente em 429 RATE_LIMITED (também no header Retry-After) */
  retryAfterSeconds?: number;
  /** presente em código de verificação incorreto */
  attemptsRemaining?: number;
  requestId: string;
  correlationId: string;
}

export interface ApiError {
  error: ApiErrorBody;
}

// ---------------------------------------------------------------- auth

/**
 * Motivos estáveis de erro da autenticação (ApiErrorBody.reason).
 * Mensagens exibidas ao estudante são decididas pelo app; nunca a mensagem técnica.
 */
export type AuthErrorReason =
  | 'invalid_credentials'
  | 'account_disabled'
  | 'too_many_attempts'
  | 'rate_limited'
  | 'missing_token'
  | 'token_invalid'
  | 'token_expired'
  | 'session_revoked'
  | 'session_expired'
  | 'account_exists'
  | 'email_domain_not_allowed'
  | 'invalid_registration_number'
  | 'unknown_program'
  | 'weak_password'
  | 'code_invalid'
  | 'code_expired'
  | 'code_locked'
  | 'reset_token_invalid'
  | 'recovery_unavailable'
  | 'biometric_credential_invalid';

export interface LoginRequest {
  email: string;
  password: string;
  /** "Manter conectado": sessão prolongada que o app pode persistir no armazenamento seguro */
  rememberMe?: boolean;
}

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}

export interface AuthStudent {
  id: string;
  registrationNumber: string;
  program: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** segundos até expirar o access token */
  expiresIn: number;
  /** segundos até expirar o refresh token (renovado a cada refresh) */
  refreshExpiresIn: number;
  /** true quando a sessão foi criada com "Manter conectado" (ou biometria) */
  rememberMe: boolean;
  tokenType: 'Bearer';
  user: AuthUser;
  student: AuthStudent | null;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken?: string;
}

/** Política pública de autenticação — fonte única das regras exibidas e validadas no app. */
export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
}

export interface AuthPolicy {
  password: PasswordPolicy;
  /** domínios aceitos no cadastro, sem "@" (lista vazia = qualquer domínio) */
  allowedEmailDomains: string[];
  registrationNumber: { pattern: string; example: string };
  resetCode: { length: number; ttlSeconds: number; resendCooldownSeconds: number; maxAttempts: number };
  session: { rememberMeDays: number; shortSessionHours: number };
  biometric: { enabled: boolean; credentialTtlDays: number };
  /** URLs só existem quando configuradas no backend; o app não mostra links inexistentes */
  legal: { termsUrl: string | null; privacyUrl: string | null };
  /** false quando o envio de e-mail não está configurado */
  passwordRecoveryAvailable: boolean;
}

export interface ProgramOption {
  code: string;
  name: string;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  password: string;
  /** RA (matrícula), validado por AuthPolicy.registrationNumber.pattern */
  registrationNumber: string;
  /** código de ProgramOption; opcional */
  programCode?: string | null;
  rememberMe?: boolean;
}

export interface ForgotPasswordRequest {
  email: string;
}

/** Resposta sempre igual, exista ou não uma conta com o e-mail (evita enumeração). */
export interface ForgotPasswordResponse {
  message: string;
  codeLength: number;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
}

export type ResendResetCodeRequest = ForgotPasswordRequest;
export type ResendResetCodeResponse = ForgotPasswordResponse;

export interface VerifyResetCodeRequest {
  email: string;
  code: string;
}

export interface VerifyResetCodeResponse {
  /** token de uso único para redefinir a senha */
  resetToken: string;
  expiresInSeconds: number;
}

export interface ResetPasswordRequest {
  resetToken: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  message: string;
}

/** Credencial de dispositivo liberada por biometria. Nunca é a senha. */
export interface BiometricEnrollRequest {
  deviceLabel?: string;
}

export interface BiometricEnrollResponse {
  credentialId: string;
  credential: string;
  expiresInSeconds: number;
}

export interface BiometricLoginRequest {
  credentialId: string;
  credential: string;
}

export interface BiometricRevokeRequest {
  credentialId: string;
}

// ------------------------------------------------------------- student

export interface StudentProfile {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  registrationNumber: string;
  program: string | null;
}

export interface LastAnalysisSummary {
  runId: string;
  status: AgentRunStatus;
  summary: string;
  recommendationsCount: number;
  requiresHumanValidation: boolean;
  abstained: boolean;
  createdAt: string;
}

export interface StudentSummary {
  subjectsCount: number;
  pendingCount: number;
  /** disciplinas referenciadas por recomendações da última análise */
  attentionCount: number;
  averageScore: number | null;
  averageAttendanceRate: number | null;
  lastAnalysis: LastAnalysisSummary | null;
}

export type EnrollmentStatus = 'active' | 'completed' | 'cancelled';

export interface StudentSubject {
  id: string;
  code: string;
  name: string;
  enrollmentStatus: EnrollmentStatus;
  averageScore: number | null;
  attendanceRate: number | null;
  pendingCount: number;
  /** true quando a última análise gerou recomendação para esta disciplina */
  attention: boolean;
}

export type AssessmentType = 'exam' | 'assignment' | 'project' | 'other';

export interface StudentAssessment {
  id: string;
  subjectId: string;
  subjectName: string;
  title: string;
  type: AssessmentType;
  score: number | null;
  maxScore: number;
  appliedAt: string | null;
}

export interface StudentAttendance {
  subjectId: string;
  subjectName: string;
  totalClasses: number;
  attendedClasses: number;
  attendanceRate: number | null;
}

export type PendingItemStatus = 'pending' | 'completed' | 'overdue';

export interface StudentPendingItem {
  id: string;
  subjectId: string | null;
  subjectName: string | null;
  type: string;
  description: string;
  dueDate: string | null;
  status: PendingItemStatus;
}

// --------------------------------------------------------------- agent

export type AgentRunStatus = 'recommendation' | 'no_action' | 'abstained';

export type AgentRecommendation = {
  id: string;
  type: string;
  message: string;
  evidence: string[];
  nextAction: string | null;
  confidence: number | null;
  requiresHumanValidation: boolean;
  priority: number;
  subjectId: string | null;
};

export type AgentAnalysis = {
  runId: string;
  agent: 'student_agent';
  version: string;
  configVersion: string;
  status: AgentRunStatus;
  summary: string;
  recommendations: AgentRecommendation[];
  confidence: number | null;
  requiresHumanValidation: boolean;
  abstained: boolean;
  abstentionReason: string | null;
  correlationId: string;
  createdAt: string;
};

export interface AgentHistoryItem {
  runId: string;
  status: AgentRunStatus;
  summary: string;
  recommendationsCount: number;
  requiresHumanValidation: boolean;
  abstained: boolean;
  confidence: number | null;
  correlationId: string;
  createdAt: string;
}

export interface AgentRecommendationDetail extends AgentRecommendation {
  runId: string;
  runStatus: AgentRunStatus;
  createdAt: string;
}

export interface HealthStatus {
  status: 'ok' | 'degraded';
  service: 'api';
  version: string;
  database: 'up' | 'down' | 'not_configured';
  agentService: 'up' | 'down';
}

// ----------------------------------------------------------- assistant
// Assistente conversacional (voz/texto) — interface do Agente para o Estudante.
// POST /api/assistant/message. Adição compatível (v1.1 do contrato mobile).
// v1.2: `currentScreen` na requisição (contexto da tela), intenção `open_screen`,
// entidade `screen` e `navigation` na resposta (ação de navegação executada pelo app).

export type AssistantInputType = 'voice' | 'text';

/** Allow-list de intenções. Qualquer outra intenção é rejeitada pela API. */
export type AssistantIntent =
  | 'greeting'
  | 'help'
  | 'unknown'
  | 'get_student_summary'
  | 'get_pending_items'
  | 'get_subjects'
  | 'get_subject_details'
  | 'get_assessments'
  | 'get_next_assessment'
  | 'get_latest_grade'
  | 'get_attendance'
  | 'get_subject_attendance'
  | 'run_student_analysis'
  | 'get_recommendations'
  | 'explain_recommendation'
  | 'get_next_action'
  | 'get_agent_history'
  | 'request_human_help'
  | 'predict_outcome'
  | 'administrative_request'
  | 'access_other_student'
  | 'repeat_last'
  | 'stop_speaking'
  | 'go_back'
  | 'clarify_last'
  | 'open_screen';

/** Tela visível no app quando a mensagem foi enviada (ajuda a interpretar perguntas curtas). */
export type AssistantScreenContext =
  | 'home'
  | 'academic.subjects'
  | 'academic.assessments'
  | 'academic.attendance'
  | 'academic.pending'
  | 'assistant'
  | 'services'
  | 'history'
  | 'profile'
  | 'recommendation'
  | 'run';

export type AssistantPeriod = 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'overdue';

export interface AssistantEntities {
  subjectId?: string;
  subjectName?: string;
  period?: AssistantPeriod;
  assessmentType?: AssessmentType;
  /** destino pedido em "abra minhas notas" (intenção open_screen) */
  screen?: AssistantNavigationTarget;
}

/** Contexto mínimo da conversa atual (sem histórico). Nunca define identidade. */
export interface AssistantConversationContext {
  lastIntent?: AssistantIntent;
  lastSubjectId?: string;
  lastRecommendationId?: string;
  lastRunId?: string;
}

export interface AssistantClientMetrics {
  /** duração do reconhecimento de fala no dispositivo (ms) */
  speechRecognitionMs?: number;
}

export interface AssistantMessageRequest {
  inputType: AssistantInputType;
  /** texto digitado ou transcrição da fala (1–500 caracteres) */
  text: string;
  conversationContext?: AssistantConversationContext;
  /** tela em que o estudante estava ao perguntar; nunca define identidade nem autorização */
  currentScreen?: AssistantScreenContext;
  clientMetrics?: AssistantClientMetrics;
}

export type AssistantResponseStatus =
  | 'success'
  | 'empty'
  | 'not_found'
  | 'needs_clarification'
  | 'abstained'
  | 'human_validation'
  | 'refused';

export type AssistantItemTone = 'neutral' | 'info' | 'success' | 'attention' | 'danger';

export interface AssistantDisplayItem {
  id: string;
  title: string;
  description: string | null;
  meta: string | null;
  badge: string | null;
  tone: AssistantItemTone;
  subjectId: string | null;
}

export interface AssistantDisplay {
  title: string;
  message: string;
  items: AssistantDisplayItem[];
  /** recomendações do Agente (com evidências e próxima ação) quando a resposta é uma análise */
  recommendations: AgentRecommendation[];
}

export type AssistantNavigationTarget =
  | 'home'
  | 'academic.subjects'
  | 'academic.assessments'
  | 'academic.attendance'
  | 'academic.pending'
  | 'assistant'
  | 'assistant.analysis'
  | 'services'
  | 'history'
  | 'profile'
  | 'subject'
  | 'recommendation'
  | 'run';

export interface AssistantNavigationParams {
  subjectId?: string;
  recommendationId?: string;
  runId?: string;
}

export type AssistantNextAction =
  | { type: 'navigate'; label: string; target: AssistantNavigationTarget; params?: AssistantNavigationParams }
  | { type: 'ask'; label: string; text: string }
  | { type: 'run_analysis'; label: string };

/** Comando executado apenas no dispositivo (não altera dados). */
export type AssistantClientCommand = 'repeat_last' | 'stop_speaking' | 'go_back';

/** Navegação que o app executa ao receber a resposta (ex.: "abra minhas notas"). Somente destinos da allow-list. */
export interface AssistantNavigationAction {
  target: AssistantNavigationTarget;
  params?: AssistantNavigationParams;
}

export interface AssistantResponse {
  interactionId: string;
  requestId: string;
  correlationId: string;
  inputType: AssistantInputType;
  intent: AssistantIntent;
  intentConfidence: number;
  entities: AssistantEntities;
  status: AssistantResponseStatus;
  display: AssistantDisplay;
  /** resumo curto para Text-to-Speech; vazio quando não há o que falar */
  speech: { text: string };
  nextActions: AssistantNextAction[];
  clientCommand: AssistantClientCommand | null;
  /** presente quando a intenção pede para abrir uma tela; o app navega após mostrar a resposta */
  navigation?: AssistantNavigationAction | null;
  requiresHumanValidation: boolean;
  abstained: boolean;
  abstentionReason: string | null;
  /** run_id do Agente quando a resposta envolveu uma execução/análise */
  runId: string | null;
  /** contexto a ser reenviado na próxima mensagem */
  context: AssistantConversationContext;
  createdAt: string;
}
