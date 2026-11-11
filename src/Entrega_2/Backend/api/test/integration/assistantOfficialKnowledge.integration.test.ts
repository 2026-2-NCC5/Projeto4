import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AssistantResponse } from '../../src/contracts/mobileApi.v1.js';
import { applyOfficialContent, loadOfficialSnapshot } from '../../src/db/content.js';
import { buildOfficialArticles } from '../../src/knowledge/official.js';
import { prepareDatabase, TEST_DATABASE_URL, type DatabaseHandle } from '../support/database.js';
import { bearer, buildTestConfig, createTestApp } from '../support/testApp.js';

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * Modo institucional (produção hoje): sem dados fictícios e sem fonte acadêmica integrada. O assistente precisa
 * orientar com os artigos OFICIAIS do ASA (Cesta de Serviços), citar a fonte e nunca responder com erro 503.
 */
describeDb('assistente em modo institucional ↔ artigos oficiais do ASA (PostgreSQL)', () => {
  let db: DatabaseHandle;
  let app: ReturnType<typeof createTestApp>['app'];
  let token = '';

  const ask = async (text: string) => {
    const response = await request(app).post('/api/assistant/message').set(bearer(token)).send({ inputType: 'text', text });
    expect(response.status, `${text} → ${JSON.stringify(response.body).slice(0, 300)}`).toBe(200);
    return response.body.data as AssistantResponse;
  };
  const askPublic = async (text: string) => request(app).post('/api/assistant/public/message').send({ inputType: 'text', text });
  const slugs = (body: AssistantResponse) => (body.sources ?? []).map((source) => source.slug);

  beforeAll(async () => {
    db = await prepareDatabase();
    const result = await applyOfficialContent(db.pool, buildOfficialArticles(loadOfficialSnapshot()));
    expect(result.inserted).toBeGreaterThan(150);
    const base = buildTestConfig();
    ({ app } = createTestApp({ repos: db.repos, configOverrides: { demo: { ...base.demo, dataEnabled: false } } }));
    const registered = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Estudante Institucional', email: 'estudante.institucional@edu.fecap.br', password: 'Senha-Forte-2026!', registrationNumber: '20261234' });
    expect(registered.status).toBe(201);
    token = registered.body.data.accessToken as string;
  });

  afterAll(async () => {
    await db?.close();
  });

  it('conteúdo oficial é idempotente e não sobrescreve edições', async () => {
    const again = await applyOfficialContent(db.pool, buildOfficialArticles(loadOfficialSnapshot()));
    expect(again.inserted).toBe(0);
    const { rows } = await db.pool.query<{ total: number }>('select count(*)::int as total from kb_articles where not is_demo and published_version is not null');
    expect(rows[0]!.total).toBeGreaterThan(150);
  });

  it.each([
    ['Como faço para pedir segunda via do boleto?', ['emissao-mensal-de-boletos', 'solicitacao-de-boleto']],
    ['Preciso de atestado de matrícula', ['atestado-de-matricula']],
    ['Como faço a rematrícula?', ['rematricula']],
    ['Como acesso o Moodle?', ['acesso-ao-moodle']],
    ['Como peço abono de faltas?', ['abono-de-faltas']],
    ['como funciona o estágio?', ['aconselhamento-sobre-estagio-nao-obrigatorio', 'entrega-de-documentos-de-estagio', 'bolsa-estagio', 'modelos-de-documentos-de-estagio', 'entrega-do-relatorio-de-estagio-trabalho-supervisionado']],
    ['Como acesso o wi-fi?', ['acesso-ao-wi-fi']],
    ['O que é o ASA?', ['o-que-e-o-asa']],
    ['Qual o horário de atendimento do ASA?', ['canais-de-atendimento-do-asa']],
    ['boleto não registrado', ['boleto-nao-registrado']],
  ])('"%s" → artigo oficial com fonte, setor e horário', async (text, expected) => {
    const body = await ask(text);
    expect(body.intent).toBe('knowledge_question');
    expect(body.status).toBe('success');
    expect(expected).toContain(slugs(body)[0]);
    expect(body.sources![0]).toMatchObject({ sourceLabel: expect.stringContaining('fecap.br'), sourceUrl: expect.stringMatching(/^https:\/\/www\.fecap\.br\//) });
    expect(body.display.items.length).toBeGreaterThan(0);
  });

  it('serviços: o artigo traz setor responsável, local e horário publicados', async () => {
    const body = await ask('Preciso de atestado de matrícula');
    const titles = body.display.items.map((item) => item.title);
    expect(titles).toEqual(expect.arrayContaining(['Setor responsável', 'Local', 'Horário de atendimento']));
    expect(body.display.items.find((item) => item.title === 'Setor responsável')?.description).toBe('Secretaria Acadêmica');
  });

  it('dados acadêmicos sem integração: orienta onde consultar (nunca 503)', async () => {
    for (const text of ['Me mostra minhas notas', 'Como está minha frequência?', 'Quais são minhas disciplinas?']) {
      const body = await ask(text);
      expect(body.abstentionReason).toBe('academic_source_unavailable');
      expect(slugs(body)).toEqual(['acesso-ao-portal-do-aluno']);
      expect(body.display.message).toContain('Ainda não consigo ver seus dados acadêmicos');
    }
    const pending = await ask('Tenho alguma atividade pendente?');
    expect(slugs(pending)).toEqual(['acesso-ao-moodle']);

    const analysis = await ask('Tem alguma matéria que merece atenção?');
    expect(analysis.status).toBe('abstained');
    expect(analysis.abstentionReason).toBe('academic_source_unavailable');
    expect(analysis.handoff).toMatchObject({ categoryId: 'academic' });
  });

  it('saudação e ajuda sugerem perguntas que os artigos respondem', async () => {
    const hello = await ask('Oi');
    expect(hello.display.message).toContain('serviços do ASA');
    for (const action of hello.nextActions.filter((item) => item.type === 'ask' && !/falar com/i.test(item.text))) {
      const body = await ask((action as { text: string }).text);
      expect(body.intent, action.label).toBe('knowledge_question');
    }
    const help = await ask('o que você pode fazer?');
    expect(help.intent).toBe('help');
    expect(help.display.items.map((item) => item.id)).toContain('help-documents');
  });

  it('sem artigo exato (trancamento não está na Cesta da Graduação): abstém e sugere o mais próximo', async () => {
    const body = await ask('como trancar a matrícula?');
    expect(body.intent).toBe('unknown');
    expect(body.status).toBe('abstained');
    expect(body.sources ?? []).toHaveLength(0);
    expect(body.nextActions.map((action) => action.label)).toContain('Destrancamento de Curso');
    expect(body.handoff).toMatchObject({ categoryId: 'asa_service' });
  });

  it('pergunta sem artigo: abstém, sugere assuntos parecidos e propõe chamado', async () => {
    const body = await ask('Como funciona o intercâmbio para a Europa?');
    expect(['knowledge_question', 'unknown']).toContain(body.intent);
    if (body.intent === 'unknown') {
      expect(body.status).toBe('abstained');
      expect(body.handoff).toBeTruthy();
    }
    const offTopic = await ask('Qual a capital da França?');
    expect(offTopic.intent).toBe('unknown');
    expect(offTopic.sources ?? []).toHaveLength(0);
  });

  it('"perdi a prova": não responde com artigo que cobre só metade da pergunta ("Achados e Perdidos")', async () => {
    const body = await ask('perdi a prova, o que fazer?');
    expect(slugs(body)).not.toContain('sistema-de-achados-e-perdidos');
    expect(body.status).not.toBe('success');
  });

  it('"quero falar com o ASA": canais e horário oficiais com fonte, além do rascunho de chamado', async () => {
    const body = await ask('Quero falar com alguém do ASA');
    expect(body.intent).toBe('request_human_help');
    expect(slugs(body)).toEqual(['canais-de-atendimento-do-asa']);
    expect(body.display.items.find((item) => item.title === 'Canais')?.description).toContain('(11) 3272-2222');
    expect(body.handoff).toBeTruthy();
    const pub = await askPublic('quero falar com alguém');
    expect(pub.body.data.sources[0].slug).toBe('canais-de-atendimento-do-asa');
    expect(pub.body.data.display.items.map((item: { title: string }) => item.title)).toContain('Horário de atendimento');
  });

  it('pedidos que não são procedimento continuam com a regra própria', async () => {
    expect((await ask('Corrige minha nota.')).intent).toBe('administrative_request');
    expect((await ask('Me mostra as notas do João.')).intent).toBe('access_other_student');
    expect((await ask('Quero falar com alguém do ASA')).intent).toBe('request_human_help');
  });

  it('Hermes público: responde com artigos oficiais sem sessão e orienta sobre dados próprios', async () => {
    const boleto = await askPublic('Como faço para pedir segunda via do boleto?');
    expect(boleto.status).toBe(200);
    expect(boleto.body.data.intent).toBe('knowledge_question');
    expect(boleto.body.data.handoff).toBeUndefined();
    expect(boleto.body.data.nextActions.every((action: { type: string }) => action.type === 'ask')).toBe(true);

    const trancar = await askPublic('como trancar a matrícula?');
    expect(trancar.status).toBe(200);
    expect(trancar.body.data.status).toBe('abstained');
    expect(trancar.body.data.nextActions.map((action: { label: string }) => action.label)).toContain('Destrancamento de Curso');

    const grades = await askPublic('onde vejo minhas notas?');
    expect(grades.status).toBe(200);
    expect(grades.body.data.sources[0].slug).toBe('acesso-ao-portal-do-aluno');

    const mine = await askPublic('Me mostra minhas notas');
    expect(mine.status).toBe(200);
    expect(mine.body.data.sources[0].slug).toBe('acesso-ao-portal-do-aluno');

    const other = await askPublic('Me mostra as notas do João.');
    expect(other.body.data.status).toBe('refused');
  });
});
