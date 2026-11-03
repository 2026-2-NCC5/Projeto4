import type { Logger } from '../../config/logger.js';
import type { Repositories } from '../../repositories/types.js';
import { runWithCorrelation } from '../realtime/correlation.js';
import type { SupportFeedRepository } from '../realtime/feedRepository.js';
import type { ContactVault } from './contactVault.js';
import { CIRCUIT_FAILURE_THRESHOLD, CIRCUIT_OPEN_MS, MAX_SEND_ATTEMPTS, SEND_LOCK_MS, nextAttemptDelayMs } from './delivery.js';
import type { ProviderSendResult, WhatsAppProvider } from './provider.js';
import type { ChannelRecord, OutboxRecord, WhatsAppRepository } from './repository.js';

export interface DrainSummary {
  sent: number;
  retried: number;
  failed: number;
  unknown: number;
}

/**
 * Entrega da outbox. Regra central: resposta ambígua vira `unknown` e NUNCA é repetida sozinha, porque o provedor pode
 * ter enviado (WA-AKG não tem idempotência). Só o que comprovadamente não saiu é tentado de novo, com espera crescente.
 * Envio interrompido por queda do processo também vira `unknown`. Várias instâncias podem rodar: `skip locked`.
 */
export class SupportOutboxWorker {
  constructor(
    private readonly deps: {
      repo: WhatsAppRepository;
      repos: Repositories;
      feed: SupportFeedRepository;
      provider: WhatsAppProvider;
      vault: ContactVault;
      outboundEnabled: boolean;
      logger: Logger;
      now: () => Date;
      random?: () => number;
    },
  ) {}

  async drain(limit = 10): Promise<DrainSummary> {
    const { repo, now } = this.deps;
    const summary: DrainSummary = { sent: 0, retried: 0, failed: 0, unknown: 0 };
    for (const stuck of await repo.expireStuckOutbox(now())) {
      await repo.updateDelivery({ messageId: stuck.messageId, state: 'unknown', errorCode: 'send_interrupted', now: now(), force: true });
      summary.unknown += 1;
    }
    // um item por vez: a trava cobre só o envio dele, não a fila inteira
    for (let processed = 0; processed < limit; processed += 1) {
      const [item] = await repo.claimOutbox(1, now(), SEND_LOCK_MS);
      if (!item) break;
      try {
        await runWithCorrelation(`corr-out-${item.id}`, async () => {
          await this.deliver(item, summary);
        });
      } catch (error) {
        // erro de banco: a linha fica "em andamento" e a expiração da trava decide, sem desfazer o que já foi confirmado
        this.deps.logger.error({ outbox_id: item.id, error_type: error instanceof Error ? error.name : typeof error }, 'support outbox item failed');
      }
    }
    return summary;
  }

  private async hold(item: OutboxRecord, until: Date, code: string): Promise<void> {
    await this.deps.repo.rescheduleOutbox(item.id, until, code, { countAttempt: false }, this.deps.now());
  }

