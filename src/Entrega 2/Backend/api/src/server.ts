import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createLogger } from './config/logger.js';
import { createPool } from './db/pool.js';
import { createPgRepositories } from './repositories/pgRepositories.js';

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
const app = createApp({ config, repos: createPgRepositories(pool), logger });

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, agent_service_url: config.agentService.url, agent_timeout_ms: config.agentService.timeoutMs, status: 'ready' }, 'api listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
