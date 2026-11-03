import type { SupportChannelConnectResult, SupportChannelCreateRequest, SupportChannelList, SupportChannelPatchRequest, SupportChannelStatusItem, SupportChannelView, SupportConversationInfo, SupportProviderHealth, SupportServiceWindow, SupportWhatsAppMetrics, SupportWhatsAppReplyBlock, SupportWhatsAppStatus } from '../../contracts/mobileApi.v1.js';
import type { WhatsAppConfig } from '../../config/env.js';
import type { Logger } from '../../config/logger.js';
import { ConflictError, NotFoundError, ValidationError } from '../../errors/AppError.js';
import type { AuditActor, AuditService } from '../../platform/auditService.js';
import { isSupportTeam } from '../catalog.js';
import type { SupportFeedRepository } from '../realtime/feedRepository.js';
import type { ProviderChannelContext, ProviderConnectionStatus, WhatsAppProvider } from './provider.js';
import type { ChannelRecord, ConversationRecord, WhatsAppRepository } from './repository.js';

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);
/** Sem conferir de novo por este tempo; a tela consulta com frequência e o provedor não precisa de uma chamada a cada vez. */
const STATUS_TTL_MS = 30_000;

const context = (channel: ChannelRecord): ProviderChannelContext => ({ channelId: channel.id, externalSessionId: channel.connection.externalSessionId });

/** Estado do canal, política de resposta e administração da conexão. O QR só existe na resposta de `connect`. */
export class ChannelService {
  constructor(
    private readonly deps: {
      repo: WhatsAppRepository;
      feed: SupportFeedRepository;
      provider: WhatsAppProvider | null;
      config: WhatsAppConfig;
      audit: AuditService;
      logger: Logger;
      now: () => Date;
      excludeDemo: boolean;
    },
  ) {}

  private statusItem(channel: ChannelRecord): SupportChannelStatusItem {
    // número só com conexão confirmada: mostrar o último conhecido sugeriria um canal que não está de pé
    const connected = channel.connection.status === 'CONNECTED' || channel.connection.status === 'DEGRADED';
    return { id: channel.id, name: channel.name, provider: channel.provider, state: channel.state, status: channel.connection.status, maskedNumber: connected ? channel.connection.maskedNumber : null, isDemo: channel.isDemo, lastWebhookAt: iso(channel.connection.lastWebhookAt) };
  }

  private webhookPath(channel: ChannelRecord): string {
    return channel.provider === 'meta-cloud-api' ? '/api/internal/webhooks/meta' : `/api/internal/webhooks/${channel.provider}/${channel.id}`;
  }

  private view(channel: ChannelRecord): SupportChannelView {
    return {
      ...this.statusItem(channel),
      team: channel.team,
      publicNumber: channel.publicNumber,
      authorizationReference: channel.authorizationReference,
      lastConnectedAt: iso(channel.connection.lastConnectedAt),
      lastDisconnectedAt: iso(channel.connection.lastDisconnectedAt),
      lastErrorCode: channel.connection.lastErrorCode,
      healthCheckedAt: iso(channel.connection.healthCheckedAt),
      circuitOpenUntil: iso(channel.connection.circuitOpenUntil),
      sessionManagementEnabled: this.deps.config.sessionManagementEnabled,
      webhookPath: this.webhookPath(channel),
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString(),
    };
  }

  private activeChannels(channels: ChannelRecord[]): ChannelRecord[] {
    const { provider } = this.deps;
    return provider ? channels.filter((channel) => channel.provider === provider.providerName) : [];
  }

