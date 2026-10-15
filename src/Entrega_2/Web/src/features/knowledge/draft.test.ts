import { describe, expect, it } from 'vitest';
import { draftFromArticle, draftToInput, EMPTY_DRAFT, sameDraft, validateDraft } from './draft';
import { helpCenterSteps, stripMarkdown } from './preview';
import { makeArticle } from './testFixtures';

describe('rascunho do editor da base de conhecimento', () => {
  it('valida com as mesmas regras do servidor', () => {
    expect(validateDraft(EMPTY_DRAFT, 'create')).toEqual({
      title: 'Escreva um título com pelo menos 3 caracteres.',
      summary: 'Escreva um resumo de uma ou duas frases.',
      body: 'Escreva o texto do artigo.',
    });
    const ok = { ...EMPTY_DRAFT, title: 'Boleto', summary: 'Resumo.', body: 'Texto.' };
    expect(validateDraft(ok, 'create')).toEqual({});
    expect(validateDraft({ ...ok, sourceUrl: 'http://inseguro.com' }, 'create').sourceUrl).toBe('Use um endereço que comece com https://');
    expect(validateDraft({ ...ok, slug: 'Com Espaço' }, 'create').slug).toMatch(/letras minúsculas/);
    // o endereço não muda depois de criado: a edição não o valida nem envia
    expect(validateDraft({ ...ok, slug: 'Com Espaço' }, 'edit').slug).toBeUndefined();
    expect(validateDraft({ ...ok, title: 'x'.repeat(161) }, 'create').title).toMatch(/160/);
  });

  it('monta o corpo aceito pela API (campos vazios viram null; slug só na criação)', () => {
    const draft = { ...EMPTY_DRAFT, title: '  Boleto  ', summary: 'Resumo.', body: '\nTexto.\n', slug: 'boleto', sourceUrl: ' ' };
    expect(draftToInput(draft, 'create')).toEqual({
      slug: 'boleto',
      title: 'Boleto',
      summary: 'Resumo.',
      body: 'Texto.',
      categoryId: null,
      audience: 'student',
      sourceLabel: null,
      sourceUrl: null,
      changeNote: null,
      reviewDueAt: null,
    });
    expect(draftToInput(draft, 'edit')).not.toHaveProperty('slug');
  });

  it('parte da versão atual do artigo e detecta alterações', () => {
    const article = makeArticle();
    const draft = draftFromArticle(article);
    expect(draft).toMatchObject({ title: article.current.title, categoryId: 'financial', sourceUrl: 'https://www.fecap.br/financeiro', changeNote: '' });
    expect(sameDraft(draft, { ...draft })).toBe(true);
    expect(sameDraft(draft, { ...draft, body: 'outro' })).toBe(false);
  });

  it('prévia do passo a passo segue a regra do servidor (listas viram passos; sem lista, parágrafos)', () => {
    expect(helpCenterSteps('Resumo.\n\n## Passo a passo\n\n1. Entre no **portal**.\n2. Abra [Financeiro](https://x.br).', 'Resumo.')).toEqual(['Entre no portal.', 'Abra Financeiro.']);
    expect(helpCenterSteps('Resumo.\n\n## Título\n\nOutro parágrafo.', 'Resumo.')).toEqual(['Outro parágrafo.']);
    expect(stripMarkdown('**a**  _b_ `c`')).toBe('a b c');
  });
});
