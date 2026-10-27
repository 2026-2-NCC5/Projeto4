import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../src/config/logger.js';
import { QueueEventBus } from '../../src/queue/eventBus.js';
import { LocalLeaderLock, type LeaderLock } from '../../src/queue/leaderLock.js';
import { QueueMetrics } from '../../src/queue/metrics.js';
import { QueueMonitor } from '../../src/queue/monitor.js';
import { QueueRealtimeHub } from '../../src/queue/realtime.js';
import { MemoryQueueRepository } from '../../src/queue/repository.js';
import type { QueueService } from '../../src/queue/service.js';
import { buildSnapshot } from '../../src/queue/snapshot.js';
import { QueueSourceError, type QueueProvider, type QueueSnapshot } from '../../src/queue/types.js';

/**
 * Execução sem processo residente (Vercel Functions): fila sob demanda, tempo real que se atualiza sozinho,
 * tarefas periódicas por rota protegida e limites que cabem na plataforma.
 */

const TZ = 'America/Sao_Paulo';
const silent = createLogger('silent');

function snapshotAt(now: Date, ticket: string): QueueSnapshot {
  return buildSnapshot({
    provider: 'fake',
    calls: [{ ticket, desk: 'Mesa 01', calledAt: now.toISOString(), serviceStatus: 'in_service', sourceId: `fake-${ticket}` }],
    upcoming: [],
    upcomingComplete: true,
    callsTotal: 1,
    now,
    timeZone: TZ,
  });
}

/** Fonte que conta as consultas; `fail` faz as próximas consultas falharem. */
function countingProvider(now: () => Date) {
  const state = { fetches: 0, fail: false };
  const provider: QueueProvider = {
    name: 'fake',
    async getCurrentQueue() {
      state.fetches += 1;
      if (state.fail) throw new QueueSourceError('network', 'fora do ar');
      return snapshotAt(now(), String(state.fetches).padStart(4, '0'));
    },
  };
  return { provider, state };
}

function onDemandMonitor(options: { repository?: MemoryQueueRepository; lock?: LeaderLock; start?: Date } = {}) {
  let clock = options.start ?? new Date('2026-10-27T13:00:00.000Z');
  const now = () => clock;
  const bus = new QueueEventBus(silent);
  const { provider, state } = countingProvider(now);
  const repository = options.repository ?? new MemoryQueueRepository();
  const monitor = new QueueMonitor({
    provider,
    repository,
    bus,
    lock: options.lock ?? new LocalLeaderLock(),
    metrics: new QueueMetrics(),
    logger: silent,
    timeZone: TZ,
    pollIntervalMs: 10_000,
    maxBackoffMs: 300_000,
    failureThreshold: 3,
    persistEveryMs: 10_000,
    now,
  });
  return {
    monitor,
    bus,
    repository,
    state,
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
  };
}

