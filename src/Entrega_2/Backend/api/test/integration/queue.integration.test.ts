import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgDeliveryRepository, PgPushDeviceRepository } from '../../src/notifications/repository.js';
import { createLogger } from '../../src/config/logger.js';
import { PgLeaseLeaderLock } from '../../src/queue/leaderLock.js';
import { createQueueModule } from '../../src/queue/module.js';
import type { NotificationService } from '../../src/notifications/notificationService.js';
import { buildTestConfig } from '../support/testApp.js';
import { PgQueueRepository } from '../../src/queue/pgRepository.js';
import { buildSnapshot } from '../../src/queue/snapshot.js';
import { endOfLocalDay } from '../../src/queue/time.js';
import { prepareDatabase, TEST_DATABASE_URL, type DatabaseHandle } from '../support/database.js';

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;
const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-10-06T23:20:00.000Z');

describeDb('integração fila presencial ↔ PostgreSQL', () => {
  let db: DatabaseHandle;
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    db = await prepareDatabase();
    const { rows } = await db.pool.query<{ id: string }>("select id from users where role = 'student' order by email limit 2");
    userId = rows[0]!.id;
    otherUserId = rows[1]!.id;
  });

  afterAll(async () => {
    await db?.close();
  });

  const input = (ticket: string, user = userId) => ({
    userId: user,
    ticket,
    ticketKey: ticket.replace(/^0+/, ''),
    serviceDate: '2026-10-06',
    expiresAt: endOfLocalDay('2026-10-06', TZ),
    preferences: { pushEnabled: true, voiceEnabled: false, vibrationEnabled: true },
    now: NOW,
  });

  it('acompanhamento: um ativo por aluno, avaliação, marcos com compare-and-set e linha do tempo idempotente', async () => {
    const repo = new PgQueueRepository(db.pool);
    const first = await repo.createSubscription(input('0028'));
    expect(first.subscription).toMatchObject({ ticket: '0028', status: 'waiting', serviceDate: '2026-10-06', voiceEnabled: false, lastAlert: null });
    expect(first.replaced).toBeNull();

    const second = await repo.createSubscription(input('0029'));
    expect(second.replaced).toMatchObject({ id: first.subscription.id, status: 'cancelled' });
    const id = second.subscription.id;
    expect((await repo.findCurrent(userId, '2026-10-06'))?.id).toBe(id);
    expect((await repo.listActive()).map((sub) => sub.id)).toEqual([id]);

    await repo.applyEvaluation(id, { status: 'approaching', position: 4, ahead: 3, calledDesk: null, calledAt: null, callSourceId: null, alreadyCalled: false, endedAt: null, now: NOW });
    expect(await repo.advanceAlert(id, null, 'QUEUE_3_AHEAD', NOW)).toBe(true);
    // outra instância com a visão antiga não consegue avançar de novo
    expect(await repo.advanceAlert(id, null, 'QUEUE_3_AHEAD', NOW)).toBe(false);
    expect(await repo.advanceAlert(id, 'QUEUE_3_AHEAD', 'QUEUE_CALLED', NOW)).toBe(true);

    expect(await repo.addTimelineEvent({ subscriptionId: id, type: 'QUEUE_CALLED', ahead: null, desk: 'Mesa 03', occurredAt: NOW })).toBe(true);
    expect(await repo.addTimelineEvent({ subscriptionId: id, type: 'QUEUE_CALLED', ahead: null, desk: 'Mesa 03', occurredAt: NOW })).toBe(false);
    expect((await repo.listTimeline(id)).map((event) => event.type)).toEqual(['QUEUE_CALLED']);

    const updated = await repo.updatePreferences(userId, '2026-10-06', { pushEnabled: false }, NOW);
    expect(updated).toMatchObject({ pushEnabled: false, voiceEnabled: false, status: 'approaching', ahead: 3, lastAlert: 'QUEUE_CALLED' });

    // o vínculo é do próprio aluno: outro usuário não vê
    expect(await repo.findCurrent(otherUserId, '2026-10-06')).toBeNull();
    expect((await repo.cancelActive(userId, NOW))?.status).toBe('cancelled');
    expect(await repo.listActive()).toEqual([]);
  });

  it('histórico de chamadas idempotente e estado do monitor compartilhado (jsonb)', async () => {
    const repo = new PgQueueRepository(db.pool);
    const call = { callKey: 'src-0026', serviceDate: '2026-10-06', ticket: '0026', desk: 'Mesa 03', calledAt: new Date('2026-10-06T23:23:19Z'), observedAt: NOW };
    expect(await repo.recordCalls([call, { ...call, callKey: 'src-0025', ticket: '0025' }])).toBe(2);
    expect(await repo.recordCalls([call])).toBe(0);

    const snapshot = buildSnapshot({
      provider: 'test',
      calls: [{ ticket: '0026', desk: 'Mesa 03', calledAt: '2026-10-06T23:23:19.000Z', serviceStatus: 'in_service', sourceId: 'src-0026' }],
      upcoming: [{ ticket: '0027', position: 1, sourceId: null }],
      upcomingComplete: true,
      callsTotal: 27,
      now: NOW,
      timeZone: TZ,
    });
    await repo.saveState({ snapshot, lastSuccessAt: NOW, lastError: null, consecutiveFailures: 0, updatedAt: NOW });
    await repo.saveState({ snapshot, lastSuccessAt: NOW, lastError: 'network: x', consecutiveFailures: 2, updatedAt: NOW });
    const state = await repo.loadState();
    expect(state).toMatchObject({ lastError: 'network: x', consecutiveFailures: 2 });
    expect(state?.snapshot?.calls[0]?.ticket).toBe('0026');
    expect(state?.snapshot?.upcoming[0]).toEqual({ ticket: '0027', position: 1, sourceId: null });
  });

  it('liderança: concessão no banco — uma instância por vez, renovação pela dona, expiração e liberação', async () => {
    const logger = createLogger('silent');
    const name = 'asa_conecta.queue_monitor.test';
    const a = new PgLeaseLeaderLock(db.pool, logger, { name, ttlMs: 60_000, holder: 'a' });
    const b = new PgLeaseLeaderLock(db.pool, logger, { name, ttlMs: 60_000, holder: 'b' });
    expect(await a.acquire()).toBe(true);
    expect(a.held).toBe(true);
    expect(await a.acquire()).toBe(true); // renovação
    expect(await b.acquire()).toBe(false);
    expect(b.held).toBe(false);
    await a.release();
    expect(a.held).toBe(false);
    expect(await b.acquire()).toBe(true);

    // concessão vencida (dona sumiu sem liberar): outra instância assume sem esperar ninguém
    await db.pool.query("update job_leases set lease_until = now() - interval '1 second' where name = $1", [name]);
    expect(await a.acquire()).toBe(true);
    expect(await b.acquire()).toBe(false);
    await a.release();
    const { rows } = await db.pool.query<{ holder: string }>('select holder from job_leases where name = $1', [name]);
    expect(rows).toEqual([{ holder: 'a' }]);
  });

  it('modo sob demanda: duas instâncias sem laço — uma consulta a fonte, a outra segue o banco', async () => {
    const logger = createLogger('silent');
    await db.pool.query("delete from job_leases where name = 'asa_conecta.queue_monitor'");
    await db.pool.query('delete from queue_monitor_state');
    let clock = new Date();
    const now = () => clock;
    let fetches = 0;
    const provider = {
      name: 'fake',
      async getCurrentQueue() {
        fetches += 1;
        return buildSnapshot({ provider: 'fake', calls: [{ ticket: String(fetches).padStart(4, '0'), desk: 'Mesa 01', calledAt: now().toISOString(), serviceStatus: 'in_service' as const, sourceId: `f-${fetches}` }], upcoming: [], upcomingComplete: true, callsTotal: 1, now: now(), timeZone: TZ });
      },
    };
    const base = buildTestConfig();
    const config = { ...base, queue: { ...base.queue, enabled: true, pollIntervalSeconds: 10 } };
    const notifications = { sendToUser: async () => ({ status: 'skipped' as const, devices: 0 }) } as unknown as NotificationService;
    const make = () => createQueueModule({ config, logger, pool: db.pool, notifications, provider, mode: 'on-demand', now });
    const first = make();
    const second = make();
    await first.service.refresh();
    expect(fetches).toBe(1);
    expect(first.service.overview().latestCall?.ticket).toBe('0001');
    // a outra instância não consulta a fonte: o intervalo não venceu e a concessão é da primeira
    await second.service.refresh();
    expect(fetches).toBe(1);
    expect(second.service.overview().latestCall?.ticket).toBe('0001');
    // vencido o intervalo, uma consulta só (a concessão da primeira também venceu)
    clock = new Date(clock.getTime() + 11_000);
    await Promise.all([first.service.refresh(), second.service.refresh()]);
    expect(fetches).toBe(2);
    await first.stop();
    await second.stop();
  });

  it('push: token por aparelho (troca de usuário), desativação e registro de entrega com idempotência', async () => {
    const devices = new PgPushDeviceRepository(db.pool);
    const deliveries = new PgDeliveryRepository(db.pool);
    const token = 'ExponentPushToken[integration-0001]';
    await devices.upsert({ userId: otherUserId, token, platform: 'ios', now: NOW });
    await devices.upsert({ userId, token, platform: 'android', now: NOW });
    expect(await devices.listActiveByUser(otherUserId)).toEqual([]);
    expect(await devices.listActiveByUser(userId)).toMatchObject([{ token, platform: 'android' }]);
    expect(await devices.disableForUser(otherUserId, token, NOW)).toBe(false);
    await devices.disable(token, 'DeviceNotRegistered', NOW);
    expect(await devices.listActiveByUser(userId)).toEqual([]);

    expect(await deliveries.begin({ userId, idempotencyKey: 'queue:x:QUEUE_CALLED', category: 'queue', now: NOW })).toBe(true);
    expect(await deliveries.begin({ userId, idempotencyKey: 'queue:x:QUEUE_CALLED', category: 'queue', now: NOW })).toBe(false);
    await deliveries.finish('queue:x:QUEUE_CALLED', { status: 'sent', attempts: 1, devices: 1, ticketIds: ['t-1'], error: null, now: NOW });
    const { rows } = await db.pool.query<{ status: string; provider_ticket_ids: string[] }>("select status, provider_ticket_ids from notification_deliveries where idempotency_key = 'queue:x:QUEUE_CALLED'");
    expect(rows[0]).toEqual({ status: 'sent', provider_ticket_ids: ['t-1'] });
  });
});
