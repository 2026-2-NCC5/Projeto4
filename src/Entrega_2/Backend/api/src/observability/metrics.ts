import { createHash, timingSafeEqual } from 'node:crypto';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Métricas da API no formato de texto do Prometheus (0.0.4), sem dependências externas.
 *
 * - HTTP: contador por método/rota/status e histograma de latência por método/rota. A rota é o molde do
 *   Express (`/api/agent/recommendations/:id`), nunca a URL real: sem identificadores nem dados pessoais
 *   nos rótulos, e com cardinalidade limitada.
 * - Processo: CPU (usuário/sistema), memória residente, heap, atraso do event loop e uptime.
 * - Banco: conexões do pool (total, ociosas e requisições esperando conexão).
 *
 * `GET /metrics` só existe com METRICS_TOKEN configurado e exige `Authorization: Bearer <token>`.
 * Em funções serverless cada instância tem os próprios contadores; a visão consolidada vem do coletor.
 */

export const LATENCY_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;

/** Pool do `pg` (só os contadores lidos aqui). */
export interface PoolStats {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

interface LatencySeries {
  method: string;
  route: string;
  buckets: number[];
  sum: number;
  count: number;
}

const UNMATCHED_ROUTE = 'unmatched';

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function labels(pairs: Record<string, string>): string {
  const body = Object.entries(pairs)
    .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
    .join(',');
  return body ? `{${body}}` : '';
}

function formatNumber(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return '+Inf';
  if (value === -Infinity) return '-Inf';
  return String(value);
}

/** Molde da rota atendida (ex.: `/api/agent/recommendations/:id`); `unmatched` quando nenhuma rota casou. */
export function routeTemplate(req: Request): string {
  const route = (req as Request & { route?: { path?: unknown } }).route;
  if (!route || typeof route.path !== 'string') return UNMATCHED_ROUTE;
  return `${req.baseUrl ?? ''}${route.path}` || '/';
}

export interface HttpMetricsOptions {
  version: string;
  runtime?: string;
  /** Caminhos que não entram nas métricas HTTP (o próprio /metrics, para a coleta não se medir). */
  ignorePaths?: string[];
  /** Relógio de alta resolução injetável (testes). Retorna nanossegundos. */
  hrtime?: () => bigint;
}

export class HttpMetrics {
  private readonly requests = new Map<string, { method: string; route: string; status: string; value: number }>();
  private readonly latency = new Map<string, LatencySeries>();
  private readonly ignore: Set<string>;
  private readonly hrtime: () => bigint;
  private readonly startTimeSeconds = Date.now() / 1000;
  private readonly loopDelay: IntervalHistogram;
  private inFlight = 0;

  constructor(private readonly options: HttpMetricsOptions) {
    this.ignore = new Set(options.ignorePaths ?? ['/metrics']);
    this.hrtime = options.hrtime ?? (() => process.hrtime.bigint());
    this.loopDelay = monitorEventLoopDelay({ resolution: 20 });
    this.loopDelay.enable();
  }

