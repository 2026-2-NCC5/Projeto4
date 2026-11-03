import { backoffDelay, SupportRealtimeController, type SupportChange } from '../features/support/realtime';
import type { SupportEventsParams } from '../features/support/api';
import { SUPPORT } from '../features/support/config';
import { ApiClientError } from '../services/apiClient';
import type { SupportEventEnvelope, SupportEventFeed } from '../types/api';

function feed(overrides: Partial<SupportEventFeed> = {}): SupportEventFeed {
  return { events: [], nextCursor: 'c1', hasMore: false, resyncRequired: false, serverTime: '2026-11-02T12:00:00.000Z', ...overrides };
}

function event(eventId: string, ticketId: string | null = 'ticket-1'): SupportEventEnvelope {
  return { schemaVersion: '1.0', eventId, correlationId: null, ticketId, sequence: 1, type: 'support.ticket.status_changed', occurredAt: '2026-11-02T12:00:00.000Z', actor: { type: 'staff' }, audience: 'STUDENT_VISIBLE', data: {} };
}

interface Call {
  params: SupportEventsParams;
  signal: AbortSignal;
  at: number;
}

/** Respostas roteirizadas: um item da fila por chamada. Sem roteiro, a chamada fica pendente (como o long polling). */
function setup(options: { random?: () => number } = {}) {
  const calls: Call[] = [];
  const changes: SupportChange[] = [];
  const script: (SupportEventFeed | Error | ((call: Call) => Promise<SupportEventFeed>))[] = [];
  const pending: { resolve: (value: SupportEventFeed) => void; reject: (reason: unknown) => void; call: Call }[] = [];
  const controller = new SupportRealtimeController({
    fetchEvents: (params, { signal }) => {
      const call = { params, signal, at: Date.now() };
      calls.push(call);
      const next = script.shift();
      if (next instanceof Error) return Promise.reject(next);
      if (typeof next === 'function') return next(call);
      if (next) return Promise.resolve(next);
      return new Promise<SupportEventFeed>((resolve, reject) => {
        pending.push({ resolve, reject, call });
        signal.addEventListener('abort', () => reject(new ApiClientError({ kind: 'cancelled', message: 'Requisição cancelada.' })));
      });
    },
    onChange: (change) => changes.push(change),
    random: options.random ?? (() => 1),
  });
  return { controller, calls, changes, script, pending };
}

const advance = (ms: number) => jest.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-02T12:00:00.000Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('cursor', () => {
  it('a primeira leitura pede só o cursor (wait=0); as seguintes usam o cursor com wait=25', async () => {
    const { controller, calls, script, changes } = setup();
    script.push(feed({ nextCursor: 'c1' }));
    controller.start();
    expect(controller.getSnapshot().state).toBe('connecting');
    await advance(0);
    expect(calls[0]?.params).toEqual({ since: null, wait: 0 });
    expect(controller.getSnapshot().state).toBe('live');
    expect(controller.getSnapshot().lastSyncAt).toBe(Date.now());
    // sem eventos e sem falha: nada é recarregado na primeira leitura
    expect(changes).toEqual([]);

    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(calls[1]?.params).toEqual({ since: 'c1', wait: 25 });
    controller.stop();
  });

  it('o cursor avança a cada resposta e os eventos avisam só os chamados afetados', async () => {
    const { controller, calls, script, changes } = setup();
    script.push(feed({ nextCursor: 'c1' }), feed({ nextCursor: 'c2', events: [event('e1', 't1'), event('e2', 't2'), event('e3', 't1')] }), feed({ nextCursor: 'c3' }));
    controller.start();
    await advance(5_000);
    expect(calls.map((call) => call.params.since)).toEqual([null, 'c1', 'c2', 'c3']);
    expect(changes).toEqual([{ kind: 'tickets', ticketIds: ['t1', 't2'] }]);
    controller.stop();
  });

  it('`hasMore` lê a página seguinte sem esperar no servidor', async () => {
    const { controller, calls, script } = setup();
    script.push(feed({ nextCursor: 'c1' }), feed({ nextCursor: 'c2', hasMore: true }), feed({ nextCursor: 'c3' }));
    controller.start();
    await advance(4_000);
    expect(calls.map((call) => call.params.wait)).toEqual([0, 25, 0, 25]);
    controller.stop();
  });

  it('evento sem chamado (canal) não dispara recarga', async () => {
    const { controller, script, changes } = setup();
    script.push(feed({ nextCursor: 'c1' }), feed({ nextCursor: 'c2', events: [event('e1', null)] }));
    controller.start();
    await advance(2_000);
    expect(changes).toEqual([]);
    controller.stop();
  });
});

