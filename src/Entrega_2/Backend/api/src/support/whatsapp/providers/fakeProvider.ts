import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { SYNTHETIC_PHONE, maskPhone, parseContact } from '../contactRef.js';
import { WebhookSchemaError, type CanonicalWhatsAppEvent, type ConnectResult, type OutboundMessage, type ProviderChannelContext, type ProviderCapabilities, type ProviderConnectionStatus, type ProviderMedia, type ProviderSendResult, type WhatsAppProvider } from '../provider.js';
import type { WhatsAppRepository } from '../repository.js';

export const FAKE_SIGNATURE_HEADER = 'x-asa-fake-signature';
const SYNTHETIC_NUMBER = '+99900000001';

const canonicalSchema = z.object({
  events: z.array(
    z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('message'),
        providerEventId: z.string().min(1).max(200),
        externalMessageId: z.string().min(1).max(200),
        from: z.string().regex(SYNTHETIC_PHONE, 'só números sintéticos (+999...)'),
        displayName: z.string().max(120).nullable(),
        timestamp: z.string(),
        contentKind: z.enum(['text', 'image', 'document', 'unsupported']),
        text: z.string().max(8000).nullable(),
        mediaRef: z.string().max(40).nullable(),
      }),
      z.object({ kind: z.literal('delivery'), providerEventId: z.string().min(1).max(200), externalMessageId: z.string().min(1).max(200), state: z.enum(['sent', 'delivered', 'read', 'failed']), errorCode: z.string().max(60).nullable(), timestamp: z.string() }),
      z.object({ kind: z.literal('connection'), providerEventId: z.string().min(1).max(200), status: z.enum(['CONNECTED', 'DISCONNECTED', 'DEGRADED', 'QR_REQUIRED']), timestamp: z.string() }),
    ]),
  ),
});

/** Arquivos sintéticos: PDF e PNG mínimos, sem nenhum dado de pessoa. */
const SYNTHETIC_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 58>>stream\nBT /F1 18 Tf 24 72 Td (Documento de demonstracao) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
);
const SYNTHETIC_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

/**
 * Provedor de demonstração e de testes. Nada sai da API: não há rede, número real nem WhatsApp. Só aceita números
 * sintéticos (+999, código de país inexistente). O estado da conexão fica no banco, para valer entre processos
 * e funções serverless; o simulador é a única forma de mudá-lo além de "conectar/desconectar".
 */
export class FakeProvider implements WhatsAppProvider {
  readonly providerName = 'fake' as const;
  readonly capabilities: ProviderCapabilities = { serviceWindowHours: null, ackMeans: 'sent', managedSession: true };

  constructor(
    private readonly repo: WhatsAppRepository,
    private readonly webhookSecret: string,
    private readonly now: () => Date,
  ) {}

  sign(rawBody: Buffer): string {
    return `sha256=${createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex')}`;
  }

  async getConnectionStatus(channel: ProviderChannelContext): Promise<{ status: ProviderConnectionStatus; maskedNumber: string | null; errorCode: string | null }> {
    const record = await this.repo.findChannel(channel.channelId);
    const status = record?.connection.status ?? 'DISCONNECTED';
    return { status, maskedNumber: status === 'CONNECTED' ? maskPhone(SYNTHETIC_NUMBER) : null, errorCode: record?.connection.lastErrorCode ?? null };
  }

  async connect(channel: ProviderChannelContext): Promise<ConnectResult> {
    const record = await this.repo.findChannel(channel.channelId);
    if (record?.connection.status === 'CONNECTED') return { action: 'none', status: 'CONNECTED', qr: null, message: 'Canal de demonstração já conectado.' };
    return { action: 'qr', status: 'QR_REQUIRED', qr: { format: 'text', value: 'ASA-DEMONSTRACAO: este QR nao conecta nenhum numero real', expiresAt: new Date(this.now().getTime() + 60_000) }, message: 'Demonstração: use o simulador para concluir a conexão. Nenhum número real é conectado.' };
  }

  async disconnect(_channel: ProviderChannelContext): Promise<void> {
    // o estado é gravado pelo serviço do canal
  }

  async sendMessage(channel: ProviderChannelContext, _message: OutboundMessage): Promise<ProviderSendResult> {
    const record = await this.repo.findChannel(channel.channelId);
    if (record?.connection.status !== 'CONNECTED') return { accepted: false, providerState: 'RETRYABLE', errorCode: 'channel_disconnected' };
    const mode = record.connection.fakeNextSend;
    if (mode) await this.repo.updateConnection(channel.channelId, { fakeNextSend: null }, this.now());
    if (mode === 'fail') return { accepted: false, providerState: 'RETRYABLE', errorCode: 'provider_http_503' };
    if (mode === 'reject') return { accepted: false, providerState: 'REJECTED', errorCode: 'provider_rejected' };
    if (mode === 'timeout') return { accepted: false, providerState: 'UNKNOWN', errorCode: 'provider_timeout' };
    return { accepted: true, providerState: 'ACKNOWLEDGED', providerMessageId: `fake-${randomUUID()}` };
  }

  async verifyWebhook(request: { rawBody: Buffer; headers: Record<string, string | undefined> }): Promise<boolean> {
    const header = request.headers[FAKE_SIGNATURE_HEADER];
    if (!header) return false;
    const received = Buffer.from(header);
    const expected = Buffer.from(this.sign(request.rawBody));
    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  async normalizeInboundWebhook(raw: unknown, _channel: ProviderChannelContext): Promise<CanonicalWhatsAppEvent[]> {
    const parsed = canonicalSchema.safeParse(raw);
    if (!parsed.success) throw new WebhookSchemaError();
    return parsed.data.events.map((event): CanonicalWhatsAppEvent => {
      const timestamp = new Date(event.timestamp);
      if (event.kind === 'connection') return { kind: 'connection', providerEventId: event.providerEventId, status: event.status, maskedNumber: event.status === 'CONNECTED' ? maskPhone(SYNTHETIC_NUMBER) : null, errorCode: null, timestamp };
      if (event.kind === 'delivery') return { kind: 'delivery', providerEventId: event.providerEventId, externalMessageId: event.externalMessageId, state: event.state, errorCode: event.errorCode, timestamp };
      return {
        kind: 'message',
        providerEventId: event.providerEventId,
        externalMessageId: event.externalMessageId,
        from: parseContact(event.from)!,
        displayName: event.displayName,
        timestamp,
        contentKind: event.contentKind,
        text: event.text,
        media: event.mediaRef ? { ref: event.mediaRef, mimeType: null, fileName: event.mediaRef === 'fake:document' ? 'documento-demonstracao.pdf' : 'imagem-demonstracao.png' } : null,
        replyToExternalId: null,
      };
    });
  }

  async fetchMedia(_channel: ProviderChannelContext, media: ProviderMedia): Promise<{ content: Buffer; mimeType: string | null; fileName: string | null } | null> {
    if (media.ref === 'fake:document') return { content: SYNTHETIC_PDF, mimeType: 'application/pdf', fileName: media.fileName };
    if (media.ref === 'fake:image') return { content: SYNTHETIC_PNG, mimeType: 'image/png', fileName: media.fileName };
    return null;
  }
}
