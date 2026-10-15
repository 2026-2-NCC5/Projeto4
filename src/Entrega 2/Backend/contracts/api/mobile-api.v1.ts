/**
 * Contrato Mobile ↔ Node.js API — v1 (camelCase).
 *
 * FONTE CANÔNICA: src/Entrega 2/Backend/contracts/api/mobile-api.v1.ts
 * Cópias sincronizadas (verificadas em CI por src/Entrega 2/Backend/scripts/check-contracts-sync.sh):
 *   - src/Entrega 2/Backend/api/src/contracts/mobileApi.v1.ts
 *   - src/Entrega 2/Frontend/types/api.ts
 *   - src/Entrega 2/Web/src/types/api.ts (portal web, v1.5+)
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
  | 'biometric_credential_invalid'
  // v1.5 (plataforma)
  | 'demo_account_disabled'
  | 'csrf_failed';

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
  /** v1.7: avaliação do próprio estudante (null = ainda não avaliou) */
  feedback?: AgentRecommendationFeedback | null;
}

/** v1.7: POST /api/agent/recommendations/:id/feedback — uma avaliação por recomendação. */
export interface AgentFeedbackRequest {
  helpful: boolean;
  comment?: string | null;
}

export interface AgentRecommendationFeedback {
  helpful: boolean;
  comment: string | null;
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
// v1.4: intenções da fila presencial (`get_queue_*`) e tela/destino `queue` (ver seção queue).

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
  | 'open_screen'
  | 'get_queue_status'
  | 'get_queue_current_call'
  | 'get_queue_estimate'
  // v1.7: resposta a partir de artigo publicado da base de conhecimento (com fonte)
  | 'knowledge_question';

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
  | 'run'
  | 'queue';

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
  | 'run'
  | 'queue';

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
  /** v1.7: artigos que fundamentam a resposta (citação com versão e data) */
  sources?: AssistantSource[];
  /** v1.7: sugestão de encaminhamento ao ASA — o cliente mostra o resumo e SÓ abre o chamado após confirmação */
  handoff?: AssistantHandoff | null;
  /** v1.7: provedor que produziu a resposta (hoje sempre "existing": regras + base de conhecimento) */
  provider?: { id: 'existing' | 'jev'; label: string };
}

/** v1.7: citação de artigo da base de conhecimento. */
export interface AssistantSource {
  type: 'knowledge_article';
  articleId: string;
  slug: string;
  title: string;
  version: number;
  publishedAt: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
}

/** v1.7: rascunho de chamado proposto pelo assistente (nunca criado sem a confirmação do aluno). */
export interface AssistantHandoff {
  categoryId: string;
  subject: string;
  description: string;
  reason: string;
}

// ---- support (Atendimento) ------------------------------------------------
// Chamados de atendimento do estudante com o ASA: abertura, acompanhamento, mensagens, anexos, prazos
// (SLA), notificações e avaliação. Adição compatível (v1.3 do contrato mobile); nenhum tipo existente mudou.
// Rotas do estudante em /api/support/* (o estudante vem sempre da sessão, nunca do corpo da requisição);
// rotas da equipe em /api/support/staff/* (papéis institutional_staff e technical_admin).

/**
 * Situação do chamado. Rascunhos não existem no servidor: ficam apenas no aparelho até o envio.
 * `submitted` dura só até o reconhecimento automático (`received`), na mesma transação da abertura.
 */
export type SupportTicketStatus =
  | 'submitted'
  | 'received'
  | 'triage'
  | 'assigned'
  | 'in_analysis'
  | 'in_progress'
  | 'waiting_student'
  | 'waiting_department'
  | 'waiting_external'
  | 'resolved'
  | 'closed'
  | 'cancelled'
  | 'reopened';

/** Definida pelo sistema (categoria) ou pela equipe; o estudante não escolhe a prioridade. */
export type SupportTicketPriority = 'normal' | 'high' | 'urgent';

/** Situação do prazo, calculada no servidor a cada leitura. */
export type SupportSlaStatus = 'on_track' | 'attention' | 'near_deadline' | 'overdue' | 'paused' | 'completed';

export type SupportActorType = 'student' | 'agent' | 'system' | 'department';

export type SupportTicketEventType =
  | 'ticket_created'
  | 'ticket_received'
  | 'ticket_triaged'
  | 'ticket_assigned'
  | 'status_changed'
  | 'message_received'
  | 'message_sent'
  | 'file_uploaded'
  | 'student_action_required'
  | 'student_response_received'
  | 'department_forwarded'
  | 'resolution_proposed'
  | 'ticket_resolved'
  | 'ticket_closed'
  | 'ticket_reopened'
  | 'ticket_cancelled'
  | 'rating_submitted'
  | 'priority_changed'
  | 'internal_note';

export interface SupportSubcategory {
  id: string;
  label: string;
}

/** Artigo curto da Central de ajuda, sugerido antes de abrir um chamado (nunca bloqueia a abertura). */
export interface SupportHelpArticle {
  id: string;
  categoryId: string;
  title: string;
  summary: string;
  steps: string[];
}

export interface SupportCategory {
  id: string;
  label: string;
  description: string;
  subcategories: SupportSubcategory[];
  /** prazo de resposta em dias úteis (base da previsão exibida ao estudante) */
  slaBusinessDays: number;
  /** equipe que costuma cuidar da categoria (exibida como "Equipe responsável") */
  defaultTeam: string;
  /** v1.8: meta vigente de primeira resposta da equipe, em horas corridas */
  firstResponseHours?: number;
}

export interface SupportCatalog {
  categories: SupportCategory[];
  articles: SupportHelpArticle[];
  limits: SupportLimits;
  /** v1.5: equipes que podem receber um chamado (encaminhamento pela equipe ASA) */
  teams?: string[];
}

