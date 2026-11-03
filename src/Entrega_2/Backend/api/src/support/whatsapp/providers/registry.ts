import type { WhatsAppConfig } from '../../../config/env.js';
import type { WhatsAppProvider } from '../provider.js';
import type { WhatsAppRepository } from '../repository.js';
import { FakeProvider } from './fakeProvider.js';
import { MetaCloudProvider } from './metaCloudProvider.js';
import { WaAkgProvider } from './waAkgProvider.js';

/** Provedor conforme a configuração. Só este arquivo conhece as implementações. */
export function createWhatsAppProvider(config: WhatsAppConfig, repo: WhatsAppRepository, now: () => Date, fetchImpl?: typeof fetch): WhatsAppProvider | null {
  if (config.provider === 'fake') return new FakeProvider(repo, config.webhookSecret!, now);
  if (config.provider === 'wa-akg' && config.waAkg) {
    return new WaAkgProvider({ ...config.waAkg, webhookSecret: config.webhookSecret!, publicBaseUrl: config.publicBaseUrl, now, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  }
  if (config.provider === 'meta-cloud-api' && config.meta) {
    return new MetaCloudProvider({ ...config.meta, timeoutMs: 15_000, now, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  }
  return null;
}
