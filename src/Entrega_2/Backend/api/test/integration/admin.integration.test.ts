import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { automationEngineOf } from '../../src/createApp.js';
import { addBusinessDays } from '../../src/support/sla.js';
import { prepareDatabase, TEST_DATABASE_URL, type DatabaseHandle } from '../support/database.js';
import { DEMO_PASSWORD } from '../support/fixtures.js';
import { bearer, createTestApp, loginAs } from '../support/testApp.js';

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

const ADMIN = 'admin.plataforma@demo.asa';
const STAFF = 'atendente.asa@demo.asa';
const STUDENT = 'estudante.exemplo@demo.asa';
const RULE_ENROLLMENT = 'b0000000-0000-4000-8000-000000000001';
const RULE_OVERDUE = 'b0000000-0000-4000-8000-000000000003';
const TZ = 'America/Sao_Paulo';

describeDb('integração administração ↔ PostgreSQL (contas, SLA, automações, saúde)', () => {
  let db: DatabaseHandle;

  beforeAll(async () => {
    db = await prepareDatabase();
  });

  afterAll(async () => {
    await db?.close();
  });

  it('saúde: migrations em dia (inclui 009) e serviços com estado explícito', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const admin = await loginAs(app, ADMIN, DEMO_PASSWORD);
    const response = await request(app).get('/api/admin/health').set(bearer(admin.accessToken));
    expect(response.status).toBe(200);
    expect(response.body.data.database.migrations.pending).toEqual([]);
    expect(response.body.data.database.migrations.applied).toContain('009_sla_automations.sql');
    expect(response.body.data.database.status).toBe('up');
    expect(response.body.data.agentService.status).toBe('down');
  });

  it('visão geral e chamados da administração: números do banco e nenhum conteúdo de chamado', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const admin = await loginAs(app, ADMIN, DEMO_PASSWORD);
    const overview = await request(app).get('/api/admin/overview').set(bearer(admin.accessToken));
    expect(overview.status).toBe(200);
    const { rows: counts } = await db.pool.query<{ students: number; staff: number; open: number }>(
      `select (select count(*) from users where role = 'student' and is_active)::int as students,
              (select count(*) from users where role = 'institutional_staff' and is_active)::int as staff,
              (select count(*) from support_tickets where status not in ('resolved','closed','cancelled'))::int as open`,
    );
    expect(overview.body.data.users).toMatchObject({ students: counts[0]!.students, staff: counts[0]!.staff });
    expect(overview.body.data.tickets.open).toBe(counts[0]!.open);
    expect(overview.body.data.source.dataMode).toBe('demo');

    const tickets = await request(app).get('/api/admin/tickets?pageSize=50').set(bearer(admin.accessToken));
    expect(tickets.status).toBe(200);
    const { rows: total } = await db.pool.query<{ total: number }>('select count(*)::int as total from support_tickets');
    expect(tickets.body.data.total).toBe(total[0]!.total);
    for (const item of tickets.body.data.items as Array<Record<string, unknown>>) {
      expect(Object.keys(item).sort()).toEqual(['categoryId', 'categoryLabel', 'channel', 'createdAt', 'id', 'priority', 'protocol', 'sla', 'status', 'team', 'updatedAt']);
    }
    const body = JSON.stringify(tickets.body);
    const { rows: subjects } = await db.pool.query<{ subject: string }>('select subject from support_tickets limit 5');
    for (const row of subjects) expect(body).not.toContain(row.subject);
    // a equipe não usa a rota da administração, e a administração não lê a fila com conteúdo
    const staff = await loginAs(app, STAFF, DEMO_PASSWORD);
    expect((await request(app).get('/api/admin/tickets').set(bearer(staff.accessToken))).status).toBe(403);
    expect((await request(app).get('/api/support/staff/tickets').set(bearer(admin.accessToken))).status).toBe(403);
  });

  it('convite grava quem convidou e quando, conta não é demo e a auditoria registra a ação', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const admin = await loginAs(app, ADMIN, DEMO_PASSWORD);
    const response = await request(app)
      .post('/api/admin/users')
      .set(bearer(admin.accessToken))
      .send({ fullName: 'Pessoa Convidada', email: 'pessoa.convidada@fecap.br', role: 'institutional_staff' });
    expect(response.status).toBe(201);
    expect(typeof response.body.data.invitation.sent).toBe('boolean');
    const { rows } = await db.pool.query<{ invited_by: string; invited_at: Date | null; is_demo: boolean; role: string }>(
      'select invited_by, invited_at, is_demo, role from users where email = $1',
      ['pessoa.convidada@fecap.br'],
    );
    expect(rows[0]).toMatchObject({ invited_by: admin.user.id, is_demo: false, role: 'institutional_staff' });
    expect(rows[0]!.invited_at).not.toBeNull();
    const audit = await db.pool.query("select actor_role, resource_id, metadata from audit_events where action = 'user.invited' order by seq desc limit 1");
    expect(audit.rows[0]).toMatchObject({ actor_role: 'technical_admin', resource_id: response.body.data.user.id });
    expect(JSON.stringify(audit.rows[0])).not.toContain('pessoa.convidada');
    const again = await request(app)
      .post('/api/admin/users')
      .set(bearer(admin.accessToken))
      .send({ fullName: 'Pessoa Convidada', email: 'PESSOA.convidada@fecap.br', role: 'technical_admin' });
    expect(again.status).toBe(409);
  });

  it('mudança de papel encerra as sessões no banco (refresh revogado) e o acesso antigo para', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const admin = await loginAs(app, ADMIN, DEMO_PASSWORD);
    const staff = await loginAs(app, STAFF, DEMO_PASSWORD);
    const changed = await request(app).patch(`/api/admin/users/${staff.user.id}`).set(bearer(admin.accessToken)).send({ role: 'technical_admin' });
    expect(changed.status).toBe(200);
    const { rows } = await db.pool.query<{ open: number }>('select count(*)::int as open from refresh_sessions where user_id = $1 and revoked_at is null', [staff.user.id]);
    expect(rows[0]!.open).toBe(0);
    expect((await request(app).get('/api/auth/me').set(bearer(staff.accessToken))).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: staff.refreshToken })).status).toBe(401);
    const back = await request(app).patch(`/api/admin/users/${staff.user.id}`).set(bearer(admin.accessToken)).send({ role: 'institutional_staff' });
    expect(back.status).toBe(200);
  });

  it('meta de SLA da administração vale para o próximo chamado (dias úteis no fuso da instituição)', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const admin = await loginAs(app, ADMIN, DEMO_PASSWORD);
    const student = await loginAs(app, STUDENT, DEMO_PASSWORD);
    const update = await request(app).put('/api/admin/sla-policies/enrollment').set(bearer(admin.accessToken)).send({ firstResponseHours: 4, resolutionBusinessDays: 1 });
    expect(update.status).toBe(200);
    const enrollment = update.body.data.find((item: { categoryId: string }) => item.categoryId === 'enrollment');
    expect(enrollment).toMatchObject({ isDefault: false, resolutionBusinessDays: 1, defaultResolutionBusinessDays: 2, updatedBy: 'Administração (demonstração)' });

    const created = await request(app)
      .post('/api/support/tickets')
      .set(bearer(student.accessToken))
      .send({ clientRequestId: 'req-admin-sla-0001', categoryId: 'enrollment', subcategoryId: 'add_drop', subject: 'Inclusão de disciplina', description: 'Preciso incluir a disciplina de Banco de Dados ainda neste semestre.' });
    expect(created.status).toBe(201);
    const sla = created.body.data.sla as { targetBusinessDays: number; startedAt: string; dueAt: string };
    expect(sla.targetBusinessDays).toBe(1);
    expect(sla.dueAt).toBe(addBusinessDays(new Date(sla.startedAt), 1, TZ).toISOString());
    const { rows } = await db.pool.query<{ sla_target_business_days: number }>('select sla_target_business_days from support_tickets where id = $1', [created.body.data.id]);
    expect(rows[0]!.sla_target_business_days).toBe(1);
    await db.pool.query("delete from sla_policies where category_id = 'enrollment'");
  });

  it('primeira resposta no PostgreSQL: prazo gravado na abertura e indicador de métricas calculado pelo histórico', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const admin = await loginAs(app, ADMIN, DEMO_PASSWORD);
    const student = await loginAs(app, STUDENT, DEMO_PASSWORD);
    const staff = await loginAs(app, STAFF, DEMO_PASSWORD);
    await request(app).put('/api/admin/sla-policies/documents').set(bearer(admin.accessToken)).send({ firstResponseHours: 4, resolutionBusinessDays: 3 });
    const created = await request(app)
      .post('/api/support/tickets')
      .set(bearer(student.accessToken))
      .send({ clientRequestId: 'req-admin-first-0001', categoryId: 'documents', subcategoryId: 'transcript', subject: 'Histórico', description: 'Preciso do histórico escolar para o estágio, por favor.' });
    const id = created.body.data.id as string;
    const { rows } = await db.pool.query<{ created_at: Date; first_response_due_at: Date }>('select created_at, first_response_due_at from support_tickets where id = $1', [id]);
    expect(rows[0]!.first_response_due_at.getTime() - rows[0]!.created_at.getTime()).toBe(4 * 3_600_000);
    const reply = await request(app).post(`/api/support/staff/tickets/${id}/messages`).set(bearer(staff.accessToken)).send({ content: 'Recebemos e já estamos providenciando.' });
    expect(reply.status).toBe(201);
    const view = await request(app).get(`/api/support/staff/tickets/${id}`).set(bearer(staff.accessToken));
    expect(view.body.data.firstResponse.status).toBe('met');
    const today = new Date().toISOString().slice(0, 10);
    const metrics = await request(app).get(`/api/asa/metrics?from=${today}&to=${today}`).set(bearer(staff.accessToken));
    expect(metrics.body.data.kpis.firstResponseMeasured).toBeGreaterThanOrEqual(1);
    expect(metrics.body.data.kpis.firstResponseOnTime).toBeGreaterThan(0);
    await db.pool.query("delete from sla_policies where category_id = 'documents'");
  });

  it('automação na abertura: aviso para toda a equipe ativa, uma execução por chamado mesmo com disparos simultâneos', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const admin = await loginAs(app, ADMIN, DEMO_PASSWORD);
    const student = await loginAs(app, STUDENT, DEMO_PASSWORD);
    const list = await request(app).get('/api/admin/automations').set(bearer(admin.accessToken));
    expect(list.body.data.items).toHaveLength(3);
    expect(list.body.data.items.every((rule: { enabled: boolean }) => !rule.enabled)).toBe(true);
    expect((await request(app).patch(`/api/admin/automations/${RULE_ENROLLMENT}`).set(bearer(admin.accessToken)).send({ enabled: true })).status).toBe(200);

    const created = await request(app)
      .post('/api/support/tickets')
      .set(bearer(student.accessToken))
      .send({ clientRequestId: 'req-admin-auto-0001', categoryId: 'enrollment', subcategoryId: 'leave', subject: 'Trancamento', description: 'Gostaria de saber o prazo para trancar a matrícula neste semestre.' });
    expect(created.status).toBe(201);
    const ticketId = created.body.data.id as string;
    const dedupe = `automation:${RULE_ENROLLMENT}:${ticketId}:ticket_created`;
    const { rows: staffCount } = await db.pool.query<{ total: number }>("select count(*)::int as total from users where role = 'institutional_staff' and is_active");
    const notices = await db.pool.query<{ total: number }>('select count(*)::int as total from user_notifications where dedupe_key = $1', [dedupe]);
    expect(notices.rows[0]!.total).toBe(staffCount[0]!.total);

    // disparos concorrentes para o mesmo chamado: a restrição única garante uma execução só
    const engine = automationEngineOf(app)!;
    const ticket = await db.repos.support.findTicket(ticketId);
    await Promise.all([engine.onTicketCreated(ticket!), engine.onTicketCreated(ticket!), engine.onTicketCreated(ticket!)]);
    const runs = await db.pool.query<{ status: string }>('select status from automation_runs where rule_id = $1 and ticket_id = $2', [RULE_ENROLLMENT, ticketId]);
    expect(runs.rows).toEqual([{ status: 'applied' }]);
    const after = await db.pool.query<{ total: number }>('select count(*)::int as total from user_notifications where dedupe_key = $1', [dedupe]);
    expect(after.rows[0]!.total).toBe(staffCount[0]!.total);

    const history = await request(app).get(`/api/admin/automations/${RULE_ENROLLMENT}/runs`).set(bearer(admin.accessToken));
    expect(history.body.data[0]).toMatchObject({ status: 'applied', ticketProtocol: created.body.data.protocol });
    await request(app).patch(`/api/admin/automations/${RULE_ENROLLMENT}`).set(bearer(admin.accessToken)).send({ enabled: false });
  });

  it('varredura de prazo excedido eleva a prioridade como evento interno, uma vez por chamado (várias instâncias)', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const second = createTestApp({ repos: db.repos }).app;
    const admin = await loginAs(app, ADMIN, DEMO_PASSWORD);
    const student = await loginAs(app, STUDENT, DEMO_PASSWORD);
    expect((await request(app).patch(`/api/admin/automations/${RULE_OVERDUE}`).set(bearer(admin.accessToken)).send({ enabled: true })).status).toBe(200);
    const created = await request(app)
      .post('/api/support/tickets')
      .set(bearer(student.accessToken))
      .send({ clientRequestId: 'req-admin-late-0001', categoryId: 'enrollment', subcategoryId: 'transfer', subject: 'Transferência', description: 'Quero entender os documentos necessários para a transferência.' });
    const ticketId = created.body.data.id as string;
    await db.pool.query("update support_tickets set sla_started_at = now() - interval '5 days', sla_due_at = now() - interval '1 hour' where id = $1", [ticketId]);

    // duas instâncias da API varrendo ao mesmo tempo
    await Promise.all([automationEngineOf(app)!.scanSla(), automationEngineOf(second)!.scanSla()]);
    const { rows } = await db.pool.query<{ priority: string; version: number }>('select priority, version from support_tickets where id = $1', [ticketId]);
    expect(rows[0]!.priority).toBe('high');
    const runs = await db.pool.query('select status from automation_runs where rule_id = $1 and ticket_id = $2', [RULE_OVERDUE, ticketId]);
    expect(runs.rows).toEqual([{ status: 'applied' }]);
    const events = await db.pool.query<{ visibility: string; actor_type: string }>(
      "select visibility, actor_type from support_ticket_events where ticket_id = $1 and type = 'priority_changed'",
      [ticketId],
    );
    expect(events.rows).toEqual([{ visibility: 'internal', actor_type: 'system' }]);
    expect(await automationEngineOf(app)!.scanSla()).toBe(0);
    await request(app).patch(`/api/admin/automations/${RULE_OVERDUE}`).set(bearer(admin.accessToken)).send({ enabled: false });
  });

  it('fila: filtro "só prazo próximo" exclui excedidos (mesma regra do cartão do painel)', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const staff = await loginAs(app, STAFF, DEMO_PASSWORD);
    const near = await request(app).get('/api/support/staff/tickets?sla=near_deadline&limit=50').set(bearer(staff.accessToken));
    const atRisk = await request(app).get('/api/support/staff/tickets?sla=at_risk&limit=50').set(bearer(staff.accessToken));
    const overdue = await request(app).get('/api/support/staff/tickets?sla=overdue&limit=50').set(bearer(staff.accessToken));
    expect(near.status).toBe(200);
    expect(near.body.data.items.every((item: { sla: { status: string } }) => item.sla.status === 'near_deadline')).toBe(true);
    expect(near.body.data.items.length + overdue.body.data.items.length).toBe(atRisk.body.data.items.length);
    const dashboard = await request(app).get('/api/asa/dashboard').set(bearer(staff.accessToken));
    expect(dashboard.body.data.tickets.slaNearDeadline).toBe(near.body.data.items.length);
  });

  it('demonstração desligada na subida: sessões abertas de contas fictícias caem na hora', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const student = await loginAs(app, STUDENT, DEMO_PASSWORD);
    expect((await request(app).get('/api/auth/me').set(bearer(student.accessToken))).status).toBe(200);
    // o mesmo que server.ts faz quando DEMO_DATA_ENABLED=false
    expect(await db.repos.sessions.revokeAllForDemoUsers()).toBeGreaterThan(0);
    expect((await request(app).get('/api/auth/me').set(bearer(student.accessToken))).status).toBe(401);
  });

  it('nunca fica sem administração: duas pessoas desativando uma à outra ao mesmo tempo', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const { rows } = await db.pool.query<{ id: string }>(
      `insert into users (email, password_hash, full_name, role, is_active, is_demo)
       select 'admin.segunda@demo.asa', password_hash, 'Segunda Administração', 'technical_admin', true, true from users where email = $1
       returning id`,
      [ADMIN],
    );
    const secondId = rows[0]!.id;
    const first = await loginAs(app, ADMIN, DEMO_PASSWORD);
    const secondSession = await loginAs(app, 'admin.segunda@demo.asa', DEMO_PASSWORD);
    const [a, b] = await Promise.all([
      request(app).patch(`/api/admin/users/${secondId}`).set(bearer(first.accessToken)).send({ isActive: false }),
      request(app).patch(`/api/admin/users/${first.user.id}`).set(bearer(secondSession.accessToken)).send({ isActive: false }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(200);
    expect([401, 409]).toContain(statuses[1]);
    const active = await db.pool.query<{ total: number }>("select count(*)::int as total from users where role = 'technical_admin' and is_active");
    expect(active.rows[0]!.total).toBe(1);
    await db.pool.query("update users set is_active = true where role = 'technical_admin'");
  });
});
