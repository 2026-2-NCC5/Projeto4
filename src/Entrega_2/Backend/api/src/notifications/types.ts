export type PushPlatform = 'ios' | 'android' | 'web';

/** Tokens do Expo Push Service ("ExponentPushToken[...]"). */
export const EXPO_PUSH_TOKEN_PATTERN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,}\]$/;

export interface PushDeviceRecord {
  id: string;
  userId: string;
  token: string;
  platform: PushPlatform;
  createdAt: Date;
  lastSeenAt: Date;
  disabledAt: Date | null;
  disabledReason: string | null;
}

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  /** canal Android (ex.: "queue-alerts", criado pelo app com vibração e prioridade alta) */
  channelId?: string;
  /** segundos que o serviço tenta entregar (alertas da fila perdem sentido rapidamente) */
  ttl?: number;
}

export type PushTicket = { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };
export type PushReceipt = { status: 'ok' } | { status: 'error'; message: string; details?: { error?: string } };

/** Provedor de envio (Expo, log em desenvolvimento, memória em testes). */
export interface PushProvider {
  readonly name: string;
  /** Um ticket por mensagem, na mesma ordem. Lança erro em falha de transporte (o serviço tenta de novo). */
  send(messages: PushMessage[]): Promise<PushTicket[]>;
  /** Recibos de entrega (Expo → APNs/FCM), quando o provedor suporta. */
  getReceipts?(ids: string[]): Promise<Record<string, PushReceipt>>;
}

export interface NotificationRequest {
  userId: string;
  /** ex.: "queue" */
  category: string;
  /** a mesma chave nunca gera duas notificações */
  idempotencyKey: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: 'normal' | 'high';
  channelId?: string;
  sound?: boolean;
  ttlSeconds?: number;
}

export type DeliveryStatus = 'pending' | 'sent' | 'partial' | 'failed' | 'skipped';

export interface NotificationResult {
  status: DeliveryStatus | 'duplicate';
  devices: number;
  error?: string;
}

/** "ExponentPushToken[abcd…wxyz]" — tokens nunca aparecem completos em logs. */
export function maskPushToken(token: string): string {
  const match = /^(\w+)\[(.+)\]$/.exec(token);
  const inner = match?.[2] ?? token;
  const masked = inner.length <= 8 ? '…' : `${inner.slice(0, 4)}…${inner.slice(-4)}`;
  return match ? `${match[1]}[${masked}]` : masked;
}
