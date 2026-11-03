import type { SupportConnectionStatus, SupportMessageContentKind, SupportProviderName } from '../../contracts/mobileApi.v1.js';
import type { ContactRef } from './contactRef.js';

export type ProviderConnectionStatus = SupportConnectionStatus;

export interface OutboundMessage {
  channelId: string;
  /** identificador canônico validado no servidor (telefone E.164 ou lid:...) */
  recipient: string;
  text: string;
  replyToProviderMessageId?: string | null;
  idempotencyKey: string;
}

/**
 * ACKNOWLEDGED = o provedor aceitou; UNKNOWN = resposta ambígua (pode ter saído: nunca reenviar sozinho);
 * REJECTED = recusa definitiva; RETRYABLE = não chegou a ser aceita (429/5xx/recusa de conexão): pode tentar de novo.
 */
export interface ProviderSendResult {
  accepted: boolean;
  providerMessageId?: string;
  providerState: 'ACKNOWLEDGED' | 'UNKNOWN' | 'REJECTED' | 'RETRYABLE';
  /** código seguro (sem conteúdo do provedor) */
  errorCode?: string;
}

export interface ProviderMedia {
  /** referência interna do provedor; só o adapter sabe buscá-la */
  ref: string;
  mimeType: string | null;
  fileName: string | null;
}

export type CanonicalWhatsAppEvent =
  | {
      kind: 'message';
      providerEventId: string;
      externalMessageId: string;
      from: ContactRef;
      /** nome informado pelo próprio WhatsApp: dado não confiável */
      displayName: string | null;
      timestamp: Date;
      contentKind: SupportMessageContentKind;
      text: string | null;
      media: ProviderMedia | null;
      replyToExternalId: string | null;
    }
  | { kind: 'delivery'; providerEventId: string; externalMessageId: string; state: 'sent' | 'delivered' | 'read' | 'failed'; errorCode: string | null; timestamp: Date }
  | { kind: 'connection'; providerEventId: string; status: ProviderConnectionStatus; maskedNumber: string | null; errorCode: string | null; timestamp: Date };

export interface ConnectResult {
  action: 'qr' | 'external-setup' | 'none';
  status: ProviderConnectionStatus;
  qr?: { format: 'text' | 'image_data_url'; value: string; expiresAt: Date | null } | null;
  message: string;
}

export interface ProviderCapabilities {
  /** janela de atendimento em horas (Cloud API: 24); null = o provedor não tem essa regra */
  serviceWindowHours: number | null;
  /** `sent` = a aceitação já significa enviada; `accepted` = o estado "enviada" vem depois, por webhook */
  ackMeans: 'sent' | 'accepted';
  /** conexão por QR dentro do portal */
  managedSession: boolean;
}

/** Contexto do canal que o adapter precisa (nunca credenciais: essas ficam na configuração do adapter). */
export interface ProviderChannelContext {
  channelId: string;
  externalSessionId: string | null;
}

/**
 * Contrato interno de um provedor de WhatsApp. Nenhum tipo do fornecedor sai do adapter; telas e regras de negócio não
 * sabem qual provedor está ativo. Não há métodos de disparo em massa, grupos ou status: estão fora de escopo.
 */
export interface WhatsAppProvider {
  readonly providerName: SupportProviderName;
  readonly capabilities: ProviderCapabilities;
  getConnectionStatus(channel: ProviderChannelContext): Promise<{ status: ProviderConnectionStatus; maskedNumber: string | null; errorCode: string | null }>;
  connect?(channel: ProviderChannelContext): Promise<ConnectResult>;
  disconnect?(channel: ProviderChannelContext): Promise<void>;
  sendMessage(channel: ProviderChannelContext, message: OutboundMessage): Promise<ProviderSendResult>;
  verifyWebhook(request: { rawBody: Buffer; headers: Record<string, string | undefined> }): Promise<boolean>;
  /** Lança WebhookSchemaError quando o corpo não segue o formato esperado. */
  normalizeInboundWebhook(raw: unknown, channel: ProviderChannelContext): Promise<CanonicalWhatsAppEvent[]>;
  /** Baixa uma mídia recebida (sempre do próprio provedor; nunca de URL vinda do payload sem validação). */
  fetchMedia?(channel: ProviderChannelContext, media: ProviderMedia, maxBytes: number): Promise<{ content: Buffer; mimeType: string | null; fileName: string | null } | null>;
  /** Provedores sem reenvio de webhook: busca o que pode ter sido perdido (mesmos ids; a inbox deduplica). */
  reconcile?(channel: ProviderChannelContext, since: Date, limits: { maxChats: number }): Promise<CanonicalWhatsAppEvent[]>;
}

export class WebhookSchemaError extends Error {
  constructor(message = 'formato de webhook inesperado') {
    super(message);
    this.name = 'WebhookSchemaError';
  }
}

export const NON_TEXT_PLACEHOLDER: Record<SupportMessageContentKind, string> = {
  text: '',
  image: '[Imagem recebida pelo WhatsApp]',
  document: '[Documento recebido pelo WhatsApp]',
  audio: '[Áudio recebido pelo WhatsApp]',
  video: '[Vídeo recebido pelo WhatsApp]',
  sticker: '[Figurinha recebida pelo WhatsApp]',
  location: '[Localização recebida pelo WhatsApp]',
  contact: '[Contato recebido pelo WhatsApp]',
  unsupported: '[Mensagem de um tipo não suportado: consulte o WhatsApp institucional]',
};
