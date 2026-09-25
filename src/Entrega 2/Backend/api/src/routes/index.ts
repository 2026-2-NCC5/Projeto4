import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { FixedWindowLimiter, rateLimitByIp } from '../auth/rateLimiter.js';
import type { AgentClient } from '../clients/agentClient.js';
import type { HealthStatus } from '../contracts/mobileApi.v1.js';
import { analyzeSchema, createAgentController } from '../controllers/agentController.js';
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
import { authenticate, requireStudent } from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validate.js';
import type { Repositories } from '../repositories/types.js';
import type { AgentService } from '../services/agentService.js';
import type { AssistantService } from '../services/assistantService.js';
import type { Mailer } from '../mail/mailer.js';
import type { AuthService } from '../services/authService.js';
import type { BiometricService } from '../services/biometricService.js';
import type { PasswordResetService } from '../services/passwordResetService.js';
import type { StudentService } from '../services/studentService.js';

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
} as const;

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap = (handler: AsyncHandler): RequestHandler => (req, res, next: NextFunction) => {
  handler(req, res).catch(next);
};

export function createRouter(deps: RouteDeps): Router {
  const router = Router();
  const auth = createAuthController(deps.authService, deps.passwordResetService, deps.biometricService, deps.mailer);
  const clock = () => deps.now().getTime();
  const limit = (name: keyof typeof AUTH_RATE_LIMITS) =>
    rateLimitByIp(name, new FixedWindowLimiter(AUTH_RATE_LIMITS[name], clock), deps.rateLimitEnabled);
  const student = createStudentController(deps.studentService);
  const agent = createAgentController(deps.agentService);
  const assistant = createAssistantController(deps.assistantService);
  const authed = authenticate(deps.authService);
  const asStudent = requireStudent(deps.studentService);

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
  router.get('/api/student/summary', authed, asStudent, wrap(student.summary));
  router.get('/api/student/subjects', authed, asStudent, wrap(student.subjects));
  router.get('/api/student/assessments', authed, asStudent, wrap(student.assessments));
  router.get('/api/student/attendance', authed, asStudent, wrap(student.attendance));
  router.get('/api/student/pending-items', authed, asStudent, wrap(student.pendingItems));

  router.post('/api/agent/analyze', authed, asStudent, validateBody(analyzeSchema), wrap(agent.analyze));
  router.get('/api/agent/recommendations', authed, asStudent, wrap(agent.recommendations));
  router.get('/api/agent/recommendations/:id', authed, asStudent, wrap(agent.recommendation));
  router.get('/api/agent/history', authed, asStudent, wrap(agent.history));
  router.get('/api/agent/history/:runId', authed, asStudent, wrap(agent.run));

  router.post(
    '/api/assistant/message',
    authed,
    asStudent,
    assistantEnabled(deps.assistantEnabled),
    validateBody(assistantMessageSchema),
    wrap(assistant.message),
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
