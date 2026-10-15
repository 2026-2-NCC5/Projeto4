import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/config/logger.js';
import { QueueEventBus, type QueueEvents } from '../../src/queue/eventBus.js';
import { LocalLeaderLock, type LeaderLock } from '../../src/queue/leaderLock.js';
import { QueueMetrics } from '../../src/queue/metrics.js';
import { QueueMonitor } from '../../src/queue/monitor.js';
import { FallbackQueueProvider } from '../../src/queue/providers/fallbackProvider.js';
import { FecapQueueHtmlProvider } from '../../src/queue/providers/fecapHtmlProvider.js';
import { FecapPortalQueueProvider } from '../../src/queue/providers/fecapPortalProvider.js';
import { MockQueueProvider } from '../../src/queue/providers/mockProvider.js';
import { MemoryQueueRepository } from '../../src/queue/repository.js';
import { buildSnapshot } from '../../src/queue/snapshot.js';
import { QueueSourceError, type QueueCall, type QueueProvider, type QueueSnapshot } from '../../src/queue/types.js';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures/queue');
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name), 'utf8');
const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-10-06T23:47:00.000Z');
const SOURCE = 'https://presencial.fecap.br/';
const silent = createLogger('silent');

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}

/** Portal fictício servindo as fixtures reais (página, token e as duas listas). */
function fakePortal(options: { gridStatuses?: number[]; waiting?: string; failNetwork?: boolean } = {}) {
  const requests: Recorded[] = [];
  const statuses = [...(options.gridStatuses ?? [])];
  let tokenCount = 0;
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    requests.push({ url, method: init?.method ?? 'GET', headers, body });
    if (options.failNetwork) throw new TypeError('fetch failed');
    const { pathname } = new URL(url);
    if (pathname === '/') return new Response(fixture('fecap-portal-page.html'), { headers: { 'set-cookie': 'ARRAffinity=abc; Path=/; HttpOnly' } });
    if (pathname === '/_layout/tokenhtml') {
      tokenCount += 1;
      return new Response(fixture('fecap-tokenhtml.html').replace('FIXTURE-ANTIFORGERY-TOKEN', `TOKEN-${tokenCount}`), {
        headers: { 'set-cookie': `__RequestVerificationToken=cookie-${tokenCount}; Path=/; HttpOnly` },
      });
    }
    if (pathname.startsWith('/_services/entity-grid-data.json/')) {
      const status = statuses.shift() ?? 200;
      if (status !== 200) return new Response('erro', { status });
      const isWaiting = body?.base64SecureConfiguration === 'FIXTURE-SECURE-CONFIG-WAITING';
      return new Response(isWaiting ? fixture(options.waiting ?? 'fecap-grid-waiting.json') : fixture('fecap-grid-calls.json'), { headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetchFn, requests };
}

describe('FecapPortalQueueProvider (endpoint estruturado do portal)', () => {
  it('descobre as listas, envia o token anti-CSRF + cookies e monta o snapshot', async () => {
    const portal = fakePortal();
    const provider = new FecapPortalQueueProvider({ sourceUrl: SOURCE, timeoutMs: 1000, timeZone: TZ, fetchFn: portal.fetchFn, now: () => NOW });
    const snapshot = await provider.getCurrentQueue();
    expect(snapshot.provider).toBe('fecap-portal');
    expect(snapshot.calls[0]).toMatchObject({ ticket: '0026', desk: 'Mesa 03' });
    expect(snapshot.upcoming.map((item) => item.ticket)).toEqual(['0027', '0028', '0029', '0030']);
    expect(snapshot.upcomingComplete).toBe(true);
    expect(snapshot.callsTotal).toBe(27);

    const posts = portal.requests.filter((request) => request.method === 'POST');
    expect(posts).toHaveLength(2);
    for (const post of posts) {
      expect(post.headers.__RequestVerificationToken).toBe('TOKEN-1');
      expect(post.headers.Cookie).toContain('ARRAffinity=abc');
      expect(post.headers.Cookie).toContain('__RequestVerificationToken=cookie-1');
      expect(post.body).toMatchObject({ page: 1, timezoneOffset: 180, search: null });
    }
    expect(posts.find((post) => post.body?.base64SecureConfiguration === 'FIXTURE-SECURE-CONFIG-WAITING')?.body?.sortExpression).toBe('fecap_posicaonafilapresencial ASC');
  });

  it('reutiliza a sessão: a página e o token não são buscados a cada ciclo', async () => {
    const portal = fakePortal();
    const provider = new FecapPortalQueueProvider({ sourceUrl: SOURCE, timeoutMs: 1000, timeZone: TZ, fetchFn: portal.fetchFn, now: () => NOW });
    await provider.getCurrentQueue();
    await provider.getCurrentQueue();
    expect(portal.requests.filter((request) => request.method === 'GET')).toHaveLength(2);
    expect(portal.requests.filter((request) => request.method === 'POST')).toHaveLength(4);
  });

  it('4xx da lista (token expirado) → renova a sessão e tenta de novo uma única vez', async () => {
    const portal = fakePortal({ gridStatuses: [403, 403] });
    const provider = new FecapPortalQueueProvider({ sourceUrl: SOURCE, timeoutMs: 1000, timeZone: TZ, fetchFn: portal.fetchFn, now: () => NOW });
    const snapshot = await provider.getCurrentQueue();
    expect(snapshot.calls).toHaveLength(10);
    const lastPost = portal.requests.filter((request) => request.method === 'POST').at(-1);
    expect(lastPost?.headers.__RequestVerificationToken).toBe('TOKEN-2');
  });

  it('5xx e falhas de rede viram QueueSourceError (o monitor faz backoff)', async () => {
    const down = new FecapPortalQueueProvider({ sourceUrl: SOURCE, timeoutMs: 1000, timeZone: TZ, fetchFn: fakePortal({ failNetwork: true }).fetchFn, now: () => NOW });
    await expect(down.getCurrentQueue()).rejects.toMatchObject({ name: 'QueueSourceError', kind: 'network' });
    const broken = new FecapPortalQueueProvider({ sourceUrl: SOURCE, timeoutMs: 1000, timeZone: TZ, fetchFn: fakePortal({ gridStatuses: [503, 503] }).fetchFn, now: () => NOW });
    await expect(broken.getCurrentQueue()).rejects.toMatchObject({ kind: 'http', status: 503 });
  });

  it('fallback HTML: com a página real (renderizada no navegador) falha em vez de inventar fila vazia', async () => {
    const portal = fakePortal({ gridStatuses: [500, 500] });
    const common = { sourceUrl: SOURCE, timeoutMs: 1000, timeZone: TZ, fetchFn: portal.fetchFn, now: () => NOW };
    const fallbacks: string[] = [];
    const provider = new FallbackQueueProvider([new FecapPortalQueueProvider(common), new FecapQueueHtmlProvider(common)], (failed) => fallbacks.push(failed.name));
    await expect(provider.getCurrentQueue()).rejects.toMatchObject({ kind: 'http', status: 500 });
    expect(fallbacks).toEqual(['fecap-portal', 'fecap-html']);
  });

  it('fallback HTML funciona quando o painel vem renderizado no servidor', async () => {
    const html = '<h2>ÚLTIMA SENHA</h2><p>0026</p><p>Mesa 03</p><h2>PRÓXIMAS SENHAS</h2><table><tr><th>Posição</th><th>Senha</th></tr><tr><td>1</td><td>0027</td></tr></table>';
    const provider = new FecapQueueHtmlProvider({ sourceUrl: SOURCE, timeoutMs: 1000, timeZone: TZ, fetchFn: (async () => new Response(html)) as typeof fetch, now: () => NOW });
    const snapshot = await provider.getCurrentQueue();
    expect(snapshot.calls.map((call) => call.ticket)).toEqual(['0026']);
    expect(snapshot.upcoming).toEqual([{ ticket: '0027', position: 1, sourceId: null }]);
  });
});

describe('MockQueueProvider (somente desenvolvimento)', () => {
  it('cenários relativos à senha 0029 e progressão 0026 → 0029', async () => {
    let now = NOW;
    const mock = new MockQueueProvider({ scenario: '3_ahead', timeZone: TZ, stepSeconds: 20, now: () => now });
    let snapshot = await mock.getCurrentQueue();
    expect(snapshot.calls[0]?.ticket).toBe('0025');
    expect(snapshot.upcoming.findIndex((item) => item.ticket === '0029')).toBe(3);
    expect(new Set(snapshot.calls.slice(0, 2).map((call) => call.desk))).toEqual(new Set(['Mesa 01', 'Mesa 03']));

    mock.setScenario('progression');
    snapshot = await mock.getCurrentQueue();
    expect(snapshot.calls[0]?.ticket).toBe('0021');
    now = new Date(NOW.getTime() + 5 * 20_000);
    expect((await mock.getCurrentQueue()).calls[0]?.ticket).toBe('0026');
    mock.advance();
    mock.advance();
    mock.advance();
    expect((await mock.getCurrentQueue()).calls[0]?.ticket).toBe('0029');

    mock.setScenario('offline');
    await expect(mock.getCurrentQueue()).rejects.toBeInstanceOf(QueueSourceError);
    mock.setScenario('empty');
    expect((await mock.getCurrentQueue()).status).toBe('empty');
  });
});

// ------------------------------------------------------------------- monitor

const call = (ticket: string, desk: string, minute: number): QueueCall => ({
  ticket,
  desk,
  calledAt: new Date(Date.UTC(2026, 9, 6, 23, minute)).toISOString(),
  serviceStatus: 'in_service',
  sourceId: `src-${ticket}`,
});

function snapshotWith(calls: QueueCall[], upcoming: string[] = []): QueueSnapshot {
  return buildSnapshot({
    provider: 'scripted',
    calls,
    upcoming: upcoming.map((ticket, index) => ({ ticket, position: index + 1, sourceId: null })),
    upcomingComplete: true,
    callsTotal: calls.length,
    now: NOW,
    timeZone: TZ,
  });
}

/** Provider roteirizado: cada leitura devolve o próximo item (snapshot ou erro). */
class ScriptedProvider implements QueueProvider {
  readonly name = 'scripted';
  constructor(private readonly script: Array<QueueSnapshot | Error>) {}
  async getCurrentQueue() {
    const next = this.script.length > 1 ? this.script.shift()! : this.script[0]!;
    if (next instanceof Error) throw next;
    return next;
  }
}

function setupMonitor(script: Array<QueueSnapshot | Error>, overrides: { lock?: LeaderLock; repository?: MemoryQueueRepository } = {}) {
  const bus = new QueueEventBus(silent);
  const repository = overrides.repository ?? new MemoryQueueRepository();
  const metrics = new QueueMetrics();
  const events: Array<{ name: keyof QueueEvents; payload: unknown }> = [];
  for (const name of ['queue.updated', 'queue.source_unavailable', 'queue.source_recovered'] as const) {
    const record = (payload: unknown) => {
      events.push({ name, payload });
    };
    bus.on(name, record as never);
  }
  const monitor = new QueueMonitor({
    provider: new ScriptedProvider(script),
    repository,
    bus,
    lock: overrides.lock ?? new LocalLeaderLock(),
    metrics,
    logger: silent,
    timeZone: TZ,
    pollIntervalMs: 10_000,
    maxBackoffMs: 300_000,
    failureThreshold: 3,
    now: () => NOW,
  });
  return { monitor, repository, metrics, events, bus };
}

describe('QueueMonitor', () => {
  const s26 = snapshotWith([call('0026', 'Mesa 03', 23), call('0025', 'Mesa 03', 22), call('0024', 'Mesa 01', 7)], ['0027', '0028', '0029']);
  const s27 = snapshotWith([call('0027', 'Mesa 01', 30), ...s26.calls], ['0028', '0029']);

  it('0026 → 0027 gera a nova chamada; repetir o mesmo snapshot não gera nada novo', async () => {
    const { monitor, repository, events, metrics } = setupMonitor([s26, s27, s27]);
    await monitor.pollOnce();
    await monitor.pollOnce();
    const second = events.filter((event) => event.name === 'queue.updated')[1]?.payload as QueueEvents['queue.updated'][0];
    expect(second.changes.newCalls.map((item) => item.ticket)).toEqual(['0027']);
    expect(second.changes.leftUpcoming).toEqual(['0027']);

    await monitor.pollOnce();
    const third = events.filter((event) => event.name === 'queue.updated')[2]?.payload as QueueEvents['queue.updated'][0];
    expect(third.changes.newCalls).toEqual([]);
    expect(third.changes.changed).toBe(false);
    // histórico idempotente: cada chamada registrada uma vez
    expect([...repository.calls.values()].map((item) => item.ticket).sort()).toEqual(['0024', '0025', '0026', '0027']);
    expect(metrics.queue_fetch_success_total).toBe(3);
    expect(monitor.getSnapshot()?.calls[0]?.ticket).toBe('0027');
  });

  it('fonte indisponível: mantém o último snapshot, avisa uma vez, faz backoff e abre o circuito', async () => {
    const failure = new QueueSourceError('network', 'fora do ar');
    const { monitor, events, metrics, repository } = setupMonitor([s26, failure, failure, failure, failure, s27]);
    await monitor.pollOnce();
    expect(monitor.nextDelayMs()).toBe(10_000);

    await monitor.pollOnce();
    expect(monitor.getSnapshot()?.calls[0]?.ticket).toBe('0026');
    expect(monitor.nextDelayMs()).toBe(20_000);
    await monitor.pollOnce();
    expect(monitor.nextDelayMs()).toBe(40_000);
    await monitor.pollOnce();
    expect(monitor.health().circuit).toBe('open');
    expect(monitor.nextDelayMs()).toBe(300_000);
    await monitor.pollOnce();
    expect(events.filter((event) => event.name === 'queue.source_unavailable')).toHaveLength(1);
    expect(metrics.queue_fetch_failure_total).toBe(4);
    expect(repository.state?.snapshot?.calls[0]?.ticket).toBe('0026');
    expect(repository.state?.consecutiveFailures).toBe(4);

    await monitor.pollOnce();
    expect(monitor.health()).toMatchObject({ circuit: 'closed', consecutiveFailures: 0 });
    expect(monitor.nextDelayMs()).toBe(10_000);
    expect(events.filter((event) => event.name === 'queue.source_recovered')).toHaveLength(1);
    expect(monitor.getSnapshot()?.calls[0]?.ticket).toBe('0027');
  });

  it('erro de parser é contado separadamente', async () => {
    const { monitor, metrics } = setupMonitor([new QueueSourceError('parse', 'estrutura mudou')]);
    await monitor.pollOnce();
    expect(metrics.queue_parser_failure_total).toBe(1);
    expect(monitor.health().lastError).toContain('parse');
  });

  it('reinício: recupera o último snapshot do dia salvo no banco', async () => {
    const repository = new MemoryQueueRepository();
    const first = setupMonitor([s26], { repository });
    await first.monitor.pollOnce();
    const failure = new QueueSourceError('timeout', 'lento');
    const restarted = setupMonitor([failure], { repository });
    await restarted.monitor.start();
    expect(restarted.monitor.getSnapshot()?.calls[0]?.ticket).toBe('0026');
    await restarted.monitor.stop();
  });

  it('seguidor (outra instância é líder): não consulta a fonte, lê o estado compartilhado', async () => {
    const repository = new MemoryQueueRepository();
    const leader = setupMonitor([s26], { repository });
    await leader.monitor.pollOnce();
    const notLeader: LeaderLock = { held: false, acquire: async () => false, release: async () => undefined };
    const follower = setupMonitor([new Error('não deveria consultar a fonte')], { repository, lock: notLeader });
    await follower.monitor.followState();
    expect(follower.monitor.getSnapshot()?.calls[0]?.ticket).toBe('0026');
    expect((follower.events[0]?.payload as QueueEvents['queue.updated'][0]).source).toBe('follower');
    expect(follower.metrics.queue_fetch_success_total + follower.metrics.queue_fetch_failure_total).toBe(0);
  });
});
