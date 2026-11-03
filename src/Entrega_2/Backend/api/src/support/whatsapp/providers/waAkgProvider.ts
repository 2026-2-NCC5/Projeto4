import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { SupportMessageContentKind } from '../../../contracts/mobileApi.v1.js';
import { maskPhone, parseContact, sendTargetJid } from '../contactRef.js';
import { readLimited } from './readLimited.js';
import { WebhookSchemaError, type CanonicalWhatsAppEvent, type ConnectResult, type OutboundMessage, type ProviderChannelContext, type ProviderCapabilities, type ProviderConnectionStatus, type ProviderMedia, type ProviderSendResult, type WhatsAppProvider } from '../provider.js';

/**
 * Adapter do gateway WA-AKG (revisão fixada: 04d6c0f, v1.7.0; ver docs/whatsapp/integration-wa-akg.md).
 * Só para piloto autorizado: o gateway usa Baileys, cliente não oficial do WhatsApp. Fatos da revisão auditada que
 * explicam escolhas daqui:
 * - sem webhook de status da sessão: o estado é sempre lido em GET /api/sessions/{id};
 * - `message.status` vem deslocado em relação ao Baileys (recibo de entrega chega como READ): READ nunca vira "lida";
 * - sem reenvio de webhook e sem webhook de mensagens recebidas com o gateway fora do ar: daí `reconcile`;
 * - sem idempotência no envio: resposta ambígua é UNKNOWN e nunca é repetida sozinha;
 * - a rota /reply não devolve id e repassa URLs ao Baileys sem validar: nunca é usada.
 * Tipos do fornecedor não saem deste arquivo.
 */
export interface WaAkgConfig {
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
  timeoutMs: number;
  /** URL pública desta API, para registrar o webhook (o gateway só aceita HTTPS público) */
  publicBaseUrl: string | null;
  fetch?: typeof fetch;
  now?: () => Date;
}

const REPLAY_WINDOW_MS = 5 * 60_000;
const FUTURE_TOLERANCE_MS = 60_000;

const SESSION_STATUS: Record<string, ProviderConnectionStatus> = {
  CONNECTED: 'CONNECTED',
  SCAN_QR: 'QR_REQUIRED',
  STOPPED: 'DISCONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  LOGGED_OUT: 'DISCONNECTED',
};

const CONTENT_KIND: Record<string, SupportMessageContentKind> = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
  STICKER: 'sticker',
  LOCATION: 'location',
  CONTACT: 'contact',
};

const envelopeSchema = z.object({ event: z.string().min(1).max(60), sessionId: z.string().max(120), timestamp: z.string().optional(), data: z.unknown() });

const messageSchema = z.object({
  key: z.object({ id: z.string().min(1).max(200), fromMe: z.boolean().optional() }),
  pushName: z.string().nullish(),
  messageTimestamp: z.union([z.number(), z.string()]).nullish(),
  from: z.string().nullish(),
  isGroup: z.boolean().optional(),
  chatType: z.string().optional(),
  type: z.string().optional(),
  content: z.string().nullish(),
  caption: z.string().nullish(),
  fileUrl: z.string().nullish(),
  quoted: z.object({ key: z.object({ id: z.string().nullish() }).nullish() }).nullish(),
});

const statusSchema = z.object({ keyId: z.string().min(1).max(200), status: z.string() });

/** Linha de GET /api/chat/{s}/{jid}. */
const storedMessageSchema = z.object({
  keyId: z.string().min(1).max(200),
  remoteJid: z.string(),
  fromMe: z.boolean(),
  type: z.string().nullish(),
  content: z.string().nullish(),
  mediaUrl: z.string().nullish(),
  timestamp: z.union([z.string(), z.number()]),
  quoteId: z.string().nullish(),
});

/** Mídia só do próprio gateway: o caminho precisa ter esta forma exata. O host nunca vem do payload. */
const MEDIA_PATH = /^\/api\/media\/[A-Za-z0-9_][A-Za-z0-9_.-]{0,200}$/;

