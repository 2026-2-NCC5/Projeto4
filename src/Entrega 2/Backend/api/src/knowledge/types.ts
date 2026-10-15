import type { KnowledgeArticleStatus, KnowledgeAudience } from '../contracts/mobileApi.v1.js';

export interface KbVersionRecord {
  articleId: string;
  version: number;
  title: string;
  summary: string;
  body: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  changeNote: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Date;
}

export interface KbArticleRecord {
  id: string;
  slug: string;
  categoryId: string | null;
  audience: KnowledgeAudience;
  status: KnowledgeArticleStatus;
  currentVersion: number;
  publishedVersion: number | null;
  isDemo: boolean;
  ownerUserId: string | null;
  lastEditorId: string | null;
  lastEditorName: string | null;
  reviewedBy: string | null;
  publishedAt: Date | null;
  reviewDueAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Artigo com a versão exibida (publicada para leitura; atual para gestão). */
export interface KbArticleWithVersion extends KbArticleRecord {
  shown: KbVersionRecord;
}

export interface KbSearchRow extends KbArticleWithVersion {
  score: number;
  excerpt: string;
  /** documento normalizado da versão (cobertura dos termos) */
  searchDocument: string;
}

export interface KbNewVersion {
  title: string;
  summary: string;
  body: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  changeNote: string | null;
  searchDocument: string;
  createdBy: string;
}

export interface KnowledgeRepository {
  /** artigos publicados para o público (lê a versão publicada) */
  /** `includeDemo=false` (demonstração desligada): artigos fictícios (is_demo) não aparecem na leitura pública */
  listPublished(filter: { audience: KnowledgeAudience[]; categoryId?: string; limit: number; offset: number; includeDemo?: boolean }): Promise<{ items: KbArticleWithVersion[]; total: number }>;
  /** busca lexical (português) na versão publicada (leitura) ou atual (gestão) */
  search(filter: { tsQuery: string; audience: KnowledgeAudience[]; scope: 'published' | 'current'; categoryId?: string; statuses?: KnowledgeArticleStatus[]; limit: number; offset: number; includeDemo?: boolean }): Promise<{ items: KbSearchRow[]; total: number }>;
  findPublished(idOrSlug: string, audience: KnowledgeAudience[], includeDemo?: boolean): Promise<KbArticleWithVersion | null>;
  listManaged(filter: { statuses?: KnowledgeArticleStatus[]; categoryId?: string; limit: number; offset: number }): Promise<{ items: KbArticleWithVersion[]; total: number; counts: Partial<Record<KnowledgeArticleStatus, number>> }>;
  findById(id: string): Promise<KbArticleRecord | null>;
  getVersion(id: string, version: number): Promise<KbVersionRecord | null>;
  listVersions(id: string): Promise<KbVersionRecord[]>;
  /** cria o artigo (rascunho, versão 1). Lança ConflictError('slug_taken') se o slug existir. */
  create(input: { id: string; slug: string; categoryId: string | null; audience: KnowledgeAudience; reviewDueAt: string | null; version: KbNewVersion }): Promise<KbArticleRecord>;
  /** nova versão se `expectedVersion` ainda for a atual (null = alguém salvou antes) */
  addVersion(input: { id: string; expectedVersion: number; categoryId: string | null; audience: KnowledgeAudience; reviewDueAt: string | null; version: KbNewVersion; status: KnowledgeArticleStatus }): Promise<KbArticleRecord | null>;
  setStatus(input: { id: string; status: KnowledgeArticleStatus; publishedVersion?: number | null; reviewedBy?: string | null; publishedAt?: Date | null }): Promise<KbArticleRecord | null>;
}