describe('deduplicação', () => {
  it('o mesmo eventId entregue de novo não dispara outra recarga', async () => {
    const { controller, script, changes } = setup();
    script.push(feed({ nextCursor: 'c1' }), feed({ nextCursor: 'c2', events: [event('e1', 't1')] }), feed({ nextCursor: 'c3', events: [event('e1', 't1')] }), feed({ nextCursor: 'c4', events: [event('e1', 't1'), event('e2', 't9')] }));
    controller.start();
    await advance(5_000);
    expect(changes).toEqual([
      { kind: 'tickets', ticketIds: ['t1'] },
      { kind: 'tickets', ticketIds: ['t9'] },
    ]);
    controller.stop();
  });
});

describe('intervalo mínimo', () => {
  it('nunca faz mais de uma chamada por segundo, mesmo com o servidor respondendo na hora', async () => {
    const calls: number[] = [];
    let run = 0;
    const controller = new SupportRealtimeController({
      fetchEvents: async () => {
        calls.push(Date.now());
        run += 1;
        return feed({ nextCursor: `c${run}` });
      },
      onChange: () => undefined,
    });
    controller.start();
    await advance(30_000);
    controller.stop();
    // 30 s com resposta imediata: o laço teria milhares de chamadas sem o limite
    expect(calls.length).toBeGreaterThanOrEqual(30);
    expect(calls.length).toBeLessThanOrEqual(31);
    for (let index = 1; index < calls.length; index += 1) expect((calls[index] as number) - (calls[index - 1] as number)).toBeGreaterThanOrEqual(SUPPORT.EVENTS_MIN_INTERVAL_MS);
  });

  it('um long polling que segurou a resposta recomeça sem pausa adicional', async () => {
    const { controller, calls, pending, script } = setup();
    script.push(feed({ nextCursor: 'c1' }));
    controller.start();
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(calls).toHaveLength(2);
    await advance(25_000);
    pending[0]?.resolve(feed({ nextCursor: 'c2' }));
    await advance(0);
    expect(calls).toHaveLength(3);
    controller.stop();
  });

  it('alternar segundo plano e primeiro plano rapidamente também respeita o intervalo', async () => {
    const { controller, calls, script } = setup();
    script.push(feed({ nextCursor: 'c1' }));
    controller.start();
    await advance(0);
    for (let index = 0; index < 5; index += 1) {
      controller.setForeground(false);
      controller.setForeground(true);
      await advance(100);
    }
    await advance(0);
    expect(calls).toHaveLength(1);
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(calls).toHaveLength(2);
    expect((calls[1]?.at as number) - (calls[0]?.at as number)).toBeGreaterThanOrEqual(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    controller.stop();
  });
});

describe('falhas', () => {
  it('backoff dobra a cada falha, com variação, e nunca passa de 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map((failures) => backoffDelay(failures, () => 1))).toEqual([2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
    expect([1, 2, 3, 4, 5, 6].map((failures) => backoffDelay(failures, () => 0))).toEqual([1_000, 2_000, 4_000, 8_000, 15_000, 15_000]);
  });

  it('espera o backoff entre as tentativas e mostra "reconnecting"', async () => {
    const { controller, calls, script } = setup({ random: () => 1 });
    const failure = () => new ApiClientError({ kind: 'server', status: 500, message: 'Error 500' });
    script.push(feed({ nextCursor: 'c1' }), failure(), failure(), failure());
    controller.start();
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(calls).toHaveLength(2);
    expect(controller.getSnapshot().state).toBe('reconnecting');

    await advance(1_999);
    expect(calls).toHaveLength(2);
    await advance(1);
    expect(calls).toHaveLength(3);
    await advance(3_999);
    expect(calls).toHaveLength(3);
    await advance(1);
    expect(calls).toHaveLength(4);
    controller.stop();
  });

  it('ao se recuperar, lê do cursor salvo com wait=0, recarrega os dados abertos e volta ao long polling', async () => {
    const { controller, calls, script, changes } = setup({ random: () => 1 });
    script.push(feed({ nextCursor: 'c1' }), new ApiClientError({ kind: 'timeout', message: 'Tempo limite excedido.' }), feed({ nextCursor: 'c2', events: [event('e1', 't1')] }));
    controller.start();
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(controller.getSnapshot().state).toBe('reconnecting');
    const lastSync = controller.getSnapshot().lastSyncAt;
    expect(lastSync).not.toBeNull();

    await advance(2_000);
    expect(calls[2]?.params).toEqual({ since: 'c1', wait: 0 });
    expect(controller.getSnapshot().state).toBe('live');
    expect(changes).toEqual([{ kind: 'all' }]);

    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(calls[3]?.params).toEqual({ since: 'c2', wait: 25 });
    controller.stop();
  });

  it('sem conexão na resposta da API, o estado é "offline"', async () => {
    const { controller, script } = setup();
    script.push(new ApiClientError({ kind: 'offline', message: 'Sem conexão com a internet.' }));
    controller.start();
    await advance(0);
    expect(controller.getSnapshot().state).toBe('offline');
    controller.stop();
  });

  it('429 respeita o Retry-After do servidor', async () => {
    const { controller, calls, script } = setup({ random: () => 1 });
    script.push(new ApiClientError({ kind: 'rate_limited', status: 429, message: 'x', retryAfterSeconds: 45 }));
    controller.start();
    await advance(44_999);
    expect(calls).toHaveLength(1);
    await advance(1);
    expect(calls).toHaveLength(2);
    controller.stop();
  });

  it('cursor recusado pelo servidor é descartado: pede um novo e recarrega tudo', async () => {
    const { controller, calls, script, changes } = setup({ random: () => 1 });
    script.push(feed({ nextCursor: 'c1' }), new ApiClientError({ kind: 'validation', status: 400, message: 'Cursor de eventos inválido.' }), feed({ nextCursor: 'c9' }));
    controller.start();
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS + 2_000);
    expect(calls[2]?.params).toEqual({ since: null, wait: 0 });
    expect(changes).toEqual([{ kind: 'all' }]);
    controller.stop();
  });

  it('401 não recuperável não gera novas chamadas (o apiClient já encerrou a sessão)', async () => {
    const { controller, calls, script } = setup();
    script.push(new ApiClientError({ kind: 'unauthorized', status: 401, message: 'x' }));
    controller.start();
    await advance(120_000);
    expect(calls).toHaveLength(1);
    controller.stop();
  });
});