describe('fila sob demanda (QueueMonitor.refresh)', () => {
  it('consulta quando o intervalo vence; chamadas simultâneas compartilham a mesma consulta', async () => {
    const queue = onDemandMonitor();
    await Promise.all([queue.monitor.refresh(), queue.monitor.refresh(), queue.monitor.refresh()]);
    expect(queue.state.fetches).toBe(1);
    expect(queue.monitor.getSnapshot()?.calls[0]?.ticket).toBe('0001');

    // dentro do intervalo: nada de nova consulta (nem de nova leitura do banco antes de 5 s)
    queue.advance(6_000);
    await queue.monitor.refresh();
    expect(queue.state.fetches).toBe(1);

    queue.advance(5_000);
    await queue.monitor.refresh();
    expect(queue.state.fetches).toBe(2);
    expect(queue.monitor.getSnapshot()?.calls[0]?.ticket).toBe('0002');
  });

  it('respeita o backoff das falhas: não martela a fonte fora do ar a cada requisição', async () => {
    const queue = onDemandMonitor();
    await queue.monitor.refresh();
    queue.state.fail = true;
    queue.advance(10_000);
    await queue.monitor.refresh();
    expect(queue.state.fetches).toBe(2);
    expect(queue.monitor.health().consecutiveFailures).toBe(1);
    // após 1 falha o próximo intervalo é 20 s; 10 s depois ainda não é hora
    queue.advance(10_000);
    await queue.monitor.refresh();
    expect(queue.state.fetches).toBe(2);
    queue.advance(10_000);
    await queue.monitor.refresh();
    expect(queue.state.fetches).toBe(3);
    // o último snapshot válido continua disponível
    expect(queue.monitor.getSnapshot()?.calls[0]?.ticket).toBe('0001');
  });

  it('só termina depois que os ouvintes assíncronos (acompanhamentos, push) processaram a leitura', async () => {
    const queue = onDemandMonitor();
    const processed: string[] = [];
    queue.bus.on('queue.updated', async ({ snapshot }) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      processed.push(snapshot.calls[0]!.ticket);
      // evento disparado por um ouvinte também é esperado
      queue.bus.emit('queue.source_recovered', { at: snapshot.capturedAt, downtimeSeconds: 0 });
    });
    queue.bus.on('queue.source_recovered', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      processed.push('recovered');
    });
    await queue.monitor.refresh();
    expect(processed).toEqual(['0001', 'recovered']);
  });

  it('sem a concessão, a instância só segue o estado gravado por quem consultou', async () => {
    const repository = new MemoryQueueRepository();
    const leader = onDemandMonitor({ repository });
    const follower = onDemandMonitor({ repository, lock: { held: false, acquire: async () => false, release: async () => undefined } });
    await leader.monitor.refresh();
    await follower.monitor.refresh();
    expect(follower.state.fetches).toBe(0);
    expect(follower.monitor.getSnapshot()?.calls[0]?.ticket).toBe('0001');
  });

  it('não adota o snapshot de outro dia gravado no banco', async () => {
    const repository = new MemoryQueueRepository();
    const yesterday = new Date('2026-10-26T20:00:00.000Z');
    await repository.saveState({ snapshot: snapshotAt(yesterday, '0099'), lastSuccessAt: yesterday, lastError: null, consecutiveFailures: 0, updatedAt: yesterday });
    const follower = onDemandMonitor({ repository, lock: { held: false, acquire: async () => false, release: async () => undefined } });
    await follower.monitor.refresh();
    expect(follower.monitor.getSnapshot()).toBeNull();
  });
});

describe('tempo real sem laço residente (QueueRealtimeHub)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function fakeStream(userId: string) {
    const req = Object.assign(new EventEmitter(), { auth: { userId }, log: silent }) as unknown as Request;
    const chunks: string[] = [];
    const res = {
      writableEnded: false,
      status() {
        return res;
      },
      setHeader() {},
      flushHeaders() {},
      write(chunk: string) {
        chunks.push(chunk);
        return true;
      },
      end() {
        res.writableEnded = true;
      },
    };
    return { req, res: res as unknown as Response, chunks, close: () => (req as unknown as EventEmitter).emit('close') };
  }

  it('enquanto há conexões, atualiza a fila no ritmo do intervalo; sem conexões, para', async () => {
    vi.useFakeTimers();
    const onTick = vi.fn(async () => undefined);
    const service = { status: async () => ({ queue: null, subscription: null, serverTime: '' }), overview: () => ({ status: null, sync: { status: 'live' } }) } as unknown as QueueService;
    const hub = new QueueRealtimeHub({ bus: new QueueEventBus(silent), service, logger: silent, onTick, tickMs: 10_000, maxStreamMs: 240_000 });
    hub.attach();
    const a = fakeStream('u1');
    const b = fakeStream('u2');
    await hub.handle(a.req, a.res);
    await hub.handle(b.req, b.res);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onTick).toHaveBeenCalledTimes(3); // um temporizador só, não um por conexão
    a.close();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onTick).toHaveBeenCalledTimes(4);
    b.close();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onTick).toHaveBeenCalledTimes(4);
    hub.stop();
  });

  it('encerra cada conexão antes do limite da função (o app reconecta)', async () => {
    vi.useFakeTimers();
    const service = { status: async () => ({ queue: null, subscription: null, serverTime: '' }) } as unknown as QueueService;
    const hub = new QueueRealtimeHub({ bus: new QueueEventBus(silent), service, logger: silent, maxStreamMs: 240_000 });
    const stream = fakeStream('u1');
    await hub.handle(stream.req, stream.res);
    await vi.advanceTimersByTimeAsync(239_000);
    expect((stream.res as unknown as { writableEnded: boolean }).writableEnded).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect((stream.res as unknown as { writableEnded: boolean }).writableEnded).toBe(true);
    expect(stream.chunks[0]).toBe('retry: 5000\n\n');
  });
});
