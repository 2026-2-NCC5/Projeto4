import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareDatabase, TEST_DATABASE_URL, type DatabaseHandle } from '../support/database.js';
import { DEMO_PASSWORD } from '../support/fixtures.js';
import { bearer, buildTestConfig, createTestApp } from '../support/testApp.js';

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * Banco com os seeds de demonstração, mas API com DEMO_DATA_ENABLED=false: nada fictício pode chegar a uma
 * pessoa real — nem artigos, nem horários de atendentes fictícios, nem notas inventadas.
 */
describeDb('demonstração desligada ↔ PostgreSQL (nenhum dado fictício chega a contas reais)', () => {
  let db: DatabaseHandle;

  beforeAll(async () => {
    db = await prepareDatabase();
  });

  afterAll(async () => {
    await db?.close();
  });

  it('conta real recém-cadastrada: sem artigos fictícios, sem horários de atendentes fictícios, acadêmico 503', async () => {
    const base = buildTestConfig();
    const { app } = createTestApp({ repos: db.repos, configOverrides: { demo: { ...base.demo, dataEnabled: false } } });

    const demoLogin = await request(app).post('/api/auth/login').send({ email: 'estudante.exemplo@demo.asa', password: DEMO_PASSWORD });
    expect(demoLogin.status).toBe(403);
    expect(demoLogin.body.error.reason).toBe('demo_account_disabled');

    const registered = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Pessoa Real de Teste', email: 'pessoa.real.teste@edu.fecap.br', password: 'Senha-Forte-2026!', registrationNumber: '20269876' });
    expect(registered.status).toBe(201);
    const token = registered.body.data.accessToken as string;

    // a base tem artigos publicados, todos fictícios: nenhum aparece (lista, busca, detalhe)
    const { rows } = await db.pool.query<{ slug: string }>("select slug from kb_articles where is_demo and published_version is not null limit 1");
    expect(rows.length).toBe(1);
    const list = await request(app).get('/api/knowledge-base').set(bearer(token));
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(0);
    const search = await request(app).get('/api/knowledge-base?search=boleto').set(bearer(token));
    expect(search.body.data.items).toHaveLength(0);
    expect((await request(app).get(`/api/knowledge-base/${rows[0]!.slug}`).set(bearer(token))).status).toBe(404);

    // o assistente não cita artigo fictício
    const answer = await request(app).post('/api/assistant/message').set(bearer(token)).send({ inputType: 'text', text: 'Como faço para pedir segunda via do boleto?' });
    expect(answer.status).toBe(200);
    expect(answer.body.data.sources ?? []).toHaveLength(0);

    // atendentes fictícios não oferecem horários a uma pessoa real
    const slots = await request(app).get('/api/appointments/slots').set(bearer(token));
    expect(slots.status).toBe(200);
    expect(slots.body.data.days.flatMap((day: { slots: unknown[] }) => day.slots)).toHaveLength(0);

    // sem fonte acadêmica institucional: 503 explícito, nunca notas inventadas
    const subjects = await request(app).get('/api/student/subjects').set(bearer(token));
    expect(subjects.status).toBe(503);
    expect(subjects.body.error.reason).toBe('academic_source_unavailable');
  });
});