  /** Lê o estado real no provedor. Nunca conclui "conectado" sem confirmação dele; erro de leitura vira ERROR. */
  async refresh(channel: ChannelRecord, options: { force?: boolean } = {}): Promise<ChannelRecord> {
    const { provider, repo, feed, now } = this.deps;
    if (!provider || channel.provider !== provider.providerName) return channel;
    // a administração não conectou (ou desconectou): uma leitura do provedor não pode religar o canal por conta própria
    if (!channel.connection.desiredConnected) return channel;
    const at = now();
    const fresh = channel.connection.healthCheckedAt && at.getTime() - channel.connection.healthCheckedAt.getTime() < STATUS_TTL_MS;
    if (fresh && !options.force) return channel;
    const live = await provider.getConnectionStatus(context(channel));
    // disjuntor aberto continua aparecendo como degradado até o provedor voltar a aceitar envios
    const circuitOpen = channel.connection.circuitOpenUntil !== null && channel.connection.circuitOpenUntil > at;
    const status: ProviderConnectionStatus = circuitOpen && live.status === 'CONNECTED' ? 'DEGRADED' : live.status;
    const changed = status !== channel.connection.status;
    await repo.updateConnection(channel.id, {
      status,
      maskedNumber: live.maskedNumber ?? channel.connection.maskedNumber,
      lastErrorCode: live.errorCode,
      healthCheckedAt: at,
      ...(changed && status === 'CONNECTED' ? { lastConnectedAt: at } : {}),
      ...(changed && status === 'DISCONNECTED' ? { lastDisconnectedAt: at } : {}),
    }, at);
    if (changed) await feed.appendChannelEvent({ type: 'support.channel.connection_updated', audience: 'STAFF_ONLY', actorType: 'system', actorUserId: null, data: { channelId: channel.id, status }, now: at });
    return (await repo.findChannel(channel.id)) ?? channel;
  }

  async refreshAll(): Promise<number> {
    const channels = this.activeChannels(await this.deps.repo.listChannels()).filter((channel) => channel.state !== 'disabled');
    for (const channel of channels) await this.refresh(channel, { force: true });
    return channels.length;
  }

  async staffStatus(): Promise<SupportWhatsAppStatus> {
    const { repo, provider, config, now } = this.deps;
    const channels = this.activeChannels(await repo.listChannels()).filter((channel) => channel.state !== 'disabled');
    const refreshed = await Promise.all(channels.map((channel) => this.refresh(channel)));
    return { configured: Boolean(provider), demoMode: config.demoMode, outboundEnabled: config.outboundEnabled, provider: provider?.providerName ?? null, channels: refreshed.map((channel) => this.statusItem(channel)), checkedAt: now().toISOString() };
  }

  async list(): Promise<SupportChannelList> {
    const { repo, provider, config } = this.deps;
    const channels = await repo.listChannels();
    return { items: channels.map((channel) => this.view(channel)), provider: provider?.providerName ?? null, configured: Boolean(provider), disabledReason: config.disabledReason, demoMode: config.demoMode };
  }

  private async mustFind(id: string): Promise<ChannelRecord> {
    const channel = await this.deps.repo.findChannel(id);
    if (!channel) throw new NotFoundError('Canal não encontrado.');
    return channel;
  }

  async get(id: string): Promise<SupportChannelView> {
    return this.view(await this.refresh(await this.mustFind(id), { force: true }));
  }

  async create(body: SupportChannelCreateRequest, actor: AuditActor): Promise<SupportChannelView> {
    const { repo, provider, audit, now, config } = this.deps;
    if (!provider) throw new ConflictError('Nenhum provedor de WhatsApp está configurado neste ambiente.', 'provider_unavailable');
    if (!isSupportTeam(body.team)) throw new ValidationError('Equipe desconhecida.', [{ field: 'team', message: 'fora da lista de equipes' }]);
    // o MVP opera um número institucional por provedor: evita vínculos conflitantes entre canais
    const existing = (await repo.listChannels()).find((channel) => channel.provider === provider.providerName && channel.state !== 'disabled');
    if (existing) throw new ConflictError('Já existe um canal ativo para este provedor. Desative-o antes de criar outro.', 'channel_exists');
    const channel = await repo.createChannel({ name: body.name.trim(), provider: provider.providerName, team: body.team, publicNumber: body.publicNumber ?? null, authorizationReference: body.authorizationReference?.trim() || null, isDemo: config.demoMode, createdBy: actor.userId ?? '', now: now() });
    await audit.record(actor, { action: 'channel.created', resourceType: 'support_channel', resourceId: channel.id, metadata: { provider: channel.provider } });
    return this.view(channel);
  }

