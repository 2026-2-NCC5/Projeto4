import { automationEngineOf, createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createLogger } from './config/logger.js';
import { createPool } from './db/pool.js';
import { createPgRepositories } from './repositories/pgRepositories.js';
// ---- queue (Fila presencial do ASA)
import { createNotificationsModule } from './notifications/module.js';
import { createQueueModule } from './queue/module.js';

const config = loadConfig();
const logger = createLogger(config.logLevel);

if (!config.databaseUrl) {
  logger.fatal('DATABASE_URL não configurada');
  process.exit(1);
}

const pool = createPool(config.databaseUrl, config.databaseSsl);
// Conexão ociosa derrubada pelo banco (restart do Postgres, failover do Supabase): o pool descarta o
// cliente e abre outro na próxima query. Sem este listener o 'error' não tratado encerra o processo.
pool.on('error', (error) => {
  logger.error({ err: error }, 'conexão ociosa do pool encerrada pelo banco');
});
// ---- queue (Fila presencial do ASA): um monitor por processo; com várias instâncias, só a líder consulta a fonte.
const notifications = createNotificationsModule({ config, logger, pool });
const queue = createQueueModule({ config, logger, pool, notifications: notifications.service });
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
const app = createApp({ config, repos, logger, notifications, queue });

// ---- admin: varredura periódica dos prazos para as automações (idempotente entre instâncias)
const automationEngine = automationEngineOf(app);
let automationTimer: NodeJS.Timeout | null = null;

const server = app.listen(config.port, (error?: Error) => {
  // Express 5 chama este callback também quando a porta não abre (ex.: EADDRINUSE): sem isto o processo
  // seguiria vivo, sem servir nada, e com o monitor da fila rodando — melhor falhar e deixar o orquestrador reiniciar
  if (error) {
    logger.fatal({ err: error, port: config.port }, 'api failed to listen');
    process.exit(1);
  }
  logger.info({ port: config.port, agent_service_url: config.agentService.url, agent_timeout_ms: config.agentService.timeoutMs, status: 'ready' }, 'api listening');
  queue.start().catch((error: unknown) => logger.error({ err: error }, 'queue monitor failed to start'));
  if (automationEngine && config.automations.scanIntervalSeconds > 0) {
    automationTimer = setInterval(() => {
      void automationEngine.scanSla().then((executed) => {
        if (executed > 0) logger.info({ executed }, 'automation sla scan');
      });
    }, config.automations.scanIntervalSeconds * 1000);
    automationTimer.unref();
  }
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  if (automationTimer) clearInterval(automationTimer);
  // encerra os streams SSE (senão server.close espera por eles) e libera o lock de liderança antes do pool
  await queue.stop().catch(() => undefined);
  notifications.stop();
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
