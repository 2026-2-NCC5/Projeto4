import { waitUntil } from '@vercel/functions';
import type { AppConfig } from '../../config/env.js';
import type { Logger } from '../../config/logger.js';
import { ConflictError } from '../../errors/AppError.js';
import type { AuditActor, AuditService } from '../../platform/auditService.js';
import type { Repositories } from '../../repositories/types.js';
import { SupportFeedService } from '../realtime/feedService.js';
import type { SupportFeedRepository } from '../realtime/feedRepository.js';
import type { SupportCore } from '../supportService.js';
import { ChannelService, REPLY_BLOCK_MESSAGES } from './channelService.js';
import { ContactVault } from './contactVault.js';
import { WhatsAppIngestService } from './ingestService.js';
import { LinkService } from './linkService.js';
import { SupportOutboxWorker } from './outboxWorker.js';
import type { WhatsAppProvider } from './provider.js';
import { createWhatsAppProvider } from './providers/registry.js';
import type { WhatsAppRepository } from './repository.js';

const DRAIN_INTERVAL_MS = 5_000;
const HEALTH_INTERVAL_MS = 60_000;
/** Sem laço residente (serverless): a própria operação conectada faz a fila andar, no máximo uma vez por este tempo. */
const OPPORTUNISTIC_DRAIN_MS = 15_000;
const RECONCILE_INTERVAL_MS = 5 * 60_000;
const DAY_MS = 86_400_000;
const INBOX_RETENTION_DAYS = 30;

export interface WhatsAppModule {
  repo: WhatsAppRepository;
  feedRepo: SupportFeedRepository;
  feed: SupportFeedService;
  provider: WhatsAppProvider | null;
  vault: ContactVault | null;
  channels: ChannelService;
  links: LinkService | null;
  ingest: WhatsAppIngestService | null;
  outbox: SupportOutboxWorker | null;
  /** Faz a fila andar agora, sem segurar a resposta. */
  kick(): void;
  /** Throttled: chamado pelo long polling da equipe. */
  touch(): void;
  /** Tarefas para /api/internal/jobs/*. */
  jobs: Record<string, () => Promise<Record<string, unknown>>>;
  start(): void;
  stop(): void;
}

export interface WhatsAppModuleDeps {
  config: AppConfig;
  repos: Repositories;
  core: SupportCore;
  audit: AuditService;
  logger: Logger;
  now: () => Date;
  /** Testes: sem disparo automático da fila; quem testa chama `outbox.drain()`. */
  autoKick?: boolean;
  fetch?: typeof fetch;
}

