import type { Express } from 'express';
import type { AutomationEngine } from './admin/automationEngine.js';
import { automationEngineOf, createApp } from './createApp.js';
import { loadConfig, type AppConfig } from './config/env.js';
import { createLogger, type Logger } from './config/logger.js';
import { createPool, type DbPool } from './db/pool.js';
import { createPgRepositories } from './repositories/pgRepositories.js';
import type { Repositories } from './repositories/types.js';
// ---- queue (Fila presencial do ASA)
import { createNotificationsModule, type NotificationsModule } from './notifications/module.js';
import { createQueueModule, type QueueModule } from './queue/module.js';

/**
 * Onde a API roda:
 * - server: processo HTTP tradicional (npm start, Docker) — laço da fila e varredura dos prazos no processo;
 * - serverless: Vercel Function (src/index.ts) — sem laços; fila sob demanda e tarefas por /api/internal/jobs/*;
 * - worker: processo residente sem HTTP (src/worker.ts, Vercel Daemon) — só os laços.
 */
export type RuntimeKind = 'server' | 'serverless' | 'worker';

export interface Runtime {
  config: AppConfig;
  logger: Logger;
  pool: DbPool;
  repos: Repositories;
  notifications: NotificationsModule;
  queue: QueueModule;
  app: Express;
  automationEngine: AutomationEngine | null;
}

/** Composição única das três entradas (mesmos serviços, mesmo banco; muda só quem dirige os laços). */
export function createRuntime(kind: RuntimeKind): Runtime {
  const config = loadConfig();
  const logger = createLogger(config.logLevel).child({ env: config.appEnv, runtime: kind, ...(config.platform.region ? { region: config.platform.region } : {}) });

  if (!config.databaseUrl) {
    logger.fatal('DATABASE_URL não configurada');
    throw new Error('DATABASE_URL não configurada');
  }

  const pool = createPool(config.databaseUrl, config.databaseSsl, { max: config.database.poolMax });
  // Conexão ociosa derrubada pelo banco (restart do Postgres, failover do Supabase): o pool descarta o
  // cliente e abre outro na próxima query. Sem este listener o 'error' não tratado encerra o processo.
  pool.on('error', (error) => {
    logger.error({ err: error }, 'conexão ociosa do pool encerrada pelo banco');
  });
  // ---- queue (Fila presencial do ASA): laço no processo residente; sob demanda nas funções serverless.
  // Com várias instâncias, a concessão no banco (job_leases) garante uma consulta à fonte por vez.
  const notifications = createNotificationsModule({ config, logger, pool });
  const queue = createQueueModule({ config, logger, pool, notifications: notifications.service, mode: kind === 'serverless' ? 'on-demand' : 'loop' });
  const repos = createPgRepositories(pool);
  // ---- platform: demonstração desligada → sessões de contas fictícias abertas antes caem já na subida
  // (login e renovação delas já são recusados; isto encerra também os tokens de acesso ainda válidos)
  if (!config.demo.dataEnabled) {
    repos.sessions
      .revokeAllForDemoUsers()
      .then((families) => {
        if (families > 0) logger.info({ families }, 'demo sessions revoked (DEMO_DATA_ENABLED=false)');
      })
      .catch((error: unknown) => logger.error({ err: error }, 'failed to revoke demo sessions'));
  }
  if (config.nodeEnv === 'production' && config.corsOrigin === '*') {
    logger.warn({ status: 'cors_open' }, 'CORS_ORIGIN=* em produção: defina as origens permitidas (o portal usa a mesma origem e não precisa de CORS)');
  }
  const app = createApp({ config, repos, logger, notifications, queue });
  return { config, logger, pool, repos, notifications, queue, app, automationEngine: automationEngineOf(app) };
}
