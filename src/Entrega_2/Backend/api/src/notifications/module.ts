import type { RequestHandler, Router } from 'express';
import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import type { DbPool } from '../db/pool.js';
import { NotificationService } from './notificationService.js';
import { ExpoPushProvider, LogPushProvider } from './pushProviders.js';
import { MemoryDeliveryRepository, MemoryPushDeviceRepository, PgDeliveryRepository, PgPushDeviceRepository } from './repository.js';
import { createNotificationRouter } from './routes.js';
import type { PushProvider } from './types.js';

export interface NotificationsModule {
  service: NotificationService;
  router(deps: { authenticate: RequestHandler; rateLimitEnabled: boolean; now: () => Date }): Router;
  stop(): void;
}

export interface CreateNotificationsModuleOptions {
  config: AppConfig;
  logger: Logger;
  /** sem pool: repositórios em memória (testes/execução sem banco) */
  pool?: DbPool;
  /** substitui o provedor configurado (testes) */
  provider?: PushProvider | null;
  now?: () => Date;
}

/** NotificationService genérico (push via Expo). Hoje usado pela fila; disponível para outros módulos. */
export function createNotificationsModule(options: CreateNotificationsModuleOptions): NotificationsModule {
  const { config, logger, pool } = options;
  const log = logger.child({ module: 'notifications' });
  const provider =
    options.provider !== undefined
      ? options.provider
      : config.push.provider === 'expo'
        ? new ExpoPushProvider({ accessToken: config.push.expoAccessToken })
        : config.push.provider === 'log'
          ? new LogPushProvider(log)
          : null;
  const service = new NotificationService({
    devices: pool ? new PgPushDeviceRepository(pool) : new MemoryPushDeviceRepository(),
    deliveries: pool ? new PgDeliveryRepository(pool) : new MemoryDeliveryRepository(),
    provider,
    logger: log,
    receiptDelayMs: config.push.receiptDelaySeconds * 1000,
    ...(options.now ? { now: options.now } : {}),
  });
  return {
    service,
    router: (deps) => createNotificationRouter({ service, ...deps }),
    stop: () => service.stop(),
  };
}
