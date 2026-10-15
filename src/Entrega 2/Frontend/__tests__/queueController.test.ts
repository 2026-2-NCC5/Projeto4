import { createMockQueueClient } from '../features/queue/services/mockQueueClient';
import type { QueueClient, QueueStreamListener } from '../features/queue/services/queueClient';
import type { QueueInAppAlert } from '../features/queue/state/alerts';
import { QueueController, type AlertStore, type PushAdapter } from '../features/queue/state/queueController';
import { ApiClientError } from '../services/apiClient';
import type { QueueAlertMilestone } from '../types/api';

function memoryStore(initial: Record<string, QueueAlertMilestone> = {}): AlertStore & { handled: Record<string, QueueAlertMilestone> } {
  const store = {
    handled: { ...initial },
    loadHandled: async () => ({ ...store.handled }),
    saveHandled: async (value: Record<string, QueueAlertMilestone>) => {
      store.handled = { ...value };
    },
    loadDefaults: async () => ({ pushEnabled: true, voiceEnabled: true, vibrationEnabled: true }),
    saveDefaults: async () => undefined,
  };
  return store;
}

function fakePush(permission: 'granted' | 'undetermined' | 'denied' = 'undetermined'): PushAdapter & { requested: number } {
  const push = {
    requested: 0,
    getPermission: async () => permission,
    requestPermission: async () => {
      push.requested += 1;
      return 'granted' as const;
    },
    getToken: async () => ({ token: 'ExponentPushToken[device-token-123]' }),
    platform: () => 'android' as const,
  };
  return push;
}

async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

function setup(options: { client?: QueueClient; store?: ReturnType<typeof memoryStore>; push?: ReturnType<typeof fakePush> } = {}) {
  const client = options.client ?? createMockQueueClient({ stepMs: 60_000 });
  const alerts: QueueInAppAlert[] = [];
  const controller = new QueueController({
    client,
    push: options.push ?? fakePush(),
    store: options.store ?? memoryStore(),
    onAlert: (alert) => alerts.push(alert),
  });
  return { controller, client, alerts };
}

