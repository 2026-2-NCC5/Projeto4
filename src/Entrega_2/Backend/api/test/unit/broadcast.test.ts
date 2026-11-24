import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/config/logger.js';
import { createNotificationsModule } from '../../src/notifications/module.js';
import { MemoryPushProvider } from '../../src/notifications/pushProviders.js';
import { DEMO_PASSWORD, USERS } from '../support/fixtures.js';
import { bearer, buildTestConfig, createTestApp, loginAs } from '../support/testApp.js';

const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbb]';

function appWithPush() {
  const config = buildTestConfig();
  const push = new MemoryPushProvider();
  const notifications = createNotificationsModule({ config, logger: createLogger('silent'), provider: push });
  return { ...createTestApp({ notifications }), push };
}

describe('avisos para todos os alunos e push de teste', () => {
  it('equipe envia aviso: central de todos os alunos + push para quem tem aparelho; repetição não duplica', async () => {
    const { app, push } = appWithPush();
    const student = await loginAs(app);
    const other = await loginAs(app, USERS.student2.email, DEMO_PASSWORD);
    expect((await request(app).post('/api/notifications/push-token').set(bearer(student.accessToken)).send({ token: TOKEN_A, platform: 'android' })).status).toBe(204);
    await request(app).post('/api/notifications/push-token').set(bearer(other.accessToken)).send({ token: TOKEN_B, platform: 'ios' });
    // o segundo aluno desligou os avisos da plataforma por push: recebe só na central
    await request(app).patch('/api/notifications/preferences').set(bearer(other.accessToken)).send({ items: [{ category: 'system', pushEnabled: false }] });

    const staff = await loginAs(app, USERS.staff.email, DEMO_PASSWORD);
    const aviso = { title: 'Rematrícula aberta', body: 'A rematrícula de 2027.1 está aberta no Portal do Aluno até 15/12.' };
    const sent = await request(app).post('/api/notifications/broadcast').set(bearer(staff.accessToken)).send(aviso);
    expect(sent.status).toBe(201);
    expect(sent.body.data.recipients).toBeGreaterThanOrEqual(2);
    expect(sent.body.data).toMatchObject({ pushSent: 1, pushEnabled: true });
    expect(push.sent.map((message) => [message.to, message.title])).toEqual([[TOKEN_A, 'Rematrícula aberta']]);

    const inbox = await request(app).get('/api/notifications').set(bearer(other.accessToken));
    expect(inbox.body.data.items.some((item: { title: string; category: string }) => item.title === 'Rematrícula aberta' && item.category === 'system')).toBe(true);

    const again = await request(app).post('/api/notifications/broadcast').set(bearer(staff.accessToken)).send(aviso);
    expect(again.body.data).toMatchObject({ recipients: 0, pushSent: 0 });
    expect(push.sent).toHaveLength(1);
  });

  it('aluno não envia aviso; texto vazio ou longo demais é recusado', async () => {
    const { app } = appWithPush();
    const student = await loginAs(app);
    expect((await request(app).post('/api/notifications/broadcast').set(bearer(student.accessToken)).send({ title: 'Oi pessoal', body: 'Teste de aviso' })).status).toBe(403);
    const staff = await loginAs(app, USERS.staff.email, DEMO_PASSWORD);
    expect((await request(app).post('/api/notifications/broadcast').set(bearer(staff.accessToken)).send({ title: 'x', body: 'y' })).status).toBe(400);
    expect((await request(app).post('/api/notifications/broadcast').set(bearer(staff.accessToken)).send({ title: 'Aviso', body: 'a'.repeat(241) })).status).toBe(400);
  });

  it('push de teste chega nos aparelhos da própria conta', async () => {
    const { app, push } = appWithPush();
    const student = await loginAs(app);
    const none = await request(app).post('/api/notifications/push-test').set(bearer(student.accessToken));
    expect(none.body.data).toMatchObject({ devices: 0 });
    await request(app).post('/api/notifications/push-token').set(bearer(student.accessToken)).send({ token: TOKEN_A, platform: 'android' });
    const test = await request(app).post('/api/notifications/push-test').set(bearer(student.accessToken));
    expect(test.status).toBe(200);
    expect(test.body.data).toMatchObject({ status: 'sent', devices: 1 });
    expect(push.sent[0]).toMatchObject({ to: TOKEN_A, title: 'Notificações do ASA ativadas' });
  });
});
