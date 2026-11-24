import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gapKey, MemoryGapStore, redactQuestion } from '../../src/brain/gaps.js';
import { BrainIndex } from '../../src/brain/index.js';
import { readVault } from '../../src/brain/readVault.js';
import { BRAIN_SNAPSHOT } from '../../src/brain/vault.generated.js';
import { isIgnoredPath, parseNote, type BrainSnapshot } from '../../src/brain/vault.js';
import { DEMO_PASSWORD, USERS } from '../support/fixtures.js';
import { bearer, createTestApp, loginAs } from '../support/testApp.js';

const note = (path: string, markdown: string) => parseNote(path, markdown)!;

const SNAPSHOT: BrainSnapshot = {
  hash: 'teste',
  notes: [
    note('FECAP/Campus Liberdade.md', `---
title: Campus Liberdade
aliases: [endereço da FECAP, onde fica a FECAP]
tags: [fecap, campus]
source_label: Site da FECAP — Fale conosco
source_url: https://www.fecap.br/fale-conosco/
updated: 2026-11-24
---
# Campus Liberdade

O campus da FECAP fica na Av. da Liberdade, 532, perto da estação Liberdade do metrô. Veja [[Biblioteca]].

## Visitas ao Campus Liberdade
Visitas guiadas de segunda a sexta às 10h30.

## Fontes
- https://www.fecap.br/
`),
    note('Vida acadêmica/Biblioteca.md', `---
title: Biblioteca
aliases: [empréstimo de livro, horário da biblioteca]
---
# Biblioteca

A biblioteca fica no Bloco E e empresta livros pelo sistema Pergamum.

## Horário da Biblioteca
De segunda a sexta, das 7h30 às 21h50.
`),
    note('Graduação/Administração.md', `# Administração\n\nO curso de Administração dura 4 anos, presencial, turnos manhã e noite. Ingresso em [[Formas de ingresso]].`),
  ],
};