export interface SupportLimits {
  subjectMinLength: number;
  subjectMaxLength: number;
  descriptionMinLength: number;
  descriptionMaxLength: number;
  messageMaxLength: number;
  maxAttachmentsPerTicket: number;
  /** v1.5: arquivos por envio (abertura ou mensagem) */
  maxAttachmentsPerSubmission?: number;
  maxAttachmentBytes: number;
  allowedMimeTypes: string[];
  /** dias, após a resolução, em que o estudante ainda pode reabrir o chamado */
  reopenWindowDays: number;
}

export interface SupportTicketSla {
  status: SupportSlaStatus;
  targetBusinessDays: number;
  startedAt: string;
  dueAt: string;
  pausedAt: string | null;
  resumedAt: string | null;
  completedAt: string | null;
}

/** O que o ASA precisa do estudante para continuar (status `waiting_student`). */
export interface SupportPendingAction {
  title: string;
  description: string;
  requestedAt: string;
  /** a ação pede um arquivo (ex.: comprovante) — o app destaca "Enviar documento" */
  expectsAttachment: boolean;
}

export interface SupportAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: 'student' | 'agent';
  /** "Você" no app quando uploadedBy = student; nome da equipe quando agent */
  uploaderName: string;
  messageId: string | null;
}

/** Arquivo enviado e ainda não vinculado a um chamado/mensagem (expira se não for usado). */
export interface SupportUpload {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string;
}

export interface SupportUploadRequest {
  name: string;
  mimeType: string;
  /** conteúdo em base64 (sem prefixo data:) */
  contentBase64: string;
}

/** Link temporário (assinado) para abrir um anexo fora do app; `url` é relativo à URL base da API. */
export interface SupportAttachmentLink {
  url: string;
  expiresAt: string;
}

export interface SupportEventDetail {
  label: string;
  value: string;
}

/** Evento público do histórico (auditoria somente-inserção; eventos internos nunca chegam ao estudante). */
export interface SupportTicketEvent {
  id: string;
  type: SupportTicketEventType;
  title: string;
  description: string | null;
  createdAt: string;
  actorType: SupportActorType;
  /** nome público (estudante ou equipe) — nunca dados pessoais de atendentes */
  actorName: string | null;
  fromStatus: SupportTicketStatus | null;
  toStatus: SupportTicketStatus | null;
  /** detalhes exibidos ao expandir o evento (Responsável, Observação...) */
  details: SupportEventDetail[];
}

export interface SupportTicketMessage {
  id: string;
  senderType: 'student' | 'agent';
  senderName: string;
  content: string;
  createdAt: string;
  /** quando o outro lado leu: mensagens da equipe → aluno; mensagens do aluno → equipe (v1.5); null = não lida */
  readAt: string | null;
  attachments: SupportAttachment[];
}

export interface SupportTicketRating {
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  createdAt: string;
}

export interface SupportLastActivity {
  title: string;
  createdAt: string;
}

/** v1.5: dados internos da fila da equipe (preenchidos só em /api/support/staff/*; nunca para o aluno). */
export interface SupportStaffSummaryInfo {
  studentId: string;
  studentName: string;
  registrationNumber: string;
  assignedTeam: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  channel: 'app' | 'web';
}

/** Item da lista "Meus chamados". */
export interface SupportTicketSummary {
  id: string;
  protocol: string;
  subject: string;
  categoryId: string;
  categoryLabel: string;
  subcategoryId: string | null;
  subcategoryLabel: string | null;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  createdAt: string;
  updatedAt: string;
  lastActivity: SupportLastActivity | null;
  /** mensagens ainda não lidas por quem consulta (aluno: da equipe; equipe: do aluno) */
  unreadCount: number;
  requiresStudentAction: boolean;
  sla: SupportTicketSla;
  /** v1.5: só na fila da equipe */
  staff?: SupportStaffSummaryInfo;
}

/** Detalhe completo do chamado. As permissões (`can*`) são decididas pelo servidor. */
/**
 * v1.8: primeira resposta da equipe. O prazo é gravado na abertura (meta da categoria, horas corridas); a
 * resposta é a primeira ação pública da equipe no histórico (mensagem, assumir, encaminhar, resolver).
 * not_applicable = chamado encerrado sem resposta da equipe (ex.: cancelado pelo aluno).
 */
export interface SupportFirstResponse {
  dueAt: string;
  respondedAt: string | null;
  status: 'pending' | 'met' | 'late' | 'overdue' | 'not_applicable';
}

export interface SupportTicket extends SupportTicketSummary {
  description: string;
  /** canal de abertura; `web` desde a v1.5 (portal) */
  channel: 'app' | 'web';
  /** equipe que está cuidando agora (ex.: "Secretaria Acadêmica") */
  assignedTeam: string;
  pendingAction: SupportPendingAction | null;
  resolution: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  reopenedCount: number;
  rating: SupportTicketRating | null;
  canReply: boolean;
  canCancel: boolean;
  canReopen: boolean;
  canRate: boolean;
  /** até quando a reabertura é permitida (null quando não se aplica) */
  reopenDeadline: string | null;
  /** v1.8: primeira resposta da equipe (null em chamados abertos antes da meta existir) */
  firstResponse?: SupportFirstResponse | null;
  events: SupportTicketEvent[];
  messages: SupportTicketMessage[];
  attachments: SupportAttachment[];
}

export interface SupportTicketCounts {
  all: number;
  /** em andamento (não resolvidos, encerrados nem cancelados), inclusive aguardando você */
  active: number;
  waitingStudent: number;
  /** resolvidos, encerrados ou cancelados */
  finished: number;
  byStatus: Partial<Record<SupportTicketStatus, number>>;
}

/** GET /api/support/tickets?status=a,b&search=texto&limit=20&cursor=... */
export interface SupportTicketList {
  items: SupportTicketSummary[];
  nextCursor: string | null;
  counts: SupportTicketCounts;
}

/** GET /api/support/overview — resumo para a Home (um único chamado em destaque, quando relevante). */
export interface SupportOverview {
  activeCount: number;
  waitingStudentCount: number;
  unreadMessagesCount: number;
  unreadNotificationsCount: number;
  highlight: SupportTicketSummary | null;
}

