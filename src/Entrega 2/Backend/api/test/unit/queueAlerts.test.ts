import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/config/logger.js';
import { NotificationService } from '../../src/notifications/notificationService.js';
import { MemoryPushProvider } from '../../src/notifications/pushProviders.js';
import { MemoryDeliveryRepository, MemoryPushDeviceRepository } from '../../src/notifications/repository.js';
import { maskPushToken } from '../../src/notifications/types.js';
import { QueueAlertDispatcher } from '../../src/queue/alerts.js';
import { estimateWait } from '../../src/queue/estimate.js';
import { QueueEventBus, type QueueTicketEvent } from '../../src/queue/eventBus.js';
import { alertCopy } from '../../src/queue/messages.js';
import { QueueMetrics } from '../../src/queue/metrics.js';
import { MemoryQueueRepository } from '../../src/queue/repository.js';
import { buildSnapshot } from '../../src/queue/snapshot.js';
import { endOfLocalDay } from '../../src/queue/time.js';
import { QueueTracker } from '../../src/queue/tracker.js';
import type { QueueCall, QueueSnapshot } from '../../src/queue/types.js';

const TZ = 'America/Sao_Paulo';
const USER = '00000000-0000-4000-8000-000000000001';
const TOKEN = 'ExponentPushToken[abcdefghijklmnop]';
const silent = createLogger('silent');
/** 06/10/2026 20:20 em São Paulo */
const START = new Date('2026-10-06T23:20:00.000Z');

const pad = (n: number) => String(n).padStart(4, '0');

/** Fila com `lastCalled` chamada (duas mesas) e as seguintes aguardando. */
function queueAt(lastCalled: number, now: Date, options: { completed?: number[]; calledAt?: Date } = {}): QueueSnapshot {
  const calls: QueueCall[] = [];
  for (let n = lastCalled; n >= 20; n -= 1) {
    calls.push({
      ticket: pad(n),
      desk: n % 2 === 0 ? 'Mesa 01' : 'Mesa 03',
      calledAt: (n === lastCalled && options.calledAt ? options.calledAt : new Date(now.getTime() - (lastCalled - n) * 60_000)).toISOString(),
      serviceStatus: options.completed?.includes(n) ? 'completed' : 'in_service',
      sourceId: `src-${n}`,
    });
  }
  const upcoming = [];
  for (let n = lastCalled + 1, position = 1; n <= 40; n += 1, position += 1) upcoming.push({ ticket: pad(n), position, sourceId: null });
  return buildSnapshot({ provider: 'test', calls, upcoming, upcomingComplete: true, callsTotal: calls.length, now, timeZone: TZ });
}

function setup(options: { pushEnabled?: boolean; ticket?: string } = {}) {
  let now = START;
  const clock = () => now;
  const bus = new QueueEventBus(silent);
  const repository = new MemoryQueueRepository();
  const devices = new MemoryPushDeviceRepository();
  const deliveries = new MemoryDeliveryRepository();
  const push = new MemoryPushProvider();
  const notifications = new NotificationService({ devices, deliveries, provider: push, logger: silent, now: clock, sleep: async () => undefined });
  const metrics = new QueueMetrics();
  const tracker = new QueueTracker({ repository, bus, logger: silent, timeZone: TZ, now: clock });
  const dispatcher = new QueueAlertDispatcher({ bus, repository, notifications, metrics, logger: silent, timeZone: TZ });
  const events: QueueTicketEvent[] = [];
  const pending: Promise<void>[] = [];
  bus.on('queue.ticket', (event) => {
    events.push(event);
    if (event.notify && event.milestone) pending.push(dispatcher.dispatch(event));
  });
  const subscribe = async (snapshot: QueueSnapshot | null) => {
    const { subscription } = await repository.createSubscription({
      userId: USER,
      ticket: options.ticket ?? '0029',
      ticketKey: (options.ticket ?? '0029').replace(/^0+/, ''),
      serviceDate: '2026-10-06',
      expiresAt: endOfLocalDay('2026-10-06', TZ),
      preferences: { pushEnabled: options.pushEnabled ?? true, voiceEnabled: true, vibrationEnabled: true },
      now,
    });
    await tracker.evaluateOne(subscription, snapshot, { initial: true });
    await Promise.all(pending);
    return subscription.id;
  };
  const cycle = async (snapshot: QueueSnapshot) => {
    await tracker.evaluateAll(snapshot);
    await Promise.all(pending);
  };
  return {
    repository,
    push,
    devices,
    deliveries,
    notifications,
    metrics,
    events,
    subscribe,
    cycle,
    setNow: (value: Date) => {
      now = value;
    },
    now: () => now,
  };
}

const minutes = (base: Date, count: number) => new Date(base.getTime() + count * 60_000);

