import type {
  AgentAnalysis,
  AgentHistoryItem,
  AgentRecommendationDetail,
  AssistantMessageRequest,
  AssistantResponse,
  AuthMe,
  AuthPolicy,
  AuthSessionList,
  CsrfToken,
  ForgotPasswordResponse,
  InboxNotificationList,
  NotificationPreferences,
  NotificationPreferencesUpdate,
  PlatformInfo,
  ProgramOption,
  RegisterRequest,
  ResetPasswordResponse,
  RevokeSessionsResult,
  StudentAssessment,
  StudentAttendance,
  StudentPendingItem,
  StudentProfile,
  StudentSubject,
  StudentSummary,
  SupportAttachmentLink,
  SupportCatalog,
  SupportMessageCreateRequest,
  SupportNotificationList,
  SupportOverview,
  SupportStaffAssignRequest,
  SupportStaffMessageRequest,
  SupportStaffPriorityRequest,
  SupportStaffStatusRequest,
  SupportStaffTicket,
  SupportTicket,
  SupportTicketCreateRequest,
  SupportTicketList,
  SupportUpload,
  SupportUploadRequest,
  VerifyResetCodeResponse,
  WebLoginRequest,
  WebSession,
  WebSessionState,
} from '@/types/api';
import { api } from './client';

const enc = encodeURIComponent;

export const platformApi = {
  info: () => api.get<PlatformInfo>('/api/platform/info', { auth: false }),
};

export const authApi = {
  csrf: () => api.get<CsrfToken>('/api/web/auth/csrf', { auth: false }),
  /** abertura do portal: sessão atual (renovada se preciso) ou visitante, sempre 200 */
  session: () => api.post<WebSessionState>('/api/web/auth/session', undefined, { auth: false }),
  login: (body: WebLoginRequest) => api.post<WebSession>('/api/web/auth/login', body, { auth: false }),
  register: (body: RegisterRequest) => api.post<WebSession>('/api/web/auth/register', body, { auth: false }),
  logout: () => api.post<void>('/api/web/auth/logout', undefined, { auth: false }),
  me: (options: { auth?: boolean } = {}) => api.get<AuthMe>('/api/auth/me', options),
  policy: () => api.get<AuthPolicy>('/api/auth/policy', { auth: false }),
  programs: () => api.get<ProgramOption[]>('/api/auth/programs', { auth: false }),
  forgotPassword: (email: string) => api.post<ForgotPasswordResponse>('/api/auth/forgot-password', { email }, { auth: false }),
  resendCode: (email: string) => api.post<ForgotPasswordResponse>('/api/auth/resend-reset-code', { email }, { auth: false }),
  verifyCode: (email: string, code: string) => api.post<VerifyResetCodeResponse>('/api/auth/verify-reset-code', { email, code }, { auth: false }),
  resetPassword: (resetToken: string, newPassword: string) => api.post<ResetPasswordResponse>('/api/auth/reset-password', { resetToken, newPassword }, { auth: false }),
  sessions: () => api.get<AuthSessionList>('/api/auth/sessions'),
  revokeSession: (id: string) => api.delete<void>(`/api/auth/sessions/${enc(id)}`),
  revokeOthers: () => api.post<RevokeSessionsResult>('/api/auth/sessions/revoke-others'),
  logoutAll: () => api.post<void>('/api/auth/logout-all'),
};

export const notificationsApi = {
  list: (limit = 30) => api.get<InboxNotificationList>('/api/notifications', { query: { limit } }),
  markRead: (ids?: string[]) => api.patch<InboxNotificationList>('/api/notifications', ids ? { read: true, ids } : { read: true }),
  preferences: () => api.get<NotificationPreferences>('/api/notifications/preferences'),
  updatePreferences: (body: NotificationPreferencesUpdate) => api.patch<NotificationPreferences>('/api/notifications/preferences', body),
};

export const studentApi = {
  me: () => api.get<StudentProfile>('/api/student/me'),
  summary: () => api.get<StudentSummary>('/api/student/summary'),
  subjects: () => api.get<StudentSubject[]>('/api/student/subjects'),
  assessments: () => api.get<StudentAssessment[]>('/api/student/assessments'),
  attendance: () => api.get<StudentAttendance[]>('/api/student/attendance'),
  pendingItems: () => api.get<StudentPendingItem[]>('/api/student/pending-items'),
};

