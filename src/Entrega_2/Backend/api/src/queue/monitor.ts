import type { Logger } from '../config/logger.js';
import type { QueueEventBus } from './eventBus.js';
import type { LeaderLock } from './leaderLock.js';
import type { QueueMetrics } from './metrics.js';
import type { QueueRepository } from './repository.js';
import { diffSnapshots } from './snapshot.js';
import { ticketKey } from './ticket.js';
import { localDate } from './time.js';
import { QueueSourceError, type QueueCallHistoryRecord, type QueueProvider, type QueueSnapshot } from './types.js';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface QueueMonitorOptions {
  provider: QueueProvider;
  repository: QueueRepository;
  bus: QueueEventBus;
  lock: LeaderLock;
  metrics: QueueMetrics;
  logger: Logger;
  timeZone: string;
  pollIntervalMs: number;
  maxBackoffMs: number;
  /** falhas seguidas até abrir o circuito (consultas passam a usar o intervalo máximo) */
  failureThreshold: number;
  now?: () => Date;
  /** seguidores: intervalo para tentar assumir a liderança */
  leaderRetryMs?: number;
  /** grava o snapshot no banco ao mudar ou, sem mudanças, a cada X ms (cache entre instâncias) */
  persistEveryMs?: number;
  /** refresh() sob demanda: intervalo mínimo entre duas verificações do banco nesta instância */
  refreshThrottleMs?: number;
}

export interface QueueMonitorHealth {
  leader: boolean;
  running: boolean;
  provider: string;
  lastSuccessAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
  circuit: CircuitState;
  outageSince: Date | null;
}

/**
 * ASAQueueMonitor: UMA consulta periódica à fonte abastece todo o ASA Conecta (nunca uma por aluno).
 *
 * - Sucesso → snapshot em memória + banco, histórico de chamadas, evento queue.updated.
 * - Falha → mantém o último snapshot válido (não apaga o estado), backoff exponencial e circuito
 *   aberto após `failureThreshold` falhas; volta ao intervalo normal na primeira leitura boa.
 * - Várias instâncias → só a líder consulta a fonte; as outras seguem o estado gravado no banco.
 * - Sem processo residente (funções serverless) → refresh() a cada requisição faz o mesmo papel do laço.
 */
export class QueueMonitor {
  private snapshot: QueueSnapshot | null = null;
  private lastSuccessAt: Date | null = null;
  /** última consulta à fonte (com ou sem sucesso) feita por qualquer instância */
  private lastAttemptAt: Date | null = null;
  private refreshing: Promise<void> | null = null;
  private lastRefreshAt = 0;
  private lastError: string | null = null;
  private consecutiveFailures = 0;
  private outageSince: Date | null = null;
  private circuit: CircuitState = 'closed';
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private lastPersistedAt = 0;
  private lastPersistedSignature = '';
  private readonly now: () => Date;

  constructor(private readonly options: QueueMonitorOptions) {
    this.now = options.now ?? (() => new Date());
  }

  get isLeader(): boolean {
    return this.options.lock.held;
  }

  get pollIntervalMs(): number {
    return this.options.pollIntervalMs;
  }

  /** Último snapshot válido (pode ser antigo quando a fonte está indisponível). */
  getSnapshot(): QueueSnapshot | null {
    return this.snapshot;
  }