export interface SupportTicketCreateRequest {
  /** chave de idempotência gerada pelo app: repetir o envio devolve o mesmo chamado */
  clientRequestId: string;
  categoryId: string;
  subcategoryId?: string | null;
  subject: string;
  description: string;
  attachmentIds?: string[];
}

export interface SupportMessageCreateRequest {
  /** chave de idempotência da mensagem (reenvio após falha de rede não duplica) */
  clientMessageId: string;
  content: string;
  attachmentIds?: string[];
}

export interface SupportCancelRequest {
  reason?: string;
}

export interface SupportReopenRequest {
  reason: string;
}

export interface SupportRatingRequest {
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string | null;
}

export type SupportNotificationKind =
  | 'ticket_received'
  | 'status_changed'
  | 'new_message'
  | 'action_required'
  | 'file_available'
  | 'ticket_resolved'
  | 'ticket_closed';

/** Notificação do centro de avisos do app (também é o payload para um futuro push: abre o chamado). */
export interface SupportNotification {
  id: string;
  ticketId: string;
  protocol: string;
  kind: SupportNotificationKind;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface SupportNotificationList {
  items: SupportNotification[];
  unreadCount: number;
}

export interface SupportNotificationsReadRequest {
  /** sem ids: marca todas como lidas */
  ids?: string[];
}

// Equipe (institutional_staff / technical_admin) -----------------------------

export type SupportEventVisibility = 'public' | 'internal';

export interface SupportStaffTicketEvent extends SupportTicketEvent {
  visibility: SupportEventVisibility;
}

export interface SupportStaffTicket extends Omit<SupportTicket, 'events'> {
  student: { id: string; fullName: string; registrationNumber: string };
  events: SupportStaffTicketEvent[];
  /** v1.5: atendente que assumiu (interno; o aluno vê só a equipe) */
  assignedAgent?: { id: string; fullName: string } | null;
  /** v1.5: mensagens do aluno ainda não lidas pela equipe */
  unreadFromStudent?: number;
}

export interface SupportStaffStatusRequest {
  status: SupportTicketStatus;
  /** observação pública exibida no histórico do estudante */
  publicNote?: string;
}

export interface SupportStaffAssignRequest {
  team: string;
  publicNote?: string;
}

export interface SupportStaffMessageRequest {
  content: string;
  attachmentIds?: string[];
  /** pede uma ação do estudante e coloca o chamado em `waiting_student` */
  requestAction?: { title: string; description: string; expectsAttachment?: boolean };
}

export interface SupportStaffNoteRequest {
  content: string;
}

export interface SupportStaffPriorityRequest {
  priority: SupportTicketPriority;
}

export interface SupportStaffResolveRequest {
  resolution: string;
}

// ---- queue (Fila presencial do ASA) ----------------------------------------
// Fila presencial do ASA (https://presencial.fecap.br/) acompanhada por UM monitor no backend, que
// envia push e eventos em tempo real. Adição compatível (v1.4 do contrato mobile); nenhum tipo existente
// mudou. Rotas: GET /api/queue, GET /api/queue/status, GET /api/queue/stream (SSE),
// POST|GET|PATCH|DELETE /api/queue/subscriptions(/current), POST|DELETE /api/notifications/push-token,
// GET /health/queue. O estudante vem sempre da sessão; nunca do corpo da requisição.
// Senhas são SEMPRE strings ("0029"): zeros à esquerda fazem parte da senha.

/** "empty" (ninguém na fila agora) é diferente de "closed" (atendimento encerrado, só quando a fonte informa). */
export type QueueSourceStatus = 'open' | 'empty' | 'unavailable' | 'closed';

/** live: atualizado agora; stale: leitura antiga; unavailable: a fonte não responde (dados = último estado válido). */
export type QueueSyncStatus = 'live' | 'stale' | 'unavailable' | 'starting' | 'disabled';

export type QueueCallServiceStatus = 'in_service' | 'completed' | 'unknown';

export interface QueueCallView {
  ticket: string;
  /** null quando a fonte não informa a mesa (nunca inventada) */
  desk: string | null;
  calledAt: string | null;
  serviceStatus: QueueCallServiceStatus;
}

export interface QueueWaitingView {
  ticket: string;
  /** posição informada pelo painel ("PRÓXIMAS SENHAS") */
  position: number;
}

export interface QueueSyncInfo {
  status: QueueSyncStatus;
  lastSuccessfulSyncAt: string | null;
  snapshotAgeSeconds: number | null;
  pollIntervalSeconds: number;
  /** v1.5: origem dos dados — `demo` é o simulador (dados fictícios, exibir como DEMONSTRAÇÃO) */
  source?: QueueDataSource;
}

/** v1.5: de onde vêm os dados da fila e se a instituição autorizou a fonte. */
export interface QueueDataSource {
  kind: 'demo' | 'public_panel';
  label: string;
  authorized: boolean;
}

export interface QueueOverview {
  /** null antes da primeira leitura */
  status: QueueSourceStatus | null;
  latestCall: QueueCallView | null;
  /** última senha chamada em cada mesa (atendimentos simultâneos) */
  currentCalls: QueueCallView[];
  recentCalls: QueueCallView[];
  upcoming: QueueWaitingView[];
  /** null quando o painel tem mais senhas do que as lidas */
  upcomingCount: number | null;
  sync: QueueSyncInfo;
}

export type QueueSubscriptionStatus = 'waiting' | 'approaching' | 'next' | 'called' | 'completed' | 'expired' | 'cancelled';

/** Alertas progressivos; cada um acontece no máximo uma vez por acompanhamento. */
export type QueueAlertMilestone = 'QUEUE_5_AHEAD' | 'QUEUE_3_AHEAD' | 'QUEUE_NEXT' | 'QUEUE_CALLED';

export interface QueueAlertPreferences {
  pushEnabled: boolean;
  voiceEnabled: boolean;
  vibrationEnabled: boolean;
}

/** Faixa aproximada calculada pelo ritmo real de chamadas; ausente quando não há dados suficientes. */
export interface QueueEstimate {
  minMinutes: number;
  maxMinutes: number;
  confidence: 'low' | 'medium';
  basedOnCalls: number;
  activeDesks: number;
}

export type QueueTimelineEventType = 'subscribed' | QueueAlertMilestone | 'completed' | 'expired' | 'cancelled';

export interface QueueTimelineEntry {
  type: QueueTimelineEventType;
  at: string;
  ahead: number | null;
  desk: string | null;
}

export interface QueueSubscription {
  id: string;
  ticket: string;
  status: QueueSubscriptionStatus;
  /** última posição conhecida; confira `positionKnown` antes de afirmar */
  position: number | null;
  ahead: number | null;
  /** true quando a posição veio da leitura atual do painel */
  positionKnown: boolean;
  calledDesk: string | null;
  calledAt: string | null;
  /** a senha já tinha sido chamada antes de o acompanhamento começar (sem alerta de "é a sua vez") */
  alreadyCalled: boolean;
  lastAlert: QueueAlertMilestone | null;
  estimate: QueueEstimate | null;
  preferences: QueueAlertPreferences;
  createdAt: string;
  updatedAt: string;
  /** fim do dia de atendimento: o acompanhamento expira sozinho */
  expiresAt: string;
  timeline: QueueTimelineEntry[];
}

export interface QueueStatus {
  queue: QueueOverview;
  subscription: QueueSubscription | null;
  serverTime: string;
}

export interface QueueSubscribeRequest extends Partial<QueueAlertPreferences> {
  ticket: string;
}

export type QueuePreferencesRequest = Partial<QueueAlertPreferences>;

/** Eventos do canal em tempo real (SSE `event:`). `queue.status` traz um QueueStatus completo. */
export type QueueRealtimeEventType =
  | 'queue.status'
  | 'queue.sync'
  | 'queue.ticket.position_changed'
  | 'queue.ticket.approaching'
  | 'queue.ticket.next'
  | 'queue.ticket.called'
  | 'queue.ticket.completed'
  | 'queue.ticket.expired';

export interface QueueTicketRealtimeEvent {
  type: Exclude<QueueRealtimeEventType, 'queue.status' | 'queue.sync'>;
  subscriptionId: string;
  ticket: string;
  status: QueueSubscriptionStatus;
  position: number | null;
  ahead: number | null;
  desk: string | null;
  calledAt: string | null;
  milestone: QueueAlertMilestone | null;
  late: boolean;
  timestamp: string;
}

export interface QueueSyncEvent {
  status: QueueSourceStatus | null;
  sync: QueueSyncInfo;
}

/** `data` das notificações push da fila. Tocar abre asaconecta://atendimento/fila. */
export interface QueuePushData {
  type: QueueTicketRealtimeEvent['type'];
  subscriptionId: string;
  ticket: string;
  desk: string | null;
  ahead: number | null;
  milestone: QueueAlertMilestone;
  url: string;
  screen: 'queue';
}

export type PushPlatform = 'ios' | 'android' | 'web';

export interface PushTokenRegisterRequest {
  /** Expo push token ("ExponentPushToken[...]") */
  token: string;
  platform: PushPlatform;
}

export interface PushTokenUnregisterRequest {
  token: string;
}

export interface QueueHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'disabled';
  provider: string;
  leader: boolean;
  lastSuccessfulSync: string | null;
  snapshotAgeSeconds: number | null;
  consecutiveFailures: number;
  circuit: 'closed' | 'open' | 'half_open';
  pollIntervalSeconds: number;
  metrics: Record<string, number | null>;
}