  /** Middleware: mede cada requisição no `finish` (resposta enviada) ou no `close` (cliente desistiu). */
  middleware(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (this.ignore.has(req.path)) {
        next();
        return;
      }
      const started = this.hrtime();
      this.inFlight += 1;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.inFlight -= 1;
        const seconds = Number(this.hrtime() - started) / 1e9;
        // 499 (convenção do nginx): o cliente fechou a conexão antes da resposta
        const status = res.writableFinished ? res.statusCode : 499;
        this.observe(req.method, routeTemplate(req), status, seconds);
      };
      res.once('finish', finish);
      res.once('close', finish);
      next();
    };
  }

  observe(method: string, route: string, status: number, seconds: number): void {
    const statusLabel = String(status);
    const requestKey = `${method} ${route} ${statusLabel}`;
    const counter = this.requests.get(requestKey);
    if (counter) counter.value += 1;
    else this.requests.set(requestKey, { method, route, status: statusLabel, value: 1 });

    const latencyKey = `${method} ${route}`;
    let series = this.latency.get(latencyKey);
    if (!series) {
      series = { method, route, buckets: LATENCY_BUCKETS_SECONDS.map(() => 0), sum: 0, count: 0 };
      this.latency.set(latencyKey, series);
    }
    series.count += 1;
    series.sum += seconds;
    LATENCY_BUCKETS_SECONDS.forEach((bound, index) => {
      if (seconds <= bound) series.buckets[index] = (series.buckets[index] ?? 0) + 1;
    });
  }

  /** Texto no formato do Prometheus. O atraso do event loop é zerado a cada coleta (janela = intervalo). */
  render(pool?: PoolStats | null): string {
    const lines: string[] = [];
    const metric = (name: string, type: 'counter' | 'gauge' | 'histogram', help: string) => {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
    };

    metric('asa_build_info', 'gauge', 'Versão e forma de execução da API.');
    lines.push(`asa_build_info${labels({ version: this.options.version, runtime: this.options.runtime ?? 'server', node: process.version })} 1`);

    metric('asa_http_requests_total', 'counter', 'Requisições HTTP atendidas, por método, rota e status.');
    for (const item of this.requests.values()) {
      lines.push(`asa_http_requests_total${labels({ method: item.method, route: item.route, status_code: item.status })} ${item.value}`);
    }

    metric('asa_http_request_duration_seconds', 'histogram', 'Latência das requisições HTTP (segundos), por método e rota.');
    for (const series of this.latency.values()) {
      const base = { method: series.method, route: series.route };
      LATENCY_BUCKETS_SECONDS.forEach((bound, index) => {
        lines.push(`asa_http_request_duration_seconds_bucket${labels({ ...base, le: String(bound) })} ${series.buckets[index] ?? 0}`);
      });
      lines.push(`asa_http_request_duration_seconds_bucket${labels({ ...base, le: '+Inf' })} ${series.count}`);
      lines.push(`asa_http_request_duration_seconds_sum${labels(base)} ${formatNumber(series.sum)}`);
      lines.push(`asa_http_request_duration_seconds_count${labels(base)} ${series.count}`);
    }

    metric('asa_http_requests_in_flight', 'gauge', 'Requisições em andamento neste processo.');
    lines.push(`asa_http_requests_in_flight ${this.inFlight}`);

    const cpu = process.cpuUsage();
    metric('process_cpu_user_seconds_total', 'counter', 'Tempo de CPU em modo usuário (segundos).');
    lines.push(`process_cpu_user_seconds_total ${cpu.user / 1e6}`);
    metric('process_cpu_system_seconds_total', 'counter', 'Tempo de CPU em modo sistema/kernel (segundos).');
    lines.push(`process_cpu_system_seconds_total ${cpu.system / 1e6}`);
    metric('process_cpu_seconds_total', 'counter', 'Tempo total de CPU (usuário + sistema, segundos).');
    lines.push(`process_cpu_seconds_total ${(cpu.user + cpu.system) / 1e6}`);

    const memory = process.memoryUsage();
    metric('process_resident_memory_bytes', 'gauge', 'Memória residente (RSS) do processo.');
    lines.push(`process_resident_memory_bytes ${memory.rss}`);
    metric('nodejs_heap_used_bytes', 'gauge', 'Heap do V8 em uso.');
    lines.push(`nodejs_heap_used_bytes ${memory.heapUsed}`);
    metric('nodejs_heap_total_bytes', 'gauge', 'Heap do V8 reservado.');
    lines.push(`nodejs_heap_total_bytes ${memory.heapTotal}`);
    metric('nodejs_external_memory_bytes', 'gauge', 'Memória fora do heap (buffers, etc.).');
    lines.push(`nodejs_external_memory_bytes ${memory.external}`);

    metric('nodejs_eventloop_lag_seconds', 'gauge', 'Atraso do event loop desde a coleta anterior (quantis).');
    for (const quantile of [0.5, 0.9, 0.99]) {
      const value = this.loopDelay.count > 0 ? this.loopDelay.percentile(quantile * 100) / 1e9 : 0;
      lines.push(`nodejs_eventloop_lag_seconds${labels({ quantile: String(quantile) })} ${value}`);
    }
    metric('nodejs_eventloop_lag_max_seconds', 'gauge', 'Maior atraso do event loop desde a coleta anterior.');
    lines.push(`nodejs_eventloop_lag_max_seconds ${this.loopDelay.count > 0 ? this.loopDelay.max / 1e9 : 0}`);
    this.loopDelay.reset();

    metric('process_start_time_seconds', 'gauge', 'Início do processo (epoch, segundos).');
    lines.push(`process_start_time_seconds ${Math.floor(this.startTimeSeconds)}`);
    metric('process_uptime_seconds', 'gauge', 'Tempo desde o início do processo (segundos).');
    lines.push(`process_uptime_seconds ${process.uptime()}`);

    if (pool) {
      metric('asa_db_pool_connections', 'gauge', 'Conexões do pool do PostgreSQL por estado (waiting = requisições na fila por conexão).');
      lines.push(`asa_db_pool_connections${labels({ state: 'total' })} ${pool.totalCount}`);
      lines.push(`asa_db_pool_connections${labels({ state: 'idle' })} ${pool.idleCount}`);
      lines.push(`asa_db_pool_connections${labels({ state: 'in_use' })} ${Math.max(0, pool.totalCount - pool.idleCount)}`);
      lines.push(`asa_db_pool_connections${labels({ state: 'waiting' })} ${pool.waitingCount}`);
    }

    return `${lines.join('\n')}\n`;
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export interface MetricsEndpointOptions {
  /** Sem token o endpoint responde 404, como uma rota inexistente. */
  token: string | null;
  pool?: PoolStats | null;
}

/** `GET /metrics`: protegido por Bearer token (comparação em tempo constante). */
export function metricsEndpoint(metrics: HttpMetrics, options: MetricsEndpointOptions): RequestHandler {
  const expected = options.token ? digest(options.token) : null;
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!expected) {
      next();
      return;
    }
    const header = req.headers.authorization ?? '';
    const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    if (!provided || !timingSafeEqual(digest(provided), expected)) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="metrics"');
      res.status(401).type('text/plain').send('unauthorized\n');
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.type('text/plain; version=0.0.4; charset=utf-8').send(metrics.render(options.pool ?? null));
  };
}