describe('resyncRequired', () => {
  it('pede a recarga de tudo e continua do novo cursor', async () => {
    const { controller, calls, script, changes } = setup();
    script.push(feed({ nextCursor: 'c1' }), feed({ nextCursor: 'c2', resyncRequired: true, events: [event('e1', 't1')] }));
    controller.start();
    await advance(2_000);
    expect(changes).toEqual([{ kind: 'all' }]);
    expect(calls[2]?.params.since).toBe('c2');
    controller.stop();
  });

  it('em uma recuperação paginada, a recarga completa só acontece na última página', async () => {
    const { controller, script, changes } = setup();
    script.push(feed({ nextCursor: 'c1' }), feed({ nextCursor: 'c2', resyncRequired: true, hasMore: true, events: [event('e1', 't1')] }), feed({ nextCursor: 'c3', resyncRequired: true, hasMore: true, events: [event('e2', 't2')] }));
    controller.start();
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS * 2);
    expect(changes).toEqual([]);
    script.push(feed({ nextCursor: 'c4' }));
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(changes).toEqual([{ kind: 'all' }]);
    controller.stop();
  });
});

describe('primeiro e segundo plano', () => {
  it('em segundo plano aborta a chamada e não faz nenhuma outra; ao voltar, recupera do cursor salvo', async () => {
    const { controller, calls, script, changes } = setup();
    script.push(feed({ nextCursor: 'c1' }));
    controller.start();
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.signal.aborted).toBe(false);

    controller.setForeground(false);
    expect(calls[1]?.signal.aborted).toBe(true);
    await advance(10 * 60_000);
    expect(calls).toHaveLength(2);
    expect(changes).toEqual([]);

    script.push(feed({ nextCursor: 'c2', events: [event('e1', 't1')] }));
    controller.setForeground(true);
    expect(controller.getSnapshot().state).toBe('connecting');
    await advance(0);
    expect(calls[2]?.params).toEqual({ since: 'c1', wait: 0 });
    expect(controller.getSnapshot().state).toBe('live');
    expect(changes).toEqual([{ kind: 'all' }]);

    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(calls[3]?.params).toEqual({ since: 'c2', wait: 25 });
    controller.stop();
  });

  it('a resposta atrasada de uma chamada abandonada é ignorada', async () => {
    let resolveLate: (value: SupportEventFeed) => void = () => undefined;
    const changes: SupportChange[] = [];
    const seen: SupportEventsParams[] = [];
    const controller = new SupportRealtimeController({
      fetchEvents: (params) => {
        seen.push(params);
        // API que ignora o `signal`: o controlador não pode confiar só no abort
        return seen.length === 1 ? new Promise((resolve) => (resolveLate = resolve)) : Promise.resolve(feed({ nextCursor: 'fresh' }));
      },
      onChange: (change) => changes.push(change),
    });
    controller.start();
    await advance(0);
    controller.setForeground(false);
    resolveLate(feed({ nextCursor: 'stale', events: [event('e1', 't1')] }));
    await advance(0);
    expect(changes).toEqual([]);
    expect(controller.getSnapshot().state).toBe('connecting');
    controller.setForeground(true);
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(seen[1]?.since).toBeNull();
    controller.stop();
  });

  it('sem rede pausa em "offline" e, com a volta da rede, reconecta e recupera', async () => {
    const { controller, calls, script, changes } = setup();
    script.push(feed({ nextCursor: 'c1' }));
    controller.start();
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    controller.setOffline(true);
    expect(controller.getSnapshot().state).toBe('offline');
    expect(calls[1]?.signal.aborted).toBe(true);
    await advance(60_000);
    expect(calls).toHaveLength(2);

    script.push(feed({ nextCursor: 'c2' }));
    controller.setOffline(false);
    expect(controller.getSnapshot().state).toBe('reconnecting');
    await advance(0);
    expect(calls[2]?.params).toEqual({ since: 'c1', wait: 0 });
    expect(changes).toEqual([{ kind: 'all' }]);
    controller.stop();
  });
});