// ---- platform (Portal web, sessões, permissões e avisos) — v1.5 ------------
// Adição compatível (v1.5): nenhum tipo existente mudou de forma incompatível.
// Rotas: GET /api/platform/info · GET /api/auth/me · GET /api/auth/sessions · DELETE /api/auth/sessions/:id ·
// POST /api/auth/sessions/revoke-others · POST /api/auth/logout-all · GET /api/web/auth/csrf ·
// POST /api/web/auth/{session,login,register,refresh,logout} (cookies HttpOnly + CSRF; o app continua com Bearer) ·
// GET|PATCH /api/notifications · GET|PATCH /api/notifications/preferences.

export type SessionChannel = 'mobile' | 'web';

/**
 * Permissões efetivas (ação:recurso[:escopo]) calculadas pela API a partir do papel.
 * A API é a autoridade: menus e guardas de rota dos clientes são apenas experiência de uso.
 */
export type Permission =
  | 'account:read:own'
  | 'account:sessions:own'
  | 'notifications:read:own'
  | 'academic:read:own'
  | 'agent:run:own'
  | 'agent:feedback:own'
  | 'assistant:use'
  | 'tickets:create:own'
  | 'tickets:read:own'
  | 'tickets:read:any'
  | 'tickets:read:metadata'
  | 'tickets:manage'
  | 'tickets:internal_note'
  | 'appointments:book:own'
  | 'appointments:read:any'
  | 'appointments:manage'
  | 'availability:manage:own'
  | 'availability:manage:any'
  | 'kb:read:published'
  | 'kb:read:all'
  | 'kb:write'
  | 'kb:publish'
  | 'students:read:support_context'
  | 'metrics:read'
  | 'reports:export'
  | 'agent:insights:read'
  | 'audit:read:own'
  | 'audit:read:any'
  | 'users:manage'
  | 'sessions:revoke:any'
  | 'settings:manage'
  | 'sla:manage'
  | 'automations:manage'
  | 'integrations:read'
  | 'health:read'
  | 'permissions:read';

/** Uma sessão (aparelho ou navegador). `id` é estável entre renovações do token. */
export interface AuthSessionSummary {
  id: string;
  channel: SessionChannel;
  /** ex.: "Chrome no Linux"; nunca o user-agent completo */
  deviceLabel: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  rememberMe: boolean;
  /** true para a sessão que fez a requisição */
  current: boolean;
}

export interface AuthSessionList {
  items: AuthSessionSummary[];
}

