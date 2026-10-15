import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, isApiError } from '@/services/api/client';
import type { KnowledgeArticle, KnowledgeSearchResult } from '@/types/api';

/**
 * Central de ajuda sobre a base de conhecimento (v1.7): só a versão PUBLICADA de cada artigo, com busca lexical
 * no servidor (PostgreSQL, português). `:slug` aceita o slug ou o id do artigo — os links antigos da Central
 * (id do catálogo = slug do artigo) continuam funcionando.
 */
export interface KnowledgeQuery {
  search?: string;
  category?: string;
  page?: number;
}

export const knowledgeApi = {
  list: (query: KnowledgeQuery = {}) => api.get<KnowledgeSearchResult>('/api/knowledge-base', { query: { search: query.search, category: query.category, page: query.page && query.page > 1 ? query.page : undefined } }),
  get: (slug: string) => api.get<KnowledgeArticle>(`/api/knowledge-base/${encodeURIComponent(slug)}`),
};

export const knowledgeKeys = {
  all: ['knowledge'] as const,
  list: (query: KnowledgeQuery) => ['knowledge', 'list', query.search ?? '', query.category ?? '', query.page ?? 1] as const,
  article: (slug: string) => ['knowledge', 'article', slug] as const,
};

/** 403 `feature_disabled`: a administração desligou a base de conhecimento. */
export const isKnowledgeDisabled = (error: unknown): boolean => isApiError(error) && error.kind === 'forbidden' && error.reason === 'feature_disabled';
/** 503 `database_required`: a base de conhecimento depende do PostgreSQL. */
export const isKnowledgeUnavailable = (error: unknown): boolean => isApiError(error) && error.status === 503;

function retryKnowledge(failureCount: number, error: Error): boolean {
  if (isApiError(error) && (error.status === 503 || !['network', 'timeout', 'server'].includes(error.kind))) return false;
  return failureCount < 2;
}

export function useKnowledgeList(query: KnowledgeQuery, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: knowledgeKeys.list(query),
    queryFn: () => knowledgeApi.list(query),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: retryKnowledge,
    enabled: options.enabled ?? true,
  });
}

export function useKnowledgeArticle(slug: string) {
  return useQuery({ queryKey: knowledgeKeys.article(slug), queryFn: () => knowledgeApi.get(slug), enabled: Boolean(slug), staleTime: 60_000, retry: retryKnowledge });
}