describe('cérebro (vault do Obsidian)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lê frontmatter, seções, links e ignora "## Fontes"', () => {
    const campus = SNAPSHOT.notes[0]!;
    expect(campus).toMatchObject({ id: 'FECAP/Campus Liberdade', title: 'Campus Liberdade', sourceUrl: 'https://www.fecap.br/fale-conosco/', links: ['Biblioteca'] });
    expect(campus.aliases).toContain('onde fica a FECAP');
    expect(campus.sections.map((section) => section.heading)).toEqual(['', 'Visitas ao Campus Liberdade']);
    expect(campus.sections[0]!.text).toContain('Veja Biblioteca.');
    expect(SNAPSHOT.notes[2]!.title).toBe('Administração');
  });

  it('caixa de entrada, modelos e README ficam fora do cérebro', () => {
    expect(isIgnoredPath('00 Entrada/Perguntas sem resposta.md')).toBe(true);
    expect(isIgnoredPath('Modelos/Nota do cérebro.md')).toBe(true);
    expect(isIgnoredPath('README.md')).toBe(true);
    expect(isIgnoredPath('FECAP/README.md')).toBe(false);
  });

  it('busca pela intenção: apelido, seção certa e nada para assunto desconhecido', () => {
    const index = new BrainIndex(SNAPSHOT);
    expect(index.search('onde fica a fecap?')[0]?.note.title).toBe('Campus Liberdade');
    const library = index.search('qual o horário da biblioteca')[0]!;
    expect(library.note.title).toBe('Biblioteca');
    expect(library.sections.map((section) => section.heading)).toContain('Horário da Biblioteca');
    expect(index.search('quanto dura o curso de administração')[0]?.note.title).toBe('Administração');
    expect(index.search('receita de bolo de cenoura')).toEqual([]);
  });

  it('nota gerada do site perde para a nota curada com o mesmo assunto', () => {
    const generated = note('Site da FECAP/Institucional/Biblioteca.md', `---\ntitle: Biblioteca da FECAP\ngenerated: true\n---\n# Biblioteca da FECAP\n\nA biblioteca fica no Bloco E e empresta livros pelo sistema Pergamum.\n\n## Horário da Biblioteca\nDe segunda a sexta, das 7h30 às 21h50.\n`);
    expect(generated.generated).toBe(true);
    const index = new BrainIndex({ hash: 'x', notes: [generated, SNAPSHOT.notes[1]!] });
    expect(index.search('horário da biblioteca').map((hit) => hit.note.id)).toEqual(['Vida acadêmica/Biblioteca', 'Site da FECAP/Institucional/Biblioteca']);
  });

  it('trechos para a IA saem marcados como cérebro, com link oficial', () => {
    const [passage] = new BrainIndex(SNAPSHOT).grounding('endereço da fecap');
    expect(passage).toMatchObject({ origin: 'brain', slug: 'cerebro-fecap-campus-liberdade', sourceUrl: 'https://www.fecap.br/fale-conosco/' });
    expect(passage!.body).toContain('Av. da Liberdade, 532');
  });

  it('estatísticas apontam links sem nota', () => {
    const stats = new BrainIndex(SNAPSHOT).stats();
    expect(stats).toMatchObject({ notes: 3, folders: { FECAP: 1, 'Vida acadêmica': 1, 'Graduação': 1 } });
    expect(stats.danglingLinks).toEqual(['Formas de ingresso']);
  });

  it('vault.generated.ts está em dia com Backend/cerebro (rode npm run brain:build)', () => {
    expect(BRAIN_SNAPSHOT).toEqual(readVault());
  });

  it('lacunas: mascaram dados pessoais, agrupam variações e reabrem se voltarem depois de resolvidas', async () => {
    expect(redactQuestion('meu ra 12345678 e email joao@edu.fecap.br')).toBe('meu ra [número] e email [e-mail]');
    expect(gapKey('Como trancar a matrícula?')).toBe(gapKey('trancar matricula como'));
    const store = new MemoryGapStore();
    const at = new Date('2026-11-24T12:00:00Z');
    await store.record('Tem estacionamento?', 'voice', at);
    await store.record('tem estacionamento', 'text', at);
    let { items, counts } = await store.list({ limit: 10 });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ timesAsked: 2, lastChannel: 'text', status: 'open' });
    await store.setStatus(items[0]!.id, { status: 'resolved', resolutionNote: 'nota criada', actorId: null, at });
    await store.record('tem estacionamento?', 'text', at);
    ({ items, counts } = await store.list({ limit: 10 }));
    expect(counts).toEqual({ open: 1, resolved: 0, ignored: 0 });
  });

  it('a IA recebe as notas do cérebro; sem base, a pergunta vira lacuna no painel', async () => {
    const prompts: string[] = [];
    const replies = [
      { title: 'Endereço', message: 'A FECAP fica na Av. da Liberdade, 532.', speech: 'Fica na avenida da Liberdade, 532.', useDraft: false, grounded: true, sourceSlugs: ['cerebro-fecap-campus-liberdade'] },
      { title: 'Estacionamento', message: 'Não encontrei essa informação.', speech: 'Não encontrei essa informação.', useDraft: false, grounded: false, sourceSlugs: [] },
    ];
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: { body?: string }) => {
      prompts.push(String(init?.body ?? ''));
      const reply = replies.shift();
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }] }), { status: 200 });
    }));
    const { app } = createTestApp({ brainSnapshot: SNAPSHOT, configOverrides: { ai: { provider: 'existing', jevEnabled: false, llm: { apiKey: 'test-key-1234567890', model: 'gemini-2.5-flash', timeoutMs: 2_000 } } } });
    const student = await loginAs(app);
    const answered = await request(app).post('/api/assistant/message').set(bearer(student.accessToken)).send({ inputType: 'text', text: 'Onde fica a FECAP?' });
    expect(answered.status).toBe(200);
    expect(answered.body.data.display.message).toContain('Liberdade, 532');
    expect(answered.body.data.sources ?? []).toEqual([]);
    expect(prompts[0]).toContain('Nota do cérebro da FECAP');
    expect(prompts[0]).toMatch(/DATA DE HOJE: \d{4}-\d{2}-\d{2}/);

    await request(app).post('/api/assistant/message').set(bearer(student.accessToken)).send({ inputType: 'voice', text: 'tem estacionamento pra aluno' });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect((await request(app).get('/api/assistant-brain').set(bearer(student.accessToken))).status).toBe(403);
    const staff = await loginAs(app, USERS.staff.email, DEMO_PASSWORD);
    const overview = await request(app).get('/api/assistant-brain').set(bearer(staff.accessToken));
    expect(overview.status).toBe(200);
    expect(overview.body.data.brain).toMatchObject({ notes: 3, llmEnabled: true });
    expect(overview.body.data.gaps.items).toEqual([expect.objectContaining({ question: 'tem estacionamento pra aluno', lastChannel: 'voice', status: 'open' })]);
    const id = overview.body.data.gaps.items[0].id as string;
    const resolved = await request(app).patch(`/api/assistant-brain/gaps/${id}`).set(bearer(staff.accessToken)).send({ status: 'resolved', resolutionNote: 'Nota "Estacionamento" criada' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe('resolved');
    expect((await request(app).patch('/api/assistant-brain/gaps/nao-existe').set(bearer(staff.accessToken)).send({ status: 'ignored' })).status).toBe(404);
  });
});
