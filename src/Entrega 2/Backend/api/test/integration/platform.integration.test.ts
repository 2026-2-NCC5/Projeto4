import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareDatabase, TEST_DATABASE_URL, type DatabaseHandle } from '../support/database.js';
import { DEMO_PASSWORD } from '../support/fixtures.js';
import { bearer, createTestApp, loginAs } from '../support/testApp.js';
import { WebClient } from '../support/webClient.js';

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb('integração plataforma ↔ PostgreSQL (migration 006, sessões, auditoria e avisos)', () => {
  let db: DatabaseHandle;

  beforeAll(async () => {
    db = await prepareDatabase();
  });

  afterAll(async () => {
    await db?.close();
  });

  it('migration 006 + seed 004: contas demo marcadas, equipe e administração fictícias criadas', async () => {
    const { rows } = await db.pool.query<{ email: string; role: string; is_demo: boolean }>(
      "select email, role, is_demo from users where email in ('estudante.exemplo@demo.asa', 'atendente.asa@demo.asa', 'admin.plataforma@demo.asa') order by email",
    );
    expect(rows).toEqual([
      { email: 'admin.plataforma@demo.asa', role: 'technical_admin', is_demo: true },
      { email: 'atendente.asa@demo.asa', role: 'institutional_staff', is_demo: true },
      { email: 'estudante.exemplo@demo.asa', role: 'student', is_demo: true },
    ]);
    const notDemo = await db.pool.query("select count(*)::int as total from users where is_demo = false and email like '%@demo.asa'");
    expect(notDemo.rows[0].total).toBe(0);
  });

  it('auditoria é somente-inserção: editar ou apagar evento falha', async () => {
    await db.pool.query("insert into audit_events (action, metadata) values ('test.inserted', '{}')");
    await expect(db.pool.query("update audit_events set action = 'test.changed' where action = 'test.inserted'")).rejects.toThrow(/somente-inserção/);
    await expect(db.pool.query("delete from audit_events where action = 'test.inserted'")).rejects.toThrow(/somente-inserção/);
  });

  it('cenário cruzado: app abre o chamado → equipe responde pelo portal → app vê a resposta, nunca a nota interna', async () => {
    const { app } = createTestApp({ repos: db.repos });

    // 1. aluno no app (Bearer) e no portal (cookie): mesma conta, mesmo perfil
    const mobile = await loginAs(app, 'estudante.exemplo@demo.asa', DEMO_PASSWORD);
    const studentWeb = new WebClient(app);
    await studentWeb.login('estudante.exemplo@demo.asa');
    const meMobile = await request(app).get('/api/auth/me').set(bearer(mobile.accessToken));
    const meWeb = await studentWeb.get('/api/auth/me');
    expect(meWeb.body.data.user).toEqual(meMobile.body.data.user);
    expect(meWeb.body.data.student).toEqual(meMobile.body.data.student);
    expect(meMobile.body.data.session.channel).toBe('mobile');
    expect(meWeb.body.data.session.channel).toBe('web');

    // 2. chamado aberto pelo app
    const created = await request(app)
      .post('/api/support/tickets')
      .set(bearer(mobile.accessToken))
      .send({ clientRequestId: 'req-cross-0001', categoryId: 'documents', subcategoryId: 'transcript', subject: 'Histórico escolar assinado', description: 'Preciso do histórico escolar com assinatura para um processo seletivo.' });
    expect(created.status).toBe(201);
    const ticketId = created.body.data.id as string;
    const protocol = created.body.data.protocol as string;

    // 3. a equipe ASA vê o mesmo chamado (mesmo id e protocolo) no portal
    const staff = new WebClient(app);
    expect((await staff.login('atendente.asa@demo.asa')).status).toBe(200);
    const queue = await staff.get('/api/support/staff/tickets?status=received');
    const listed = queue.body.data.items.find((item: { id: string }) => item.id === ticketId);
    expect(listed).toMatchObject({ protocol, status: 'received' });

    // 4. atribui, registra nota interna, responde e muda a situação
    expect((await staff.send('post', `/api/support/staff/tickets/${ticketId}/assign`, { team: 'Secretaria Acadêmica' })).status).toBe(200);
    expect((await staff.send('post', `/api/support/staff/tickets/${ticketId}/notes`, { content: 'NOTA-INTERNA: conferir pendência financeira antes.' })).status).toBe(201);
    expect((await staff.send('post', `/api/support/staff/tickets/${ticketId}/messages`, { content: 'Seu histórico assinado fica pronto em 2 dias úteis.' })).status).toBe(201);
    expect((await staff.send('post', `/api/support/staff/tickets/${ticketId}/status`, { status: 'in_progress' })).status).toBe(200);

    // 5. o aluno vê no app a resposta e a situação, sem a nota interna
    const seen = await request(app).get(`/api/support/tickets/${ticketId}`).set(bearer(mobile.accessToken));
    expect(seen.status).toBe(200);
    expect(seen.body.data.status).toBe('in_progress');
    expect(seen.body.data.messages.map((message: { content: string }) => message.content)).toContain('Seu histórico assinado fica pronto em 2 dias úteis.');
    expect(JSON.stringify(seen.body.data)).not.toContain('NOTA-INTERNA');
    const webView = await studentWeb.get(`/api/support/tickets/${ticketId}`);
    expect(webView.body.data.status).toBe('in_progress');
    expect(JSON.stringify(webView.body.data)).not.toContain('NOTA-INTERNA');

    // 6. avisos persistidos aparecem na central dos dois canais; ler no portal reflete no app
    const inbox = await studentWeb.get('/api/notifications');
    expect(inbox.body.data.items.some((item: { resource: { id: string } | null }) => item.resource?.id === ticketId)).toBe(true);
    expect((await studentWeb.send('patch', '/api/notifications', { read: true })).body.data.unreadCount).toBe(0);
    expect((await request(app).get('/api/support/notifications').set(bearer(mobile.accessToken))).body.data.unreadCount).toBe(0);

    // 7. auditoria liga autor, canal e correlação sem segredos
    const { rows } = await db.pool.query<{ action: string; channel: string; metadata: Record<string, unknown> }>(
      "select action, channel, metadata from audit_events where action in ('auth.login', 'auth.login_failed') order by seq",
    );
    expect(rows.filter((row) => row.action === 'auth.login').map((row) => row.channel)).toEqual(expect.arrayContaining(['mobile', 'web']));
    expect(JSON.stringify(rows)).not.toMatch(/Demo@2026|@demo\.asa/);
  });

  it('sessões por família no PostgreSQL: rotação mantém o aparelho e encerrar corta o acesso na hora', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const web = new WebClient(app);
    await web.login('estudante.regular@demo.asa', DEMO_PASSWORD, true);
    const before = await web.get('/api/auth/sessions');
    const familyId = before.body.data.items.find((item: { current: boolean }) => item.current).id;
    await web.send('post', '/api/web/auth/refresh');
    const after = await web.get('/api/auth/sessions');
    expect(after.body.data.items.find((item: { current: boolean }) => item.current).id).toBe(familyId);
    const mobile = await loginAs(app, 'estudante.regular@demo.asa', DEMO_PASSWORD);
    const { rows } = await db.pool.query<{ families: number }>(
      "select count(distinct family_id)::int as families from refresh_sessions where user_id = (select id from users where email = 'estudante.regular@demo.asa') and revoked_at is null",
    );
    expect(rows[0]?.families).toBe(2);
    expect((await web.send('post', '/api/auth/logout-all')).status).toBe(204);
    expect((await request(app).get('/api/auth/me').set(bearer(mobile.accessToken))).status).toBe(401);
  });

  it('desligar o modo demonstração encerra sessões de contas fictícias', async () => {
    const mobile = await loginAs(createTestApp({ repos: db.repos }).app, 'estudante.multiplo@demo.asa', DEMO_PASSWORD);
    expect(await db.repos.sessions.revokeAllForDemoUsers()).toBeGreaterThan(0);
    const response = await request(createTestApp({ repos: db.repos }).app).get('/api/auth/me').set(bearer(mobile.accessToken));
    expect(response.status).toBe(401);
  });
});
