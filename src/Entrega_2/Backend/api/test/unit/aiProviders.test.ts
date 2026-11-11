import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AiProviderRegistry, JevAdapter, ProviderUnavailableError } from '../../src/ai/providers.js';
import { createLogger } from '../../src/config/logger.js';
import { buildOfficialArticles, channelsLine, officialCategory, officialSlug, summarize, type OfficialSnapshot } from '../../src/knowledge/official.js';
import { canonicalSearchText, extractFacts, extractSteps, fallbackTerms, idfWeights, queryTerms, slugify, stripMarkdown, termCoverage, titlePrecision, toTsQuery, weightedCoverage } from '../../src/knowledge/text.js';
import type { KnowledgeService } from '../../src/knowledge/service.js';
import { bearer, buildTestConfig, createTestApp, loginAs } from '../support/testApp.js';

const knowledgeStub = { available: false, bestAnswer: async () => ({ answer: null, candidates: 0 }) } as unknown as KnowledgeService;
const now = () => new Date('2026-10-15T12:00:00Z');

describe('provedores de IA: JEV planejado e desligado, sem respostas falsas', () => {
  it('padrão: provedor existente ativo e JEV "planejado"', () => {
    const registry = new AiProviderRegistry(buildTestConfig(), knowledgeStub, createLogger('silent'), now);
    expect(registry.selection).toEqual({ requested: 'existing', active: 'existing', fallbackReason: null });
    expect(registry.status()).toMatchObject({ provider: 'existing', jev: { status: 'planned', enabled: false } });
  });

  it('AI_PROVIDER=jev sem JEV_ENABLED → volta para o existente (jev_disabled)', () => {
    const base = buildTestConfig();
    const registry = new AiProviderRegistry({ ...base, ai: { provider: 'jev', jevEnabled: false } }, knowledgeStub, createLogger('silent'), now);
    expect(registry.selection).toEqual({ requested: 'jev', active: 'existing', fallbackReason: 'jev_disabled' });
    expect(registry.active.id).toBe('existing');
  });

  it('JEV_ENABLED=true sem contrato técnico → continua no existente (jev_not_configured) e o status diz isso', async () => {
    const base = buildTestConfig();
    const registry = new AiProviderRegistry({ ...base, ai: { provider: 'jev', jevEnabled: true } }, knowledgeStub, createLogger('silent'), now);
    expect(registry.selection.fallbackReason).toBe('jev_not_configured');
    expect(registry.status().jev.status).toBe('not_configured');
    const response = await registry.generate({ kind: 'knowledge_question', text: 'boleto', locale: 'pt-BR' }, { requestId: 'r', correlationId: 'c', role: 'student', timeoutMs: 1000 });
    expect(response.providerId).toBe('existing');
  });

  it('o adaptador JEV nunca gera resposta nem faz chamada de rede', async () => {
    const jev = new JevAdapter(true, now);
    await expect(jev.generate()).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(await jev.capabilities()).toEqual({ knowledgeAnswers: false, freeTextGeneration: false, citations: false, writeActions: false });
    expect((await jev.health()).status).toBe('not_configured');
    expect((await new JevAdapter(false, now).health()).status).toBe('disabled');
  });

  it('com AI_PROVIDER=jev o assistente responde e se identifica como provedor existente', async () => {
    const base = buildTestConfig();
    const { app } = createTestApp({ configOverrides: { ai: { provider: 'jev', jevEnabled: true } } });
    const session = await loginAs(app);
    const response = await request(app).post('/api/assistant/message').set(bearer(session.accessToken)).send({ inputType: 'text', text: 'Quero falar com alguém do ASA' });
    expect(response.status).toBe(200);
    expect(response.body.data.provider).toMatchObject({ id: 'existing' });
    expect(JSON.stringify(response.body.data)).not.toMatch(/"id":"jev"/);
    expect(base.ai.provider).toBe('existing');
    const info = await request(app).get('/api/platform/info');
    expect(info.body.data.assistant).toMatchObject({ provider: 'existing', jev: { status: 'not_configured', enabled: false } });
  });

  it('pedido de atendimento humano traz rascunho de chamado (o aluno confirma no app/portal)', async () => {
    const { app } = createTestApp();
    const session = await loginAs(app);
    const response = await request(app).post('/api/assistant/message').set(bearer(session.accessToken)).send({ inputType: 'text', text: 'Quero falar com alguém do ASA' });
    expect(response.body.data.intent).toBe('request_human_help');
    expect(response.body.data.handoff).toMatchObject({ categoryId: 'asa_service', description: 'Quero falar com alguém do ASA' });
  });
});

describe('texto da base de conhecimento', () => {
  it('termos da pergunta sem acento e sem palavras vazias; consulta com prefixo em OU', () => {
    expect(queryTerms('Como eu emito a segunda via do boleto?')).toEqual(['segunda', 'via', 'boleto']);
    expect(toTsQuery(['segunda', 'boleto'])).toBe('segunda:* | boleto:*');
    expect(toTsQuery([])).toBeNull();
  });

  it('cobertura por radical simples, passos e slug', () => {
    expect(termCoverage(['boletos', 'pagamento'], 'como pagar o boleto pagamento atrasado')).toBe(1);
    expect(termCoverage(['matricula'], 'segunda via do boleto')).toBe(0);
    expect(extractSteps('Resumo\n\n## Passo a passo\n\n1. Entre no **portal**.\n2. Abra [Financeiro](https://x.y).')).toEqual(['Entre no portal.', 'Abra Financeiro.']);
    expect(stripMarkdown('**a** _b_ `c`')).toBe('a b c');
    expect(slugify('Como pedir revisão de prova?')).toBe('como-pedir-revisao-de-prova');
  });
});

