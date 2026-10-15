import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AiProviderRegistry, JevAdapter, ProviderUnavailableError } from '../../src/ai/providers.js';
import { createLogger } from '../../src/config/logger.js';
import { extractSteps, queryTerms, slugify, stripMarkdown, termCoverage, toTsQuery } from '../../src/knowledge/text.js';
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
    expect(queryTerms('Como eu emito a segunda via do boleto?')).toEqual(['emito', 'segunda', 'via', 'boleto']);
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
