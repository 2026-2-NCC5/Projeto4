import { EventEmitter } from 'node:events';
import type { Logger } from '../config/logger.js';
import type { SnapshotChanges } from './snapshot.js';
import type { QueueAlertMilestone, QueueSnapshot, QueueSubscriptionStatus } from './types.js';

/**
 * Eventos de um acompanhamento (equivalentes a QUEUE_TICKET_POSITION_CHANGED, QUEUE_TICKET_APPROACHING,
 * QUEUE_TICKET_NEXT, QUEUE_TICKET_CALLED e QUEUE_TICKET_COMPLETED). Os nomes seguem o formato
 * enviado ao app pelo canal em tempo real.
 */
export type QueueTicketEventType =
  | 'queue.ticket.position_changed'
  | 'queue.ticket.approaching'
  | 'queue.ticket.next'
  | 'queue.ticket.called'
  | 'queue.ticket.completed'
  | 'queue.ticket.expired';

export interface QueueTicketEvent {
  type: QueueTicketEventType;
  userId: string;
  subscriptionId: string;
  ticket: string;
  status: QueueSubscriptionStatus;
  position: number | null;
  ahead: number | null;
  /** só quando a fonte informou */
  desk: string | null;
  calledAt: string | null;
  milestone: QueueAlertMilestone | null;
  /** true → enviar push (alerta novo, não suprimido) */
  notify: boolean;
  /** chamada detectada com atraso (monitor sem acesso à fonte) */
  late: boolean;
  occurredAt: string;
}

export interface QueueEvents {
  /** QUEUE_UPDATED — a cada leitura bem-sucedida (líder) ou estado novo lido do banco (seguidor) */
  'queue.updated': [{ snapshot: QueueSnapshot; changes: SnapshotChanges; source: 'leader' | 'follower' }];
  /** QUEUE_SOURCE_UNAVAILABLE — uma vez por indisponibilidade */
  'queue.source_unavailable': [{ since: string; consecutiveFailures: number; error: string }];
  'queue.source_recovered': [{ at: string; downtimeSeconds: number }];
  'queue.ticket': [QueueTicketEvent];
}

type Listener<K extends keyof QueueEvents> = (...args: QueueEvents[K]) => void | Promise<void>;

/**
 * Barramento em processo: Monitor → (Tracker, Notificações, Tempo real). Ouvintes assíncronos têm
 * erros capturados e logados — um consumidor com falha nunca derruba o monitor nem os demais.
 */
export class QueueEventBus {
  private readonly emitter = new EventEmitter();

  constructor(private readonly logger: Logger) {
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof QueueEvents>(event: K, listener: Listener<K>): () => void {
    const wrapped = (...args: QueueEvents[K]) => {
      try {
        const result = listener(...args);
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch((error: unknown) => this.logListenerError(event, error));
        }
      } catch (error) {
        this.logListenerError(event, error);
      }
    };
    this.emitter.on(event, wrapped as (...args: unknown[]) => void);
    return () => this.emitter.off(event, wrapped as (...args: unknown[]) => void);
  }

  emit<K extends keyof QueueEvents>(event: K, ...args: QueueEvents[K]): void {
    this.emitter.emit(event, ...args);
  }

  private logListenerError(event: string, error: unknown) {
    this.logger.error({ event, status: 'queue_listener_failed', error_type: error instanceof Error ? error.name : typeof error, error_message: error instanceof Error ? error.message : undefined }, 'queue event listener failed');
  }
}
