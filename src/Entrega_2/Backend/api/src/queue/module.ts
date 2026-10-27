import type { RequestHandler, Router } from 'express';
import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import type { DbPool } from '../db/pool.js';
import type { NotificationService } from '../notifications/notificationService.js';
import { QueueAlertDispatcher } from './alerts.js';
import { QueueEventBus } from './eventBus.js';
import { LocalLeaderLock, PgLeaseLeaderLock, type LeaderLock } from './leaderLock.js';
import { QueueMetrics } from './metrics.js';
import { QueueMonitor } from './monitor.js';
import { PgQueueRepository } from './pgRepository.js';
import { FallbackQueueProvider } from './providers/fallbackProvider.js';
import { FecapQueueHtmlProvider } from './providers/fecapHtmlProvider.js';
import { FecapPortalQueueProvider } from './providers/fecapPortalProvider.js';
import type { FetchFn } from './providers/http.js';
import { MockQueueProvider } from './providers/mockProvider.js';
import { QueueRealtimeHub } from './realtime.js';
import { MemoryQueueRepository, type QueueRepository } from './repository.js';
import { createQueueRouter } from './routes.js';
import { QueueService } from './service.js';
import { QueueTracker } from './tracker.js';
import type { QueueProvider } from './types.js';

export interface QueueModule {
  service: QueueService;
  monitor: QueueMonitor;
  tracker: QueueTracker;
  hub: QueueRealtimeHub;
  bus: QueueEventBus;
  metrics: QueueMetrics;
  repository: QueueRepository;
  /** presente só com ASA_QUEUE_PROVIDER=mock (fora de produção) */
  mock: MockQueueProvider | null;
  router(deps: { authenticate: RequestHandler; rateLimitEnabled: boolean; now: () => Date }): Router;
  /** inicia o monitor residente (modo loop; no modo sob demanda não há o que iniciar) */
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * loop: processo residente (servidor tradicional, worker) consulta a fonte num laço próprio.
 * on-demand: funções serverless — sem laço; cada leitura atualiza o estado (QueueMonitor.refresh).
 */
export type QueueRunMode = 'loop' | 'on-demand';

export interface CreateQueueModuleOptions {
  config: AppConfig;
  /** padrão: loop */
  mode?: QueueRunMode;
  logger: Logger;
  notifications: NotificationService;
  /** sem pool: repositório em memória e liderança local */
  pool?: DbPool;
  provider?: QueueProvider;
  repository?: QueueRepository;
  lock?: LeaderLock;
  now?: () => Date;
  fetchFn?: FetchFn;
}

function createProvider(options: CreateQueueModuleOptions, logger: Logger): QueueProvider {
  const { config } = options;
  const common = {
    sourceUrl: config.queue.sourceUrl,
    timeoutMs: config.queue.requestTimeoutMs,
    timeZone: config.assistant.timezone,
    ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
    ...(options.now ? { now: options.now } : {}),
  };
  switch (config.queue.provider) {
    case 'mock':
      return new MockQueueProvider({ scenario: config.queue.mock.scenario, stepSeconds: config.queue.mock.stepSeconds, timeZone: config.assistant.timezone, ...(options.now ? { now: options.now } : {}) });
    case 'fecap-html':
      return new FecapQueueHtmlProvider(common);
    default:
      // API estruturada do portal primeiro; HTML como fallback (ver fecapHtmlProvider.ts)
      return new FallbackQueueProvider([new FecapPortalQueueProvider(common), new FecapQueueHtmlProvider(common)], (failed, error) => {
        logger.debug({ status: 'queue_provider_fallback', provider: failed.name, error_message: error instanceof Error ? error.message : 'unknown' }, 'queue provider failed, trying fallback');
      });
  }
}

/**
 * Monta a fila: Provider → Monitor → Barramento → (Tracker → Alertas/Push, Tempo real) e a API.
 * Cada parte vive em seu arquivo; aqui só ocorre a composição.
 */
export function createQueueModule(options: CreateQueueModuleOptions): QueueModule {
  const { config, pool } = options;
  const logger = options.logger.child({ module: 'queue' });
  const now = options.now ?? (() => new Date());
  const timeZone = config.assistant.timezone;
  const bus = new QueueEventBus(logger);
  const metrics = new QueueMetrics();
  const mode = options.mode ?? 'loop';
  const pollIntervalMs = config.queue.pollIntervalSeconds * 1000;
  const repository = options.repository ?? (pool ? new PgQueueRepository(pool) : new MemoryQueueRepository());
  const provider = options.provider ?? createProvider(options, logger);
  // Concessão no banco (serve ao laço e às funções serverless ao mesmo tempo). No laço o líder renova a cada
  // ciclo; sob demanda ela dura um intervalo e funciona como limite global: no máximo uma consulta por intervalo.
  const lock =
    options.lock ??
    (pool ? new PgLeaseLeaderLock(pool, logger, { ttlMs: mode === 'loop' ? pollIntervalMs * 3 : pollIntervalMs, now }) : new LocalLeaderLock());
  const monitor = new QueueMonitor({
    provider,
    repository,
    bus,
    lock,
    metrics,
    logger,
    timeZone,
    pollIntervalMs,
    maxBackoffMs: config.queue.maxBackoffSeconds * 1000,
    failureThreshold: config.queue.failureThreshold,
    leaderRetryMs: config.queue.cacheTtlSeconds * 1000,
    // as demais instâncias seguem o banco: o estado é gravado a cada leitura
    persistEveryMs: pollIntervalMs,
    now,
  });
  const tracker = new QueueTracker({ repository, bus, logger, timeZone, now });
  const alerts = new QueueAlertDispatcher({ bus, repository, notifications: options.notifications, metrics, logger, timeZone });
  const service = new QueueService({
    enabled: config.queue.enabled,
    monitor,
    repository,
    tracker,
    metrics,
    logger,
    timeZone,
    staleAfterMs: Math.max(config.queue.cacheTtlSeconds, config.queue.pollIntervalSeconds * 3) * 1000,
    now,
    // simulador = DEMONSTRAÇÃO; painel público só é "autorizado" com ASA_QUEUE_SOURCE_AUTHORIZED=true
    source:
      config.queue.provider === 'mock'
        ? { kind: 'demo', label: 'Simulação — dados fictícios de demonstração', authorized: true }
        : { kind: 'public_panel', label: 'Painel público do ASA (presencial.fecap.br)', authorized: config.queue.sourceAuthorized },
    ...(mode === 'on-demand' ? { refresh: () => monitor.refresh() } : {}),
  });
  const hub = new QueueRealtimeHub({
    bus,
    service,
    logger,
    maxStreamMs: config.queue.streamMaxSeconds * 1000,
    // sem laço residente, quem mantém conexões abertas atualiza a fila no ritmo do intervalo
    ...(mode === 'on-demand' ? { onTick: () => service.refresh(), tickMs: pollIntervalMs } : {}),
  });
  const detach = [tracker.attach(), alerts.attach()];
  hub.attach();
  const mock = provider instanceof MockQueueProvider && config.nodeEnv !== 'production' ? provider : null;

  return {
    service,
    monitor,
    tracker,
    hub,
    bus,
    metrics,
    repository,
    mock,
    router: (deps) => createQueueRouter({ service, hub, mock, subscriptionRateLimit: config.queue.subscriptionRateLimit, ...deps }),
    async start() {
      if (mode === 'on-demand') return;
      if (!config.queue.enabled) {
        logger.info({ status: 'queue_monitor_disabled' }, 'queue monitor disabled (ASA_QUEUE_ENABLED=false)');
        return;
      }
      await monitor.start();
    },
    async stop() {
      hub.stop();
      for (const off of detach) off();
      await monitor.stop();
    },
  };
}
