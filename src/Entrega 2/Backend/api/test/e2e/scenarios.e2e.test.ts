/**
 * Cenários E2E oficiais (TASK-004 §40-50): API real + PostgreSQL real +
 * Agent Service Python real (E2E-001/005/006) e stub controlado para
 * falhas (E2E-002/003/004). Exige DATABASE_URL; o Python é iniciado via
 * uvicorn a partir de src/Entrega 2/Backend/agent-service (ou E2E_AGENT_SERVICE_URL).
 *
 *   E2E_WRITE_EVIDENCE=1 npm run test:e2e   → grava documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/evidence/e2e/last-run.{md,json}
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_VERSION } from '../../src/app.js';
import { createStubAgentServer, type StubHandle } from '../support/agentStubServer.js';
import { startAgentService, type AgentServiceHandle } from '../support/agentServiceProcess.js';
import { prepareDatabase, TEST_DATABASE_URL, type DatabaseHandle } from '../support/database.js';
import { flushEvidence, recordEvidence } from '../support/evidence.js';
import { DEMO_PASSWORD } from '../support/fixtures.js';
import { bearer, createTestApp, loginAs } from '../support/testApp.js';

const describeE2E = TEST_DATABASE_URL ? describe : describe.skip;

describeE2E('E2E — fluxo ponta a ponta do ASA Conecta', () => {
  let db: DatabaseHandle;
  let agent: AgentServiceHandle;
  let stub: StubHandle;

  beforeAll(async () => {
    db = await prepareDatabase();
    agent = await startAgentService();
    stub = await createStubAgentServer({ mode: 'slow', delayMs: 5000 }).listen();
  });

  afterAll(async () => {
    flushEvidence({ agentServiceUrl: agent?.url ?? 'n/a', apiVersion: API_VERSION });
    await stub?.close();
    await agent?.stop();
    await db?.close();
  });

  async function analyze(email: string, correlationId: string, options: { agentServiceUrl: string; agentTimeoutMs?: number }) {
    const { app } = createTestApp({ repos: db.repos, agentServiceUrl: options.agentServiceUrl, agentTimeoutMs: options.agentTimeoutMs ?? 5000 });
    const session = await loginAs(app, email, DEMO_PASSWORD);
    const response = await request(app).post('/api/agent/analyze').set(bearer(session.accessToken)).set('x-correlation-id', correlationId).send({});
    return { app, session, response };
  }

  it('E2E-001 sucesso: login → contexto → Node → Python → Agent Engine → recomendação + evidência + próxima ação persistidas', async () => {
    const correlationId = 'corr-e2e-001';
    const { app, session, response } = await analyze('estudante.exemplo@demo.asa', correlationId, { agentServiceUrl: agent.url });
    const data = response.body.data;
    const passed = response.status === 201 && data.status === 'recommendation' && data.recommendations[0]?.type === 'pending_activity';
    recordEvidence({
      scenario: 'E2E-001', title: 'Sucesso (SCENARIO-002 atividade pendente)', student: 'student-demo-001', correlationId,
      requestId: response.body.meta?.requestId ?? null, runId: data?.runId ?? null, httpStatus: response.status,
      outcome: `${data?.status} · ${data?.recommendations?.length ?? 0} recomendação(ões)`, expected: 'recommendation · pending_activity', passed,
      details: { summary: data?.summary, recommendations: data?.recommendations, confidence: data?.confidence, agentVersion: data?.version, configVersion: data?.configVersion },
    });
    expect(response.status).toBe(201);
    expect(data.agent).toBe('student_agent');
    expect(data.correlationId).toBe(correlationId);
    expect(data.runId).toMatch(/^run-/);
    expect(data.status).toBe('recommendation');
    expect(data.abstained).toBe(false);
    expect(data.requiresHumanValidation).toBe(false);
    const rec = data.recommendations[0];
    expect(rec.type).toBe('pending_activity');
    expect(rec.evidence[0]).toBe('Foi identificada uma atividade pendente.');
    expect(rec.evidence.some((line: string) => line.includes('Banco de Dados'))).toBe(true);
    expect(rec.nextAction).toBe('Consultar os detalhes da atividade.');
    expect(rec.subjectId).toBe('subject-demo-002');

    // rastreabilidade: correlation_id no banco e consulta posterior
    const stored = await db.pool.query('select correlation_id, request_id, status from agent_runs where run_id = $1', [data.runId]);
    expect(stored.rows[0]).toMatchObject({ correlation_id: correlationId, status: 'recommendation' });
    const latest = await request(app).get('/api/agent/recommendations').set(bearer(session.accessToken));
    expect(latest.body.data.runId).toBe(data.runId);
    const subjects = await request(app).get('/api/student/subjects').set(bearer(session.accessToken));
    expect(subjects.body.data.find((s: { id: string }) => s.id === 'subject-demo-002').attention).toBe(true);
  });

  it('E2E-002 Agent Service indisponível → 503 DEPENDENCY_ERROR (nunca 200 com lista vazia)', async () => {
    const correlationId = 'corr-e2e-002';
    const { response } = await analyze('estudante.exemplo@demo.asa', correlationId, { agentServiceUrl: 'http://127.0.0.1:1' });
    const passed = response.status === 503 && response.body.error?.code === 'DEPENDENCY_ERROR';
    recordEvidence({
      scenario: 'E2E-002', title: 'Agent Service indisponível', student: 'student-demo-001', correlationId,
      requestId: response.body.error?.requestId ?? null, runId: null, httpStatus: response.status,
      outcome: response.body.error?.code ?? 'sem erro', expected: '503 DEPENDENCY_ERROR', passed, details: { error: response.body.error },
    });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DEPENDENCY_ERROR');
    expect(response.body.error.message).toBe('Não foi possível concluir a análise. Tente novamente.');
    expect(response.body.error.correlationId).toBe(correlationId);
    const runs = await db.pool.query('select count(*)::int as count from agent_runs where correlation_id = $1', [correlationId]);
    expect(runs.rows[0].count).toBe(0);
  });

  it('E2E-003 timeout do Agent Service → 504 TIMEOUT dentro do limite configurado', async () => {
    const correlationId = 'corr-e2e-003';
    stub.setMode('slow');
    const startedAt = Date.now();
    const { response } = await analyze('estudante.exemplo@demo.asa', correlationId, { agentServiceUrl: stub.url, agentTimeoutMs: 300 });
    const elapsed = Date.now() - startedAt;
    const passed = response.status === 504 && elapsed < 3000;
    recordEvidence({
      scenario: 'E2E-003', title: 'Timeout do Agent Service', student: 'student-demo-001', correlationId,
      requestId: response.body.error?.requestId ?? null, runId: null, httpStatus: response.status,
      outcome: `${response.body.error?.code} em ${elapsed}ms (timeout configurado 300ms)`, expected: '504 TIMEOUT', passed, details: { error: response.body.error, elapsedMs: elapsed },
    });
    expect(response.status).toBe(504);
    expect(response.body.error.code).toBe('TIMEOUT');
    expect(response.body.error.message).toBe('A análise está demorando mais que o esperado. Tente novamente.');
    expect(elapsed).toBeLessThan(3000);
  });

  it('E2E-004 contrato incompatível (provider 2.0) → 502 CONTRACT_ERROR, resposta rejeitada', async () => {
    const correlationId = 'corr-e2e-004';
    stub.setMode('incompatible');
    const { response } = await analyze('estudante.exemplo@demo.asa', correlationId, { agentServiceUrl: stub.url });
    const passed = response.status === 502 && response.body.error?.code === 'CONTRACT_ERROR';
    recordEvidence({
      scenario: 'E2E-004', title: 'Contrato incompatível (2.0)', student: 'student-demo-001', correlationId,
      requestId: response.body.error?.requestId ?? null, runId: null, httpStatus: response.status,
      outcome: response.body.error?.code ?? 'sem erro', expected: '502 CONTRACT_ERROR', passed, details: { error: response.body.error },
    });
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('CONTRACT_ERROR');
    expect(response.body.error.details[0].field).toBe('contract_version');
    const runs = await db.pool.query('select count(*)::int as count from agent_runs where correlation_id = $1', [correlationId]);
    expect(runs.rows[0].count).toBe(0);
  });

  it('E2E-005 dados insuficientes → abstenção persistida como resultado válido', async () => {
    const correlationId = 'corr-e2e-005';
    const { response } = await analyze('estudante.semdados@demo.asa', correlationId, { agentServiceUrl: agent.url });
    const data = response.body.data;
    const passed = response.status === 201 && data?.status === 'abstained' && data.abstained === true;
    recordEvidence({
      scenario: 'E2E-005', title: 'Abstenção (SCENARIO-006 dados insuficientes)', student: 'student-demo-006', correlationId,
      requestId: response.body.meta?.requestId ?? null, runId: data?.runId ?? null, httpStatus: response.status,
      outcome: `${data?.status} · ${data?.abstentionReason}`, expected: 'abstained', passed, details: { data },
    });
    expect(response.status).toBe(201);
    expect(data.status).toBe('abstained');
    expect(data.abstained).toBe(true);
    expect(data.recommendations).toEqual([]);
    expect(data.abstentionReason).toBe('Dados insuficientes para realizar uma análise confiável.');
    expect(data.requiresHumanValidation).toBe(false);
    const stored = await db.pool.query('select status, abstained, abstention_reason from agent_runs where run_id = $1', [data.runId]);
    expect(stored.rows[0]).toMatchObject({ status: 'abstained', abstained: true });
  });

  it('E2E-006 validação humana → requires_human_validation com próxima ação segura', async () => {
    const correlationId = 'corr-e2e-006';
    const { response } = await analyze('estudante.validacao@demo.asa', correlationId, { agentServiceUrl: agent.url });
    const data = response.body.data;
    const passed = response.status === 201 && data?.requiresHumanValidation === true;
    recordEvidence({
      scenario: 'E2E-006', title: 'Validação humana (SCENARIO-008 frequência abaixo do mínimo)', student: 'student-demo-008', correlationId,
      requestId: response.body.meta?.requestId ?? null, runId: data?.runId ?? null, httpStatus: response.status,
      outcome: `${data?.status} · human_validation=${data?.requiresHumanValidation}`, expected: 'recommendation · requires_human_validation=true', passed, details: { data },
    });
    expect(response.status).toBe(201);
    expect(data.status).toBe('recommendation');
    expect(data.requiresHumanValidation).toBe(true);
    const rec = data.recommendations[0];
    expect(rec.type).toBe('attendance_critical');
    expect(rec.requiresHumanValidation).toBe(true);
    expect(rec.nextAction).toBe('Procure a coordenação para validar sua situação de frequência.');
    expect(rec.evidence.length).toBeGreaterThanOrEqual(2);
  });

  it('E2E-007 cenários restantes do agente com dados reais do seed (001, 003, 004, 005, 007)', async () => {
    const expectations: Array<[string, string, string, string[]]> = [
      ['SCENARIO-001', 'estudante.regular@demo.asa', 'no_action', []],
      ['SCENARIO-003', 'estudante.frequencia@demo.asa', 'recommendation', ['attendance_attention']],
      ['SCENARIO-004', 'estudante.desempenho@demo.asa', 'recommendation', ['performance_attention']],
      ['SCENARIO-005', 'estudante.multiplo@demo.asa', 'recommendation', ['pending_activity', 'attendance_attention', 'performance_attention']],
      ['SCENARIO-007', 'estudante.inconsistente@demo.asa', 'recommendation', ['institutional_validation']],
    ];
    for (const [scenario, email, expectedStatus, expectedTypes] of expectations) {
      const correlationId = `corr-e2e-${scenario.toLowerCase()}`;
      const { response } = await analyze(email, correlationId, { agentServiceUrl: agent.url });
      const data = response.body.data;
      const types = (data?.recommendations ?? []).map((rec: { type: string }) => rec.type).sort();
      const passed = response.status === 201 && data.status === expectedStatus && JSON.stringify(types) === JSON.stringify([...expectedTypes].sort());
      recordEvidence({
        scenario, title: 'Cenário controlado do agente', student: email.split('@')[0] ?? email, correlationId,
        requestId: response.body.meta?.requestId ?? null, runId: data?.runId ?? null, httpStatus: response.status,
        outcome: `${data?.status} · [${types.join(', ')}]`, expected: `${expectedStatus} · [${expectedTypes.join(', ')}]`, passed,
        details: { summary: data?.summary, recommendations: data?.recommendations, requiresHumanValidation: data?.requiresHumanValidation },
      });
      expect(response.status, scenario).toBe(201);
      expect(data.status, scenario).toBe(expectedStatus);
      expect(types, scenario).toEqual([...expectedTypes].sort());
      for (const rec of data.recommendations) {
        expect(rec.evidence.length, `${scenario} evidência`).toBeGreaterThan(0);
        expect(rec.nextAction, `${scenario} próxima ação`).toBeTruthy();
      }
      if (scenario === 'SCENARIO-007') expect(data.requiresHumanValidation).toBe(true);
    }
  });

  it('E2E-008 acesso não autorizado e isolamento entre estudantes', async () => {
    const { app } = createTestApp({ repos: db.repos, agentServiceUrl: agent.url });
    const anonymous = await request(app).post('/api/agent/analyze').send({});
    expect(anonymous.status).toBe(401);
    const owner = await loginAs(app, 'estudante.exemplo@demo.asa', DEMO_PASSWORD);
    const latest = await request(app).get('/api/agent/recommendations').set(bearer(owner.accessToken));
    const other = await loginAs(app, 'estudante.regular@demo.asa', DEMO_PASSWORD);
    const forbidden = await request(app).get(`/api/agent/recommendations/${latest.body.data.recommendations[0].id}`).set(bearer(other.accessToken));
    recordEvidence({
      scenario: 'E2E-008', title: 'Acesso indevido', student: 'student-demo-002 → dados de student-demo-001', correlationId: forbidden.body.error?.correlationId ?? 'n/a',
      requestId: forbidden.body.error?.requestId ?? null, runId: null, httpStatus: forbidden.status,
      outcome: `${anonymous.status} sem token · ${forbidden.status} ${forbidden.body.error?.code}`, expected: '401 · 403 FORBIDDEN', passed: anonymous.status === 401 && forbidden.status === 403,
      details: { anonymous: anonymous.body.error, forbidden: forbidden.body.error },
    });
    expect(forbidden.status).toBe(403);
  });
});
