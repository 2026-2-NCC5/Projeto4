import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStubAgentServer, type StubHandle } from '../support/agentStubServer.js';
import { prepareDatabase, TEST_DATABASE_URL, type DatabaseHandle } from '../support/database.js';
import { bearer, createTestApp, loginAs } from '../support/testApp.js';
import { DEMO_PASSWORD } from '../support/fixtures.js';

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb('integração API ↔ PostgreSQL (migrations, seeds, persistência do agente)', () => {
  let db: DatabaseHandle;
  let stub: StubHandle;

  beforeAll(async () => {
    db = await prepareDatabase();
    stub = await createStubAgentServer({ mode: 'ok' }).listen();
  });

  afterAll(async () => {
    await stub?.close();
    await db?.close();
  });

  it('migrations constroem o schema do zero e seeds são idempotentes', async () => {
    const { rows } = await db.pool.query<{ name: string }>('select name from schema_migrations order by name');
    expect(rows.map((row) => row.name)).toEqual(['001_init_schema.sql', '002_assistant_interactions.sql', '003_auth_recovery_biometrics.sql']);
    const { runSeeds } = await import('../../src/db/seed.js');
    await runSeeds(db.pool, () => undefined); // segunda execução não duplica
    const students = await db.pool.query<{ count: number }>('select count(*)::int as count from students');
    expect(students.rows[0]?.count).toBe(8);
    const plain = await db.pool.query<{ count: number }>("select count(*)::int as count from users where password_hash not like '$2%'");
    expect(plain.rows[0]?.count).toBe(0); // nenhuma senha em texto puro
  });

  it('login com usuário sintético do seed e leitura dos dados acadêmicos reais', async () => {
    const { app } = createTestApp({ repos: db.repos, agentServiceUrl: stub.url });
    const session = await loginAs(app, 'estudante.exemplo@demo.asa', DEMO_PASSWORD);
    expect(session.student?.id).toBe('student-demo-001');
    const summary = await request(app).get('/api/student/summary').set(bearer(session.accessToken));
    expect(summary.status).toBe(200);
    expect(summary.body.data).toMatchObject({ subjectsCount: 2, pendingCount: 1 });
    const attendance = await request(app).get('/api/student/attendance').set(bearer(session.accessToken));
    expect(attendance.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ subjectId: 'subject-demo-001', totalClasses: 10, attendedClasses: 9, attendanceRate: 0.9 })]),
    );
    const pending = await request(app).get('/api/student/pending-items').set(bearer(session.accessToken));
    expect(pending.body.data[0]).toMatchObject({ id: 'pending-demo-001', subjectName: 'Banco de Dados', status: 'pending' });
  });

  it('análise persiste agent_runs, agent_recommendations e agent_evidence com rastreabilidade', async () => {
    const { app } = createTestApp({ repos: db.repos, agentServiceUrl: stub.url });
    const session = await loginAs(app, 'estudante.exemplo@demo.asa', DEMO_PASSWORD);
    const response = await request(app).post('/api/agent/analyze').set(bearer(session.accessToken)).set('x-correlation-id', 'corr-integration-001').send({});
    expect(response.status).toBe(201);
    const runId = response.body.data.runId as string;

    const run = await db.pool.query('select * from agent_runs where run_id = $1', [runId]);
    expect(run.rows[0]).toMatchObject({ student_id: 'student-demo-001', correlation_id: 'corr-integration-001', status: 'recommendation', abstained: false, contract_version: '1.0' });
    expect(run.rows[0].request_id).toMatch(/^req-/);
    const recs = await db.pool.query('select * from agent_recommendations where run_id = $1', [runId]);
    expect(recs.rows).toHaveLength(1);
    const evidence = await db.pool.query('select * from agent_evidence where recommendation_id = $1 order by position', [recs.rows[0].id]);
    expect(evidence.rows[0]).toMatchObject({ position: 1, description: 'Foi identificada uma atividade pendente.' });

    const history = await request(app).get('/api/agent/history').set(bearer(session.accessToken));
    expect(history.body.data[0]).toMatchObject({ runId, correlationId: 'corr-integration-001', recommendationsCount: 1 });
    const detail = await request(app).get(`/api/agent/history/${runId}`).set(bearer(session.accessToken));
    expect(detail.body.data.recommendations[0].evidence).toEqual(['Foi identificada uma atividade pendente.']);
  });

  it('refresh sessions são persistidas, rotacionadas e revogadas no banco', async () => {
    const { app } = createTestApp({ repos: db.repos, agentServiceUrl: stub.url });
    const session = await loginAs(app, 'estudante.regular@demo.asa', DEMO_PASSWORD);
    const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(refreshed.status).toBe(200);
    const logout = await request(app).post('/api/auth/logout').set(bearer(refreshed.body.data.accessToken)).send({ refreshToken: refreshed.body.data.refreshToken });
    expect(logout.status).toBe(204);
    const { rows } = await db.pool.query<{ total: number; revoked: number }>(
      `select count(*)::int as total, count(revoked_at)::int as revoked from refresh_sessions rs join users u on u.id = rs.user_id where u.email = 'estudante.regular@demo.asa'`,
    );
    expect(rows[0]).toEqual({ total: 2, revoked: 2 });
    const plain = await db.pool.query<{ count: number }>('select count(*)::int as count from refresh_sessions where length(token_hash) <> 64');
    expect(plain.rows[0]?.count).toBe(0); // somente hashes sha256
  });

  it('assistente: consulta com dados reais do seed e metadados persistidos sem texto', async () => {
    const { app } = createTestApp({ repos: db.repos, agentServiceUrl: stub.url });
    const session = await loginAs(app, 'estudante.exemplo@demo.asa', DEMO_PASSWORD);
    const response = await request(app)
      .post('/api/assistant/message')
      .set(bearer(session.accessToken))
      .set('x-correlation-id', 'corr-integration-assistant-001')
      .send({ inputType: 'voice', text: 'Tenho alguma atividade pendente?', clientMetrics: { speechRecognitionMs: 1200 } });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ intent: 'get_pending_items', status: 'success' });
    expect(response.body.data.display.items[0]).toMatchObject({ id: 'pending-demo-001', description: 'Banco de Dados' });

    const catalog = await request(app).post('/api/assistant/message').set(bearer(session.accessToken)).send({ inputType: 'text', text: 'Como estou em Estruturas de Dados?' });
    expect(catalog.body.data.status).toBe('not_found'); // catálogo real: disciplina existe, mas sem matrícula

    const { rows } = await db.pool.query('select * from assistant_interactions where correlation_id = $1', ['corr-integration-assistant-001']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ student_id: 'student-demo-001', input_type: 'voice', intent: 'get_pending_items', status: 'success', speech_recognition_ms: 1200 });
    const columns = await db.pool.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'assistant_interactions'");
    expect(columns.rows.map((row) => row.column_name)).not.toEqual(expect.arrayContaining(['text']));
    expect(JSON.stringify(rows)).not.toContain('pendente');
  });

  it('assistente: pedido administrativo não altera registros oficiais', async () => {
    const { app } = createTestApp({ repos: db.repos, agentServiceUrl: stub.url });
    const session = await loginAs(app, 'estudante.exemplo@demo.asa', DEMO_PASSWORD);
    const snapshot = async () =>
      (await db.pool.query("select (select count(*) from assessments)::int as a, (select sum(coalesce(score,0)) from assessments)::float as s, (select count(*) filter (where present) from attendance)::int as p, (select count(*) from enrollments)::int as e")).rows[0];
    const before = await snapshot();
    for (const text of ['Corrige minha nota.', 'Minha frequência está errada, você pode corrigir?', 'Cancela minha matrícula em Banco de Dados']) {
      const response = await request(app).post('/api/assistant/message').set(bearer(session.accessToken)).send({ inputType: 'voice', text });
      expect(response.body.data.status).toBe('human_validation');
    }
    expect(await snapshot()).toEqual(before);
  });

  it('isolamento entre estudantes com dados reais (403)', async () => {
    const { app } = createTestApp({ repos: db.repos, agentServiceUrl: stub.url });
    const owner = await loginAs(app, 'estudante.exemplo@demo.asa', DEMO_PASSWORD);
    const analyze = await request(app).post('/api/agent/analyze').set(bearer(owner.accessToken)).send({});
    const other = await loginAs(app, 'estudante.regular@demo.asa', DEMO_PASSWORD);
    const forbidden = await request(app).get(`/api/agent/history/${analyze.body.data.runId}`).set(bearer(other.accessToken));
    expect(forbidden.status).toBe(403);
  });
});