describe('alertas progressivos e idempotência (5 → 3 → próxima → chamada)', () => {
  it('cada marco gera exatamente um push; snapshots repetidos não duplicam', async () => {
    const ctx = setup();
    await ctx.devices.upsert({ userId: USER, token: TOKEN, platform: 'android', now: START });
    await ctx.subscribe(queueAt(20, START)); // 8 à frente: nenhum alerta

    const steps: Array<[number, string | null]> = [
      [21, null], // 7 à frente
      [23, 'Sua vez está chegando'], // 5 à frente
      [23, null], // mesmo snapshot
      [25, 'Fique por perto'], // 3 à frente
      [26, null], // 2 à frente: mesmo marco (3_AHEAD)
      [27, 'Prepare-se'], // 1 à frente
      [28, null], // próxima (0 à frente): mesmo marco (NEXT)
      [29, 'É a sua vez!'],
      [29, null],
      [29, null],
    ];
    for (const [index, [lastCalled]] of steps.entries()) {
      ctx.setNow(minutes(START, index + 1));
      await ctx.cycle(queueAt(lastCalled, ctx.now()));
    }
    expect(ctx.push.sent.map((message) => message.title)).toEqual(['Sua vez está chegando', 'Fique por perto', 'Prepare-se', 'É a sua vez!']);
    expect(ctx.push.sent[0]?.body).toBe('Há 5 senhas antes da sua (0029).');
    expect(ctx.push.sent[1]?.body).toBe('Faltam apenas 3 atendimentos para a senha 0029.');
    expect(ctx.push.sent[3]).toMatchObject({
      body: 'Sua senha 0029 foi chamada na Mesa 03.',
      channelId: 'queue-alerts',
      priority: 'high',
      sound: 'default',
      data: expect.objectContaining({ type: 'queue.ticket.called', url: 'asaconecta://atendimento/fila', screen: 'queue', desk: 'Mesa 03', ticket: '0029' }),
    });
    expect(ctx.metrics.queue_notifications_sent_total).toBe(4);
    const sub = (await ctx.repository.listActive())[0];
    expect(sub).toMatchObject({ status: 'called', calledDesk: 'Mesa 03', lastAlert: 'QUEUE_CALLED' });
    const timeline = await ctx.repository.listTimeline(sub!.id);
    expect(timeline.map((event) => event.type)).toEqual(['QUEUE_5_AHEAD', 'QUEUE_3_AHEAD', 'QUEUE_NEXT', 'QUEUE_CALLED']);
  });

  it('salto (7 à frente → 1 à frente) envia só o alerta mais urgente', async () => {
    const ctx = setup();
    await ctx.devices.upsert({ userId: USER, token: TOKEN, platform: 'ios', now: START });
    await ctx.subscribe(queueAt(21, START));
    ctx.setNow(minutes(START, 1));
    await ctx.cycle(queueAt(27, ctx.now()));
    ctx.setNow(minutes(START, 2));
    await ctx.cycle(queueAt(25, ctx.now())); // posição "voltou" (prioridade inserida): sem alerta antigo
    expect(ctx.push.sent.map((message) => message.title)).toEqual(['Prepare-se']);
  });

  it('cadastro já perto da vez: o aluno está olhando a tela, então não recebe push de proximidade', async () => {
    const ctx = setup();
    await ctx.devices.upsert({ userId: USER, token: TOKEN, platform: 'ios', now: START });
    await ctx.subscribe(queueAt(26, START)); // 2 à frente
    expect(ctx.push.sent).toEqual([]);
    expect((await ctx.repository.listActive())[0]?.lastAlert).toBe('QUEUE_3_AHEAD');
    ctx.setNow(minutes(START, 1));
    await ctx.cycle(queueAt(29, ctx.now()));
    expect(ctx.push.sent.map((message) => message.title)).toEqual(['É a sua vez!']);
  });

  it('senha chamada ANTES do cadastro: estado "chamada" sem alerta de "é a sua vez"', async () => {
    const ctx = setup();
    await ctx.devices.upsert({ userId: USER, token: TOKEN, platform: 'ios', now: START });
    await ctx.subscribe(queueAt(29, START, { calledAt: minutes(START, -15) }));
    const sub = (await ctx.repository.listActive())[0];
    expect(sub).toMatchObject({ status: 'called', alreadyCalled: true });
    expect(ctx.push.sent).toEqual([]);
    expect(ctx.events.find((event) => event.type === 'queue.ticket.called')?.notify).toBe(false);
  });

  it('chamada detectada com atraso (monitor sem acesso à fonte): push no passado, com horário', async () => {
    const ctx = setup();
    await ctx.devices.upsert({ userId: USER, token: TOKEN, platform: 'ios', now: START });
    await ctx.subscribe(queueAt(25, START));
    ctx.setNow(minutes(START, 30));
    await ctx.cycle(queueAt(29, ctx.now(), { calledAt: minutes(START, 12) }));
    expect(ctx.push.sent[0]).toMatchObject({ title: 'Sua senha foi chamada', body: 'A senha 0029 foi chamada às 20:32 na Mesa 03. Se ainda não foi atendido, procure a equipe do ASA.' });
  });

  it('push desativado na preferência: estado avança, nenhum push sai', async () => {
    const ctx = setup({ pushEnabled: false });
    await ctx.devices.upsert({ userId: USER, token: TOKEN, platform: 'ios', now: START });
    await ctx.subscribe(queueAt(20, START));
    ctx.setNow(minutes(START, 1));
    await ctx.cycle(queueAt(29, ctx.now()));
    expect(ctx.push.sent).toEqual([]);
    expect((await ctx.repository.listActive())[0]?.status).toBe('called');
  });

  it('"Concluído" na fonte só vira "atendimento finalizado" depois de um tempo em "chamada"', async () => {
    const ctx = setup();
    await ctx.subscribe(queueAt(28, START));
    ctx.setNow(minutes(START, 1));
    await ctx.cycle(queueAt(29, ctx.now(), { completed: [29] }));
    expect((await ctx.repository.listActive())[0]?.status).toBe('called');
    ctx.setNow(minutes(START, 4));
    await ctx.cycle(queueAt(30, ctx.now(), { completed: [29] }));
    expect(await ctx.repository.listActive()).toEqual([]);
    const sub = ctx.repository.subscriptions[0];
    expect(sub).toMatchObject({ status: 'completed' });
    expect(ctx.events.map((event) => event.type)).toContain('queue.ticket.completed');
  });

  it('virada do dia: senha antiga expira e não é mais monitorada', async () => {
    const ctx = setup();
    await ctx.subscribe(queueAt(20, START));
    ctx.setNow(new Date('2026-10-07T11:00:00.000Z'));
    await ctx.cycle(queueAt(29, ctx.now()));
    expect(await ctx.repository.listActive()).toEqual([]);
    expect(ctx.repository.subscriptions[0]?.status).toBe('expired');
    expect(ctx.push.sent).toEqual([]);
  });

  it('senha fora das listas mantém o último estado (sem regredir nem inventar posição)', async () => {
    const ctx = setup({ ticket: '0029' });
    await ctx.subscribe(queueAt(27, START));
    const missing = buildSnapshot({ provider: 'test', calls: queueAt(27, START).calls, upcoming: [], upcomingComplete: true, callsTotal: null, now: START, timeZone: TZ });
    await ctx.cycle(missing);
    expect((await ctx.repository.listActive())[0]).toMatchObject({ status: 'next', ahead: 1, position: 2 });
  });
});

