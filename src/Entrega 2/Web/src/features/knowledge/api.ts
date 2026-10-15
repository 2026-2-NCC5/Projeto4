import { api, isApiError } from '@/services/api/client';
import type { KnowledgeArticleInput, KnowledgeArticleStatus, KnowledgeArticleUpdate, KnowledgeManageArticle, KnowledgeManageList } from '@/types/api';

/**
 * Gestão da base de conhecimento (equipe ASA e administração). Leitura exige `kb:read:all`; criar, editar,
 * enviar para revisão e restaurar exigem `kb:write`; publicar e arquivar, `kb:publish`. O servidor confere tudo.
 */

const enc = encodeURIComponent;

export const KB_PAGE_SIZE = 20;

export interface KnowledgeListQuery {
  /** lista separada por vírgula de KnowledgeArticleStatus */
  status?: string;
  /** busca lexical no título, resumo e texto da versão atual */
  search?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

export type KnowledgeAction = 'submit' | 'publish' | 'archive' | 'restore';

export const knowledgeApi = {
  list: (query: KnowledgeListQuery = {}) => api.get<KnowledgeManageList>('/api/knowledge-base/manage', { query: { ...query } }),
  get: (id: string) => api.get<KnowledgeManageArticle>(`/api/knowledge-base/manage/${enc(id)}`),
  create: (body: KnowledgeArticleInput) => api.post<KnowledgeManageArticle>('/api/knowledge-base/manage', body),
  update: (id: string, body: KnowledgeArticleUpdate) => api.put<KnowledgeManageArticle>(`/api/knowledge-base/manage/${enc(id)}`, body),
  action: (id: string, action: KnowledgeAction) => api.post<KnowledgeManageArticle>(`/api/knowledge-base/manage/${enc(id)}/${action}`),
};

export const knowledgeKeys = {
  all: ['knowledge', 'manage'] as const,
  lists: ['knowledge', 'manage', 'list'] as const,
  list: (query: KnowledgeListQuery) => ['knowledge', 'manage', 'list', query] as const,
  article: (id: string) => ['knowledge', 'manage', 'article', id] as const,
};

const conflict = (error: unknown, reason: string) => isApiError(error) && error.kind === 'conflict' && error.reason === reason;
/** 409: outra pessoa salvou uma versão depois da que estava sendo editada. */
export const isArticleChanged = (error: unknown) => conflict(error, 'article_changed');
/** 409: publicação bloqueada (política de segunda pessoa, artigo arquivado ou versão já publicada). */
export const isPublishBlocked = (error: unknown) => conflict(error, 'publish_blocked');
/** 409: já existe artigo com o mesmo endereço (slug). */
export const isSlugTaken = (error: unknown) => conflict(error, 'slug_taken');
/** 409: a situação mudou e a ação não vale mais (ex.: já arquivado). */
export const isInvalidTransition = (error: unknown) => conflict(error, 'invalid_transition');

export const ALL_STATUSES: KnowledgeArticleStatus[] = ['draft', 'in_review', 'published', 'archived'];

/** Endereço do artigo na Central de ajuda do aluno (a equipe não abre essa área; vê a prévia). */
export const studentArticlePath = (slug: string) => `/aluno/ajuda/${enc(slug)}`;

/** Limites do servidor (routes/knowledge.ts e knowledge/service.ts). */
export const KB_LIMITS = {
  title: { min: 3, max: 160 },
  summary: { min: 1, max: 400 },
  body: { min: 1, max: 20_000 },
  sourceLabel: 200,
  sourceUrl: 500,
  changeNote: 300,
  slug: 80,
} as const;
