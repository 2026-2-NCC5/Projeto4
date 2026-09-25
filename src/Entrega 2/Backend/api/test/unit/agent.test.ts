import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStubAgentServer, type StubHandle } from '../support/agentStubServer.js';
import { bearer, createTestApp, loginAs } from '../support/testApp.js';
import { USERS } from '../support/fixtures.js';

describe('fluxo do agente (Node ↔ Agent Service simulado)', () => {
  let stub: StubHandle;

  beforeAll(async () => {
    stub = await createStubAgentServer({ mode: 'ok', delayMs: 3000 }).listen();
  });

  afterAll(async () => {
    await stub.close();
  });

  it('POST /api/agent/analyze monta o contexto, preserva correlation_id, valida e persiste o resultado', async () => {
    stub.setMode('ok');
    const { app, repos } = createTestApp({ agentServiceUrl: stub.url });
    const session = await loginAs(app);
    const response = await request(app)
      .post('/api/agent/analyze')
      .set(bearer(session.accessToken))
      .set('x-correlation-id', 'corr-e2e-test-001')
      .send({});
    expect(response.status).toBe(201);
    const analysis = response.body.data;
    expect(analysis.runId).toMatch(/^run-/);
    expect(analysis.status).toBe('recommendation');
    expect(analysis.correlationId).toBe('corr-e2e-test-001');
    expect(analysis.recommendations[0]).toMatchObject({
      type: 'pending_activity',
      evidence: ['Foi identificada uma atividade pendente.'],
      nextAction: 'Consultar os detalhes da atividade.',
      requiresHumanValidation: false,
    });
    expect(response.headers['x-correlation-id']).toBe('corr-e2e-test-001');

    // contrato enviado ao Agent Service
    const sent = stub.requests.at(-1)!;
    expect(sent.headers['x-correlation-id']).toBe('corr-e2e-test-001');
    const body = sent.body as { contract_version: string; student_id: string; correlation_id: string; request_id: string; academic_context: { subjects: unknown[]; pending_items: unknown[]; attendance: unknown[]; assessments: unknown[] } };
    expect(body.contract_version).toBe('1.0');
    expect(body.student_id).toBe('student-demo-001');
    expect(body.correlation_id).toBe('corr-e2e-test-001');
    expect(body.request_id).toMatch(/^req-/);
    expect(body.academic_context.subjects).toHaveLength(2);
    expect(body.academic_context.pending_items).toHaveLength(1);
    expect(body.academic_context.attendance).toHaveLength(2);
    expect(body.academic_context.assessments).toHaveLength(3);

    // persistência
    const latest = await repos.agentRuns.findLatestByStudent('student-demo-001');
    expect(latest?.runId).toBe(analysis.runId);
    expect(latest?.recommendations[0]?.evidence[0]?.description).toBe('Foi identificada uma atividade pendente.');

    // leitura posterior
    const latestResponse = await request(app).get('/api/agent/recommendations').set(bearer(session.accessToken));
    expect(latestResponse.body.data.runId).toBe(analysis.runId);
    const detail = await request(app).get(`/api/agent/recommendations/${analysis.recommendations[0].id}`).set(bearer(session.accessToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.runId).toBe(analysis.runId);
    const history = await request(app).get('/api/agent/history').set(bearer(session.accessToken));
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0]).toMatchObject({ runId: analysis.runId, recommendationsCount: 1 });
    const summary = await request(app).get('/api/student/summary').set(bearer(session.accessToken));
    expect(summary.body.data.lastAnalysis.runId).toBe(analysis.runId);
    expect(summary.body.data.attentionCount).toBe(1);
  });

  it('rejeita student_id enviado pelo cliente (identidade vem da sessão)', async () => {
    const { app } = createTestApp({ agentServiceUrl: stub.url });
    const session = await loginAs(app);
    const response = await request(app).post('/api/agent/analyze').set(bearer(session.accessToken)).send({ student_id: 'student-demo-002' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('isolamento: estudante não acessa recomendação/análise de outro estudante (403)', async () => {
    stub.setMode('ok');
    const { app } = createTestApp({ agentServiceUrl: stub.url });
    const owner = await loginAs(app, USERS.student1.email);
    const analyze = await request(app).post('/api/agent/analyze').set(bearer(owner.accessToken)).send({});
    const recId = analyze.body.data.recommendations[0].id as string;
    const runId = analyze.body.data.runId as string;

    const other = await loginAs(app, USERS.student2.email);
    const rec = await request(app).get(`/api/agent/recommendations/${recId}`).set(bearer(other.accessToken));
    expect(rec.status).toBe(403);
    expect(rec.body.error.code).toBe('FORBIDDEN');
    const run = await request(app).get(`/api/agent/history/${runId}`).set(bearer(other.accessToken));
    expect(run.status).toBe(403);
    const latest = await request(app).get('/api/agent/recommendations').set(bearer(other.accessToken));
    expect(latest.status).toBe(200);
    expect(latest.body.data).toBeNull();
  });

  it('sem análise anterior, recommendations devolve null e history lista vazia (EMPTY)', async () => {
    const { app } = createTestApp({ agentServiceUrl: stub.url });
    const session = await loginAs(app, USERS.student2.email);
    const latest = await request(app).get('/api/agent/recommendations').set(bearer(session.accessToken));
    expect(latest.status).toBe(200);
    expect(latest.body.data).toBeNull();
    const history = await request(app).get('/api/agent/history').set(bearer(session.accessToken));
    expect(history.body.data).toEqual([]);
    const missing = await request(app).get('/api/agent/recommendations/rec-nao-existe').set(bearer(session.accessToken));
    expect(missing.status).toBe(404);
  });

  it('abstenção é persistida e devolvida como resultado válido (não erro)', async () => {
    stub.setMode('abstained');
    const { app } = createTestApp({ agentServiceUrl: stub.url });
    const session = await loginAs(app, USERS.student6.email);
    const response = await request(app).post('/api/agent/analyze').set(bearer(session.accessToken)).send({});
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ status: 'abstained', abstained: true, recommendations: [], abstentionReason: 'Dados insuficientes para realizar uma análise confiável.' });
  });

  it('validação humana é propagada ao mobile', async () => {
    stub.setMode('human_validation');
    const { app } = createTestApp({ agentServiceUrl: stub.url });
    const session = await loginAs(app);
    const response = await request(app).post('/api/agent/analyze').set(bearer(session.accessToken)).send({});
    expect(response.status).toBe(201);
    expect(response.body.data.requiresHumanValidation).toBe(true);
    expect(response.body.data.recommendations[0]).toMatchObject({ type: 'institutional_validation', requiresHumanValidation: true, nextAction: 'Entre em contato com a coordenação para validação.' });
  });

  it('falha de dependência (Agent Service indisponível) → 503 DEPENDENCY_ERROR, nada persistido', async () => {
    const { app, repos } = createTestApp({ agentServiceUrl: 'http://127.0.0.1:1' });
    const session = await loginAs(app);
    const response = await request(app).post('/api/agent/analyze').set(bearer(session.accessToken)).send({});
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DEPENDENCY_ERROR');
    expect(response.body.error.message).toBe('Não foi possível concluir a análise. Tente novamente.');
    expect(await repos.agentRuns.findLatestByStudent('student-demo-001')).toBeNull();
  });

  it('Agent Service com erro 500 → 503 DEPENDENCY_ERROR (nunca 200 com lista vazia)', async () => {
    stub.setMode('error');
    const { app } = createTestApp({ agentServiceUrl: stub.url });
    const session = await loginAs(app);
    const response = await request(app).post('/api/agent/analyze').set(bearer(session.accessToken)).send({});
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DEPENDENCY_ERROR');
  });

  it('timeout do Agent Service → 504 TIMEOUT dentro do limite configurado', async () => {
    stub.setMode('slow');
    const { app } = createTestApp({ agentServiceUrl: stub.url, agentTimeoutMs: 200 });
    const session = await loginAs(app);
    const startedAt = Date.now();
    const response = await request(app).post('/api/agent/analyze').set(bearer(session.accessToken)).send({});
    expect(Date.now() - startedAt).toBeLessThan(2500);
    expect(response.status).toBe(504);
    expect(response.body.error.code).toBe('TIMEOUT');
    expect(response.body.error.message).toBe('A análise está demorando mais que o esperado. Tente novamente.');
  });

  it('contrato incompatível (2.0) → 502 CONTRACT_ERROR e nada persistido', async () => {
    stub.setMode('incompatible');
    const { app, repos } = createTestApp({ agentServiceUrl: stub.url });
    const session = await loginAs(app);
    const response = await request(app).post('/api/agent/analyze').set(bearer(session.accessToken)).send({});
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('CONTRACT_ERROR');
    expect(response.body.error.details[0]).toEqual({ field: 'contract_version', message: 'esperado 1.x' });
    expect(await repos.agentRuns.findLatestByStudent('student-demo-001')).toBeNull();
  });

  it('resposta 1.x fora do schema também é rejeitada (campos ausentes não são preenchidos)', async () => {
    stub.setMode('invalid_schema');
    const { app } = createTestApp({ agentServiceUrl: stub.url });
    const session = await loginAs(app);
    const response = await request(app).post('/api/agent/analyze').set(bearer(session.accessToken)).send({});
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('CONTRACT_ERROR');
  });

  it('exige autenticação', async () => {
    const { app } = createTestApp({ agentServiceUrl: stub.url });
    const response = await request(app).post('/api/agent/analyze').send({});
    expect(response.status).toBe(401);
  });
});
