import cors from 'cors';
import { z } from 'zod';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { IntentInterpreter } from './assistant/interpretation.js';
import { RuleBasedIntentInterpreter } from './assistant/ruleBasedInterpreter.js';
import { createAgentClient, type AgentClient } from './clients/agentClient.js';
import type { AppConfig } from './config/env.js';
import { createLogger, type Logger } from './config/logger.js';
import { createMailer, type Mailer } from './mail/mailer.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { requestContext } from './middlewares/requestContext.js';
import type { Repositories } from './repositories/types.js';
import { createRouter } from './routes/index.js';
import { AgentService } from './services/agentService.js';
import { AssistantService } from './services/assistantService.js';
import { AuthService } from './services/authService.js';
import { BiometricService } from './services/biometricService.js';
import { PasswordResetService } from './services/passwordResetService.js';
import { StudentService } from './services/studentService.js';
// ---- support (Atendimento)
import { hmacHex } from './auth/secrets.js';
import { SUPPORT_UPLOAD_BODY_LIMIT, SUPPORT_UPLOAD_PATHS } from './routes/support.js';
import { SupportCore, SupportService, type SupportPushNotifier } from './support/supportService.js';
import { SupportStaffService } from './support/supportStaffService.js';
// ---- queue (Fila presencial do ASA)
import { authenticate } from './middlewares/auth.js';
import { createNotificationsModule, type NotificationsModule } from './notifications/module.js';
import { createQueueModule, type QueueModule } from './queue/module.js';
// ---- platform (portal web, sessões, auditoria, avisos)
import { AuditService } from './platform/auditService.js';
import { InboxService } from './platform/inboxService.js';
import { PlatformService, type AssistantProviderStatus } from './platform/platformService.js';
import { SettingsService } from './platform/settingsService.js';
import { OperationsService } from './operations/operationsService.js';
import { createOperationsRouter } from './routes/operations.js';
import { AppointmentService } from './appointments/service.js';
import { createAppointmentRouter } from './routes/appointments.js';
import { requireStudent } from './middlewares/auth.js';
import { AiProviderRegistry } from './ai/providers.js';
import { KnowledgeService } from './knowledge/service.js';
import { createKnowledgeRouter } from './routes/knowledge.js';
import { AdminService } from './admin/adminService.js';
import { AutomationEngine } from './admin/automationEngine.js';
import { createAdminRouter } from './routes/admin.js';
// ---- jobs (tarefas periódicas acionadas de fora: Vercel Cron, agendador externo)
import { createJobsRouter } from './routes/jobs.js';

export const API_VERSION = '1.0.0';

// mensagens de validação (zod) em português do Brasil: os clientes mostram os detalhes de campo
z.config(z.locales.ptBR());

/** Motor de automações criado pela aplicação (server.ts agenda a varredura dos prazos). */
export function automationEngineOf(app: Express): AutomationEngine | null {
  return (app.locals.automationEngine as AutomationEngine | undefined) ?? null;
}

export interface AppDeps {
  config: AppConfig;
  repos: Repositories;
  logger?: Logger;
  agentClient?: AgentClient;
  /** Interpretador de intenções; padrão: regras determinísticas pt-BR (sem provedor externo). */
  intentInterpreter?: IntentInterpreter;
  /** Relógio injetável (testes determinísticos de prazos). */
  now?: () => Date;
  /** Envio de e-mail; padrão: conforme MAIL_TRANSPORT (smtp ou desabilitado). */
  mailer?: Mailer;
  /** Entrega por push dos avisos de chamados (opcional; o centro de avisos do app funciona sem ela). */
  supportPush?: SupportPushNotifier;
  // ---- queue (Fila presencial do ASA)
  /** Push (Expo); padrão: conforme PUSH_PROVIDER, com registro de aparelhos em memória. */
  notifications?: NotificationsModule;
  /** Fila presencial; padrão: módulo em memória sem monitor iniciado (server.ts usa o do banco e o inicia). */
  queue?: QueueModule;
}

