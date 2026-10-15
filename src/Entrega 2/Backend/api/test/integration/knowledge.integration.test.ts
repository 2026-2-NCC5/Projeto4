import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStubAgentServer, type StubHandle } from '../support/agentStubServer.js';
import { prepareDatabase, TEST_DATABASE_URL, type DatabaseHandle } from '../support/database.js';
import { DEMO_PASSWORD } from '../support/fixtures.js';
import { bearer, createTestApp, loginAs } from '../support/testApp.js';

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb('integração base de conhecimento + assistente + feedback do agente ↔ PostgreSQL (migration 008)', () => {
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

  const app = () => createTestApp({ repos: db.repos, agentServiceUrl: stub.url }).app;

  it('leitura: artigos publicados (demonstração) e busca lexical com trecho', async () => {
    const student = await loginAs(app(), 'estudante.exemplo@demo.asa', DEMO_PASSWORD);
    const list = await request(app()).get('/api/knowledge-base?pageSize=50').set(bearer(student.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data.total).toBe(16);
    expect(list.body.data.mode).toBe('lexical');
    expect(list.body.data.items.every((item: { isDemo: boolean }) => item.isDemo)).toBe(true);
    const search = await request(app()).get('/api/knowledge-base?search=segunda%20via%20do%20boleto').set(bearer(student.accessToken));
    expect(search.body.data.items[0]).toMatchObject({ slug: 'financial-bill-copy', version: 1, categoryLabel: 'Financeiro' });
    expect(search.body.data.items[0].excerpt.length).toBeGreaterThan(10);
    const detail = await request(app()).get('/api/knowledge-base/financial-bill-copy').set(bearer(student.accessToken));
    expect(detail.body.data.body).toContain('## Passo a passo');
    // a Central de ajuda do app passa a vir da base (inclusive o artigo atualizado de agendamento)
    const catalog = await request(app()).get('/api/support/catalog').set(bearer(student.accessToken));
    const appointment = catalog.body.data.articles.find((article: { id: string }) => article.id === 'asa-appointment');
    expect(appointment.summary).toContain('Agendamentos');
    expect(appointment.steps.length).toBeGreaterThan(1);
  });

  it('gestão: rascunho invisível ao aluno, conflito de versão, revisão, publicação, edição sem tirar do ar e arquivamento', async () => {
    const staff = await loginAs(app(), 'atendente.asa@demo.asa', DEMO_PASSWORD);
    const student = await loginAs(app(), 'estudante.exemplo@demo.asa', DEMO_PASSWORD);
    expect((await request(app()).get('/api/knowledge-base/manage').set(bearer(student.accessToken))).status).toBe(403);

    const created = await request(app())
      .post('/api/knowledge-base/manage')
      .set(bearer(staff.accessToken))
      .send({ title: 'Como trancar a matrícula', summary: 'O trancamento é pedido à Secretaria Acadêmica dentro do prazo.', body: '1. Abra um chamado em Matrícula → Trancamento.\n2. Informe o semestre.', categoryId: 'enrollment', sourceLabel: 'Secretaria Acadêmica' });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect(created.body.data).toMatchObject({ slug: 'como-trancar-a-matricula', status: 'draft', currentVersion: 1, publishedVersion: null });
    expect((await request(app()).get('/api/knowledge-base/como-trancar-a-matricula').set(bearer(student.accessToken))).status).toBe(404);

    const stale = await request(app()).put(`/api/knowledge-base/manage/${id}`).set(bearer(staff.accessToken)).send({ expectedVersion: 7, title: 'Como trancar a matrícula', summary: 'x', body: 'y' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.reason).toBe('article_changed');

    expect((await request(app()).post(`/api/knowledge-base/manage/${id}/submit`).set(bearer(staff.accessToken))).body.data.status).toBe('in_review');
    const published = await request(app()).post(`/api/knowledge-base/manage/${id}/publish`).set(bearer(staff.accessToken));
    expect(published.body.data).toMatchObject({ status: 'published', publishedVersion: 1 });
    const publishedView = await request(app()).get('/api/knowledge-base/como-trancar-a-matricula').set(bearer(student.accessToken));
    expect(publishedView.body.data.version).toBe(1);
    const publishedAt = publishedView.body.data.updatedAt as string;
    // endereço reservado (rota da gestão) é recusado
    const reserved = await request(app())
      .post('/api/knowledge-base/manage')
      .set(bearer(staff.accessToken))
      .send({ title: 'Manage', slug: 'manage', summary: 'Artigo de teste com endereço reservado.', body: 'Texto.', categoryId: 'other' });
    expect(reserved.status).toBe(409);
    expect(reserved.body.error.reason).toBe('slug_taken');

    const edited = await request(app())
      .put(`/api/knowledge-base/manage/${id}`)
      .set(bearer(staff.accessToken))
      .send({ expectedVersion: 1, title: 'Como trancar a matrícula', summary: 'Novo texto em revisão.', body: '1. Passo novo.', categoryId: 'enrollment', changeNote: 'Atualiza prazo' });
    expect(edited.body.data).toMatchObject({ currentVersion: 2, publishedVersion: 1, hasUnpublishedChanges: true, status: 'published' });
    // o aluno continua vendo a versão publicada
    expect((await request(app()).get('/api/knowledge-base/como-trancar-a-matricula').set(bearer(student.accessToken))).body.data.summary).toContain('Secretaria Acadêmica');
    // enviar a alteração para revisão também não tira do ar a versão publicada (leitura e busca)
    expect((await request(app()).post(`/api/knowledge-base/manage/${id}/submit`).set(bearer(staff.accessToken))).body.data.status).toBe('in_review');
    const stillLive = await request(app()).get('/api/knowledge-base/como-trancar-a-matricula').set(bearer(student.accessToken));
    expect(stillLive.status).toBe(200);
    expect(stillLive.body.data.version).toBe(1);
    // a data que o aluno vê é a da versão publicada (editar o rascunho não muda)
    expect(stillLive.body.data.updatedAt).toBe(publishedAt);
    const searched = await request(app()).get('/api/knowledge-base?search=trancar').set(bearer(student.accessToken));
    expect(JSON.stringify(searched.body.data.items)).toContain('como-trancar-a-matricula');

    // política de dois revisores: quem editou por último não publica
    const admin = await loginAs(app(), 'admin.plataforma@demo.asa', DEMO_PASSWORD);
    await db.pool.query(`insert into platform_settings (key, value) values ('knowledge.policy', '{"requireSecondReviewer": true}') on conflict (key) do update set value = excluded.value`);
    const blocked = await request(app()).post(`/api/knowledge-base/manage/${id}/publish`).set(bearer(staff.accessToken));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.reason).toBe('publish_blocked');
    expect((await request(app()).post(`/api/knowledge-base/manage/${id}/publish`).set(bearer(admin.accessToken))).body.data.publishedVersion).toBe(2);
    await db.pool.query("delete from platform_settings where key = 'knowledge.policy'");

    expect((await request(app()).post(`/api/knowledge-base/manage/${id}/archive`).set(bearer(staff.accessToken))).body.data.status).toBe('archived');
    expect((await request(app()).get('/api/knowledge-base/como-trancar-a-matricula').set(bearer(student.accessToken))).status).toBe(404);
    await expect(db.pool.query(`update kb_article_versions set title = 'x' where article_id = $1`, [id])).rejects.toThrow(/somente-inserção/);
    const audit = await db.pool.query("select action from audit_events where resource_id = $1 order by seq", [id]);
    expect(audit.rows.map((row) => row.action)).toEqual(expect.arrayContaining(['kb.article_created', 'kb.article_submitted', 'kb.article_published', 'kb.article_archived']));
  });

  it('assistente: responde com citação; assunto relacionado sem resposta confiável → abstém e propõe chamado; fora do tema → não entendi', async () => {
    const student = await loginAs(app(), 'estudante.exemplo@demo.asa', DEMO_PASSWORD);
    const ask = (text: string) => request(app()).post('/api/assistant/message').set(bearer(student.accessToken)).send({ inputType: 'text', text });

    const answered = await ask('Como eu tiro a segunda via do boleto?');
    expect(answered.status).toBe(200);
    expect(answered.body.data).toMatchObject({ intent: 'knowledge_question', status: 'success', provider: { id: 'existing' } });
    expect(answered.body.data.sources[0]).toMatchObject({ type: 'knowledge_article', slug: 'financial-bill-copy', version: 1, sourceLabel: expect.stringContaining('demonstração') });
    expect(answered.body.data.display.items.length).toBeGreaterThan(0);

    const weak = await ask('Posso parcelar no cartão de crédito em vez do boleto?');
    expect(weak.body.data).toMatchObject({ status: 'abstained', abstained: true, abstentionReason: 'low_confidence' });
    expect(weak.body.data.handoff).toMatchObject({ categoryId: 'asa_service', description: 'Posso parcelar no cartão de crédito em vez do boleto?' });
    expect(weak.body.data.sources).toBeUndefined();

    const offTopic = await ask('Qual é a capital da França?');
    expect(offTopic.body.data).toMatchObject({ intent: 'unknown', status: 'needs_clarification' });
    expect(offTopic.body.data.handoff).toBeUndefined();

    const stored = await db.pool.query("select intent, status from assistant_interactions where intent = 'knowledge_question'");
    expect(stored.rows.length).toBeGreaterThan(0);
  });

  it('feedback do aluno sobre a própria recomendação (uma vez) e indicadores agregados para a equipe', async () => {
    const student = await loginAs(app(), 'estudante.exemplo@demo.asa', DEMO_PASSWORD);
    const analysis = await request(app()).post('/api/agent/analyze').set(bearer(student.accessToken)).send({});
    expect(analysis.status).toBe(201);
    const recommendationId = analysis.body.data.recommendations[0]?.id as string;
    expect(recommendationId).toBeTruthy();
    const first = await request(app()).post(`/api/agent/recommendations/${recommendationId}/feedback`).set(bearer(student.accessToken)).send({ helpful: true, comment: 'Ajudou a priorizar' });
    expect(first.status).toBe(201);
    expect((await request(app()).post(`/api/agent/recommendations/${recommendationId}/feedback`).set(bearer(student.accessToken)).send({ helpful: false })).body.error.reason).toBe('already_rated');
    const other = await loginAs(app(), 'estudante.regular@demo.asa', DEMO_PASSWORD);
    expect((await request(app()).post(`/api/agent/recommendations/${recommendationId}/feedback`).set(bearer(other.accessToken)).send({ helpful: true })).status).toBe(403);
    const detail = await request(app()).get(`/api/agent/recommendations/${recommendationId}`).set(bearer(student.accessToken));
    expect(detail.body.data.feedback).toMatchObject({ helpful: true, comment: 'Ajudou a priorizar' });

    const staff = await loginAs(app(), 'atendente.asa@demo.asa', DEMO_PASSWORD);
    const insights = await request(app()).get('/api/asa/agent-insights?from=2026-01-01&to=2026-12-31').set(bearer(staff.accessToken));
    expect(insights.status).toBe(200);
    expect(insights.body.data.feedback.helpful).toBeGreaterThanOrEqual(1);
    expect(insights.body.data.runs.total).toBeGreaterThanOrEqual(1);
    expect(insights.body.data.provider).toMatchObject({ active: 'existing', jev: { status: 'disabled' } });
    expect(JSON.stringify(insights.body.data)).not.toMatch(/Estudante Exemplo|student-demo-001|@demo\.asa/);
    expect((await request(app()).get('/api/asa/agent-insights').set(bearer(student.accessToken))).status).toBe(403);
  });
});
