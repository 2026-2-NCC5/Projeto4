import type { KnowledgeArticleInput, KnowledgeAudience, KnowledgeManageArticle } from '@/types/api';
import { KB_LIMITS } from './api';

/** Conteúdo do editor (texto puro dos campos; vazio = não informado). */
export interface ArticleDraft {
  title: string;
  summary: string;
  body: string;
  categoryId: string;
  audience: KnowledgeAudience;
  sourceLabel: string;
  sourceUrl: string;
  reviewDueAt: string;
  changeNote: string;
  /** só na criação */
  slug: string;
}

export type DraftField = keyof ArticleDraft;
export type DraftErrors = Partial<Record<DraftField, string>>;

export const EMPTY_DRAFT: ArticleDraft = {
  title: '',
  summary: '',
  body: '',
  categoryId: '',
  audience: 'student',
  sourceLabel: '',
  sourceUrl: '',
  reviewDueAt: '',
  changeNote: '',
  slug: '',
};

export function draftFromArticle(article: KnowledgeManageArticle): ArticleDraft {
  return {
    title: article.current.title,
    summary: article.current.summary,
    body: article.current.body,
    categoryId: article.categoryId ?? '',
    audience: article.audience,
    sourceLabel: article.current.sourceLabel ?? '',
    sourceUrl: article.current.sourceUrl ?? '',
    reviewDueAt: article.reviewDueAt ?? '',
    changeNote: '',
    slug: article.slug,
  };
}

export const sameDraft = (a: ArticleDraft, b: ArticleDraft): boolean => (Object.keys(a) as DraftField[]).every((key) => a[key] === b[key]);

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HTTPS = /^https:\/\/[^\s]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Mesmas regras do servidor (routes/knowledge.ts + knowledge/service.ts), com mensagens para quem escreve. */
export function validateDraft(draft: ArticleDraft, mode: 'create' | 'edit'): DraftErrors {
  const errors: DraftErrors = {};
  const title = draft.title.trim();
  const summary = draft.summary.trim();
  const body = draft.body.trim();
  const slug = draft.slug.trim();
  const sourceUrl = draft.sourceUrl.trim();
  if (title.length < KB_LIMITS.title.min) errors.title = `Escreva um título com pelo menos ${KB_LIMITS.title.min} caracteres.`;
  else if (title.length > KB_LIMITS.title.max) errors.title = `Use no máximo ${KB_LIMITS.title.max} caracteres no título.`;
  if (!summary) errors.summary = 'Escreva um resumo de uma ou duas frases.';
  else if (summary.length > KB_LIMITS.summary.max) errors.summary = `Use no máximo ${KB_LIMITS.summary.max} caracteres no resumo.`;
  if (!body) errors.body = 'Escreva o texto do artigo.';
  else if (body.length > KB_LIMITS.body.max) errors.body = 'Use no máximo 20.000 caracteres no texto.';
  if (sourceUrl && !HTTPS.test(sourceUrl)) errors.sourceUrl = 'Use um endereço que comece com https://';
  else if (sourceUrl.length > KB_LIMITS.sourceUrl) errors.sourceUrl = `Use no máximo ${KB_LIMITS.sourceUrl} caracteres.`;
  if (draft.sourceLabel.trim().length > KB_LIMITS.sourceLabel) errors.sourceLabel = `Use no máximo ${KB_LIMITS.sourceLabel} caracteres.`;
  if (draft.changeNote.trim().length > KB_LIMITS.changeNote) errors.changeNote = `Use no máximo ${KB_LIMITS.changeNote} caracteres.`;
  if (draft.reviewDueAt && !DATE.test(draft.reviewDueAt)) errors.reviewDueAt = 'Use uma data válida.';
  if (mode === 'create' && slug && (!SLUG.test(slug) || slug.length > KB_LIMITS.slug)) errors.slug = 'Use letras minúsculas sem acento, números e hífens (até 80 caracteres).';
  return errors;
}

/** Corpo para a API (o esquema do servidor é estrito: nada além dos campos aceitos). */
export function draftToInput(draft: ArticleDraft, mode: 'create' | 'edit'): KnowledgeArticleInput {
  const slug = draft.slug.trim();
  return {
    ...(mode === 'create' && slug ? { slug } : {}),
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    body: draft.body.trim(),
    categoryId: draft.categoryId || null,
    audience: draft.audience,
    sourceLabel: draft.sourceLabel.trim() || null,
    sourceUrl: draft.sourceUrl.trim() || null,
    changeNote: draft.changeNote.trim() || null,
    reviewDueAt: draft.reviewDueAt || null,
  };
}

export const FIELD_LABELS: Record<DraftField, string> = {
  title: 'Título',
  summary: 'Resumo',
  body: 'Texto do artigo',
  categoryId: 'Categoria',
  audience: 'Público',
  sourceLabel: 'Fonte',
  sourceUrl: 'Link da fonte',
  reviewDueAt: 'Revisar até',
  changeNote: 'Nota da alteração',
  slug: 'Endereço (slug)',
};