export const agentApi = {
  analyze: () => api.post<AgentAnalysis>('/api/agent/analyze', {}, { timeoutMs: 20_000 }),
  latest: () => api.get<AgentAnalysis | null>('/api/agent/recommendations'),
  recommendation: (id: string) => api.get<AgentRecommendationDetail>(`/api/agent/recommendations/${enc(id)}`),
  history: (limit = 20) => api.get<AgentHistoryItem[]>('/api/agent/history', { query: { limit } }),
  run: (runId: string) => api.get<AgentAnalysis>(`/api/agent/history/${enc(runId)}`),
};

export const assistantApi = {
  message: (body: AssistantMessageRequest, signal?: AbortSignal) => api.post<AssistantResponse>('/api/assistant/message', body, { timeoutMs: 20_000, ...(signal ? { signal } : {}) }),
};

export interface TicketListQuery {
  status?: string;
  search?: string;
  limit?: number;
  cursor?: string;
}

export const supportApi = {
  catalog: () => api.get<SupportCatalog>('/api/support/catalog'),
  overview: () => api.get<SupportOverview>('/api/support/overview'),
  list: (query: TicketListQuery = {}) => api.get<SupportTicketList>('/api/support/tickets', { query: { ...query } }),
  get: (id: string) => api.get<SupportTicket>(`/api/support/tickets/${enc(id)}`),
  create: (body: SupportTicketCreateRequest) => api.post<SupportTicket>('/api/support/tickets', body),
  reply: (id: string, body: SupportMessageCreateRequest) => api.post<SupportTicket>(`/api/support/tickets/${enc(id)}/messages`, body),
  markRead: (id: string) => api.post<SupportTicket>(`/api/support/tickets/${enc(id)}/read`),
  cancel: (id: string, reason?: string) => api.post<SupportTicket>(`/api/support/tickets/${enc(id)}/cancel`, reason ? { reason } : {}),
  reopen: (id: string, reason: string) => api.post<SupportTicket>(`/api/support/tickets/${enc(id)}/reopen`, { reason }),
  rate: (id: string, rating: 1 | 2 | 3 | 4 | 5, comment?: string) => api.post<SupportTicket>(`/api/support/tickets/${enc(id)}/rating`, { rating, ...(comment ? { comment } : {}) }),
  attachmentLink: (ticketId: string, attachmentId: string) => api.get<SupportAttachmentLink>(`/api/support/tickets/${enc(ticketId)}/attachments/${enc(attachmentId)}/link`),
  upload: (body: SupportUploadRequest) => api.post<SupportUpload>('/api/support/uploads', body, { timeoutMs: 60_000 }),
  deleteUpload: (id: string) => api.delete<void>(`/api/support/uploads/${enc(id)}`),
  notifications: (limit = 20) => api.get<SupportNotificationList>('/api/support/notifications', { query: { limit } }),
};

export const staffSupportApi = {
  list: (query: TicketListQuery = {}) => api.get<SupportTicketList>('/api/support/staff/tickets', { query: { ...query } }),
  get: (id: string) => api.get<SupportStaffTicket>(`/api/support/staff/tickets/${enc(id)}`),
  status: (id: string, body: SupportStaffStatusRequest) => api.post<SupportStaffTicket>(`/api/support/staff/tickets/${enc(id)}/status`, body),
  assign: (id: string, body: SupportStaffAssignRequest) => api.post<SupportStaffTicket>(`/api/support/staff/tickets/${enc(id)}/assign`, body),
  message: (id: string, body: SupportStaffMessageRequest) => api.post<SupportStaffTicket>(`/api/support/staff/tickets/${enc(id)}/messages`, body),
  note: (id: string, content: string) => api.post<SupportStaffTicket>(`/api/support/staff/tickets/${enc(id)}/notes`, { content }),
  priority: (id: string, body: SupportStaffPriorityRequest) => api.post<SupportStaffTicket>(`/api/support/staff/tickets/${enc(id)}/priority`, body),
  resolve: (id: string, resolution: string) => api.post<SupportStaffTicket>(`/api/support/staff/tickets/${enc(id)}/resolve`, { resolution }),
  upload: (body: SupportUploadRequest) => api.post<SupportUpload>('/api/support/staff/uploads', body, { timeoutMs: 60_000 }),
};
