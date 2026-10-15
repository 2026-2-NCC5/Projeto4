import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KnowledgeArticleInput, KnowledgeArticleUpdate, KnowledgeManageArticle } from '@/types/api';
import { knowledgeApi, knowledgeKeys, type KnowledgeAction, type KnowledgeListQuery } from './api';

export function useKnowledgeList(query: KnowledgeListQuery, enabled = true) {
  return useQuery({ queryKey: knowledgeKeys.list(query), queryFn: () => knowledgeApi.list(query), placeholderData: keepPreviousData, enabled });
}

export function useKnowledgeArticle(id: string | undefined, enabled = true) {
  return useQuery({ queryKey: knowledgeKeys.article(id ?? ''), queryFn: () => knowledgeApi.get(id ?? ''), enabled: Boolean(id) && enabled });
}

/** Guarda o artigo devolvido pela API (fonte da verdade) e marca as listas como desatualizadas. */
function useStoreArticle() {
  const queryClient = useQueryClient();
  return (article: KnowledgeManageArticle) => {
    queryClient.setQueryData(knowledgeKeys.article(article.id), article);
    void queryClient.invalidateQueries({ queryKey: knowledgeKeys.lists });
  };
}

/** Criar artigo (nasce como rascunho, versão 1). Escrita nunca é repetida automaticamente. */
export function useCreateArticle() {
  const store = useStoreArticle();
  return useMutation({ mutationFn: (body: KnowledgeArticleInput) => knowledgeApi.create(body), onSuccess: store });
}

/** Nova versão com a versão esperada (409 `article_changed` se outra pessoa salvou antes). */
export function useUpdateArticle(id: string) {
  const store = useStoreArticle();
  return useMutation({ mutationFn: (body: KnowledgeArticleUpdate) => knowledgeApi.update(id, body), onSuccess: store });
}

/** Enviar para revisão, publicar, arquivar ou restaurar. */
export function useArticleAction(id: string) {
  const store = useStoreArticle();
  return useMutation({ mutationFn: (action: KnowledgeAction) => knowledgeApi.action(id, action), onSuccess: store });
}