export interface RevokeSessionsResult {
  revoked: number;
}

/** GET /api/auth/me — mesma resposta para o app (Bearer) e o portal (cookie). */
export interface AuthMe {
  user: AuthUser;
  /** "Aluno", "Equipe ASA" ou "Administração" */
  roleLabel: string;
  permissions: Permission[];
  student: AuthStudent | null;
  /** conta fictícia de demonstração */
  isDemo: boolean;
  session: AuthSessionSummary;
}

/** POST /api/web/auth/login — tokens ficam em cookies HttpOnly; o corpo nunca traz tokens. */
export interface WebLoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export type WebRegisterRequest = RegisterRequest;

export interface WebSession {
  user: AuthUser;
  student: AuthStudent | null;
  rememberMe: boolean;
  /** segundos até expirar o cookie de acesso (renovado por POST /api/web/auth/refresh) */
  expiresIn: number;
  refreshExpiresIn: number;
  /** enviar no cabeçalho X-CSRF-Token em toda requisição que altera dados */
  csrfToken: string;
}

export interface CsrfToken {
  csrfToken: string;
}

/**
 * POST /api/web/auth/session — abertura do portal: devolve a sessão (renovando pelo cookie quando o acesso
 * expirou) ou `authenticated: false`, sempre com 200 (sem 401 para quem simplesmente não entrou).
 */
export interface WebSessionState {
  authenticated: boolean;
  me: AuthMe | null;
  csrfToken: string;
}

export type DataMode = 'demo' | 'institutional';

export interface PlatformAnnouncement {
  text: string;
  tone: 'info' | 'attention';
  updatedAt: string;
}

export interface PlatformLink {
  label: string;
  url: string;
}

export interface BusinessHoursInterval {
  /** "08:00" */
  start: string;
  end: string;
}

export interface BusinessHoursDay {
  /** 0 = domingo … 6 = sábado */
  weekday: number;
  label: string;
  intervals: BusinessHoursInterval[];
}

export interface AsaBusinessHours {
  timezone: string;
  days: BusinessHoursDay[];
  note: string | null;
}

/** GET /api/platform/info — público; define o rótulo DEMONSTRAÇÃO/INSTITUCIONAL e os recursos ativos. */
export interface PlatformInfo {
  name: string;
  institution: string;
  environment: 'development' | 'test' | 'staging' | 'demo' | 'production';
  apiVersion: string;
  contractVersion: string;
  dataMode: DataMode;
  /** "DEMONSTRAÇÃO — Dados fictícios" ou "INSTITUCIONAL — Dados autorizados" */
  dataModeLabel: string;
  academicSource: {
    provider: 'demo' | 'institutional';
    status: 'demo' | 'available' | 'unavailable';
    message: string;
  };
  features: {
    tickets: boolean;
    appointments: boolean;
    knowledgeBase: boolean;
    notifications: boolean;
    realtime: boolean;
    assistant: boolean;
  };
  assistant: {
    provider: 'existing' | 'jev';
    providerLabel: string;
    jev: { status: 'planned' | 'not_configured' | 'operational'; enabled: boolean };
  };
  queue: { enabled: boolean; source: 'demo' | 'public_panel' | 'disabled'; authorized: boolean };
  announcement: PlatformAnnouncement | null;
  businessHours: AsaBusinessHours;
  links: PlatformLink[];
  timezone: string;
  serverTime: string;
}

export type NotificationCategory = 'support' | 'appointment' | 'agent' | 'account' | 'system' | 'knowledge';

export interface InboxNotificationResource {
  type: 'ticket' | 'appointment' | 'recommendation' | 'article';
  id: string;
}

/** Aviso da central (une os avisos de chamados do aluno e os demais avisos internos). */
export interface InboxNotification {
  id: string;
  category: NotificationCategory;
  kind: string;
  title: string;
  body: string;
  resource: InboxNotificationResource | null;
  createdAt: string;
  readAt: string | null;
}

export interface InboxNotificationList {
  items: InboxNotification[];
  unreadCount: number;
}

/** PATCH /api/notifications — sem `ids`, marca todos como lidos. */
export interface InboxReadRequest {
  read: true;
  ids?: string[];
}

export interface NotificationPreference {
  category: NotificationCategory;
  label: string;
  pushEnabled: boolean;
}

export interface NotificationPreferences {
  items: NotificationPreference[];
  /** push depende de um aparelho registrado (build EAS); o inbox interno funciona sempre */
  pushDelivery: 'available' | 'unavailable';
  note: string;
}

export interface NotificationPreferencesUpdate {
  items: Array<{ category: NotificationCategory; pushEnabled: boolean }>;
}

// ---- operations (Operação ASA: painel, métricas, relatórios, alunos atendidos, auditoria) — v1.5
// Rotas: GET /api/asa/dashboard · GET /api/asa/metrics?from&to · GET /api/asa/reports/tickets.csv?from&to ·
// GET /api/asa/students?search · GET /api/asa/students/:id · GET /api/audit/mine. Todos os números vêm do banco
// no momento da consulta (`generatedAt`) e informam a origem (`source`).

export interface MetricSource {
  /** tabelas/consulta de origem, em linguagem simples */
  description: string;
  generatedAt: string;
  timezone: string;
  /** modo demonstração: números de dados fictícios */
  dataMode: DataMode;
}

export interface AsaDashboard {
  tickets: {
    open: number;
    awaitingTeam: number;
    waitingStudent: number;
    unassigned: number;
    assignedToMe: number;
    unreadFromStudents: number;
    slaNearDeadline: number;
    slaOverdue: number;
  };
  atRisk: SupportTicketSummary[];
  appointmentsToday: { total: number; confirmed: number; completed: number; noShow: number } | null;
  source: MetricSource;
}

export interface MetricsSeriesPoint {
  /** YYYY-MM-DD no fuso da instituição */
  date: string;
  created: number;
  resolved: number;
}

export interface MetricsBreakdown {
  key: string;
  label: string;
  count: number;
}

