/**
 * Domínio da fila presencial do ASA (https://presencial.fecap.br/).
 *
 * Senhas são SEMPRE strings ("0026"): zeros à esquerda fazem parte da senha exibida no painel.
 * Comparações usam `ticketKey` (ver ticket.ts), nunca subtração numérica.
 */

/** Estado geral da fila na fonte. "empty" ≠ "closed": lista vazia não significa atendimento encerrado. */
export type QueueSourceStatus = 'open' | 'empty' | 'unavailable' | 'closed';

/** Situação do atendimento de uma senha já chamada, conforme a fonte. */
export type QueueServiceStatus = 'in_service' | 'completed' | 'unknown';

export interface QueueCall {
  /** senha como exibida na fonte, ex.: "0026" */
  ticket: string;
  /** "Mesa 03"; null quando a fonte não informa (nunca inventada) */
  desk: string | null;
  /** instante da chamada (ISO UTC); null quando a fonte não informa */
  calledAt: string | null;
  serviceStatus: QueueServiceStatus;
  /** identificador estável do registro na fonte (Dataverse), quando existe */
  sourceId: string | null;
}

export interface QueueWaiting {
  ticket: string;
  /** posição informada pela fonte ("PRÓXIMAS SENHAS · Posição") */
  position: number;
  sourceId: string | null;
}

export interface QueueSnapshot {
  capturedAt: string;
  /** provider que produziu o snapshot (fecap-portal | fecap-html | mock) */
  provider: string;
  /** chamadas do dia, da mais recente para a mais antiga */
  calls: QueueCall[];
  /** próximas senhas em ordem crescente de posição */
  upcoming: QueueWaiting[];
  /** false quando a fonte indicou mais registros do que os lidos (posição de quem está além é desconhecida) */
  upcomingComplete: boolean;
  /** total de chamadas do dia informado pela fonte (pode ser maior que `calls.length`) */
  callsTotal: number | null;
  /** instante da chamada mais recente */
  sourceUpdatedAt: string | null;
  status: QueueSourceStatus;
}

export type QueueSourceErrorKind = 'network' | 'timeout' | 'http' | 'parse' | 'config';

/** Falha ao consultar ou interpretar a fonte. Mensagens são técnicas (logs), nunca exibidas ao estudante. */
export class QueueSourceError extends Error {
  readonly kind: QueueSourceErrorKind;
  readonly status: number | undefined;
  /** true quando vale descartar a sessão (token/configuração do portal) e tentar de novo uma vez */
  readonly renewSession: boolean;

  constructor(kind: QueueSourceErrorKind, message: string, options: { status?: number; renewSession?: boolean; cause?: unknown } = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'QueueSourceError';
    this.kind = kind;
    this.status = options.status;
    this.renewSession = options.renewSession ?? false;
  }
}

/** Estratégia de obtenção dos dados da fila (API do portal, HTML, mock). */
export interface QueueProvider {
  readonly name: string;
  getCurrentQueue(): Promise<QueueSnapshot>;
}

// ------------------------------------------------------------ acompanhamento

export type QueueSubscriptionStatus = 'waiting' | 'approaching' | 'next' | 'called' | 'completed' | 'expired' | 'cancelled';

/** Estados em que o monitor continua avaliando a senha. */
export const ACTIVE_SUBSCRIPTION_STATUSES: readonly QueueSubscriptionStatus[] = ['waiting', 'approaching', 'next', 'called'];

/** Alertas progressivos — cada um é enviado no máximo uma vez por acompanhamento. */
export type QueueAlertMilestone = 'QUEUE_5_AHEAD' | 'QUEUE_3_AHEAD' | 'QUEUE_NEXT' | 'QUEUE_CALLED';

export const MILESTONE_RANK: Record<QueueAlertMilestone, number> = {
  QUEUE_5_AHEAD: 1,
  QUEUE_3_AHEAD: 2,
  QUEUE_NEXT: 3,
  QUEUE_CALLED: 4,
};

export interface QueuePreferences {
  pushEnabled: boolean;
  voiceEnabled: boolean;
  vibrationEnabled: boolean;
}

export interface QueueSubscriptionRecord extends QueuePreferences {
  id: string;
  userId: string;
  /** senha digitada pelo estudante, normalizada (maiúsculas, sem espaços), zeros preservados */
  ticket: string;
  ticketKey: string;
  /** dia do atendimento (YYYY-MM-DD no fuso do app): senhas valem só para o dia */
  serviceDate: string;
  status: QueueSubscriptionStatus;
  /** última posição conhecida na fonte */
  position: number | null;
  /** última quantidade conhecida de senhas à frente */
  ahead: number | null;
  calledDesk: string | null;
  calledAt: Date | null;
  callSourceId: string | null;
  /** a senha já tinha sido chamada antes de o estudante começar a acompanhar (sem alerta de "é a sua vez") */
  alreadyCalled: boolean;
  /** alerta mais urgente já disparado (controle de idempotência) */
  lastAlert: QueueAlertMilestone | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
}

export type QueueTimelineEventType = 'subscribed' | QueueAlertMilestone | 'completed' | 'expired' | 'cancelled';

export interface QueueTimelineEventRecord {
  subscriptionId: string;
  type: QueueTimelineEventType;
  ahead: number | null;
  desk: string | null;
  occurredAt: Date;
}

/** Chamada observada pelo monitor (histórico do dia). */
export interface QueueCallHistoryRecord {
  callKey: string;
  serviceDate: string;
  ticket: string;
  desk: string | null;
  calledAt: Date | null;
  observedAt: Date;
}
