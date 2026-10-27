import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/createApp.js';
import { createLogger } from '../../src/config/logger.js';
import type { AssistantResponse, QueueHealth, QueueStatus, QueueSubscription } from '../../src/contracts/mobileApi.v1.js';
import { createNotificationsModule } from '../../src/notifications/module.js';
import { MemoryPushProvider } from '../../src/notifications/pushProviders.js';
import { createQueueModule } from '../../src/queue/module.js';
import { MockQueueProvider, type MockScenario } from '../../src/queue/providers/mockProvider.js';
import { buildFixtureData, FIXED_NOW, USERS } from '../support/fixtures.js';
import { createInMemoryRepositories } from '../support/inMemoryRepositories.js';
import { bearer, buildTestConfig, loginAs } from '../support/testApp.js';

const TZ = 'America/Sao_Paulo';
const TOKEN = 'ExponentPushToken[queue-test-device-0001]';

async function setup(options: { scenario?: MockScenario; subscriptionRateLimit?: number; enabled?: boolean } = {}) {
  const base = buildTestConfig({ now: FIXED_NOW });
  const config = { ...base, queue: { ...base.queue, enabled: options.enabled ?? true, subscriptionRateLimit: options.subscriptionRateLimit ?? base.queue.subscriptionRateLimit } };
  const logger = createLogger('silent');
  const push = new MemoryPushProvider();
  const notifications = createNotificationsModule({ config, logger, provider: push, now: FIXED_NOW });
  const mock = new MockQueueProvider({ scenario: options.scenario ?? '5_ahead', timeZone: TZ, now: FIXED_NOW });
  const queue = createQueueModule({ config, logger, notifications: notifications.service, provider: mock, now: FIXED_NOW });
  const app = createApp({ config, repos: createInMemoryRepositories(buildFixtureData()), logger, notifications, queue, now: FIXED_NOW });
  if (config.queue.enabled) await queue.monitor.pollOnce();
  const session = await loginAs(app, USERS.student1.email);
  const auth = bearer(session.accessToken);
  return { app, queue, push, mock, auth, session };
}

const data = <T>(response: request.Response) => response.body.data as T;