describe('NotificationService', () => {
  function service() {
    const devices = new MemoryPushDeviceRepository();
    const deliveries = new MemoryDeliveryRepository();
    const push = new MemoryPushProvider();
    const sleeps: number[] = [];
    const notifications = new NotificationService({ devices, deliveries, provider: push, logger: silent, now: () => START, sleep: async (ms) => void sleeps.push(ms) });
    return { devices, deliveries, push, notifications, sleeps };
  }
  const request = { userId: USER, category: 'queue', idempotencyKey: 'queue:sub-1:QUEUE_CALLED', title: 'É a sua vez!', body: 'Sua senha 0029 foi chamada na Mesa 03.' };

  it('idempotência: a mesma chave nunca envia duas vezes', async () => {
    const ctx = service();
    await ctx.notifications.registerDevice(USER, TOKEN, 'android');
    expect((await ctx.notifications.sendToUser(request)).status).toBe('sent');
    expect((await ctx.notifications.sendToUser(request)).status).toBe('duplicate');
    expect(ctx.push.sent).toHaveLength(1);
    expect(ctx.deliveries.deliveries.get(request.idempotencyKey)).toMatchObject({ status: 'sent', attempts: 1, devices: 1 });
  });

  it('falha de transporte: tenta de novo com backoff e registra o resultado', async () => {
    const ctx = service();
    await ctx.notifications.registerDevice(USER, TOKEN, 'android');
    ctx.push.failNextSends = 2;
    expect((await ctx.notifications.sendToUser(request)).status).toBe('sent');
    expect(ctx.sleeps).toEqual([1000, 2000]);
    ctx.push.failNextSends = 5;
    const failed = await ctx.notifications.sendToUser({ ...request, idempotencyKey: 'outra' });
    expect(failed.status).toBe('failed');
    expect(ctx.deliveries.deliveries.get('outra')).toMatchObject({ status: 'failed', attempts: 3 });
    expect(ctx.notifications.metrics).toMatchObject({ sent: 1, failed: 1 });
  });

  it('DeviceNotRegistered desativa o token; sem aparelhos o envio é "skipped"', async () => {
    const ctx = service();
    await ctx.notifications.registerDevice(USER, TOKEN, 'android');
    ctx.push.unregistered.add(TOKEN);
    expect((await ctx.notifications.sendToUser(request)).status).toBe('failed');
    expect(await ctx.devices.listActiveByUser(USER)).toEqual([]);
    expect((await ctx.notifications.sendToUser({ ...request, idempotencyKey: 'k2' })).status).toBe('skipped');
  });

  it('token trocado de usuário no mesmo aparelho passa a ser do usuário atual', async () => {
    const ctx = service();
    await ctx.notifications.registerDevice('outro-usuario', TOKEN, 'ios');
    await ctx.notifications.registerDevice(USER, TOKEN, 'ios');
    expect(await ctx.devices.listActiveByUser('outro-usuario')).toEqual([]);
    expect(await ctx.devices.listActiveByUser(USER)).toHaveLength(1);
    expect(await ctx.notifications.unregisterDevice(USER, TOKEN)).toBe(true);
    expect(await ctx.devices.listActiveByUser(USER)).toEqual([]);
  });

  it('tokens nunca aparecem completos', () => {
    expect(maskPushToken(TOKEN)).toBe('ExponentPushToken[abcd…mnop]');
  });
});

