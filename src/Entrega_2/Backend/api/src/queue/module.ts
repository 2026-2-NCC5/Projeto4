import type { RequestHandler, Router } from 'express';
import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import type { DbPool } from '../db/pool.js';
import type { NotificationService } from '../notifications/notificationService.js';
import { QueueAlertDispatcher } from './alerts.js';
import { QueueEventBus } from './eventBus.js';
import { LocalLeaderLock, PgAdvisoryLeaderLock, type LeaderLock } from './leaderLock.js';
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
  /** inicia o monitor (o servidor chama; testes controlam os ciclos com monitor.pollOnce()) */
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface CreateQueueModuleOptions {
  config: AppConfig;
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
  const repository = options.repository ?? (pool ? new PgQueueRepository(pool) : new MemoryQueueRepository());
  const provider = options.provider ?? createProvider(options, logger);
  const monitor = new QueueMonitor({
    provider,
    repository,
    bus,
    lock: options.lock ?? (pool ? new PgAdvisoryLeaderLock(pool, logger) : new LocalLeaderLock()),
    metrics,
    logger,
    timeZone,
    pollIntervalMs: config.queue.pollIntervalSeconds * 1000,
    maxBackoffMs: config.queue.maxBackoffSeconds * 1000,
    failureThreshold: config.queue.failureThreshold,
    leaderRetryMs: config.queue.cacheTtlSeconds * 1000,
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
  });
  const hub = new QueueRealtimeHub({ bus, service, logger });
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
