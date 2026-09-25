import cors from 'cors';
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

export const API_VERSION = '1.0.0';

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
  const studentService = new StudentService(deps.repos);
  const agentService = new AgentService(deps.repos, studentService, agentClient, deps.config);
  const assistantService = new AssistantService(
    deps.repos,
    studentService,
    agentService,
    deps.intentInterpreter ?? new RuleBasedIntentInterpreter(),
    deps.config,
    now,
  );

  const app = express();
  app.disable('x-powered-by');
  // Só confie em X-Forwarded-For atrás de um proxy conhecido (TRUST_PROXY); senão o limite por IP seria burlável.
  app.set('trust proxy', deps.config.trustProxy);
  app.use(helmet());
  app.use(cors({ origin: deps.config.corsOrigin === '*' ? true : deps.config.corsOrigin.split(',').map((item) => item.trim()) }));
  app.use(express.json({ limit: '64kb' }));
  app.use(requestContext(logger));
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
    }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
