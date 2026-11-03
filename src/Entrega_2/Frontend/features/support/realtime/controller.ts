import { isApiClientError } from '../../../services/apiClient';
import type { SupportEventFeed } from '../../../types/api';
import type { SupportEventsParams } from '../api/types';
import { SUPPORT } from '../config';

import type { SupportChange } from './changes';

/**
 * Estado da ligação do app com a API (nunca uma promessa sobre o WhatsApp):
 * connecting: primeira leitura · live: recebendo · reconnecting: falhou, tentando de novo · offline: sem rede.
 */
export type SupportRealtimeState = 'connecting' | 'live' | 'reconnecting' | 'offline';

export interface SupportRealtimeSnapshot {
  state: SupportRealtimeState;
  /** relógio do aparelho na última resposta do feed (null = ainda nenhuma nesta sessão) */
  lastSyncAt: number | null;
}

export interface SupportRealtimeDeps {
  fetchEvents: (params: SupportEventsParams, options: { signal: AbortSignal }) => Promise<SupportEventFeed>;
  onChange: (change: SupportChange) => void;
  now?: () => number;
  random?: () => number;
}

/** Quantos eventId ficam guardados para descartar repetições (a entrega é "ao menos uma vez"). */
const REMEMBERED_EVENTS = 500;

const INITIAL: SupportRealtimeSnapshot = { state: 'connecting', lastSyncAt: null };