describe('textos do push', () => {
  it('mesa só aparece quando a fonte informou', () => {
    const base = { ticket: '0029', ahead: null, calledAt: null, late: false, timeZone: TZ };
    expect(alertCopy({ ...base, milestone: 'QUEUE_CALLED', desk: 'Mesa 03' }).body).toBe('Sua senha 0029 foi chamada na Mesa 03.');
    expect(alertCopy({ ...base, milestone: 'QUEUE_CALLED', desk: null }).body).toBe('Sua senha 0029 foi chamada. Confira a mesa no painel do ASA.');
    expect(alertCopy({ ...base, milestone: 'QUEUE_NEXT', desk: null })).toEqual({ title: 'Prepare-se', body: 'A senha 0029 é uma das próximas a serem chamadas.' });
    expect(alertCopy({ ...base, milestone: 'QUEUE_3_AHEAD', desk: null, ahead: 1 }).body).toBe('Faltam apenas 1 atendimento para a senha 0029.');
  });
});

describe('estimativa de espera (throughput real da fila)', () => {
  const at = (hhmm: string, desk: string): QueueCall => ({
    ticket: 'x',
    desk,
    calledAt: new Date(`2026-10-06T${hhmm}:00-03:00`).toISOString(),
    serviceStatus: 'in_service',
    sourceId: null,
  });

  it('atendimento paralelo (Mesa 01 e Mesa 03) usa o ritmo global, não serial', () => {
    // 20:00 M1, 20:02 M3, 20:05 M1, 20:06 M3 → 3 intervalos em 6 min = 0,5 chamada/min
    const calls = [at('20:06', 'Mesa 03'), at('20:05', 'Mesa 01'), at('20:02', 'Mesa 03'), at('20:00', 'Mesa 01')];
    const estimate = estimateWait(calls, 3, new Date('2026-10-06T20:07:00-03:00'));
    // (3 à frente + a própria) / 0,5 = 8 min → faixa aproximada
    expect(estimate).toMatchObject({ minMinutes: 6, maxMinutes: 11, confidence: 'low', basedOnCalls: 4, activeDesks: 2 });
  });

  it('sem dados suficientes ou atendimento parado: sem estimativa (null), nunca inventada', () => {
    const few = [at('20:06', 'Mesa 03'), at('20:05', 'Mesa 01')];
    expect(estimateWait(few, 3, new Date('2026-10-06T20:07:00-03:00'))).toBeNull();
    const old = [at('19:06', 'Mesa 03'), at('19:05', 'Mesa 01'), at('19:02', 'Mesa 03'), at('19:00', 'Mesa 01')];
    expect(estimateWait(old, 3, new Date('2026-10-06T19:40:00-03:00'))).toBeNull();
    const burst = [at('20:00', 'Mesa 03'), at('20:00', 'Mesa 01'), at('20:01', 'Mesa 03'), at('20:01', 'Mesa 01')];
    expect(estimateWait(burst, 3, new Date('2026-10-06T20:02:00-03:00'))).toBeNull();
  });

  it('fila longa: faixa arredondada de 5 em 5 minutos', () => {
    const calls = Array.from({ length: 10 }, (_, index) => at(`20:${String(index * 4).padStart(2, '0')}`, index % 2 ? 'Mesa 01' : 'Mesa 03'));
    const estimate = estimateWait(calls, 5, new Date('2026-10-06T20:40:00-03:00'));
    // 9 intervalos em 36 min = 0,25/min → 24 min esperados
    expect(estimate).toMatchObject({ minMinutes: 15, maxMinutes: 35, confidence: 'medium' });
  });
});