export interface TicketMetrics {
  from: string;
  to: string;
  kpis: {
    created: number;
    resolved: number;
    backlog: number;
    /** minutos até a primeira resposta da equipe (mediana); null sem dados */
    firstResponseMedianMinutes: number | null;
    /**
     * v1.8: fração (0–1) das primeiras respostas dentro da meta, entre os chamados abertos no período com meta
     * e já medidos (respondidos ou com o prazo vencido); null sem dados
     */
    firstResponseOnTime?: number | null;
    firstResponseMeasured?: number;
    /** minutos entre abertura e resolução (mediana) */
    resolutionMedianMinutes: number | null;
    /** fração dos prazos concluídos dentro do SLA no período (0–1) */
    slaCompliance: number | null;
    slaCompletedCount: number;
    ratingAverage: number | null;
    ratingCount: number;
  };
  series: MetricsSeriesPoint[];
  byCategory: MetricsBreakdown[];
  byStatus: MetricsBreakdown[];
  byTeam: MetricsBreakdown[];
  appointments: { booked: number; completed: number; cancelled: number; noShow: number } | null;
  source: MetricSource;
}

/** Aluno com histórico de atendimento (a equipe só vê quem já interagiu com o ASA). */
export interface StudentContextSummary {
  studentId: string;
  fullName: string;
  registrationNumber: string;
  program: string | null;
  ticketsTotal: number;
  ticketsOpen: number;
  appointmentsUpcoming: number;
  lastInteractionAt: string | null;
}

export interface StudentContextList {
  items: StudentContextSummary[];
  total: number;
}

/** Contexto para atender: contato institucional e histórico com o ASA. Notas, frequência e análises não aparecem. */
export interface StudentContext {
  student: StudentContextSummary & { email: string };
  tickets: SupportTicketSummary[];
  /** acesso registrado na auditoria (finalidade: atendimento) */
  accessLogged: boolean;
}

export interface AuditEventView {
  id: string;
  occurredAt: string;
  action: string;
  /** descrição legível da ação */
  label: string;
  outcome: 'success' | 'failure' | 'denied';
  channel: 'mobile' | 'web' | 'system';
  actor: { userId: string | null; role: UserRole | null; name: string | null };
  resource: { type: string; id: string | null } | null;
  metadata: Record<string, string | number | boolean | null>;
  requestId: string | null;
  correlationId: string | null;
}