/** Dobra a cada falha até o limite; a variação aleatória (metade superior) evita aparelhos voltando todos juntos. */
export function backoffDelay(failures: number, random: () => number = Math.random): number {
  const ceiling = Math.min(SUPPORT.EVENTS_MAX_BACKOFF_MS, SUPPORT.EVENTS_BASE_BACKOFF_MS * 2 ** Math.max(0, failures - 1));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

/**
 * Long polling por cursor em GET /api/support/me/events, fora do React (como o controlador da fila).
 * - só roda com sessão, em primeiro plano e com rede; cada chamada passa pela autenticação normal;
 * - no mínimo 1 s entre chamadas, mesmo se o servidor responder na hora;
 * - ao voltar do segundo plano ou de uma falha, lê o que perdeu com `wait=0` e pede a recarga dos dados abertos;
 * - `stop()` aborta a chamada em andamento e esquece cursor e eventos: nada passa de uma conta para outra.
 */
export class SupportRealtimeController {
  private snapshot: SupportRealtimeSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;
  private readonly random: () => number;
  private active = false;
  private foreground = true;
  private offline = false;
  private cursor: string | null = null;
  private seen = new Set<string>();
  private failures = 0;
  /** a próxima leitura é de recuperação: `wait=0`, seguida de recarga dos dados abertos */
  private catchingUp = false;
  private morePages = false;
  private fullRefreshPending = false;
  private inFlight: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastRequestAt: number | null = null;

  constructor(private readonly deps: SupportRealtimeDeps) {
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): SupportRealtimeSnapshot => this.snapshot;

  // ------------------------------------------------------------------ ciclo de vida

  start() {
    if (this.active) return;
    this.active = true;
    // Sessão que começa sem poder ler (sem rede, segundo plano): as telas também não atualizaram, então recupera ao voltar.
    // Evento entre a carga das telas e o primeiro cursor: coberto pela atualização periódica das telas (30 s a 60 s).
    if (!this.running()) this.catchingUp = true;
    this.update({ state: this.offline ? 'offline' : 'connecting' });
    this.sync();
  }

  /** Logout ou troca de conta: para na hora, aborta o que está em andamento e esquece tudo desta sessão. */
  stop() {
    this.active = false;
    this.halt();
    this.cursor = null;
    this.seen = new Set();
    this.failures = 0;
    this.catchingUp = false;
    this.morePages = false;
    this.fullRefreshPending = false;
    this.update(INITIAL);
  }

  setForeground(foreground: boolean) {
    if (this.foreground === foreground) return;
    this.foreground = foreground;
    this.pauseOrResume('connecting');
  }

  setOffline(offline: boolean) {
    if (this.offline === offline) return;
    this.offline = offline;
    this.pauseOrResume('reconnecting');
  }

  private running(): boolean {
    return this.active && this.foreground && !this.offline;
  }

  private pauseOrResume(resumeState: SupportRealtimeState) {
    if (!this.active) return;
    if (!this.running()) {
      // Eventos podem chegar enquanto a leitura está parada: a volta sempre passa pela recuperação.
      this.halt();
      this.catchingUp = true;
      this.update({ state: this.offline ? 'offline' : 'connecting' });
      return;
    }
    this.update({ state: resumeState });
    this.sync();
  }

  private sync() {
    if (this.running() && !this.inFlight && !this.timer) this.schedule(0);
  }

  private halt() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const request = this.inFlight;
    this.inFlight = null;
    request?.abort();
  }

  private update(changes: Partial<SupportRealtimeSnapshot>) {
    const next = { ...this.snapshot, ...changes };
    if (next.state === this.snapshot.state && next.lastSyncAt === this.snapshot.lastSyncAt) return;
    this.snapshot = next;
    for (const listener of [...this.listeners]) listener();
  }

  // ------------------------------------------------------------------ leitura

  /** Nunca menos que o intervalo mínimo desde o início da chamada anterior, seja qual for o motivo da nova chamada. */
  private schedule(delay: number) {
    const sinceLast = this.lastRequestAt === null ? SUPPORT.EVENTS_MIN_INTERVAL_MS : this.now() - this.lastRequestAt;
    const wait = Math.max(delay, SUPPORT.EVENTS_MIN_INTERVAL_MS - sinceLast, 0);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.poll();
    }, wait);
  }

  private poll() {
    if (!this.running()) return;
    const request = new AbortController();
    this.inFlight = request;
    this.lastRequestAt = this.now();
    const wait = !this.cursor || this.catchingUp || this.morePages ? 0 : SUPPORT.EVENTS_WAIT_SECONDS;
    const params: SupportEventsParams = { since: this.cursor, wait };
    // `inFlight` diferente: a chamada foi abandonada (segundo plano, logout); o resultado não vale mais nada.
    new Promise<SupportEventFeed>((resolve) => resolve(this.deps.fetchEvents(params, { signal: request.signal }))).then(
      (feed) => {
        if (this.inFlight !== request) return;
        this.inFlight = null;
        this.applyFeed(feed);
      },
      (error: unknown) => {
        if (this.inFlight !== request) return;
        this.inFlight = null;
        this.handleFailure(error);
      },
    );
  }

  private applyFeed(feed: SupportEventFeed) {
    this.cursor = feed.nextCursor;
    this.failures = 0;
    this.morePages = feed.hasMore;
    if (this.catchingUp || feed.resyncRequired) this.fullRefreshPending = true;
    this.catchingUp = false;

    const changed = new Set<string>();
    for (const event of feed.events) {
      if (this.seen.has(event.eventId)) continue;
      this.remember(event.eventId);
      if (event.ticketId) changed.add(event.ticketId);
    }

    this.update({ state: 'live', lastSyncAt: this.now() });
    // Em uma recuperação paginada, a recarga completa espera a última página: ela já cobre o que veio nas anteriores.
    if (this.fullRefreshPending) {
      if (!feed.hasMore) {
        this.fullRefreshPending = false;
        this.notify({ kind: 'all' });
      }
    } else if (changed.size > 0) {
      this.notify({ kind: 'tickets', ticketIds: [...changed] });
    }
    this.sync();
  }

  private handleFailure(error: unknown) {
    const kind = isApiClientError(error) ? error.kind : null;
    this.update({ state: kind === 'offline' ? 'offline' : 'reconnecting' });
    // 401 não recuperável: o apiClient já encerrou a sessão; nenhuma nova chamada até o próximo start().
    if (kind === 'unauthorized') return;
    // Cursor recusado pelo servidor não adianta repetir: recomeça do cursor atual e recarrega tudo.
    if (kind === 'validation') this.cursor = null;
    this.catchingUp = true;
    this.morePages = false;
    this.failures += 1;
    this.schedule(this.retryDelay(error));
  }

  private retryDelay(error: unknown): number {
    const delay = backoffDelay(this.failures, this.random);
    if (!isApiClientError(error) || error.kind !== 'rate_limited' || !error.retryAfterSeconds) return delay;
    return Math.max(delay, Math.min(error.retryAfterSeconds * 1000, SUPPORT.EVENTS_MAX_RETRY_AFTER_MS));
  }

  private remember(eventId: string) {
    this.seen.add(eventId);
    if (this.seen.size <= REMEMBERED_EVENTS) return;
    const oldest = this.seen.values().next().value;
    if (oldest !== undefined) this.seen.delete(oldest);
  }

  private notify(change: SupportChange) {
    try {
      this.deps.onChange(change);
    } catch {
      // um problema em quem escuta não derruba a leitura
    }
  }
}
