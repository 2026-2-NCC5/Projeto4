import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { FixedWindowLimiter, rateLimitByIp } from '../auth/rateLimiter.js';
import type { AgentClient } from '../clients/agentClient.js';
import type { HealthStatus, Permission } from '../contracts/mobileApi.v1.js';
import { analyzeSchema, createAgentController, feedbackSchema } from '../controllers/agentController.js';
import { assistantEnabled, assistantMessageSchema, createAssistantController } from '../controllers/assistantController.js';
import {
  biometricEnrollSchema,
  biometricLoginSchema,
  biometricRevokeSchema,
  createAuthController,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyResetCodeSchema,
} from '../controllers/authController.js';
import { createStudentController } from '../controllers/studentController.js';
import { ok } from '../controllers/respond.js';
import { authenticate, requirePermission, requireStudent } from '../middlewares/auth.js';
// ---- platform (portal web, sessões, auditoria, avisos)
import type { AuditService } from '../platform/auditService.js';
import type { InboxService } from '../platform/inboxService.js';
import type { PlatformService } from '../platform/platformService.js';
import type { SettingsService } from '../platform/settingsService.js';
import { createPlatformRouter } from './platform.js';
import { validateBody } from '../middlewares/validate.js';
import type { Repositories } from '../repositories/types.js';
import type { AgentService } from '../services/agentService.js';
import type { AssistantService } from '../services/assistantService.js';
import type { Mailer } from '../mail/mailer.js';
import type { AuthService } from '../services/authService.js';
import type { BiometricService } from '../services/biometricService.js';
import type { PasswordResetService } from '../services/passwordResetService.js';
import type { StudentService } from '../services/studentService.js';
// ---- support (Atendimento)
import type { SupportCore, SupportService } from '../support/supportService.js';
import type { SupportStaffService } from '../support/supportStaffService.js';
import { createSupportRouter } from './support.js';

export interface RouteDeps {
  repos: Repositories;
  authService: AuthService;
  studentService: StudentService;
  agentService: AgentService;
  assistantService: AssistantService;
  assistantEnabled: boolean;
  passwordResetService: PasswordResetService;
  biometricService: BiometricService;
  mailer: Mailer;
  rateLimitEnabled: boolean;
  now: () => Date;
  agentClient: AgentClient;
  version: string;
  // ---- support (Atendimento)
  support: { core: SupportCore; student: SupportService; staff: SupportStaffService };
  // ---- platform (portal web, sessões, auditoria, avisos)
  platform: PlatformService;
  inbox: InboxService;
  audit: AuditService;
  settings: SettingsService;
  /** cookies do portal (Secure em produção) e origens aceitas no CSRF */
  web: { origins: readonly string[]; secure: boolean };
}

const MINUTE = 60_000;

/** Limites por IP das rotas públicas sensíveis (além dos limites por conta/código nos serviços). */
export const AUTH_RATE_LIMITS = {
  login: { windowMs: 10 * MINUTE, max: 20 },
  register: { windowMs: 60 * MINUTE, max: 10 },
  refresh: { windowMs: 10 * MINUTE, max: 60 },
  recovery: { windowMs: 15 * MINUTE, max: 10 },
  verify: { windowMs: 15 * MINUTE, max: 20 },
  reset: { windowMs: 15 * MINUTE, max: 10 },
  biometric: { windowMs: 10 * MINUTE, max: 20 },
  // abertura do portal web (uma por carregamento de página; redes compartilhadas usam o mesmo IP)
  session: { windowMs: 10 * MINUTE, max: 300 },
} as const;

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap = (handler: AsyncHandler): RequestHandler => (req, res, next: NextFunction) => {
  handler(req, res).catch(next);
};