  async patch(id: string, body: SupportChannelPatchRequest, actor: AuditActor): Promise<SupportChannelView> {
    const { repo, audit, now } = this.deps;
    await this.mustFind(id);
    if (body.team !== undefined && !isSupportTeam(body.team)) throw new ValidationError('Equipe desconhecida.', [{ field: 'team', message: 'fora da lista de equipes' }]);
    const updated = await repo.updateChannel(id, {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.team !== undefined ? { team: body.team } : {}),
      ...(body.state !== undefined ? { state: body.state } : {}),
      ...(body.publicNumber !== undefined ? { publicNumber: body.publicNumber } : {}),
      ...(body.authorizationReference !== undefined ? { authorizationReference: body.authorizationReference?.trim() || null } : {}),
    }, now());
    await audit.record(actor, { action: 'channel.updated', resourceType: 'support_channel', resourceId: id, metadata: { ...(body.state ? { state: body.state } : {}) } });
    return this.view(updated!);
  }

  /**
   * Conexão autorizada. Exige o gerenciamento de sessão ligado e, em provedor real, a referência da autorização do
   * número: conectar um número sem respaldo institucional é justamente o que este passo existe para impedir.
   */
  async connect(id: string, actor: AuditActor): Promise<SupportChannelConnectResult> {
    const { repo, provider, config, audit, logger, now, feed } = this.deps;
    const channel = await this.mustFind(id);
    if (!provider || channel.provider !== provider.providerName) throw new ConflictError('O provedor deste canal não está ativo neste ambiente.', 'provider_unavailable');
    if (!config.sessionManagementEnabled) throw new ConflictError('A conexão pelo portal está desligada neste ambiente (ASA_WHATSAPP_SESSION_MANAGEMENT_ENABLED).', 'session_management_disabled');
    if (channel.state !== 'enabled') throw new ConflictError('Ative o canal antes de conectar.', 'channel_paused');
    if (channel.provider !== 'fake' && !channel.authorizationReference) throw new ConflictError('Informe a referência da autorização institucional deste número antes de conectar.', 'authorization_required');
    if (!provider.connect) throw new ConflictError('Este provedor é conectado fora do portal.', 'external_setup');
    await audit.record(actor, { action: 'channel.connect_requested', resourceType: 'support_channel', resourceId: id });
    let result;
    try {
      result = await provider.connect(context(channel));
    } catch (error) {
      // a mensagem de erro é um código do adapter, sem conteúdo do gateway
      const code = error instanceof Error ? error.message.slice(0, 60) : 'provider_error';
      logger.warn({ channel_id: id, error_type: code }, 'whatsapp connect failed');
      await repo.updateConnection(id, { status: 'ERROR', lastErrorCode: code, healthCheckedAt: now() }, now());
      throw new ConflictError('Não foi possível falar com o provedor. Confira o estado do gateway e tente de novo.', 'provider_unavailable');
    }
    const at = now();
    await repo.updateConnection(id, { status: result.status, desiredConnected: true, lastErrorCode: null, healthCheckedAt: at, ...(result.status === 'CONNECTED' ? { lastConnectedAt: at } : {}) }, at);
    if (result.status !== channel.connection.status) await feed.appendChannelEvent({ type: 'support.channel.connection_updated', audience: 'STAFF_ONLY', actorType: 'agent', actorUserId: actor.userId, data: { channelId: id, status: result.status }, now: at });
    const updated = await this.mustFind(id);
    return {
      channel: this.view(updated),
      action: result.action,
      qr: result.qr ? { format: result.qr.format, value: result.qr.value, expiresAt: result.qr.expiresAt?.toISOString() ?? null } : null,
      message: result.message,
    };
  }

  /** Desconecta sem apagar nada: chamados e histórico continuam; mensagens na fila aguardam ou falham de forma explícita. */
  async disconnect(id: string, actor: AuditActor): Promise<SupportChannelView> {
    const { repo, provider, audit, feed, now } = this.deps;
    const channel = await this.mustFind(id);
    if (provider?.disconnect && channel.provider === provider.providerName) {
      try {
        await provider.disconnect(context(channel));
      } catch {
        throw new ConflictError('O provedor não confirmou a desconexão. Tente de novo ou encerre a sessão direto no gateway.', 'provider_unavailable');
      }
    }
    const at = now();
    await repo.updateConnection(id, { status: 'DISCONNECTED', desiredConnected: false, lastDisconnectedAt: at, healthCheckedAt: at, maskedNumber: null }, at);
    await feed.appendChannelEvent({ type: 'support.channel.connection_updated', audience: 'STAFF_ONLY', actorType: 'agent', actorUserId: actor.userId, data: { channelId: id, status: 'DISCONNECTED' }, now: at });
    await audit.record(actor, { action: 'channel.disconnected', resourceType: 'support_channel', resourceId: id });
    return this.view(await this.mustFind(id));
  }

  async health(): Promise<SupportProviderHealth> {
    const { repo, provider, config, now } = this.deps;
    const [channels, outbox, inbox] = await Promise.all([repo.listChannels(), repo.outboxStats(), repo.inboxStats()]);
    const at = now();
    return {
      provider: provider?.providerName ?? null,
      configured: Boolean(provider),
      demoMode: config.demoMode,
      disabledReason: config.disabledReason,
      outbox: { pending: outbox.pending, processing: outbox.processing, failed: outbox.failed, unknown: outbox.unknown, oldestPendingAt: iso(outbox.oldestPendingAt) },
      inbox: { pending: inbox.pending, failed: inbox.failed, lastReceivedAt: iso(inbox.lastReceivedAt) },
      eventLagSeconds: outbox.oldestPendingAt ? Math.max(0, Math.round((at.getTime() - outbox.oldestPendingAt.getTime()) / 1000)) : null,
      channels: channels.map((channel) => this.statusItem(channel)),
      checkedAt: at.toISOString(),
    };
  }

  serviceWindow(conversation: ConversationRecord): SupportServiceWindow {
    const hours = this.deps.provider?.capabilities.serviceWindowHours ?? null;
    if (hours === null) return { kind: 'not_applicable', expiresAt: null };
    if (!conversation.lastInboundAt) return { kind: 'expired', expiresAt: null };
    const expiresAt = new Date(conversation.lastInboundAt.getTime() + hours * 3_600_000);
    return { kind: expiresAt > this.deps.now() ? 'open' : 'expired', expiresAt: expiresAt.toISOString() };
  }

  /** O servidor decide se uma resposta pode sair agora. A tela só mostra o motivo. */
  replyBlock(channel: ChannelRecord | null, conversation: ConversationRecord): SupportWhatsAppReplyBlock | null {
    const { provider, config, now } = this.deps;
    if (!provider || !channel || channel.provider !== provider.providerName) return 'provider_unavailable';
    if (!config.outboundEnabled) return 'outbound_disabled';
    if (channel.state !== 'enabled') return 'channel_paused';
    if (channel.connection.circuitOpenUntil && channel.connection.circuitOpenUntil > now()) return 'provider_unavailable';
    if (channel.connection.status !== 'CONNECTED' && channel.connection.status !== 'DEGRADED') return 'channel_disconnected';
    if (conversation.optedOutAt) return 'consent_required';
    if (this.serviceWindow(conversation).kind === 'expired') return 'template_required';
    return null;
  }

  async conversationInfo(conversationId: string): Promise<SupportConversationInfo | null> {
    const { repo } = this.deps;
    const conversation = await repo.findConversation(conversationId);
    if (!conversation) return null;
    const channel = await repo.findChannel(conversation.channelId);
    return {
      id: conversation.id,
      channelId: conversation.channelId,
      channelName: channel?.name ?? 'Canal removido',
      contactLabel: conversation.contactMasked,
      contactName: conversation.contactDisplayName,
      identified: Boolean(conversation.studentId),
      linkedAt: iso(conversation.linkedAt),
      lastInboundAt: iso(conversation.lastInboundAt),
      serviceWindow: this.serviceWindow(conversation),
      replyBlock: this.replyBlock(channel, conversation),
    };
  }

  async metrics(from: Date, to: Date): Promise<SupportWhatsAppMetrics> {
    const data = await this.deps.repo.metrics(from, to, this.deps.excludeDemo);
    return { from: from.toISOString(), to: to.toISOString(), ...data };
  }
}

export const REPLY_BLOCK_MESSAGES: Record<SupportWhatsAppReplyBlock, string> = {
  outbound_disabled: 'O envio pelo WhatsApp está desligado neste ambiente. Responda pelo chat do app ou consulte a administração.',
  channel_disconnected: 'O WhatsApp institucional está desconectado. Nada foi enviado. Responda pelo chat do app ou peça à administração para reconectar.',
  channel_paused: 'O canal WhatsApp está pausado pela administração. Nada foi enviado.',
  provider_unavailable: 'O provedor do WhatsApp está indisponível no momento. Nada foi enviado; tente de novo em instantes.',
  template_required: 'A janela de 24 horas desta conversa terminou. Por regra do WhatsApp, só um modelo aprovado pode iniciar uma nova conversa.',
  consent_required: 'Esta pessoa pediu para não receber mensagens por este canal. Nada foi enviado.',
};