function parseTimestamp(value: number | string | null | undefined, fallback: Date): Date {
  if (value === null || value === undefined) return fallback;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function toMessageEvent(input: { id: string; contactJid: string; displayName: string | null; timestamp: Date; type: string | null | undefined; content: string | null | undefined; caption: string | null | undefined; fileUrl: string | null | undefined; replyTo: string | null | undefined }): CanonicalWhatsAppEvent | null {
  const from = parseContact(input.contactJid);
  if (!from) return null;
  const type = (input.type ?? 'UNKNOWN').toUpperCase();
  const mapped: SupportMessageContentKind = CONTENT_KIND[type] ?? 'unsupported';
  const rawText = mapped === 'text' ? input.content : mapped === 'document' || mapped === 'image' || mapped === 'video' ? (input.caption ?? (mapped === 'document' ? null : input.content)) : null;
  const text = rawText?.trim() ? rawText : null;
  // TEXT com conteúdo vazio é como o gateway representa tipos que ele não conhece: não descarta, marca como não suportada
  const contentKind: SupportMessageContentKind = mapped === 'text' && !text ? 'unsupported' : mapped;
  return {
    kind: 'message',
    providerEventId: `msg:${input.id}`,
    externalMessageId: input.id,
    from,
    displayName: input.displayName?.trim().slice(0, 120) || null,
    timestamp: input.timestamp,
    contentKind,
    text,
    media: input.fileUrl ? { ref: input.fileUrl, mimeType: null, fileName: mapped === 'document' ? (input.content ?? null) : null } : null,
    replyToExternalId: input.replyTo ?? null,
  };
}

export class WaAkgProvider implements WhatsAppProvider {
  readonly providerName = 'wa-akg' as const;
  readonly capabilities: ProviderCapabilities = { serviceWindowHours: null, ackMeans: 'sent', managedSession: true };
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly baseUrl: string;

  constructor(private readonly config: WaAkgConfig) {
    this.fetchImpl = config.fetch ?? fetch;
    this.now = config.now ?? (() => new Date());
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
  }

  private async call(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
    return this.fetchImpl(`${this.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: { 'x-api-key': this.config.apiKey, ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      // a chave não pode acompanhar um redirecionamento para outro host
      redirect: 'error',
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
  }

  private sessionRef(channel: ProviderChannelContext): string {
    // o gateway extrai o id da sessão do nome do arquivo de mídia: só letras, números e "_"
    return channel.externalSessionId ?? `asa_${channel.channelId.replace(/[^A-Za-z0-9]/g, '')}`;
  }

  async getConnectionStatus(channel: ProviderChannelContext): Promise<{ status: ProviderConnectionStatus; maskedNumber: string | null; errorCode: string | null }> {
    try {
      const response = await this.call(`/api/sessions/${encodeURIComponent(this.sessionRef(channel))}`);
      if (response.status === 404) return { status: 'DISCONNECTED', maskedNumber: null, errorCode: 'session_not_found' };
      if (response.status === 401 || response.status === 403) return { status: 'ERROR', maskedNumber: null, errorCode: 'gateway_auth_failed' };
      if (!response.ok) return { status: 'ERROR', maskedNumber: null, errorCode: `gateway_http_${response.status}` };
      // a resposta também traz o QR e o segredo do webhook: só os campos abaixo são lidos
      const body = (await response.json()) as { data?: { status?: unknown; hasInstance?: unknown; me?: { id?: unknown } | null } };
      const raw = typeof body.data?.status === 'string' ? body.data.status : '';
      // sem socket no processo, o CONNECTED guardado no banco é velho: depois de reiniciar o gateway, a sessão não está de pé
      if (raw === 'CONNECTED' && body.data?.hasInstance === false) return { status: 'DISCONNECTED', maskedNumber: null, errorCode: 'session_not_running' };
      const meId = typeof body.data?.me?.id === 'string' ? body.data.me.id : null;
      const me = meId ? parseContact(meId) : null;
      return { status: SESSION_STATUS[raw] ?? 'ERROR', maskedNumber: me?.kind === 'phone' ? maskPhone(me.value) : null, errorCode: raw === 'LOGGED_OUT' ? 'session_logged_out' : SESSION_STATUS[raw] ? null : 'gateway_status_unknown' };
    } catch {
      return { status: 'ERROR', maskedNumber: null, errorCode: 'gateway_unreachable' };
    }
  }

  async connect(channel: ProviderChannelContext): Promise<ConnectResult> {
    const session = this.sessionRef(channel);
    const encoded = encodeURIComponent(session);
    const current = await this.call(`/api/sessions/${encoded}`);
    let needsStart = true;
    let alreadyConnected = false;
    if (current.status === 404) {
      const created = await this.call('/api/sessions', { method: 'POST', body: { name: session, sessionId: session } });
      if (!created.ok) throw new Error(`gateway_http_${created.status}`);
    } else if (current.ok) {
      const body = (await current.json()) as { data?: { status?: unknown; hasInstance?: unknown } };
      const status = body.data?.status;
      // /start em uma sessão com socket ativo abre um segundo socket
      needsStart = status === 'STOPPED' || status === 'LOGGED_OUT' || body.data?.hasInstance === false;
      alreadyConnected = status === 'CONNECTED' && body.data?.hasInstance !== false;
    } else {
      throw new Error(`gateway_http_${current.status}`);
    }
    // antes de qualquer retorno: sessão criada direto no gateway também precisa do webhook
    await this.ensureWebhook(encoded, channel.channelId);
    if (alreadyConnected) return { action: 'none', status: 'CONNECTED', qr: null, message: 'A conta institucional já está conectada.' };
    if (needsStart) {
      const started = await this.call(`/api/sessions/${encoded}/start`, { method: 'POST' });
      if (!started.ok) throw new Error(`gateway_http_${started.status}`);
    }
    const qr = await this.call(`/api/sessions/${encoded}/qr`);
    if (qr.status === 400) return { action: 'none', status: 'CONNECTED', qr: null, message: 'A conta institucional já está conectada.' };
    if (qr.status === 404) return { action: 'qr', status: 'CONNECTING', qr: null, message: 'Gerando o QR no gateway. Ele aparece em alguns segundos.' };
    if (!qr.ok) throw new Error(`gateway_http_${qr.status}`);
    const body = (await qr.json()) as { base64?: unknown };
    if (typeof body.base64 !== 'string' || !body.base64.startsWith('data:image/png;base64,')) throw new Error('gateway_qr_invalid');
    // o gateway não informa validade: o QR é renovado por ele e a tela consulta de novo
    return { action: 'qr', status: 'QR_REQUIRED', qr: { format: 'image_data_url', value: body.base64, expiresAt: null }, message: 'Escaneie com o aparelho do número institucional autorizado.' };
  }

  /** Registra o webhook uma vez, e reaplica o segredo a cada conexão, para valer depois de uma rotação (a lista traz segredos: só URL e id são lidos). */
  private async ensureWebhook(encodedSession: string, channelId: string): Promise<void> {
    if (!this.config.publicBaseUrl) throw new Error('public_base_url_missing');
    const url = `${this.config.publicBaseUrl.replace(/\/+$/, '')}/api/internal/webhooks/wa-akg/${encodeURIComponent(channelId)}`;
    const list = await this.call(`/api/webhooks/${encodedSession}`);
    if (list.ok) {
      const body = (await list.json()) as { data?: Array<{ id?: unknown; url?: unknown }> };
      const existing = body.data?.find((item) => item.url === url);
      if (existing && typeof existing.id === 'string') {
        const updated = await this.call(`/api/webhooks/${encodedSession}/${encodeURIComponent(existing.id)}`, { method: 'PUT', body: { secret: this.config.webhookSecret, events: ['message.received', 'message.status'], isActive: true } });
        if (!updated.ok) throw new Error(`gateway_webhook_http_${updated.status}`);
        return;
      }
    }
    const created = await this.call(`/api/webhooks/${encodedSession}`, { method: 'POST', body: { name: 'asa-conecta', url, secret: this.config.webhookSecret, events: ['message.received', 'message.status'] } });
    if (!created.ok) throw new Error(`gateway_webhook_http_${created.status}`);
  }

  async disconnect(channel: ProviderChannelContext): Promise<void> {
    // `stop` não sobrevive a um reinício do gateway; `logout` encerra de fato o acesso ao número
    const response = await this.call(`/api/sessions/${encodeURIComponent(this.sessionRef(channel))}/logout`, { method: 'POST' });
    if (!response.ok && response.status !== 404) throw new Error(`gateway_http_${response.status}`);
  }

  async sendMessage(channel: ProviderChannelContext, message: OutboundMessage): Promise<ProviderSendResult> {
    const jid = encodeURIComponent(sendTargetJid(message.recipient));
    let response: Response;
    try {
      response = await this.call(`/api/messages/${encodeURIComponent(this.sessionRef(channel))}/${jid}/send`, {
        method: 'POST',
        body: { message: { text: message.text }, ...(message.replyToProviderMessageId ? { quotedMessageId: message.replyToProviderMessageId } : {}) },
      });
    } catch (error) {
      // sem conexão estabelecida o pedido não saiu. Queda no meio (ECONNRESET, timeout) pode ter saído: sem idempotência no gateway, não repete
      const code = (error as { cause?: { code?: string } }).cause?.code;
      if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { accepted: false, providerState: 'RETRYABLE', errorCode: 'gateway_unreachable' };
      return { accepted: false, providerState: 'UNKNOWN', errorCode: 'gateway_timeout' };
    }
    if (response.ok) {
      // o corpo pode trazer material criptográfico da mídia: só o id é lido
      const body = (await response.json().catch(() => null)) as { data?: { key?: { id?: unknown }; id?: unknown } | null } | null;
      const id = body?.data?.key?.id ?? body?.data?.id;
      if (typeof id === 'string' && id) return { accepted: true, providerState: 'ACKNOWLEDGED', providerMessageId: id };
      return { accepted: false, providerState: 'UNKNOWN', errorCode: 'gateway_no_message_id' };
    }
    if (response.status === 401 || response.status === 403) return { accepted: false, providerState: 'REJECTED', errorCode: 'gateway_auth_failed' };
    if (response.status === 400 || response.status === 404) return { accepted: false, providerState: 'REJECTED', errorCode: `gateway_http_${response.status}` };
    // 5xx é o que o gateway usa tanto para "sessão desconectada" quanto para falha no meio do envio
    const text = await response.text().catch(() => '');
    if (/not connected|disconnected|session not found|not ready|no active session/i.test(text)) return { accepted: false, providerState: 'RETRYABLE', errorCode: 'channel_disconnected' };
    return { accepted: false, providerState: 'UNKNOWN', errorCode: `gateway_http_${response.status}` };
  }

  async verifyWebhook(request: { rawBody: Buffer; headers: Record<string, string | undefined> }): Promise<boolean> {
    const header = request.headers['x-webhook-signature'];
    if (!header?.startsWith('sha256=')) return false;
    const received = Buffer.from(header.slice('sha256='.length), 'hex');
    const expected = createHmac('sha256', this.config.webhookSecret).update(request.rawBody).digest();
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
    // o gateway não tem proteção contra repetição; o timestamp está dentro do corpo assinado
    try {
      const { timestamp } = JSON.parse(request.rawBody.toString('utf8')) as { timestamp?: unknown };
      const sentAt = typeof timestamp === 'string' ? Date.parse(timestamp) : Number.NaN;
      if (Number.isNaN(sentAt)) return false;
      const age = this.now().getTime() - sentAt;
      return age <= REPLAY_WINDOW_MS && age >= -FUTURE_TOLERANCE_MS;
    } catch {
      return false;
    }
  }

  async normalizeInboundWebhook(raw: unknown, channel: ProviderChannelContext): Promise<CanonicalWhatsAppEvent[]> {
    const envelope = envelopeSchema.safeParse(raw);
    if (!envelope.success) throw new WebhookSchemaError();
    const { event, sessionId, data } = envelope.data;
    if (event === 'test') return [];
    if (sessionId !== this.sessionRef(channel)) throw new WebhookSchemaError('sessão diferente da configurada no canal');
    if (event === 'message.received') {
      const parsed = messageSchema.safeParse(data);
      if (!parsed.success) throw new WebhookSchemaError();
      const message = parsed.data;
      // grupos estão fora de escopo; `from` é a conta do remetente (phone quando o gateway resolve, senão @lid)
      if (message.isGroup === true || (message.chatType !== undefined && message.chatType !== 'PERSONAL') || message.key.fromMe === true || !message.from) return [];
      const canonical = toMessageEvent({
        id: message.key.id,
        contactJid: message.from,
        displayName: message.pushName ?? null,
        timestamp: parseTimestamp(message.messageTimestamp, this.now()),
        type: message.type,
        content: message.content,
        caption: message.caption,
        fileUrl: message.fileUrl,
        replyTo: message.quoted?.key?.id,
      });
      return canonical ? [canonical] : [];
    }
    if (event === 'message.status') {
      const parsed = statusSchema.safeParse(data);
      if (!parsed.success) throw new WebhookSchemaError();
      // Mapa do gateway está deslocado: READ cobre entrega e leitura, então nunca afirmamos "lida".
      // PENDING cobre erro, áudio ouvido e atualização sem status: não dá para concluir nada.
      const state = parsed.data.status === 'SENT' || parsed.data.status === 'DELIVERED' ? 'sent' : parsed.data.status === 'READ' ? 'delivered' : null;
      if (!state) return [];
      return [{ kind: 'delivery', providerEventId: `status:${parsed.data.keyId}:${parsed.data.status}`, externalMessageId: parsed.data.keyId, state, errorCode: null, timestamp: this.now() }];
    }
    // message.sent (inclui o que foi digitado no aparelho), edições, grupos e contatos: fora do atendimento
    return [];
  }

  async fetchMedia(_channel: ProviderChannelContext, media: ProviderMedia, maxBytes: number): Promise<{ content: Buffer; mimeType: string | null; fileName: string | null } | null> {
    if (!MEDIA_PATH.test(media.ref) || media.ref.includes('..')) return null;
    const response = await this.call(media.ref);
    if (!response.ok) return null;
    const content = await readLimited(response, maxBytes);
    if (!content) return null;
    return { content, mimeType: response.headers.get('content-type'), fileName: media.fileName };
  }

  /**
   * O gateway não reenvia webhooks nem avisa do que chegou com ele fora do ar. Lê as conversas recentes e devolve os
   * eventos no mesmo formato do webhook: o id é o mesmo, então a deduplicação da inbox evita qualquer repetição.
   * `since` limita ao período do canal: o gateway guarda o histórico completo do número (syncFullHistory).
   */
  async reconcile(channel: ProviderChannelContext, since: Date, limits: { maxChats: number }): Promise<CanonicalWhatsAppEvent[]> {
    const session = encodeURIComponent(this.sessionRef(channel));
    const chats = await this.call(`/api/chat/${session}`);
    if (!chats.ok) throw new Error(`gateway_http_${chats.status}`);
    const body = (await chats.json()) as { data?: Array<{ jid?: unknown; remoteJid?: unknown }> };
    const jids = (body.data ?? []).map((chat) => (typeof chat.jid === 'string' ? chat.jid : typeof chat.remoteJid === 'string' ? chat.remoteJid : null)).filter((jid): jid is string => Boolean(jid && parseContact(jid))).slice(0, limits.maxChats);
    const events: CanonicalWhatsAppEvent[] = [];
    for (const jid of jids) {
      const response = await this.call(`/api/chat/${session}/${encodeURIComponent(jid)}`);
      if (!response.ok) continue;
      const list = (await response.json()) as { data?: unknown[] };
      for (const item of list.data ?? []) {
        const parsed = storedMessageSchema.safeParse(item);
        if (!parsed.success || parsed.data.fromMe) continue;
        const timestamp = parseTimestamp(parsed.data.timestamp, this.now());
        if (timestamp < since) continue;
        const canonical = toMessageEvent({ id: parsed.data.keyId, contactJid: jid, displayName: null, timestamp, type: parsed.data.type, content: parsed.data.content, caption: null, fileUrl: parsed.data.mediaUrl, replyTo: parsed.data.quoteId });
        if (canonical) events.push(canonical);
      }
    }
    return events;
  }
}
