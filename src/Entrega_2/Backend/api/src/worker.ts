import { createRuntime } from './runtime.js';

/**
 * Worker residente, sem HTTP (npm run worker; na Vercel, um Daemon com a imagem deste diretório).
 * Faz o que as funções serverless não fazem sozinhas entre requisições:
 * - lê a fila presencial a cada ASA_QUEUE_POLL_INTERVAL_SECONDS e dispara os push com o app fechado;
 * - varre os prazos das automações a cada AUTOMATION_SCAN_INTERVAL_SECONDS.
 * Pode coexistir com a API serverless e com outras réplicas: a concessão no banco elege um leitor por vez.
 */
const { config, logger, pool, notifications, queue, automationEngine } = createRuntime('worker');

let automationTimer: NodeJS.Timeout | null = null;

async function main(): Promise<void> {
  await queue.start();
  if (automationEngine && config.automations.scanIntervalSeconds > 0) {
    automationTimer = setInterval(() => {
      void automationEngine.scanSla().then((executed) => {
        if (executed > 0) logger.info({ executed }, 'automation sla scan');
      });
    }, config.automations.scanIntervalSeconds * 1000);
  }
  logger.info(
    { status: 'ready', queue_enabled: config.queue.enabled, queue_provider: config.queue.provider, automation_interval_seconds: config.automations.scanIntervalSeconds },
    'worker started',
  );
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'worker shutting down');
  if (automationTimer) clearInterval(automationTimer);
  // a Vercel espera 30 s depois do SIGTERM: termina a leitura em curso e libera a concessão
  await queue.stop().catch(() => undefined);
  notifications.stop();
  await pool.end().catch(() => undefined);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'worker failed to start');
  process.exit(1);
});