  health(): QueueMonitorHealth {
    return {
      leader: this.isLeader,
      running: this.running,
      provider: this.options.provider.name,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
      consecutiveFailures: this.consecutiveFailures,
      circuit: this.circuit,
      outageSince: this.outageSince,
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.restoreState();
    this.options.logger.info({ status: 'queue_monitor_started', provider: this.options.provider.name, poll_interval_ms: this.options.pollIntervalMs }, 'queue monitor started');
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.inFlight?.catch(() => undefined);
    await this.options.lock.release();
    this.options.logger.info({ status: 'queue_monitor_stopped' }, 'queue monitor stopped');
  }

  private schedule(delayMs: number) {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.inFlight = this.tick().finally(() => {
        this.inFlight = null;
      });
    }, delayMs);
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    let delay = this.options.pollIntervalMs;
    try {
      if (await this.options.lock.acquire()) {
        await this.pollOnce();
        delay = this.nextDelayMs();
      } else {
        await this.followState();
        delay = Math.min(this.options.pollIntervalMs, this.options.leaderRetryMs ?? 30_000);
      }
    } catch (error) {
      this.options.logger.error({ status: 'queue_monitor_tick_failed', error_message: error instanceof Error ? error.message : 'unknown' }, 'queue monitor tick failed');
    } finally {
      this.schedule(delay);
    }
  }

  /** Intervalo até a próxima consulta: normal, backoff exponencial ou circuito aberto (máximo). */
  nextDelayMs(): number {
    if (this.consecutiveFailures === 0) return this.options.pollIntervalMs;
    if (this.circuit === 'open') return this.options.maxBackoffMs;
    return Math.min(this.options.pollIntervalMs * 2 ** Math.min(this.consecutiveFailures, 10), this.options.maxBackoffMs);
  }

  /**
   * Modo sob demanda (funções serverless, sem laço residente): adota o estado gravado no banco e, se a última
   * consulta já venceu o intervalo (normal ou de backoff), consulta a fonte — só a instância que obtiver a
   * concessão. Chamadas simultâneas nesta instância compartilham a mesma execução; a promessa só termina
   * depois que acompanhamentos, alertas e tempo real processaram a leitura.
   */
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const nowMs = this.now().getTime();
    const throttleMs = this.options.refreshThrottleMs ?? Math.min(this.options.pollIntervalMs, 5000);
    if (this.lastRefreshAt > 0 && nowMs - this.lastRefreshAt < throttleMs) return Promise.resolve();
    this.lastRefreshAt = nowMs;
    this.refreshing = this.runRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async runRefresh(): Promise<void> {
    try {
      await this.followState();
      if (this.isDue() && (await this.options.lock.acquire())) await this.pollOnce();
    } catch (error) {
      this.options.logger.error({ status: 'queue_refresh_failed', error_message: error instanceof Error ? error.message : 'unknown' }, 'queue refresh failed');
    } finally {
      await this.options.bus.idle();
    }
  }

  /** A próxima consulta já venceu? Respeita o backoff de falhas registrado por qualquer instância. */
  private isDue(): boolean {
    if (!this.lastAttemptAt) return true;
    return this.now().getTime() - this.lastAttemptAt.getTime() >= this.nextDelayMs();
  }

  /** Uma leitura da fonte (o líder chama a cada ciclo; testes chamam diretamente). */
  async pollOnce(): Promise<void> {
    const { logger, metrics } = this.options;
    this.lastAttemptAt = this.now();
    if (this.circuit === 'open') this.circuit = 'half_open';
    let snapshot: QueueSnapshot;
    try {
      snapshot = await this.options.provider.getCurrentQueue();
    } catch (error) {
      await this.onFailure(error);
      return;
    }
    const now = this.now();
    metrics.queue_fetch_success_total += 1;
    if (this.consecutiveFailures > 0) {
      const downtimeSeconds = this.outageSince ? Math.round((now.getTime() - this.outageSince.getTime()) / 1000) : 0;
      logger.info({ status: 'queue_source_recovered', downtime_seconds: downtimeSeconds, failures: this.consecutiveFailures }, 'queue source recovered');
      this.options.bus.emit('queue.source_recovered', { at: now.toISOString(), downtimeSeconds });
    }
    this.consecutiveFailures = 0;
    this.outageSince = null;
    this.circuit = 'closed';
    this.lastError = null;
    this.lastSuccessAt = now;

    const previous = this.snapshot;
    const changes = diffSnapshots(previous, snapshot);
    this.snapshot = snapshot;
    logger[changes.changed ? 'info' : 'debug'](
      { status: 'queue_fetch_success', provider: snapshot.provider, calls: snapshot.calls.length, upcoming: snapshot.upcoming.length, new_calls: changes.newCalls.length, changed: changes.changed },
      changes.changed ? 'queue snapshot updated' : 'queue snapshot unchanged',
    );
    // Na primeira leitura tudo é "novo": só registramos como chamada quem apareceu depois dela.
    if (previous) {
      for (const call of changes.newCalls) {
        logger.info({ status: 'queue_ticket_called', ticket: call.ticket, desk: call.desk, called_at: call.calledAt }, 'queue ticket called');
      }
    }
    if (changes.newCalls.length > 0) await this.recordCalls(changes.newCalls, now);
    await this.persist(changes.changed);
    this.options.bus.emit('queue.updated', { snapshot, changes, source: 'leader' });
  }

  private async onFailure(error: unknown) {
    const { logger, metrics, bus } = this.options;
    const now = this.now();
    metrics.queue_fetch_failure_total += 1;
    const kind = error instanceof QueueSourceError ? error.kind : 'unknown';
    if (kind === 'parse') metrics.queue_parser_failure_total += 1;
    this.consecutiveFailures += 1;
    this.lastError = `${kind}: ${error instanceof Error ? error.message : 'erro desconhecido'}`;
    if (this.consecutiveFailures >= this.options.failureThreshold) this.circuit = 'open';
    else if (this.circuit === 'half_open') this.circuit = 'open';
    logger.warn(
      { status: kind === 'parse' ? 'queue_parser_error' : 'queue_fetch_error', kind, failures: this.consecutiveFailures, circuit: this.circuit, next_attempt_ms: this.nextDelayMs(), error_message: this.lastError },
      'queue fetch failed',
    );
    if (this.consecutiveFailures === 1) {
      this.outageSince = now;
      bus.emit('queue.source_unavailable', { since: now.toISOString(), consecutiveFailures: 1, error: this.lastError });
    }
    await this.persist(false, true);
  }

  private async recordCalls(calls: QueueSnapshot['calls'], now: Date) {
    const records: QueueCallHistoryRecord[] = calls.map((call) => {
      const calledAt = call.calledAt ? new Date(call.calledAt) : null;
      const serviceDate = localDate(calledAt ?? now, this.options.timeZone);
      return {
        callKey: call.sourceId ?? `${serviceDate}:${ticketKey(call.ticket)}:${call.calledAt ?? ''}`,
        serviceDate,
        ticket: call.ticket,
        desk: call.desk,
        calledAt,
        observedAt: now,
      };
    });
    try {
      this.options.metrics.queue_calls_observed_total += await this.options.repository.recordCalls(records);
    } catch (error) {
      this.options.logger.error({ status: 'queue_history_failed', error_message: error instanceof Error ? error.message : 'unknown' }, 'queue call history not persisted');
    }
  }

  private async persist(changed: boolean, force = false) {
    const nowMs = this.now().getTime();
    const signature = JSON.stringify({ calls: this.snapshot?.calls, upcoming: this.snapshot?.upcoming, failures: this.consecutiveFailures });
    if (!force && !changed && signature === this.lastPersistedSignature && nowMs - this.lastPersistedAt < (this.options.persistEveryMs ?? 30_000)) return;
    try {
      await this.options.repository.saveState({
        snapshot: this.snapshot,
        lastSuccessAt: this.lastSuccessAt,
        lastError: this.lastError,
        consecutiveFailures: this.consecutiveFailures,
        updatedAt: new Date(nowMs),
      });
      this.lastPersistedAt = nowMs;
      this.lastPersistedSignature = signature;
    } catch (error) {
      this.options.logger.error({ status: 'queue_state_persist_failed', error_message: error instanceof Error ? error.message : 'unknown' }, 'queue state not persisted');
    }
  }

  /** Após reinício: recupera o último snapshot do dia (a tela não fica vazia enquanto a fonte responde). */
  private async restoreState() {
    try {
      const state = await this.options.repository.loadState();
      if (!state?.snapshot) return;
      if (localDate(new Date(state.snapshot.capturedAt), this.options.timeZone) !== localDate(this.now(), this.options.timeZone)) return;
      this.snapshot = state.snapshot;
      this.lastSuccessAt = state.lastSuccessAt;
      this.lastPersistedSignature = '';
    } catch (error) {
      this.options.logger.warn({ status: 'queue_state_restore_failed', error_message: error instanceof Error ? error.message : 'unknown' }, 'queue state not restored');
    }
  }

  /** Seguidor: adota o estado gravado pelo líder e repassa ao tempo real desta instância. */
  async followState(): Promise<void> {
    const state = await this.options.repository.loadState();
    if (!state) return;
    this.consecutiveFailures = state.consecutiveFailures;
    this.lastError = state.lastError;
    this.lastSuccessAt = state.lastSuccessAt;
    if (!this.lastAttemptAt || state.updatedAt > this.lastAttemptAt) this.lastAttemptAt = state.updatedAt;
    if (!state.snapshot || state.snapshot.capturedAt === this.snapshot?.capturedAt) return;
    // snapshot de outro dia (instância nova lendo o banco de manhã): não é a fila de hoje
    if (localDate(new Date(state.snapshot.capturedAt), this.options.timeZone) !== localDate(this.now(), this.options.timeZone)) return;
    const changes = diffSnapshots(this.snapshot, state.snapshot);
    this.snapshot = state.snapshot;
    this.options.bus.emit('queue.updated', { snapshot: state.snapshot, changes, source: 'follower' });
  }
}