describe('API da fila presencial', () => {
  it('exige autenticação', async () => {
    const { app } = await setup();
    expect((await request(app).get('/api/queue/status')).status).toBe(401);
    expect((await request(app).post('/api/queue/subscriptions').send({ ticket: '0029' })).status).toBe(401);
  });

  it('GET /api/queue: senha atual, chamadas por mesa e próximas senhas (zeros preservados)', async () => {
    const { app, auth } = await setup();
    const overview = data<QueueStatus['queue']>(await request(app).get('/api/queue').set(auth));
    expect(overview.status).toBe('open');
    expect(overview.latestCall).toMatchObject({ ticket: '0023', desk: 'Mesa 03' });
    expect(overview.currentCalls.map((call) => `${call.ticket} ${call.desk}`)).toEqual(['0023 Mesa 03', '0022 Mesa 01']);
    expect(overview.upcoming[0]).toEqual({ ticket: '0024', position: 1 });
    expect(overview.sync).toMatchObject({ status: 'live', pollIntervalSeconds: 10 });
  });

  it('acompanhar senha: validação amigável e corpo estrito (sem userId)', async () => {
    const { app, auth } = await setup();
    const invalid = await request(app).post('/api/queue/subscriptions').set(auth).send({ ticket: 'abc!' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details).toEqual([{ field: 'ticket', message: 'Digite uma senha válida.' }]);
    const withUser = await request(app).post('/api/queue/subscriptions').set(auth).send({ ticket: '0029', userId: USERS.student2.id });
    expect(withUser.status).toBe(400);
  });

  it('cadastro mostra a posição real na hora; "29" vira "0029" como no painel; outro aluno não vê o vínculo', async () => {
    const { app, auth, push } = await setup();
    const created = await request(app).post('/api/queue/subscriptions').set(auth).send({ ticket: '29', voiceEnabled: false });
    expect(created.status).toBe(201);
    const status = data<QueueStatus>(created);
    expect(status.subscription).toMatchObject({
      ticket: '0029',
      status: 'approaching',
      position: 6,
      ahead: 5,
      positionKnown: true,
      lastAlert: 'QUEUE_5_AHEAD',
      preferences: { pushEnabled: true, voiceEnabled: false, vibrationEnabled: true },
    });
    expect(status.subscription?.timeline.map((entry) => entry.type)).toEqual(['subscribed', 'QUEUE_5_AHEAD']);
    expect(status.subscription?.estimate).toMatchObject({ minMinutes: 10, maxMinutes: 25 });
    expect(push.sent).toEqual([]);

    const other = await loginAs(app, USERS.student2.email);
    expect(data<QueueStatus>(await request(app).get('/api/queue/status').set(bearer(other.accessToken))).subscription).toBeNull();
  });

  it('preferências, encerramento e nova senha substituindo a anterior', async () => {
    const { app, auth } = await setup();
    await request(app).post('/api/queue/subscriptions').set(auth).send({ ticket: '0029' });
    const patched = await request(app).patch('/api/queue/subscriptions/current').set(auth).send({ pushEnabled: false });
    expect(data<QueueSubscription>(patched).preferences.pushEnabled).toBe(false);
    expect((await request(app).patch('/api/queue/subscriptions/current').set(auth).send({})).status).toBe(400);

    const replaced = data<QueueStatus>(await request(app).post('/api/queue/subscriptions').set(auth).send({ ticket: '0031' }));
    expect(replaced.subscription).toMatchObject({ ticket: '0031', ahead: 7, status: 'waiting' });

    expect((await request(app).delete('/api/queue/subscriptions/current').set(auth)).status).toBe(204);
    expect(data(await request(app).get('/api/queue/subscriptions/current').set(auth))).toBeNull();
    expect((await request(app).patch('/api/queue/subscriptions/current').set(auth).send({ pushEnabled: true })).status).toBe(404);
  });

  it('limite de cadastros por usuário (429)', async () => {
    const { app, auth } = await setup({ subscriptionRateLimit: 2 });
    for (const ticket of ['0029', '0030']) expect((await request(app).post('/api/queue/subscriptions').set(auth).send({ ticket })).status).toBe(201);
    const limited = await request(app).post('/api/queue/subscriptions').set(auth).send({ ticket: '0031' });
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('progressão simulada até a chamada: push "É a sua vez!" com deep link, uma única vez', async () => {
    const { app, auth, queue, push, mock } = await setup({ scenario: 'next' });
    expect((await request(app).post('/api/notifications/push-token').set(auth).send({ token: TOKEN, platform: 'android' })).status).toBe(204);
    await request(app).post('/api/queue/subscriptions').set(auth).send({ ticket: '0029' });
    mock.setScenario('called');
    await queue.monitor.pollOnce();
    await vi.waitFor(() => expect(push.sent.map((message) => message.title)).toEqual(['É a sua vez!']));
    await queue.monitor.pollOnce();
    await queue.monitor.pollOnce();
    const status = data<QueueStatus>(await request(app).get('/api/queue/status').set(auth));
    expect(status.subscription).toMatchObject({ status: 'called', calledDesk: 'Mesa 03', lastAlert: 'QUEUE_CALLED' });
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]?.data).toMatchObject({ url: 'asaconecta://atendimento/fila', screen: 'queue' });
  });

  it('simulação existe só com provider mock fora de produção', async () => {
    const { app, auth } = await setup();
    const advanced = await request(app).post('/api/queue/dev/mock').set(auth).send({ advance: true });
    expect(data<{ scenario: string }>(advanced).scenario).toBe('progression');
    expect((await request(app).post('/api/queue/dev/mock').set(auth).send({ scenario: 'inexistente' })).status).toBe(400);
  });

  it('push token: formato do Expo validado; remoção pelo próprio usuário', async () => {
    const { app, auth } = await setup();
    expect((await request(app).post('/api/notifications/push-token').set(auth).send({ token: 'abc', platform: 'android' })).status).toBe(400);
    expect((await request(app).post('/api/notifications/push-token').set(auth).send({ token: TOKEN, platform: 'symbian' })).status).toBe(400);
    expect((await request(app).post('/api/notifications/push-token').set(auth).send({ token: TOKEN, platform: 'ios' })).status).toBe(204);
    expect((await request(app).delete('/api/notifications/push-token').set(auth).send({ token: TOKEN })).status).toBe(204);
  });

  it('fonte indisponível: mantém o último estado e informa "unavailable"; /health/queue reflete', async () => {
    const { app, auth, queue, mock } = await setup();
    let health = data<QueueHealth>(await request(app).get('/health/queue'));
    expect(health).toMatchObject({ status: 'healthy', provider: 'mock', consecutiveFailures: 0, circuit: 'closed' });
    expect(health.metrics.queue_fetch_success_total).toBe(1);

    mock.setScenario('offline');
    await queue.monitor.pollOnce();
    const overview = data<QueueStatus['queue']>(await request(app).get('/api/queue').set(auth));
    expect(overview.latestCall?.ticket).toBe('0023');
    expect(overview.sync.status).toBe('unavailable');
    health = data<QueueHealth>(await request(app).get('/health/queue'));
    expect(health).toMatchObject({ status: 'degraded', consecutiveFailures: 1 });
  });

  it('desabilitada por configuração: cadastro responde 503 sem quebrar o app', async () => {
    const { app, auth } = await setup({ enabled: false });
    const response = await request(app).post('/api/queue/subscriptions').set(auth).send({ ticket: '0029' });
    expect(response.status).toBe(503);
    expect(response.body.error.reason).toBe('queue_disabled');
    expect(data<QueueStatus>(await request(app).get('/api/queue/status').set(auth)).queue.sync.status).toBe('disabled');
    expect(data<QueueHealth>(await request(app).get('/health/queue')).status).toBe('disabled');
  });

  it('SSE: o app aberto recebe o estado completo assim que conecta', async () => {
    const { app, auth } = await setup();
    await request(app).post('/api/queue/subscriptions').set(auth).send({ ticket: '0029' });
    const server = app.listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const controller = new AbortController();
      const response = await fetch(`http://127.0.0.1:${port}/api/queue/stream`, { headers: auth, signal: controller.signal });
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      const reader = response.body!.getReader();
      let text = '';
      while (!text.includes('event: queue.status')) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += new TextDecoder().decode(chunk.value);
      }
      while (!/event: queue\.status\ndata: .*\n\n/.test(text)) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += new TextDecoder().decode(chunk.value);
      }
      controller.abort();
      const payload = JSON.parse(/event: queue\.status\ndata: (.*)\n/.exec(text)![1]!) as QueueStatus;
      expect(payload.subscription?.ticket).toBe('0029');
      expect(text).toContain('retry: 5000');
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});

describe('ASA IA — perguntas sobre a fila', () => {
  const ask = async (ctx: Awaited<ReturnType<typeof setup>>, text: string, extra: Record<string, unknown> = {}) =>
    data<AssistantResponse>(await request(ctx.app).post('/api/assistant/message').set(ctx.auth).send({ inputType: 'voice', text, ...extra }));

  it('"quantas pessoas faltam para mim?" responde com a posição real', async () => {
    const ctx = await setup();
    const before = await ask(ctx, 'ASA, quantas pessoas faltam para mim?');
    expect(before.intent).toBe('get_queue_status');
    expect(before.display.message).toContain('Você ainda não está acompanhando nenhuma senha');
    expect(before.nextActions).toContainEqual({ type: 'navigate', label: 'Acompanhar minha senha', target: 'queue' });

    await request(ctx.app).post('/api/queue/subscriptions').set(ctx.auth).send({ ticket: '0029' });
    const after = await ask(ctx, 'ASA, quantas pessoas faltam para mim?');
    expect(after.display.message).toBe('Existem 5 atendimentos antes da sua senha.');
    expect(after.speech.text).toBe('Existem cinco atendimentos antes da sua senha.');
  });

  it('"qual senha está sendo atendida?" usa os dados reais mais recentes, com a mesa', async () => {
    const ctx = await setup();
    const response = await ask(ctx, 'Qual senha está sendo atendida?');
    expect(response.intent).toBe('get_queue_current_call');
    expect(response.speech.text).toBe('A senha 0023 está entre as últimas chamadas e foi direcionada para a Mesa 03. Na Mesa 01, a última chamada foi a 0022.');
  });

  it('"quanto tempo falta?" com senha acompanhada: estimativa aproximada; sem dados, diz que não consegue', async () => {
    const ctx = await setup();
    await request(ctx.app).post('/api/queue/subscriptions').set(ctx.auth).send({ ticket: '0029' });
    const estimate = await ask(ctx, 'Quanto tempo falta?');
    expect(estimate.intent).toBe('get_queue_estimate');
    expect(estimate.speech.text).toContain('A estimativa atual é de aproximadamente 10 a 25 minutos.');

    ctx.mock.setScenario('offline');
    await ctx.queue.monitor.pollOnce();
    const noEstimate = await ask(ctx, 'Quanto tempo falta pra minha vez?');
    expect(noEstimate.intent).toBe('get_queue_estimate');
    expect(noEstimate.display.message).toContain('Não consigo estimar o tempo com segurança agora, mas posso acompanhar sua posição na fila.');
  });

  it('"quanto tempo falta?" sem senha acompanhada continua sendo pergunta acadêmica; "abre a fila" navega', async () => {
    const ctx = await setup();
    expect((await ask(ctx, 'Quanto tempo falta?')).intent).not.toMatch(/^get_queue/);
    const open = await ask(ctx, 'Abre a fila do ASA');
    expect(open.intent).toBe('open_screen');
    expect(open.navigation).toEqual({ target: 'queue' });
    expect((await ask(ctx, 'E quantas faltam?', { currentScreen: 'queue' })).intent).toBe('get_queue_status');
  });

  it('chamada: o assistente anuncia a mesa; sem mesa não inventa', async () => {
    const ctx = await setup({ scenario: 'next' });
    await request(ctx.app).post('/api/queue/subscriptions').set(ctx.auth).send({ ticket: '0029' });
    ctx.mock.setScenario('called');
    await ctx.queue.monitor.pollOnce();
    await vi.waitFor(async () => expect((await ask(ctx, 'Já é a minha vez?')).display.message).toBe('Chegou a sua vez! Sua senha 0029 foi chamada na Mesa 03.'));
  });
});