/** Fábrica da aplicação Express com injeção de dependências (testável sem rede/banco). */
export function createApp(deps: AppDeps): Express {
  const logger = deps.logger ?? createLogger(deps.config.logLevel);
  const agentClient = deps.agentClient ?? createAgentClient({ baseUrl: deps.config.agentService.url, timeoutMs: deps.config.agentService.timeoutMs });
  const now = deps.now ?? (() => new Date());
  const mailer = deps.mailer ?? createMailer(deps.config);
  const authService = new AuthService(deps.repos, deps.config, now);
  const passwordResetService = new PasswordResetService(deps.repos, deps.config, mailer, now);
  const biometricService = new BiometricService(deps.repos, authService, deps.config, now);
  // ---- platform (portal web, sessões, auditoria, avisos)
  const audit = new AuditService(deps.repos.audit, deps.config.jwt.secret, logger, now);
  const settings = new SettingsService(deps.repos.settings, logger, now);
  // o estado do provedor de IA é lido na hora da requisição (o registro é criado logo abaixo)
  const assistantStatus = (): AssistantProviderStatus => aiRegistry.status();
  const platform = new PlatformService(deps.config, settings, API_VERSION, now, assistantStatus);
  const knowledge = new KnowledgeService(deps.repos.knowledge ?? null, platform, settings, audit, now);
  const aiRegistry = new AiProviderRegistry(deps.config, knowledge, logger, now);
  // ---- end platform
  const studentService = new StudentService(deps.repos, () => platform.assertAcademicAvailable());
  const agentService = new AgentService(deps.repos, studentService, agentClient, deps.config, now);
  // ---- queue (Fila presencial do ASA)
  const notifications = deps.notifications ?? createNotificationsModule({ config: deps.config, logger, now });
  const queue = deps.queue ?? createQueueModule({ config: deps.config, logger, now, notifications: notifications.service });
  // ---- end queue
  // ---- platform: central de avisos (push opcional pelo mesmo módulo de notificações)
  const inbox = new InboxService(deps.repos, logger, now, notifications.service);
  const assistantService = new AssistantService(
    deps.repos,
    studentService,
    agentService,
    deps.intentInterpreter ?? new RuleBasedIntentInterpreter(),
    deps.config,
    now,
    queue.service,
    aiRegistry,
  );

  // ---- support (Atendimento)
  const supportCore = new SupportCore(
    deps.repos,
    {
      timeZone: deps.config.assistant.timezone,
      excludeDemo: !deps.config.demo.dataEnabled,
      // chave própria dos links de download, derivada do segredo do servidor (nunca a chave do JWT diretamente)
      signingSecret: hmacHex(deps.config.jwt.secret, 'asa-conecta:support-attachment-links'),
      rateLimitEnabled: deps.config.rateLimit.enabled,
      maxAttachmentBytes: deps.config.support.maxAttachmentBytes,
    },
    now,
    // Push do sistema pelos aparelhos registrados (módulo de notificações); o centro de avisos funciona sem ele.
    deps.supportPush ?? { sendToUser: (userId, payload) => notifications.service.sendToUser({ userId, category: 'support', ...payload }) },
    logger,
  );
  const support = { core: supportCore, student: new SupportService(supportCore), staff: new SupportStaffService(supportCore) };
  support.student.helpArticles = () => knowledge.helpArticles();
  // ---- end support
  // ---- platform: operação do ASA (painel, métricas, relatórios, alunos atendidos, auditoria)
  const appointments = new AppointmentService(deps.repos, deps.repos.appointments ?? null, settings, platform, inbox, audit, {
    timeZone: deps.config.assistant.timezone,
    rateLimitEnabled: deps.config.rateLimit.enabled,
    excludeDemo: !deps.config.demo.dataEnabled,
  }, now);
  const operations = new OperationsService(deps.repos, deps.repos.analytics ?? null, support.staff, audit, {
    timezone: deps.config.assistant.timezone,
    excludeDemo: !deps.config.demo.dataEnabled,
    dataMode: platform.dataMode,
  }, now, deps.repos.appointments ?? null);

  // ---- admin (contas, SLA, automações, integrações, saúde, parâmetros)
  const admin = new AdminService({
    repos: deps.repos,
    repo: deps.repos.admin ?? null,
    config: deps.config,
    audit,
    settings,
    platform,
    resets: passwordResetService,
    mailer,
    agentClient,
    ai: aiRegistry,
    queue: queue.service,
    push: notifications.service,
    logger,
    apiVersion: API_VERSION,
    startedAt: now(),
    now,
  });
  supportCore.hooks.resolutionDays = (categoryId, fallback) => admin.sla.resolutionDays(categoryId, fallback);
  supportCore.hooks.firstResponseHours = (categoryId) => admin.sla.firstResponseHours(categoryId);
  const automationEngine = deps.repos.admin
    ? new AutomationEngine({ repo: deps.repos.admin, repos: deps.repos, core: supportCore, inbox, platform, logger, excludeDemo: !deps.config.demo.dataEnabled, now })
    : null;
  if (automationEngine) supportCore.hooks.onTicketCreated = (ticket) => automationEngine.onTicketCreated(ticket);
  // ---- end admin

  const app = express();
  app.locals.automationEngine = automationEngine;
  app.disable('x-powered-by');
  // Só confie em X-Forwarded-For atrás de um proxy conhecido (TRUST_PROXY); senão o limite por IP seria burlável.
  app.set('trust proxy', deps.config.trustProxy);
  app.use(helmet());
  app.use(cors({ origin: deps.config.corsOrigin === '*' ? true : deps.config.corsOrigin.split(',').map((item) => item.trim()) }));
  // ---- support (Atendimento): envio de arquivos em base64 aceita corpo maior só nestas rotas
  app.use(SUPPORT_UPLOAD_PATHS, express.json({ limit: SUPPORT_UPLOAD_BODY_LIMIT }));
  app.use(express.json({ limit: '64kb' }));
  app.use(requestContext(logger));
  // ---- platform: respostas da API nunca ficam em cache compartilhado e informam o modo de dados
  app.use('/api', (_req, res, next) => {
    if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-ASA-Data-Mode', platform.dataMode);
    next();
  });
  app.use(
    createRouter({
      repos: deps.repos,
      authService,
      studentService,
      agentService,
      assistantService,
      assistantEnabled: deps.config.assistant.enabled,
      passwordResetService,
      biometricService,
      mailer,
      rateLimitEnabled: deps.config.rateLimit.enabled,
      now,
      agentClient,
      version: API_VERSION,
      // ---- support (Atendimento)
      support,
      // ---- platform (portal web, sessões, auditoria, avisos)
      platform,
      inbox,
      audit,
      settings,
      web: { origins: deps.config.web.origins, secure: deps.config.web.cookieSecure },
    }),
  );
  // ---- queue (Fila presencial do ASA): /api/queue/*, /api/notifications/push-token, /health/queue
  const queueRouteDeps = { authenticate: authenticate(authService, { allowedOrigins: deps.config.web.origins }), rateLimitEnabled: deps.config.rateLimit.enabled, now };
  // ---- platform: operação do ASA e auditoria (rotas em routes/operations.ts)
  const platformAuthed = authenticate(authService, { allowedOrigins: deps.config.web.origins });
  const onDenied = (req: express.Request, permission: string) => void audit.recordFor(req, { action: 'authz.denied', outcome: 'denied', metadata: { permission, route: req.route?.path ?? req.path } });
  app.use(createOperationsRouter({ operations, audit, authed: platformAuthed, onDenied, agentInsights: (input) => operations.agentInsights(input, { agentClient, ai: aiRegistry }) }));
  // ---- platform: base de conhecimento (rotas em routes/knowledge.ts)
  app.use(createKnowledgeRouter({ knowledge, audit, authed: platformAuthed, onDenied }));
  // ---- platform: agendamentos (rotas em routes/appointments.ts)
  app.use(createAppointmentRouter({ appointments, audit, authed: platformAuthed, asStudent: requireStudent(studentService), onDenied }));
  // ---- admin (rotas em routes/admin.ts)
  app.use(createAdminRouter({ admin, audit, authed: platformAuthed, onDenied, operationalCounts: (viewerUserId) => operations.operationalCounts(viewerUserId) }));
  app.use(notifications.router(queueRouteDeps));
  app.use(queue.router(queueRouteDeps));
  // ---- jobs: o que o servidor residente faz com timers, para quando a API roda em funções serverless
  app.use(
    createJobsRouter({
      secret: deps.config.jobs.cronSecret,
      jobs: {
        'sla-scan': async () => ({ executed: automationEngine ? await automationEngine.scanSla() : 0 }),
        'queue-refresh': async () => {
          await queue.service.refresh();
          return { queue: queue.service.sync().status };
        },
      },
    }),
  );
  // ---- end jobs
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