/** Composição do canal WhatsApp. Sem provedor, o feed e a Central continuam funcionando para o app e o portal. */
export function createWhatsAppModule(deps: WhatsAppModuleDeps): WhatsAppModule | null {
  const { repos, config, core, audit, logger, now } = deps;
  const repo = repos.whatsapp;
  const feedRepo = repos.supportFeed;
  if (!repo || !feedRepo) return null;
  const whatsapp = config.whatsapp;
  const provider = createWhatsAppProvider(whatsapp, repo, now, deps.fetch);
  const vault = whatsapp.piiKey ? new ContactVault(whatsapp.piiKey) : null;
  const excludeDemo = !config.demo.dataEnabled;
  const feed = new SupportFeedService(feedRepo, now);
  const channels = new ChannelService({ repo, feed: feedRepo, provider, config: whatsapp, audit, logger, now, excludeDemo });
  const links = vault && provider ? new LinkService({ repo, repos, core, vault, audit, logger, demoMode: whatsapp.demoMode, rateLimitEnabled: config.rateLimit.enabled, providerName: provider.providerName, refreshChannel: (channel) => channels.refresh(channel), now }) : null;
  const ingest = provider && vault && links
    ? new WhatsAppIngestService({ repo, repos, feed: feedRepo, core, provider, vault, links, mirrorToApp: whatsapp.mirrorToApp, maxAttachmentBytes: config.support.maxAttachmentBytes, logger, now })
    : null;
  const outbox = provider && vault ? new SupportOutboxWorker({ repo, repos, feed: feedRepo, provider, vault, outboundEnabled: whatsapp.outboundEnabled, logger, now }) : null;

  // ---- ganchos do núcleo de chamados: nenhum outro módulo conhece o provedor
  core.hooks.conversationInfo = (ticket) => (ticket.conversationId ? channels.conversationInfo(ticket.conversationId) : Promise.resolve(null));
  core.hooks.ticketTags = (ticketId) => repo.tagsForTicket(ticketId);
  core.hooks.inboxExtras = (ticketIds) => repo.inboxExtras(ticketIds);
  core.hooks.prepareWhatsAppReply = async (ticket, input) => {
    if (!ticket.conversationId) throw new ConflictError('Este chamado não tem conversa no WhatsApp.', 'no_whatsapp_conversation');
    if (ticket.assignedAgentId && ticket.assignedAgentId !== input.actorUserId && !input.overrideAssignee) {
      // duas pessoas respondendo no mesmo número confunde quem recebe: exige decisão explícita
      throw new ConflictError('Este chamado está com outra pessoa. Confirme para responder mesmo assim.', 'assigned_to_other');
    }
    const conversation = await repo.findConversation(ticket.conversationId);
    if (!conversation) throw new ConflictError('Este chamado não tem conversa no WhatsApp.', 'no_whatsapp_conversation');
    // nunca envia dados do chamado de uma pessoa para um número que hoje é de outra
    if (ticket.studentId && ticket.studentId !== conversation.studentId) throw new ConflictError('Este chamado não tem conversa no WhatsApp.', 'no_whatsapp_conversation');
    // o estado guardado pode estar velho sem laço residente: confere no provedor (com cache curto)
    const stored = await repo.findChannel(conversation.channelId);
    const channel = stored ? await channels.refresh(stored) : null;
    const block = channels.replyBlock(channel, conversation);
    if (block) throw new ConflictError(REPLY_BLOCK_MESSAGES[block], block);
    return {
      transportFields: { transport: 'whatsapp' as const, channelId: conversation.channelId, deliveryState: 'queued' as const, studentVisible: whatsapp.mirrorToApp && Boolean(ticket.studentId) && ticket.studentId === conversation.studentId },
      outbox: { messageId: input.messageId, channelId: conversation.channelId, dedupeKey: `message:${input.messageId}` },
    };
  };

  // uma drenagem por instância: entre instâncias, `skip locked` já separa os itens
  let draining = false;
  const drain = async () => {
    if (!outbox || draining) return;
    draining = true;
    try {
      await outbox.drain();
    } catch (error) {
      logger.error({ error_type: error instanceof Error ? error.name : typeof error }, 'support outbox drain failed');
    } finally {
      draining = false;
    }
  };
  const autoKick = deps.autoKick ?? true;
  const kick = () => {
    if (autoKick) waitUntil(drain());
  };
  core.hooks.kickOutbox = kick;

  let lastTouch = 0;
  const touch = () => {
    if (!autoKick) return;
    const at = Date.now();
    if (at - lastTouch < OPPORTUNISTIC_DRAIN_MS) return;
    lastTouch = at;
    waitUntil(
      (async () => {
        await drain();
        await ingest?.reprocessPending(10);
      })().catch(() => undefined),
    );
  };

  let lastReconcile = 0;
  const maintenance = async (): Promise<Record<string, unknown>> => {
    const at = now();
    const inboxCutoff = new Date(at.getTime() - INBOX_RETENTION_DAYS * DAY_MS);
    const [expired, presence, inbox, failedInbox, events] = await Promise.all([
      repo.expireVerifications(at),
      repo.purgePresence(new Date(at.getTime() - DAY_MS)),
      repo.purgeFinishedInbox(inboxCutoff),
      // falhas guardam conteúdo cifrado: não ficam para sempre
      repo.purgeFailedInbox(inboxCutoff),
      feedRepo.purgeOlderThan(new Date(at.getTime() - whatsapp.eventRetentionDays * DAY_MS)),
    ]);
    return { expiredVerifications: expired, purgedPresence: presence, purgedInbox: inbox, purgedFailedInbox: failedInbox, purgedEvents: events };
  };

  const jobs: WhatsAppModule['jobs'] = {
    'support-maintenance': maintenance,
    ...(outbox && ingest
      ? {
          'support-outbox': async () => ({ ...(await outbox.drain(50)), reprocessed: await ingest.reprocessPending(50) }),
          'support-channel-health': async () => ({ channels: await channels.refreshAll() }),
          'support-whatsapp-reconcile': async () => ingest.reconcile(),
        }
      : {}),
  };

  const timers: NodeJS.Timeout[] = [];
  return {
    repo,
    feedRepo,
    feed,
    provider,
    vault,
    channels,
    links,
    ingest,
    outbox,
    kick,
    touch,
    jobs,
    start() {
      if (!provider) return;
      timers.push(
        setInterval(() => {
          void drain();
          void ingest?.reprocessPending(20).catch(() => undefined);
        }, DRAIN_INTERVAL_MS),
      );
      timers.push(
        setInterval(() => {
          void channels.refreshAll().catch(() => undefined);
          if (Date.now() - lastReconcile >= RECONCILE_INTERVAL_MS) {
            lastReconcile = Date.now();
            void ingest?.reconcile().catch(() => undefined);
          }
        }, HEALTH_INTERVAL_MS),
      );
      for (const timer of timers) timer.unref();
    },
    stop() {
      for (const timer of timers) clearInterval(timer);
      timers.length = 0;
    },
  };
}

export type { AuditActor };
