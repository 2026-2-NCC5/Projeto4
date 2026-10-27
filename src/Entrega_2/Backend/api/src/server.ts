import { createRuntime } from './runtime.js';

// Servidor HTTP tradicional (npm start, Docker). Na Vercel a entrada é src/index.ts.
const { config, logger, pool, notifications, queue, app, automationEngine } = createRuntime('server');

// ---- admin: varredura periódica dos prazos para as automações (idempotente entre instâncias)
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
  // encerra os streams SSE (senão server.close espera por eles) e libera a concessão da fila antes do pool
  await queue.stop().catch(() => undefined);
  notifications.stop();
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
