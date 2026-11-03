import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { SupportMessageContentKind } from '../../../contracts/mobileApi.v1.js';
import { maskPhone, normalizePhone, parseContact } from '../contactRef.js';
import { readLimited } from './readLimited.js';
import { WebhookSchemaError, type CanonicalWhatsAppEvent, type ConnectResult, type OutboundMessage, type ProviderChannelContext, type ProviderCapabilities, type ProviderConnectionStatus, type ProviderMedia, type ProviderSendResult, type WhatsAppProvider } from '../provider.js';

export interface MetaCloudConfig {
  graphApiVersion: string;
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  appSecret: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

const GRAPH = 'https://graph.facebook.com';
/** Download da mídia: a URL vem da Graph API, mas só é seguida para estes hosts. */
const MEDIA_HOST = /(^|\.)(fbsbx\.com|facebook\.com|whatsapp\.net|fbcdn\.net)$/i;

const TEMPLATE_REQUIRED_CODES = new Set([131047]);

const CONTENT_KIND: Record<string, SupportMessageContentKind> = {
  text: 'text',
  image: 'image',
  document: 'document',
  audio: 'audio',
  video: 'video',
  sticker: 'sticker',
  location: 'location',
  contacts: 'contact',
};

const mediaSchema = z.object({ id: z.string(), mime_type: z.string().optional(), filename: z.string().optional(), caption: z.string().optional() }).partial({ mime_type: true });

const webhookSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z
            .object({
              metadata: z.object({ phone_number_id: z.string() }).partial().optional(),
              contacts: z.array(z.object({ wa_id: z.string().optional(), profile: z.object({ name: z.string().optional() }).optional() })).optional(),
              messages: z
                .array(
                  z.object({
                    from: z.string(),
                    id: z.string(),
                    timestamp: z.string(),
                    type: z.string(),
                    text: z.object({ body: z.string() }).optional(),
                    image: mediaSchema.optional(),
                    document: mediaSchema.optional(),
                    audio: mediaSchema.optional(),
                    video: mediaSchema.optional(),
                    sticker: mediaSchema.optional(),
                    context: z.object({ id: z.string().optional() }).optional(),
                  }),
                )
                .optional(),
              statuses: z
                .array(
                  z.object({
                    id: z.string(),
                    status: z.string(),
                    timestamp: z.string(),
                    errors: z.array(z.object({ code: z.number() })).optional(),
                  }),
                )
                .optional(),
            })
            .optional(),
        }),
      ),
    }),
  ),
});

const fromEpochSeconds = (value: string, fallback: Date): Date => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : fallback;
};

const safeErrorCode = (code: number): string => (TEMPLATE_REQUIRED_CODES.has(code) ? 'template_required' : `meta_error_${code}`);

/**
 * WhatsApp Business Cloud API (Graph API). É o provedor recomendado para produção institucional, depois de habilitar o
 * negócio e o número. Testado com respostas simuladas no formato documentado: sem credenciais, nunca foi exercitado
 * contra a Meta. Fora da janela de 24 h só template aprovado pode sair: o servidor bloqueia antes de tentar.
 */