  private async deliver(item: OutboxRecord, summary: DrainSummary): Promise<void> {
    const { repo, repos, provider, vault, logger, now, outboundEnabled } = this.deps;
    const at = now();
    const fail = async (code: string) => {
      await repo.updateDelivery({ messageId: item.messageId, state: 'failed', errorCode: code, now: now(), force: true });
      await repo.finishOutbox(item.id, 'failed', code, now());
      summary.failed += 1;
    };
    const [message, ticket, channel] = await Promise.all([repo.findMessage(item.messageId), repos.support.findTicket(item.ticketId), repo.findChannel(item.channelId)]);
    const conversation = ticket?.conversationId ? await repo.findConversation(ticket.conversationId) : null;
    if (!message || !channel || !conversation) return fail('send_context_missing');
    // o número pode ter mudado de dono depois que a resposta entrou na fila: nunca envia dados de um para outro
    if (ticket?.studentId && ticket.studentId !== conversation.studentId) return fail('conversation_changed');
    // desligar o envio ou pausar o canal segura a fila sem gastar tentativas
    if (!outboundEnabled || channel.state === 'paused') return this.hold(item, new Date(at.getTime() + 60_000), 'channel_paused');
    if (channel.state === 'disabled') return fail('channel_disabled');
    if (channel.connection.circuitOpenUntil && channel.connection.circuitOpenUntil > at) return this.hold(item, channel.connection.circuitOpenUntil, 'circuit_open');
    if (conversation.optedOutAt) return fail('consent_required');

    await repo.updateDelivery({ messageId: item.messageId, state: 'sending', errorCode: null, now: at });
    let result: ProviderSendResult;
    try {
      result = await provider.sendMessage(
        { channelId: channel.id, externalSessionId: channel.connection.externalSessionId },
        { channelId: channel.id, recipient: vault.decrypt(conversation.contactEncrypted), text: message.content, replyToProviderMessageId: message.replyToExternalId, idempotencyKey: item.dedupeKey },
      );
    } catch (error) {
      // exceção ao chamar o provedor: não dá para garantir que não saiu
      logger.error({ outbox_id: item.id, error_type: error instanceof Error ? error.name : typeof error }, 'whatsapp send raised');
      await repo.updateDelivery({ messageId: item.messageId, state: 'unknown', errorCode: 'provider_exception', now: now(), force: true });
      await repo.finishOutbox(item.id, 'unknown', 'provider_exception', now());
      summary.unknown += 1;
      return;
    }
    if (result.providerState === 'ACKNOWLEDGED' && result.providerMessageId) {
      await repo.updateDelivery({ messageId: item.messageId, state: provider.capabilities.ackMeans === 'sent' ? 'sent' : 'sending', errorCode: null, externalMessageId: result.providerMessageId, now: now() });
      await repo.finishOutbox(item.id, 'sent', null, now());
      await repo.touchConversation(conversation.id, { lastOutboundAt: now(), lastMessageAt: now() });
      if (channel.connection.consecutiveFailures > 0) await repo.updateConnection(channel.id, { consecutiveFailures: 0, circuitOpenUntil: null }, now());
      summary.sent += 1;
      return;
    }
    if (result.providerState === 'REJECTED') return fail(result.errorCode ?? 'provider_rejected');
    if (result.providerState === 'RETRYABLE') return this.retry(item, channel, result.errorCode ?? 'provider_unavailable', summary, fail);
    await repo.updateDelivery({ messageId: item.messageId, state: 'unknown', errorCode: result.errorCode ?? 'provider_ambiguous', now: now(), force: true });
    await repo.finishOutbox(item.id, 'unknown', result.errorCode ?? 'provider_ambiguous', now());
    summary.unknown += 1;
  }

  private async retry(item: OutboxRecord, channel: ChannelRecord, code: string, summary: DrainSummary, fail: (code: string) => Promise<void>): Promise<void> {
    const { repo, feed, logger, now, random } = this.deps;
    const at = now();
    const failures = channel.connection.consecutiveFailures + 1;
    const opensCircuit = failures >= CIRCUIT_FAILURE_THRESHOLD;
    await repo.updateConnection(channel.id, { consecutiveFailures: failures, lastErrorCode: code, ...(opensCircuit ? { circuitOpenUntil: new Date(at.getTime() + CIRCUIT_OPEN_MS), status: 'DEGRADED' as const } : {}) }, at);
    if (opensCircuit && channel.connection.status !== 'DEGRADED') {
      logger.warn({ channel_id: channel.id, failures }, 'whatsapp provider circuit opened');
      await feed.appendChannelEvent({ type: 'support.channel.connection_updated', audience: 'STAFF_ONLY', actorType: 'system', actorUserId: null, data: { channelId: channel.id, status: 'DEGRADED' }, now: at });
    }
    if (item.attemptCount >= MAX_SEND_ATTEMPTS) return fail(code);
    await repo.updateDelivery({ messageId: item.messageId, state: 'queued', errorCode: code, now: at, force: true });
    await repo.rescheduleOutbox(item.id, new Date(at.getTime() + nextAttemptDelayMs(item.attemptCount, random)), code, { countAttempt: true }, at);
    summary.retried += 1;
  }
}
