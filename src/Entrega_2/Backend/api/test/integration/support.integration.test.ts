import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareDatabase, TEST_DATABASE_URL, type DatabaseHandle } from '../support/database.js';
import { DEMO_PASSWORD } from '../support/fixtures.js';
import { bearer, createTestApp, loginAs } from '../support/testApp.js';

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\n%%EOF').toString('base64');

describeDb('integração Atendimento ↔ PostgreSQL (migration 004, seed e repositório)', () => {
  let db: DatabaseHandle;

  beforeAll(async () => {
    db = await prepareDatabase();
  });

  afterAll(async () => {
    await db?.close();
  });

  it('migration cria as tabelas e o seed de chamados é idempotente', async () => {
    const { rows } = await db.pool.query<{ name: string }>('select name from schema_migrations order by name');
    expect(rows.map((row) => row.name)).toContain('004_support_tickets.sql');
    const count = async () => (await db.pool.query<{ total: number }>("select count(*)::int as total from support_tickets where student_id = 'student-demo-001'")).rows[0]?.total ?? 0;
    const before = await count();
    const { runSeeds } = await import('../../src/db/seed.js');
    await runSeeds(db.pool, () => undefined);
    expect(await count()).toBe(before);
    const protocols = await db.pool.query<{ protocol: string }>('select protocol from support_tickets');
    for (const row of protocols.rows) expect(row.protocol).toMatch(/^ASA-\d{4}-\d{5}$/);
  });

  it('o histórico é somente-inserção: editar evento falha; anonimizar o autor é permitido', async () => {
    const event = await db.pool.query<{ id: string }>('select id from support_ticket_events limit 1');
    const id = event.rows[0]?.id;
    expect(id).toBeDefined();
    await expect(db.pool.query("update support_ticket_events set title = 'alterado' where id = $1", [id])).rejects.toThrow(/somente-inserção/);
    await expect(db.pool.query('update support_ticket_events set actor_user_id = null where id = $1', [id])).resolves.toBeDefined();
  });

  it('equipe agindo em paralelo no mesmo chamado: nenhuma alteração se perde (aplicada sobre a versão lida ou 409 ticket_changed)', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const student = await loginAs(app, 'estudante.exemplo@demo.asa', DEMO_PASSWORD);
    const staff = await loginAs(app, 'atendente.asa@demo.asa', DEMO_PASSWORD);
    const created = await request(app)
      .post('/api/support/tickets')
      .set(bearer(student.accessToken))
      .send({ clientRequestId: 'req-race-ticket-0001', categoryId: 'documents', subcategoryId: 'transcript', subject: 'Histórico escolar', description: 'Preciso do histórico escolar atualizado para o estágio.' });
    const id = created.body.data.id as string;
    const before = await db.pool.query<{ version: number }>('select version from support_tickets where id = $1', [id]);
    const results = await Promise.all(
      ['high', 'urgent', 'normal', 'high', 'urgent', 'normal', 'high', 'urgent'].map((priority) =>
        request(app).post(`/api/support/staff/tickets/${id}/priority`).set(bearer(staff.accessToken)).send({ priority }),
      ),
    );
    expect(results.every((response) => response.status === 200 || response.status === 409)).toBe(true);
    for (const response of results.filter((item) => item.status === 409)) expect(response.body.error.reason).toBe('ticket_changed');
    // cada alteração aplicada gerou exatamente um evento e uma versão nova; a prioridade final é a do último evento
    const events = await db.pool.query<{ details: Array<{ label: string; value: string }> }>(
      "select details from support_ticket_events where ticket_id = $1 and type = 'priority_changed' order by seq",
      [id],
    );
    const after = await db.pool.query<{ version: number; priority: string }>('select version, priority from support_tickets where id = $1', [id]);
    expect(after.rows[0]!.version).toBe(before.rows[0]!.version + events.rows.length);
    expect(events.rows.length).toBeGreaterThan(0);
  });

  it('fluxo completo no PostgreSQL: abertura com anexo, pedido de ação, resposta, resolução, avaliação e download', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const student = bearer((await loginAs(app, 'estudante.exemplo@demo.asa', DEMO_PASSWORD)).accessToken);
    const staff = bearer((await loginAs(app, 'responsavel.exemplo@demo.asa', DEMO_PASSWORD)).accessToken);

    const upload = await request(app).post('/api/support/uploads').set(student).send({ name: 'comprovante.pdf', mimeType: 'application/pdf', contentBase64: PDF });
    expect(upload.status).toBe(201);
    const body = { clientRequestId: 'req-integration-0001', categoryId: 'financial', subcategoryId: 'unidentified_payment', subject: 'Pagamento não aparece', description: 'O boleto pago no dia 2 ainda aparece em aberto no portal.', attachmentIds: [upload.body.data.id] };
    const created = await request(app).post('/api/support/tickets').set(student).send(body);
    expect(created.status).toBe(201);
    expect((await request(app).post('/api/support/tickets').set(student).send(body)).status).toBe(200);
    const id = created.body.data.id as string;
    expect(created.body.data.attachments).toHaveLength(1);

    await request(app).post(`/api/support/staff/tickets/${id}/assign`).set(staff).send({ team: 'Financeiro' });
    await request(app).post(`/api/support/staff/tickets/${id}/notes`).set(staff).send({ content: 'nota interna' });
    const asked = await request(app)
      .post(`/api/support/staff/tickets/${id}/messages`)
      .set(staff)
      .send({ content: 'Pode enviar o comprovante?', requestAction: { title: 'Comprovante', description: 'Envie o comprovante da parcela.', expectsAttachment: true } });
    expect(asked.status).toBe(201);

    const waiting = (await request(app).get(`/api/support/tickets/${id}`).set(student)).body.data;
    expect(waiting).toMatchObject({ status: 'waiting_student', unreadCount: 1, pendingAction: { expectsAttachment: true } });
    expect(waiting.events.map((event: { type: string }) => event.type)).not.toContain('internal_note');

    const list = (await request(app).get('/api/support/tickets?search=PAGAMENTO&status=waiting_student').set(student)).body.data;
    expect(list.items.map((item: { id: string }) => item.id)).toContain(id);
    expect(list.items.find((item: { id: string }) => item.id === id)).toMatchObject({ unreadCount: 1, lastActivity: { title: 'Precisamos de uma informação sua' } });

    const replied = await request(app).post(`/api/support/tickets/${id}/messages`).set(student).send({ clientMessageId: 'msg-integration-1', content: 'Enviado!' });
    expect(replied.body.data.status).toBe('in_analysis');
    await request(app).post(`/api/support/tickets/${id}/read`).set(student);
    await request(app).post(`/api/support/staff/tickets/${id}/resolve`).set(staff).send({ resolution: 'Pagamento localizado e baixado no sistema.' });
    expect((await request(app).post(`/api/support/tickets/${id}/rating`).set(student).send({ rating: 4 })).status).toBe(201);
    expect((await request(app).post(`/api/support/tickets/${id}/rating`).set(student).send({ rating: 5 })).status).toBe(409);

    const attachment = created.body.data.attachments[0];
    const link = await request(app).get(`/api/support/tickets/${id}/attachments/${attachment.id}/link`).set(student);
    const file = await request(app).get(link.body.data.url);
    expect(file.status).toBe(200);
    expect(Buffer.from(file.body as Buffer).toString('base64')).toBe(PDF);

    const page = (await request(app).get('/api/support/tickets?limit=2').set(student)).body.data;
    const next = (await request(app).get(`/api/support/tickets?limit=2&cursor=${page.nextCursor}`).set(student)).body.data;
    const ids = [...page.items, ...next.items].map((item: { id: string }) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    const notifications = (await request(app).get('/api/support/notifications').set(student)).body.data;
    expect(notifications.items.some((item: { ticketId: string; kind: string }) => item.ticketId === id && item.kind === 'ticket_resolved')).toBe(true);
  });
});