export class MetaCloudProvider implements WhatsAppProvider {
  readonly providerName = 'meta-cloud-api' as const;
  readonly capabilities: ProviderCapabilities = { serviceWindowHours: 24, ackMeans: 'accepted', managedSession: false };
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly config: MetaCloudConfig) {
    this.fetchImpl = config.fetch ?? fetch;
    this.now = config.now ?? (() => new Date());
  }

  private async graph(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
    return this.fetchImpl(`${GRAPH}/${this.config.graphApiVersion}${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${this.config.accessToken}`, ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
  }

  async getConnectionStatus(_channel: ProviderChannelContext): Promise<{ status: ProviderConnectionStatus; maskedNumber: string | null; errorCode: string | null }> {
    try {
      const response = await this.graph(`/${encodeURIComponent(this.config.phoneNumberId)}?fields=display_phone_number`);
      if (response.status === 401 || response.status === 403) return { status: 'ERROR', maskedNumber: null, errorCode: 'meta_auth_failed' };
      if (!response.ok) return { status: 'DEGRADED', maskedNumber: null, errorCode: `meta_http_${response.status}` };
      const body = (await response.json()) as { display_phone_number?: unknown };
      const phone = typeof body.display_phone_number === 'string' ? normalizePhone(body.display_phone_number) : null;
      return { status: 'CONNECTED', maskedNumber: phone ? maskPhone(phone) : null, errorCode: null };
    } catch {
      return { status: 'ERROR', maskedNumber: null, errorCode: 'meta_unreachable' };
    }
  }

  /** O número é configurado na Meta; aqui a administração só confirma o uso, e a API confere se as credenciais respondem. */
  async connect(channel: ProviderChannelContext): Promise<ConnectResult> {
    const live = await this.getConnectionStatus(channel);
    if (live.status === 'CONNECTED') return { action: 'none', status: 'CONNECTED', qr: null, message: 'Número da API oficial conferido e em uso.' };
    return { action: 'external-setup', status: live.status, qr: null, message: 'A conexão da API oficial é feita no gerenciador do WhatsApp Business. Depois de configurar número e webhook, tente de novo aqui.' };
  }

  async sendMessage(_channel: ProviderChannelContext, message: OutboundMessage): Promise<ProviderSendResult> {
    // a Cloud API trabalha com número; contato só por LID não tem como ser endereçado
    if (message.recipient.startsWith('lid:')) return { accepted: false, providerState: 'REJECTED', errorCode: 'recipient_not_addressable' };
    let response: Response;
    try {
      response = await this.graph(`/${encodeURIComponent(this.config.phoneNumberId)}/messages`, {
        method: 'POST',
        body: {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: message.recipient,
          type: 'text',
          text: { preview_url: false, body: message.text },
          ...(message.replyToProviderMessageId ? { context: { message_id: message.replyToProviderMessageId } } : {}),
        },
      });
    } catch {
      return { accepted: false, providerState: 'UNKNOWN', errorCode: 'meta_timeout' };
    }
    if (response.ok) {
      const body = (await response.json().catch(() => null)) as { messages?: Array<{ id?: unknown }> } | null;
      const id = body?.messages?.[0]?.id;
      if (typeof id === 'string' && id) return { accepted: true, providerState: 'ACKNOWLEDGED', providerMessageId: id };
      return { accepted: false, providerState: 'UNKNOWN', errorCode: 'meta_no_message_id' };
    }
    const error = (await response.json().catch(() => null)) as { error?: { code?: unknown } } | null;
    const code = typeof error?.error?.code === 'number' ? error.error.code : null;
    if (response.status === 429 || response.status === 503) return { accepted: false, providerState: 'RETRYABLE', errorCode: `meta_http_${response.status}` };
    if (response.status >= 500) return { accepted: false, providerState: 'UNKNOWN', errorCode: `meta_http_${response.status}` };
    return { accepted: false, providerState: 'REJECTED', errorCode: code === null ? `meta_http_${response.status}` : safeErrorCode(code) };
  }

  async verifyWebhook(request: { rawBody: Buffer; headers: Record<string, string | undefined> }): Promise<boolean> {
    const header = request.headers['x-hub-signature-256'];
    if (!header?.startsWith('sha256=')) return false;
    const received = Buffer.from(header.slice('sha256='.length), 'hex');
    const expected = createHmac('sha256', this.config.appSecret).update(request.rawBody).digest();
    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  /** Handshake GET do webhook. Devolve o desafio, ou null se o token não confere. */
  verifyHandshake(query: { mode: unknown; token: unknown; challenge: unknown }): string | null {
    if (query.mode !== 'subscribe' || typeof query.token !== 'string' || typeof query.challenge !== 'string') return null;
    const received = Buffer.from(query.token);
    const expected = Buffer.from(this.config.verifyToken);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    return query.challenge;
  }

  async normalizeInboundWebhook(raw: unknown, _channel: ProviderChannelContext): Promise<CanonicalWhatsAppEvent[]> {
    const parsed = webhookSchema.safeParse(raw);
    if (!parsed.success) throw new WebhookSchemaError();
    const events: CanonicalWhatsAppEvent[] = [];
    for (const entry of parsed.data.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        if (change.field !== 'messages' || !value) continue;
        // outro número do mesmo negócio não entra neste canal
        if (value.metadata?.phone_number_id && value.metadata.phone_number_id !== this.config.phoneNumberId) continue;
        for (const message of value.messages ?? []) {
          const from = parseContact(message.from);
          if (!from) continue;
          const name = value.contacts?.find((contact) => contact.wa_id === message.from)?.profile?.name ?? null;
          const kind: SupportMessageContentKind = CONTENT_KIND[message.type] ?? 'unsupported';
          const media = kind === 'image' ? message.image : kind === 'document' ? message.document : kind === 'audio' ? message.audio : kind === 'video' ? message.video : kind === 'sticker' ? message.sticker : undefined;
          const text = message.text?.body ?? media?.caption ?? null;
          events.push({
            kind: 'message',
            providerEventId: `msg:${message.id}`,
            externalMessageId: message.id,
            from,
            displayName: name?.trim().slice(0, 120) || null,
            timestamp: fromEpochSeconds(message.timestamp, this.now()),
            contentKind: kind,
            text,
            media: media ? { ref: media.id, mimeType: media.mime_type ?? null, fileName: media.filename ?? null } : null,
            replyToExternalId: message.context?.id ?? null,
          });
        }
        for (const status of value.statuses ?? []) {
          if (status.status !== 'sent' && status.status !== 'delivered' && status.status !== 'read' && status.status !== 'failed') continue;
          const code = status.errors?.[0]?.code;
          events.push({
            kind: 'delivery',
            providerEventId: `status:${status.id}:${status.status}`,
            externalMessageId: status.id,
            state: status.status,
            errorCode: status.status === 'failed' ? (code === undefined ? 'meta_failed' : safeErrorCode(code)) : null,
            timestamp: fromEpochSeconds(status.timestamp, this.now()),
          });
        }
      }
    }
    return events;
  }

  async fetchMedia(_channel: ProviderChannelContext, media: ProviderMedia, maxBytes: number): Promise<{ content: Buffer; mimeType: string | null; fileName: string | null } | null> {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(media.ref)) return null;
    const info = await this.graph(`/${encodeURIComponent(media.ref)}`);
    if (!info.ok) return null;
    const body = (await info.json()) as { url?: unknown; mime_type?: unknown; file_size?: unknown };
    if (typeof body.url !== 'string' || (typeof body.file_size === 'number' && body.file_size > maxBytes)) return null;
    const url = new URL(body.url);
    if (url.protocol !== 'https:' || !MEDIA_HOST.test(url.hostname)) return null;
    const file = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${this.config.accessToken}` }, redirect: 'error', signal: AbortSignal.timeout(this.config.timeoutMs) });
    if (!file.ok) return null;
    const content = await readLimited(file, maxBytes);
    if (!content) return null;
    return { content, mimeType: typeof body.mime_type === 'string' ? body.mime_type : media.mimeType, fileName: media.fileName };
  }
}