export function createRouter(deps: RouteDeps): Router {
  const router = Router();
  const auth = createAuthController(deps.authService, deps.passwordResetService, deps.biometricService, deps.mailer, deps.audit);
  const clock = () => deps.now().getTime();
  const limit = (name: keyof typeof AUTH_RATE_LIMITS) =>
    rateLimitByIp(name, new FixedWindowLimiter(AUTH_RATE_LIMITS[name], clock), deps.rateLimitEnabled);
  const student = createStudentController(deps.studentService);
  const agent = createAgentController(deps.agentService);
  const assistant = createAssistantController(deps.assistantService);
  // Bearer (app) ou cookie HttpOnly do portal; CSRF exigido nas alterações feitas por cookie
  const authed = authenticate(deps.authService, { allowedOrigins: deps.web.origins });
  const asStudent = requireStudent(deps.studentService);
  // Depois do vínculo de aluno (mesma resposta de antes para outros papéis), a matriz de permissões também vale
  // para as rotas do aluno: um papel futuro sem estas permissões recebe 403 auditado.
  const studentCan = (permission: Permission) =>
    requirePermission(permission, (req, denied) => void deps.audit.recordFor(req, { action: 'authz.denied', outcome: 'denied', metadata: { permission: denied, route: req.route?.path ?? req.path } }));
  const readsAcademic = studentCan('academic:read:own');

  router.get('/health', wrap(async (req, res) => {
    const [database, agentUp] = await Promise.all([
      deps.repos.ping().then((up) => (up ? 'up' : 'down') as HealthStatus['database']),
      deps.agentClient.health(),
    ]);
    const body: HealthStatus = {
      status: database === 'up' && agentUp ? 'ok' : 'degraded',
      service: 'api',
      version: deps.version,
      database,
      agentService: agentUp ? 'up' : 'down',
    };
    ok(req, res, body, body.status === 'ok' ? 200 : 503);
  }));

  router.get('/api/auth/policy', wrap(auth.policy));
  router.get('/api/auth/programs', wrap(auth.programs));
  router.post('/api/auth/login', limit('login'), validateBody(loginSchema), wrap(auth.login));
  router.post('/api/auth/register', limit('register'), validateBody(registerSchema), wrap(auth.register));
  router.post('/api/auth/refresh', limit('refresh'), validateBody(refreshSchema), wrap(auth.refresh));
  router.post('/api/auth/logout', optionalAuth(deps.authService), validateBody(logoutSchema), wrap(auth.logout));
  const recovery = limit('recovery');
  router.post('/api/auth/forgot-password', recovery, validateBody(forgotPasswordSchema), wrap(auth.forgotPassword));
  router.post('/api/auth/resend-reset-code', recovery, validateBody(forgotPasswordSchema), wrap(auth.resendResetCode));
  router.post('/api/auth/verify-reset-code', limit('verify'), validateBody(verifyResetCodeSchema), wrap(auth.verifyResetCode));
  router.post('/api/auth/reset-password', limit('reset'), validateBody(resetPasswordSchema), wrap(auth.resetPassword));
  router.post('/api/auth/biometric/enroll', authed, validateBody(biometricEnrollSchema), wrap(auth.biometricEnroll));
  router.post('/api/auth/biometric/login', limit('biometric'), validateBody(biometricLoginSchema), wrap(auth.biometricLogin));
  router.post('/api/auth/biometric/revoke', authed, validateBody(biometricRevokeSchema), wrap(auth.biometricRevoke));

  router.get('/api/student/me', authed, wrap(student.me));
  router.get('/api/student/summary', authed, asStudent, readsAcademic, wrap(student.summary));
  router.get('/api/student/subjects', authed, asStudent, readsAcademic, wrap(student.subjects));
  router.get('/api/student/assessments', authed, asStudent, readsAcademic, wrap(student.assessments));
  router.get('/api/student/attendance', authed, asStudent, readsAcademic, wrap(student.attendance));
  router.get('/api/student/pending-items', authed, asStudent, readsAcademic, wrap(student.pendingItems));

  router.post('/api/agent/analyze', authed, asStudent, studentCan('agent:run:own'), validateBody(analyzeSchema), wrap(agent.analyze));
  router.get('/api/agent/recommendations', authed, asStudent, readsAcademic, wrap(agent.recommendations));
  router.get('/api/agent/recommendations/:id', authed, asStudent, readsAcademic, wrap(agent.recommendation));
  router.post('/api/agent/recommendations/:id/feedback', authed, asStudent, studentCan('agent:feedback:own'), validateBody(feedbackSchema), (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode < 400) void deps.audit.recordFor(req, { action: 'agent.feedback', resourceType: 'recommendation', resourceId: String(req.params.id ?? ''), metadata: { helpful: Boolean((req.body as { helpful?: boolean }).helpful) } });
    });
    next();
  }, wrap(agent.feedback));
  router.get('/api/agent/history', authed, asStudent, readsAcademic, wrap(agent.history));
  router.get('/api/agent/history/:runId', authed, asStudent, readsAcademic, wrap(agent.run));

  router.post(
    '/api/assistant/message',
    authed,
    asStudent,
    studentCan('assistant:use'),
    assistantEnabled(deps.assistantEnabled),
    validateBody(assistantMessageSchema),
    wrap(assistant.message),
  );

  // ---- support (Atendimento): chamados do estudante e fila da equipe (rotas em routes/support.ts)
  router.use(createSupportRouter({ ...deps.support, repos: deps.repos, authed, asStudent, audit: deps.audit }));

  // ---- platform (portal web, sessões, auditoria, avisos): rotas em routes/platform.ts
  router.use(
    createPlatformRouter({
      authService: deps.authService,
      platform: deps.platform,
      inbox: deps.inbox,
      audit: deps.audit,
      authed,
      limit: (name) => limit(name),
      web: { origins: deps.web.origins, secure: deps.web.secure },
    }),
  );

  return router;
}

/** Logout aceita token expirado: tenta autenticar, mas segue sem sessão se falhar. */
function optionalAuth(authService: AuthService): RequestHandler {
  const strict = authenticate(authService);
  return (req, res, next) => {
    if (!req.headers.authorization) return next();
    strict(req, res, () => next());
  };
}