describe('QueueController — alertas pelo estado', () => {
  it('progressão simulada 0026 → 0029: cada alerta uma única vez, chamada abre o aviso com a mesa', async () => {
    const { controller, client, alerts } = setup();
    await controller.start();
    await client.simulate({ scenario: 'waiting' });
    expect((await controller.subscribe('29')).ok).toBe(true);
    expect(controller.state.status?.subscription).toMatchObject({ ticket: '0029', ahead: 7, status: 'waiting' });

    for (const scenario of ['5_ahead', '5_ahead', '3_ahead', 'next', 'next', 'called', 'called'] as const) {
      await controller.simulate({ scenario });
    }
    expect(alerts.map((alert) => alert.kind)).toEqual(['five_ahead', 'three_ahead', 'next', 'called']);
    expect(controller.state.called).toMatchObject({ kind: 'called', ticket: '0029', desk: 'Mesa 03' });
    controller.acknowledgeCalled();
    expect(controller.state.called).toBeNull();

    // reaplicar o mesmo estado (polling, reconexão) não repete nada
    await controller.refresh();
    await controller.refresh();
    expect(alerts).toHaveLength(4);
    controller.dispose();
  });

  it('cadastro já perto da vez não gera alerta imediato; reabrir o app não repete alertas vistos', async () => {
    const store = memoryStore();
    const client = createMockQueueClient({ stepMs: 60_000 });
    const first = setup({ client, store });
    await first.controller.start();
    await client.simulate({ scenario: '3_ahead' });
    await first.controller.subscribe('0029');
    expect(first.alerts).toEqual([]);
    await first.controller.simulate({ scenario: 'next' });
    expect(first.alerts.map((alert) => alert.kind)).toEqual(['next']);
    first.controller.dispose();

    // "app reaberto": mesmo armazenamento, novo controlador
    const second = setup({ client, store });
    await second.controller.start();
    expect(second.alerts).toEqual([]);
    await second.controller.simulate({ scenario: 'called' });
    expect(second.alerts.map((alert) => alert.kind)).toEqual(['called']);
    second.controller.dispose();
  });

  it('banner de proximidade some sozinho', async () => {
    jest.useFakeTimers();
    try {
      const { controller, client } = setup();
      await controller.start();
      await client.simulate({ scenario: 'waiting' });
      await controller.subscribe('0029');
      await controller.simulate({ scenario: '5_ahead' });
      expect(controller.state.banner?.kind).toBe('five_ahead');
      jest.advanceTimersByTime(8_000);
      expect(controller.state.banner).toBeNull();
      controller.dispose();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('QueueController — conexão', () => {
  function streamingClient() {
    const base = createMockQueueClient({ stepMs: 60_000 });
    const opened: QueueStreamListener[] = [];
    const closed: number[] = [];
    let getStatusCalls = 0;
    const client: QueueClient = {
      ...base,
      getStatus: () => {
        getStatusCalls += 1;
        return base.getStatus();
      },
      openStream: (listener) => {
        opened.push(listener);
        return { close: () => closed.push(opened.length) };
      },
    };
    return { client, opened, closed, getStatusCalls: () => getStatusCalls };
  }

  it('sem senha e sem a tela aberta não mantém conexão; a tela ou uma senha ativa abrem o canal', async () => {
    const { client, opened } = streamingClient();
    const { controller } = setup({ client });
    await controller.start();
    expect(opened).toHaveLength(0);
    expect(controller.state.connection).toBe('idle');
    const release = controller.retainInterest();
    expect(opened).toHaveLength(1);
    opened[0]!.onOpen();
    expect(controller.state.connection).toBe('live');
    release();
    expect(controller.state.connection).toBe('idle');
    await controller.subscribe('0029');
    expect(opened).toHaveLength(2);
    controller.dispose();
  });

  it('SSE cai → polling como plano B e nova tentativa; segundo plano fecha tudo e a volta atualiza', async () => {
    jest.useFakeTimers();
    try {
      const { client, opened, closed, getStatusCalls } = streamingClient();
      const { controller } = setup({ client });
      await controller.start();
      await controller.subscribe('0029');
      opened[0]!.onClose(true);
      expect(controller.state.connection).toBe('polling');
      const before = getStatusCalls();
      jest.advanceTimersByTime(15_000);
      expect(getStatusCalls()).toBeGreaterThan(before);
      jest.advanceTimersByTime(3_000);
      await flush();
      expect(opened.length).toBeGreaterThanOrEqual(2);

      controller.setForeground(false);
      expect(controller.state.connection).toBe('idle');
      expect(closed.length).toBeGreaterThanOrEqual(1);
      const beforeForeground = getStatusCalls();
      controller.setForeground(true);
      expect(getStatusCalls()).toBe(beforeForeground + 1);

      controller.setOffline(true);
      expect(controller.state.connection).toBe('offline');
      controller.dispose();
    } finally {
      jest.useRealTimers();
    }
  });

  it('stream que fecha logo após abrir (sem erro) não reconecta em laço: polling + espera', async () => {
    jest.useFakeTimers();
    try {
      const { client, opened } = streamingClient();
      const { controller } = setup({ client });
      await controller.start();
      controller.retainInterest();
      opened[0]!.onOpen();
      opened[0]!.onClose(false);
      await flush();
      expect(opened).toHaveLength(1);
      expect(controller.state.connection).toBe('polling');
      jest.advanceTimersByTime(3_000);
      await flush();
      expect(opened).toHaveLength(2);
      controller.dispose();
    } finally {
      jest.useRealTimers();
    }
  });

  it('eventos do canal atualizam o estado (queue.status e queue.sync)', async () => {
    const { client, opened } = streamingClient();
    const { controller } = setup({ client });
    await controller.start();
    controller.retainInterest();
    const status = await client.getStatus();
    opened[0]!.onEvent({ type: 'queue.status', status });
    opened[0]!.onEvent({ type: 'queue.sync', sync: { status: 'open', sync: { status: 'unavailable', lastSuccessfulSyncAt: status.serverTime, snapshotAgeSeconds: 40, pollIntervalSeconds: 10 } } });
    expect(controller.state.status?.queue.sync.status).toBe('unavailable');
    controller.dispose();
  });
});

describe('QueueController — ações e push', () => {
  it('permissão só quando o aluno pede; com permissão o aparelho é registrado no backend', async () => {
    const base = createMockQueueClient({ stepMs: 60_000 });
    const registered: string[] = [];
    const client: QueueClient = { ...base, registerPushToken: async (token) => void registered.push(token) };
    const push = fakePush('undetermined');
    const { controller } = setup({ client, push });
    await controller.start();
    await controller.subscribe('0029');
    expect(push.requested).toBe(0);
    expect(registered).toEqual([]);
    expect(await controller.requestNotifications()).toBe('granted');
    expect(registered).toEqual(['ExponentPushToken[device-token-123]']);
    expect(controller.state.push).toMatchObject({ permission: 'granted', registered: true });
    controller.dispose();
  });

  it('permissão já concedida: registra o token assim que há uma senha ativa', async () => {
    const base = createMockQueueClient({ stepMs: 60_000 });
    const registered: string[] = [];
    const client: QueueClient = { ...base, registerPushToken: async (token) => void registered.push(token) };
    const { controller } = setup({ client, push: fakePush('granted') });
    await controller.start();
    await controller.subscribe('0029');
    await flush();
    expect(registered).toHaveLength(1);
    controller.dispose();
  });

  it('erros do cadastro chegam como mensagem amigável; preferências voltam se o servidor recusar', async () => {
    const base = createMockQueueClient({ stepMs: 60_000 });
    const client: QueueClient = {
      ...base,
      subscribe: async () => {
        throw new ApiClientError({ kind: 'validation', message: 'Dados inválidos.', details: [{ field: 'ticket', message: 'Digite uma senha válida.' }] });
      },
    };
    const { controller } = setup({ client });
    await controller.start();
    expect(await controller.subscribe('x')).toEqual({ ok: false, message: 'Digite uma senha válida.' });

    const okClient = createMockQueueClient({ stepMs: 60_000 });
    const failing: QueueClient = { ...okClient, updatePreferences: async () => Promise.reject(new ApiClientError({ kind: 'network', message: 'x' })) };
    const second = setup({ client: failing });
    await second.controller.start();
    await second.controller.subscribe('0029');
    const result = await second.controller.updatePreferences({ voiceEnabled: false });
    expect(result.ok).toBe(false);
    expect(second.controller.state.status?.subscription?.preferences.voiceEnabled).toBe(true);
    controller.dispose();
    second.controller.dispose();
  });
});