export interface AuditEventList {
  items: AuditEventView[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- appointments (Agendamentos com o ASA) — v1.6 --------------------------
// Rotas do aluno: GET /api/appointments/catalog · GET /api/appointments/slots?from&to&mode ·
// GET /api/appointments?scope=upcoming|past|all · POST /api/appointments · GET /api/appointments/:id ·
// POST /api/appointments/:id/cancel · POST /api/appointments/:id/reschedule · GET /api/appointments/:id/calendar.ics
// Rotas da equipe: GET /api/asa/appointments?from&to&status&attendant=mine · GET|PATCH /api/asa/appointments/:id ·
// GET|POST /api/asa/availability · PATCH /api/asa/availability/:id.
// Horários vêm da disponibilidade cadastrada; reserva dupla é bloqueada no banco (409 slot_unavailable).

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export type AppointmentMode = 'presencial' | 'online';

export interface AppointmentTopic {
  /** categoria do catálogo de atendimento */
  id: string;
  label: string;
  description: string;
}

export interface AppointmentPolicy {
  minLeadHours: number;
  maxDaysAhead: number;
  cancellationMinHours: number;
  maxActivePerStudent: number;
  timezone: string;
}

export interface AppointmentCatalog {
  topics: AppointmentTopic[];
  modes: Array<{ id: AppointmentMode; label: string; description: string }>;
  policy: AppointmentPolicy;
}

/** Horário livre: `available` = atendentes livres naquele horário (nunca quem são). */
export interface AppointmentSlot {
  startsAt: string;
  endsAt: string;
  mode: AppointmentMode;
  location: string | null;
  available: number;
}

export interface AppointmentSlotDay {
  /** YYYY-MM-DD no fuso da instituição */
  date: string;
  slots: AppointmentSlot[];
}

export interface AppointmentSlotList {
  from: string;
  to: string;
  timezone: string;
  days: AppointmentSlotDay[];
  generatedAt: string;
}

export interface AppointmentEvent {
  id: string;
  type: 'scheduled' | 'confirmed' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show' | 'note';
  title: string;
  description: string | null;
  actorType: 'student' | 'staff' | 'system';
  createdAt: string;
}

export interface Appointment {
  id: string;
  protocol: string;
  status: AppointmentStatus;
  topicId: string;
  topicLabel: string;
  mode: AppointmentMode;
  location: string | null;
  startsAt: string;
  endsAt: string;
  studentNotes: string | null;
  channel: 'app' | 'web';
  /** quem atende, como o aluno vê (equipe, nunca o nome do atendente) */
  attendantLabel: string;
  ticketId: string | null;
  rescheduledFromId: string | null;
  /** v1.8: substituto quando este agendamento foi remarcado (o antigo fica cancelado) */
  rescheduledToId: string | null;
  cancelReason: string | null;
  cancelledBy: 'student' | 'staff' | null;
  canCancel: boolean;
  canReschedule: boolean;
  /** até quando o aluno pode cancelar/remarcar pelo app/portal */
  changeDeadline: string | null;
  createdAt: string;
  updatedAt: string;
  events: AppointmentEvent[];
}

export interface AppointmentList {
  items: Appointment[];
}

export interface AppointmentCreateRequest {
  /** chave de idempotência gerada pelo cliente */
  clientRequestId: string;
  topicId: string;
  startsAt: string;
  mode: AppointmentMode;
  notes?: string | null;
  /** chamado relacionado (opcional; precisa ser do próprio aluno) */
  ticketId?: string | null;
  /**
   * `location` do horário escolhido (v1.8): o mesmo início pode existir em locais diferentes. Ausente = qualquer
   * local livre naquele horário (comportamento anterior).
   */
  location?: string | null;
}

export interface AppointmentRescheduleRequest {
  clientRequestId: string;
  startsAt: string;
  mode?: AppointmentMode;
  /** `location` do novo horário escolhido (v1.8); ausente = qualquer local livre */
  location?: string | null;
}

export interface AppointmentCancelRequest {
  reason?: string;
}

export interface StaffAppointmentEvent extends AppointmentEvent {
  visibility: 'public' | 'internal';
  actorName: string | null;
}

export interface StaffAppointment extends Omit<Appointment, 'events'> {
  student: { id: string; fullName: string; registrationNumber: string };
  attendant: { id: string; fullName: string };
  staffNotes: string | null;
  events: StaffAppointmentEvent[];
}

export interface StaffAppointmentList {
  from: string;
  to: string;
  items: StaffAppointment[];
  counts: Record<AppointmentStatus, number>;
}

/** PATCH /api/asa/appointments/:id — transições válidas conforme a situação e o horário. */
export interface StaffAppointmentUpdateRequest {
  status?: 'confirmed' | 'completed' | 'no_show' | 'cancelled';
  /** obrigatório para cancelar (vai para o aluno) */
  reason?: string;
  /** anotação interna (não vai para o aluno) */
  staffNotes?: string | null;
}

export interface AvailabilityRule {
  id: string;
  attendant: { id: string; fullName: string };
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  mode: AppointmentMode;
  location: string | null;
  validFrom: string;
  validUntil: string | null;
  active: boolean;
  updatedAt: string;
}

export interface AvailabilityList {
  items: AvailabilityRule[];
}

export interface AvailabilityRuleInput {
  /** só a administração (availability:manage:any) cria para outra pessoa */
  attendantUserId?: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  mode: AppointmentMode;
  location?: string | null;
  validFrom?: string;
  validUntil?: string | null;
}

export interface AvailabilityRuleUpdate {
  startTime?: string;
  endTime?: string;
  slotMinutes?: number;
  mode?: AppointmentMode;
  location?: string | null;
  validUntil?: string | null;
  active?: boolean;
}

// ---- knowledge (Base de conhecimento) — v1.7 ------------------------------
// Leitura (alunos e equipe): GET /api/knowledge-base?search&category&page · GET /api/knowledge-base/:slug
// Gestão (equipe/administração): GET|POST /api/knowledge-base/manage · GET|PUT /api/knowledge-base/manage/:id ·
// POST /api/knowledge-base/manage/:id/{submit,publish,archive,restore}.
// Busca LEXICAL (full-text do PostgreSQL, português); não há embeddings nem índice vetorial.

export type KnowledgeArticleStatus = 'draft' | 'in_review' | 'published' | 'archived';
export type KnowledgeAudience = 'student' | 'staff';

export interface KnowledgeArticleSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  categoryId: string | null;
  categoryLabel: string | null;
  audience: KnowledgeAudience;
  /** versão publicada exibida */
  version: number;
  publishedAt: string | null;
  sourceLabel: string | null;
  /** conteúdo de demonstração (precisa de validação do ASA) */
  isDemo: boolean;
}

export interface KnowledgeArticle extends KnowledgeArticleSummary {
  body: string;
  sourceUrl: string | null;
  updatedAt: string;
}

export interface KnowledgeSearchHit extends KnowledgeArticleSummary {
  /** trecho com os termos encontrados (texto puro) */
  excerpt: string;
  /** relevância lexical (ts_rank) — só para ordenação */
  score: number;
}

export interface KnowledgeSearchResult {
  items: KnowledgeSearchHit[];
  total: number;
  page: number;
  pageSize: number;
  mode: 'lexical';
}

export interface KnowledgeVersion {
  version: number;
  title: string;
  summary: string;
  body: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  changeNote: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface KnowledgeManageSummary {
  id: string;
  slug: string;
  title: string;
  status: KnowledgeArticleStatus;
  audience: KnowledgeAudience;
  categoryId: string | null;
  categoryLabel: string | null;
  currentVersion: number;
  publishedVersion: number | null;
  /** há versão mais nova que a publicada */
  hasUnpublishedChanges: boolean;
  isDemo: boolean;
  lastEditor: string | null;
  updatedAt: string;
  publishedAt: string | null;
  reviewDueAt: string | null;
}

export interface KnowledgeManageList {
  items: KnowledgeManageSummary[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<KnowledgeArticleStatus, number>;
}

export interface KnowledgeManageArticle extends KnowledgeManageSummary {
  current: KnowledgeVersion;
  published: KnowledgeVersion | null;
  versions: Array<{ version: number; createdAt: string; createdBy: string | null; changeNote: string | null }>;
  /** false quando a política exige outra pessoa para publicar (ou sem permissão) */
  canPublish: boolean;
  publishBlockedReason: string | null;
}

export interface KnowledgeArticleInput {
  /** só na criação; gerado do título quando ausente */
  slug?: string;
  title: string;
  summary: string;
  body: string;
  categoryId?: string | null;
  audience?: KnowledgeAudience;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  changeNote?: string | null;
  reviewDueAt?: string | null;
}

export interface KnowledgeArticleUpdate extends KnowledgeArticleInput {
  /** versão que a pessoa editou (conflito 409 se outra pessoa salvou antes) */
  expectedVersion: number;
}

/**
 * v1.7: GET /api/asa/agent-insights?from&to — indicadores AGREGADOS do Agente e do Assistente (sem identificar
 * estudantes), versões/limiares ativos do Agent Service e o provedor de IA em uso (JEV planejado).
 */
export interface AgentInsights {
  from: string;
  to: string;
  runs: {
    total: number;
    byStatus: Record<AgentRunStatus, number>;
    requiresHumanValidation: number;
    averageConfidence: number | null;
    abstentionRate: number | null;
  };
  recommendationsByType: MetricsBreakdown[];
  feedback: { helpful: number; notHelpful: number };
  assistant: {
    interactions: number;
    byIntent: MetricsBreakdown[];
    byStatus: MetricsBreakdown[];
    knowledgeAnswered: number;
    knowledgeAbstained: number;
  };
  agentConfig: {
    available: boolean;
    agentVersion: string | null;
    configVersion: string | null;
    contractVersion: string | null;
    minimumConfidence: number | null;
    rules: string[];
  };
  provider: {
    requested: 'existing' | 'jev';
    active: 'existing' | 'jev';
    fallbackReason: string | null;
    label: string;
    jev: { status: string; detail: string };
  };
  source: MetricSource;
}

// ---- admin (Administração) — v1.8 -----------------------------------------
// GET /api/admin/overview · GET|POST /api/admin/users · GET|PATCH /api/admin/users/:id ·
// POST /api/admin/users/:id/{revoke-sessions,invite} · GET /api/admin/permissions ·
// GET /api/admin/sla-policies · PUT /api/admin/sla-policies/:categoryId ·
// GET|POST /api/admin/automations · PATCH /api/admin/automations/:id · GET /api/admin/automations/:id/runs ·
// GET /api/admin/integrations · GET /api/admin/health · GET /api/admin/settings · PUT /api/admin/settings/:key ·
// GET /api/admin/tickets (metadados, sem conteúdo nem identificação de alunos) · GET /api/admin/audit-events.

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  isActive: boolean;
  isDemo: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  invitedAt: string | null;
  /** conta com vínculo acadêmico (aluno) */
  student: { id: string; registrationNumber: string } | null;
  activeSessions: number;
}

export interface AdminUserList {
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

/** Convite: só equipe ASA e administração (alunos se cadastram com e-mail institucional). */
export interface AdminUserCreateRequest {
  fullName: string;
  email: string;
  role: 'institutional_staff' | 'technical_admin';
}

export interface AdminUserCreateResult {
  user: AdminUser;
  invitation: { sent: boolean; message: string };
}

/** Mudar papel ou ativar/desativar encerra as sessões da conta na hora. */
export interface AdminUserUpdateRequest {
  role?: 'institutional_staff' | 'technical_admin';
  isActive?: boolean;
}

export interface PermissionMatrix {
  roles: Array<{ role: UserRole; label: string; permissions: Permission[] }>;
  permissions: Array<{ key: Permission; group: string; label: string }>;
}

export interface SlaPolicyView {
  categoryId: string;
  categoryLabel: string;
  firstResponseHours: number;
  resolutionBusinessDays: number;
  /** true = padrão do catálogo (nenhuma meta gravada) */
  isDefault: boolean;
  defaultResolutionBusinessDays: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SlaPolicyUpdate {
  firstResponseHours: number;
  resolutionBusinessDays: number;
}

export type AutomationTrigger = 'ticket_created' | 'sla_near_deadline' | 'sla_overdue';
export type AutomationAction = 'notify_staff' | 'raise_priority';

export interface AutomationRuleView {
  id: string;
  name: string;
  description: string | null;
  trigger: AutomationTrigger;
  conditions: { categoryIds?: string[]; priorities?: SupportTicketPriority[] };
  action: AutomationAction;
  actionParams: { audience?: 'team' | 'assigned'; priority?: 'high' | 'urgent' };
  enabled: boolean;
  updatedAt: string;
  runs: { applied: number; skipped: number; failed: number; lastRunAt: string | null };
}

export interface AutomationRuleInput {
  name: string;
  description?: string | null;
  trigger: AutomationTrigger;
  conditions?: { categoryIds?: string[]; priorities?: SupportTicketPriority[] };
  action: AutomationAction;
  actionParams?: { audience?: 'team' | 'assigned'; priority?: 'high' | 'urgent' };
  enabled?: boolean;
}

export interface AutomationRunView {
  id: string;
  ticketProtocol: string;
  trigger: AutomationTrigger;
  status: 'applied' | 'skipped' | 'failed';
  detail: string | null;
  createdAt: string;
}

export interface AutomationList {
  /** interruptor geral (Configurações → Recursos ativos) */
  engineEnabled: boolean;
  items: AutomationRuleView[];
}

export type IntegrationState = 'not_configured' | 'configured' | 'operational' | 'degraded' | 'error' | 'planned' | 'demo' | 'disabled';

export interface IntegrationView {
  id: string;
  name: string;
  description: string;
  state: IntegrationState;
  /** situação em linguagem simples (sem segredos) */
  detail: string;
  /** variáveis de ambiente que configuram a integração (nomes, nunca valores) */
  configuredBy: string[];
  checkedAt: string;
}

export interface ServiceHealth {
  status: 'up' | 'down' | 'degraded' | 'disabled';
  latencyMs: number | null;
  detail: string;
}

export interface AdminHealth {
  checkedAt: string;
  api: { version: string; environment: string; uptimeSeconds: number; node: string; memoryMb: number };
  database: ServiceHealth & { migrations: { applied: string[]; pending: string[] } };
  agentService: ServiceHealth & { agentVersion: string | null; configVersion: string | null };
  queue: ServiceHealth & { provider: string; authorizedSource: boolean };
  mail: ServiceHealth;
  push: ServiceHealth & { provider: string };
}

export interface AdminSetting {
  key: string;
  label: string;
  description: string;
  public: boolean;
  value: unknown;
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AdminTicketMetadata {
  id: string;
  protocol: string;
  categoryId: string;
  categoryLabel: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  team: string;
  channel: 'app' | 'web';
  createdAt: string;
  updatedAt: string;
  sla: { status: SupportSlaStatus; dueAt: string };
}

export interface AdminTicketList {
  items: AdminTicketMetadata[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminOverview {
  users: { students: number; staff: number; admins: number; inactive: number; activeSessions: number };
  tickets: { open: number; slaOverdue: number; slaNearDeadline: number; unassigned: number };
  appointmentsToday: number | null;
  security: { failedLogins24h: number; deniedAccess24h: number };
  integrations: Array<{ id: string; name: string; state: IntegrationState }>;
  services: { database: ServiceHealth['status']; agentService: ServiceHealth['status']; queue: ServiceHealth['status'] };
  source: MetricSource;
}