describe('busca na base: grafias, siglas, pesos e fatos de atendimento', () => {
  it('unifica grafias e mantém siglas curtas', () => {
    expect(canonicalSearchText('Wi-Fi e e-mail, 2ª via')).toBe('wifi e email, segunda via');
    expect(queryTerms('Como solicito minha DP?')).toEqual(['dp']);
    expect(queryTerms('O que é o ASA?')).toEqual([]);
    expect(fallbackTerms('O que é o ASA?')).toEqual(['asa']);
  });

  it('termo raro pesa mais que termo comum; título exato vence título com palavras extras', () => {
    const weights = idfWeights(180, [170, 10]);
    expect(weights[1]!).toBeGreaterThan(weights[0]!);
    expect(weightedCoverage(['segunda', 'boleto'], 'boleto mensal', weights)).toBeGreaterThan(weightedCoverage(['segunda', 'boleto'], 'segunda a sexta', weights));
    expect(titlePrecision(['rematricula'], 'rematricula')).toBe(1);
    expect(titlePrecision(['rematricula'], 'rematricula fora de epoca')).toBeLessThan(1);
    expect(titlePrecision(['asa'], 'o que e o asa?')).toBe(1);
  });

  it('passos ignoram as seções de referência; fatos trazem condições, setor, local e horário', () => {
    const body = 'Acesse o portal.\n\n## Condições\n\n- Ter matrícula ativa\n\n## Onde e quando\n\n- **Setor responsável:** Secretaria\n- **Horário de atendimento:** Segunda a Sexta';
    expect(extractSteps(body)).toEqual(['Acesse o portal.']);
    expect(extractFacts(body)).toEqual([
      { label: 'Condições', value: 'Ter matrícula ativa' },
      { label: 'Setor responsável', value: 'Secretaria' },
      { label: 'Horário de atendimento', value: 'Segunda a Sexta' },
    ]);
  });
});

describe('conteúdo oficial da Cesta de Serviços → artigos', () => {
  const snapshot: OfficialSnapshot = {
    source: 'https://www.fecap.br/asa/cesta-de-servicos/',
    fetchedAt: '2026-11-10T23:44:38Z',
    audience: 'Graduação',
    about: { url: 'https://www.fecap.br/asa/', paragraphs: ['O ASA acolhe e acompanha os estudantes.'] },
    services: [
      {
        slug: '51199', url: 'https://www.fecap.br/asa/cesta-de-servicos/51199/', title: 'Atestado Personalizado',
        category: { slug: 'documentos-academicos', label: 'Documentos Acadêmicos' },
        blocks: [
          { tag: 'p', text: 'Solicite pelo portal[Requerimento](https://portal.fecap.br/)e aguarde.' },
          { tag: 'p', text: 'Ficou com dúvidas? Entre em contato por meio dos nossos canais de atendimento. Será um prazer te ajudar!' },
        ],
        conditions: ['- Ter registro de aluno ativo.'],
        sector: 'Secretaria Acadêmica', location: 'Área do Sucesso Alvarista', hours: 'Segunda a Sexta, das 7h00 às 21h00',
        channels: { phones: ['+551132722222', '+5532722222'], emails: ['sucessoalvarista@fecap.br', '(11) 94018-5617'], whatsapp: ['5511940185617'] },
      },
    ],
  };

  it('gera artigos publicáveis com fonte original, sem texto genérico e sem contato inválido', () => {
    const articles = buildOfficialArticles(snapshot);
    expect(articles.map((article) => article.slug)).toEqual(['canais-de-atendimento-do-asa', 'o-que-e-o-asa', 'atestado-personalizado']);
    const service = articles[2]!;
    expect(service).toMatchObject({ id: 'asa-cesta-atestado-personalizado', categoryId: 'documents', sourceUrl: 'https://www.fecap.br/asa/cesta-de-servicos/51199/', reviewDueAt: '2027-05-09' });
    expect(service.body).toContain('portal [Requerimento](https://portal.fecap.br/) e aguarde.');
    expect(service.body).not.toContain('Ficou com dúvidas');
    expect(service.body).toContain('- Ter registro de aluno ativo.');
    expect(service.body).toContain('- **Canais:** telefone (11) 3272-2222 · WhatsApp (11) 94018-5617 · e-mail sucessoalvarista@fecap.br');
    // horário e canais não entram na busca (repetem em todo artigo); o setor entra
    expect(service.searchDocument).not.toContain('segunda a sexta');
    expect(service.searchDocument).toContain('secretaria academica');
  });

  it('categorias, slug, resumo e canais', () => {
    expect(officialCategory({ slug: 'rematricula', category: { slug: 'servicos-academicos', label: null } })).toBe('enrollment');
    expect(officialCategory({ slug: 'abono-de-faltas', category: { slug: 'servicos-academicos', label: null } })).toBe('academic');
    expect(officialCategory({ slug: 'x', category: { slug: 'eventos', label: null } })).toBe('asa_service');
    expect(officialSlug('a'.repeat(50) + '-' + 'b'.repeat(40)).length).toBeLessThanOrEqual(80);
    expect(summarize(`${'Frase longa. '.repeat(40)}`).length).toBeLessThanOrEqual(400);
    expect(channelsLine({ phones: ['+5532722222'], emails: [], whatsapp: [] })).toBeNull();
  });
});