describe('logout e troca de conta', () => {
  it('para na hora, aborta a chamada e esquece o cursor', async () => {
    const { controller, calls, script } = setup();
    script.push(feed({ nextCursor: 'c-conta-a' }));
    controller.start();
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(calls).toHaveLength(2);

    controller.stop();
    expect(calls[1]?.signal.aborted).toBe(true);
    expect(controller.getSnapshot()).toEqual({ state: 'connecting', lastSyncAt: null });
    await advance(120_000);
    expect(calls).toHaveLength(2);

    script.push(feed({ nextCursor: 'c-conta-b' }));
    controller.start();
    await advance(0);
    // a outra conta começa do zero: nenhum cursor da conta anterior
    expect(calls[2]?.params).toEqual({ since: null, wait: 0 });
    controller.stop();
  });

  it('resposta que chega depois do logout não muda estado nem avisa ninguém', async () => {
    const { controller, pending, script, changes } = setup();
    script.push(feed({ nextCursor: 'c1' }));
    controller.start();
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    const late = pending[0];
    controller.stop();
    late?.resolve(feed({ nextCursor: 'c2', events: [event('e1', 't1')] }));
    await advance(0);
    expect(changes).toEqual([]);
    expect(controller.getSnapshot()).toEqual({ state: 'connecting', lastSyncAt: null });
  });

  it('eventos vistos não passam de uma sessão para a outra', async () => {
    const { controller, script, changes } = setup();
    script.push(feed({ nextCursor: 'c1' }), feed({ nextCursor: 'c2', events: [event('e1', 't1')] }));
    controller.start();
    await advance(2_000);
    expect(changes).toHaveLength(1);
    controller.stop();

    script.push(feed({ nextCursor: 'c3' }), feed({ nextCursor: 'c4', events: [event('e1', 't1')] }));
    controller.start();
    await advance(2_000);
    expect(changes).toHaveLength(2);
    controller.stop();
  });

  it('segundo plano depois do logout não religa a leitura', async () => {
    const { controller, calls, script } = setup();
    script.push(feed({ nextCursor: 'c1' }));
    controller.start();
    await advance(0);
    controller.stop();
    controller.setForeground(false);
    controller.setForeground(true);
    controller.setOffline(true);
    controller.setOffline(false);
    await advance(60_000);
    expect(calls).toHaveLength(1);
  });
});
