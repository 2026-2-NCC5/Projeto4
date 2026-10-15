import { randomUUID } from 'node:crypto';
import { hasPermission } from '../auth/permissions.js';
import type {
  KnowledgeArticle,
  KnowledgeArticleInput,
  KnowledgeArticleStatus,
  KnowledgeArticleSummary,
  KnowledgeArticleUpdate,
  KnowledgeAudience,
  KnowledgeManageArticle,
  KnowledgeManageList,
  KnowledgeManageSummary,
  KnowledgeSearchResult,
  KnowledgeVersion,
  SupportHelpArticle,
  UserRole,
} from '../contracts/mobileApi.v1.js';
import { ConflictError, DependencyError, ForbiddenError, NotFoundError, ValidationError } from '../errors/AppError.js';
import type { AuditActor, AuditService } from '../platform/auditService.js';
import type { PlatformService } from '../platform/platformService.js';
import type { SettingsService } from '../platform/settingsService.js';
import { findCategory } from '../support/catalog.js';
import { extractSteps, queryTerms, searchDocument, slugify, stripMarkdown, termCoverage, toTsQuery } from './text.js';
import type { KbArticleRecord, KbArticleWithVersion, KbVersionRecord, KnowledgeRepository } from './types.js';

const STATUSES: KnowledgeArticleStatus[] = ['draft', 'in_review', 'published', 'archived'];
const RESERVED_SLUGS = new Set(['manage']);
const MAX_PAGE = 50;

/** Resposta candidata para o assistente: artigo publicado + quão bem a pergunta foi coberta. */
export interface KnowledgeAnswer {
  article: KbArticleWithVersion;
  steps: string[];
  coverage: number;
  score: number;
}

/**
 * Base de conhecimento do ASA: leitura da versão publicada, busca lexical (PostgreSQL, português) e
 * fluxo editorial (rascunho → revisão → publicação → arquivamento) com versões imutáveis e auditoria.
 */
export class KnowledgeService {
  constructor(
    private readonly store: KnowledgeRepository | null,
    private readonly platform: PlatformService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly now: () => Date,
  ) {}

  get available(): boolean {
    return this.store !== null;
  }

  private repo(): KnowledgeRepository {
    if (!this.store) throw new DependencyError('A base de conhecimento exige o banco de dados PostgreSQL.', undefined, 'database_required');
    return this.store;
  }

  /** Demonstração desligada: artigos fictícios (is_demo) não chegam ao aluno nem ao assistente. */
  private get includeDemo(): boolean {
    return this.platform.dataMode === 'demo';
  }

  private audiences(role: UserRole): KnowledgeAudience[] {
    return hasPermission(role, 'kb:read:all') ? ['student', 'staff'] : ['student'];
  }

  private summary(record: KbArticleWithVersion): KnowledgeArticleSummary {
    return {
      id: record.id,
      slug: record.slug,
      title: record.shown.title,
      summary: record.shown.summary,
      categoryId: record.categoryId,
      categoryLabel: record.categoryId ? (findCategory(record.categoryId)?.label ?? null) : null,
      audience: record.audience,
      version: record.shown.version,
      publishedAt: record.publishedAt?.toISOString() ?? null,
      sourceLabel: record.shown.sourceLabel,
      isDemo: record.isDemo,
    };
  }

  // ---------------------------------------------------------------- leitura

  async listPublished(role: UserRole, input: { search?: string; category?: string; page?: number; pageSize?: number }): Promise<KnowledgeSearchResult> {
    await this.platform.assertEnabled('knowledgeBase');
    const repo = this.repo();
    const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), MAX_PAGE);
    const page = Math.max(input.page ?? 1, 1);
    const audience = this.audiences(role);
    const tsQuery = input.search ? toTsQuery(queryTerms(input.search)) : null;
    if (tsQuery) {
      const result = await repo.search({ tsQuery, audience, scope: 'published', ...(input.category ? { categoryId: input.category } : {}), limit: pageSize, offset: (page - 1) * pageSize, includeDemo: this.includeDemo });
      return {
        items: result.items.map((row) => ({ ...this.summary(row), excerpt: stripMarkdown(row.excerpt), score: Math.round(row.score * 1000) / 1000 })),
        total: result.total,
        page,
        pageSize,
        mode: 'lexical',
      };
    }
    const result = await repo.listPublished({ audience, ...(input.category ? { categoryId: input.category } : {}), limit: pageSize, offset: (page - 1) * pageSize, includeDemo: this.includeDemo });
    return { items: result.items.map((row) => ({ ...this.summary(row), excerpt: row.shown.summary, score: 0 })), total: result.total, page, pageSize, mode: 'lexical' };
  }

  async getPublished(role: UserRole, idOrSlug: string): Promise<KnowledgeArticle> {
    await this.platform.assertEnabled('knowledgeBase');
    const record = await this.repo().findPublished(idOrSlug, this.audiences(role), this.includeDemo);
    if (!record) throw new NotFoundError('Artigo não encontrado.');
    return { ...this.summary(record), body: record.shown.body, sourceUrl: record.shown.sourceUrl, updatedAt: record.shown.createdAt.toISOString() };
  }

  /**
   * Melhor artigo publicado (público de alunos) para uma pergunta em linguagem natural. Devolve null quando
   * nada cobre a pergunta de forma confiável — o assistente então se abstém e oferece atendimento humano.
   */
  async bestAnswer(question: string, options: { minCoverage: number; minScore: number }): Promise<{ answer: KnowledgeAnswer | null; candidates: number }> {
    if (!this.store || !(await this.platform.isEnabled('assistantKnowledgeAnswers'))) return { answer: null, candidates: 0 };
    const terms = queryTerms(question);
    const tsQuery = toTsQuery(terms);
    if (!tsQuery) return { answer: null, candidates: 0 };
    const { items } = await this.store.search({ tsQuery, audience: ['student'], scope: 'published', limit: 3, offset: 0, includeDemo: this.includeDemo });
    const ranked = items
      .map((row) => ({ row, coverage: termCoverage(terms, row.searchDocument) }))
      .filter((candidate) => candidate.coverage >= options.minCoverage && candidate.row.score >= options.minScore)
      .sort((a, b) => b.coverage - a.coverage || b.row.score - a.row.score);
    const best = ranked[0];
    // `candidates` > 0 sem resposta = assunto relacionado ao ASA, mas sem artigo que responda com segurança
    if (!best) return { answer: null, candidates: items.length };
    return { answer: { article: best.row, steps: extractSteps(best.row.shown.body), coverage: best.coverage, score: best.row.score }, candidates: items.length };
  }

  /** Artigos publicados no formato da Central de ajuda do app (passo a passo). null = sem banco. */
  async helpArticles(): Promise<SupportHelpArticle[] | null> {
    if (!this.store || !(await this.platform.isEnabled('knowledgeBase'))) return null;
    const { items } = await this.store.listPublished({ audience: ['student'], limit: 200, offset: 0, includeDemo: this.includeDemo });
    return items
      .filter((item) => item.categoryId)
      .map((item) => ({ id: item.slug, categoryId: item.categoryId!, title: item.shown.title, summary: item.shown.summary, steps: extractSteps(item.shown.body).filter((step) => step !== item.shown.summary) }));
  }

  // ----------------------------------------------------------------- gestão

  private manageSummary(record: KbArticleRecord, shown: KbVersionRecord): KnowledgeManageSummary {
    return {
      id: record.id,
      slug: record.slug,
      title: shown.title,
      status: record.status,
      audience: record.audience,
      categoryId: record.categoryId,
      categoryLabel: record.categoryId ? (findCategory(record.categoryId)?.label ?? null) : null,
      currentVersion: record.currentVersion,
      publishedVersion: record.publishedVersion,
      hasUnpublishedChanges: record.publishedVersion !== null && record.currentVersion > record.publishedVersion,
      isDemo: record.isDemo,
      lastEditor: record.lastEditorName,
      updatedAt: record.updatedAt.toISOString(),
      publishedAt: record.publishedAt?.toISOString() ?? null,
      reviewDueAt: record.reviewDueAt,
    };
  }

  private version(record: KbVersionRecord): KnowledgeVersion {
    return {
      version: record.version,
      title: record.title,
      summary: record.summary,
      body: record.body,
      sourceLabel: record.sourceLabel,
      sourceUrl: record.sourceUrl,
      changeNote: record.changeNote,
      createdAt: record.createdAt.toISOString(),
      createdBy: record.createdByName,
    };
  }

  async listManaged(input: { status?: string; search?: string; category?: string; page?: number; pageSize?: number }): Promise<KnowledgeManageList> {
    const repo = this.repo();
    const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), MAX_PAGE);
    const page = Math.max(input.page ?? 1, 1);
    const statuses = input.status ? (input.status.split(',').filter((value) => (STATUSES as string[]).includes(value)) as KnowledgeArticleStatus[]) : undefined;
    const counts = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<KnowledgeArticleStatus, number>;
    const tsQuery = input.search ? toTsQuery(queryTerms(input.search)) : null;
    if (tsQuery) {
      const result = await repo.search({ tsQuery, audience: ['student', 'staff'], scope: 'current', ...(statuses ? { statuses } : {}), ...(input.category ? { categoryId: input.category } : {}), limit: pageSize, offset: (page - 1) * pageSize });
      const all = await repo.listManaged({ limit: 1, offset: 0 });
      return { items: result.items.map((row) => this.manageSummary(row, row.shown)), total: result.total, page, pageSize, counts: { ...counts, ...all.counts } };
    }
    const result = await repo.listManaged({ ...(statuses ? { statuses } : {}), ...(input.category ? { categoryId: input.category } : {}), limit: pageSize, offset: (page - 1) * pageSize });
    return { items: result.items.map((row) => this.manageSummary(row, row.shown)), total: result.total, page, pageSize, counts: { ...counts, ...result.counts } };
  }

  async getManaged(id: string, viewer: { userId: string; role: UserRole }): Promise<KnowledgeManageArticle> {
    const repo = this.repo();
    const record = await repo.findById(id);
    if (!record) throw new NotFoundError('Artigo não encontrado.');
    const versions = await repo.listVersions(id);
    const current = versions.find((item) => item.version === record.currentVersion)!;
    const published = record.publishedVersion ? (versions.find((item) => item.version === record.publishedVersion) ?? null) : null;
    const blocked = await this.publishBlocker(record, viewer);
    return {
      ...this.manageSummary(record, current),
      current: this.version(current),
      published: published ? this.version(published) : null,
      versions: versions.map((item) => ({ version: item.version, createdAt: item.createdAt.toISOString(), createdBy: item.createdByName, changeNote: item.changeNote })),
      canPublish: blocked === null,
      publishBlockedReason: blocked,
    };
  }

  private validate(input: KnowledgeArticleInput): void {
    const details: Array<{ field: string; message: string }> = [];
    if (input.title.trim().length < 3 || input.title.trim().length > 160) details.push({ field: 'title', message: '3 a 160 caracteres' });
    if (!input.summary.trim() || input.summary.trim().length > 400) details.push({ field: 'summary', message: '1 a 400 caracteres' });
    if (!input.body.trim() || input.body.length > 20_000) details.push({ field: 'body', message: '1 a 20.000 caracteres' });
    if (input.categoryId && !findCategory(input.categoryId)) details.push({ field: 'categoryId', message: 'categoria desconhecida' });
    if (input.sourceUrl && !/^https:\/\/[^\s]+$/.test(input.sourceUrl)) details.push({ field: 'sourceUrl', message: 'use um endereço https' });
    if (input.reviewDueAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.reviewDueAt)) details.push({ field: 'reviewDueAt', message: 'use AAAA-MM-DD' });
    if (details.length > 0) throw new ValidationError('Artigo inválido.', details);
  }

  private newVersion(input: KnowledgeArticleInput, userId: string) {
    const title = input.title.trim();
    const summary = input.summary.trim();
    const body = input.body.trim();
    return {
      title,
      summary,
      body,
      sourceLabel: input.sourceLabel?.trim() || null,
      sourceUrl: input.sourceUrl?.trim() || null,
      changeNote: input.changeNote?.trim() || null,
      searchDocument: searchDocument(title, summary, body),
      createdBy: userId,
    };
  }

  async create(actor: AuditActor & { userId: string; role: UserRole }, input: KnowledgeArticleInput): Promise<KnowledgeManageArticle> {
    this.validate(input);
    const slug = input.slug ? input.slug.trim() : slugify(input.title);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) throw new ValidationError('Endereço (slug) inválido.', [{ field: 'slug', message: 'use letras minúsculas, números e hífens' }]);
    // "manage" é rota da gestão (/api/knowledge-base/manage): um artigo com esse endereço ficaria inacessível
    if (RESERVED_SLUGS.has(slug)) throw new ConflictError('Este endereço é reservado. Escolha outro título ou endereço.', 'slug_taken');
    const id = `kb-${randomUUID()}`;
    await this.repo().create({ id, slug, categoryId: input.categoryId ?? null, audience: input.audience ?? 'student', reviewDueAt: input.reviewDueAt ?? null, version: this.newVersion(input, actor.userId) });
    await this.audit.record(actor, { action: 'kb.article_created', resourceType: 'kb_article', resourceId: id, metadata: { slug } });
    return this.getManaged(id, actor);
  }

  /** Salva uma nova versão. Artigo publicado continua no ar com a versão anterior até nova publicação. */
  async update(actor: AuditActor & { userId: string; role: UserRole }, id: string, input: KnowledgeArticleUpdate): Promise<KnowledgeManageArticle> {
    this.validate(input);
    const repo = this.repo();
    const record = await repo.findById(id);
    if (!record) throw new NotFoundError('Artigo não encontrado.');
    const status: KnowledgeArticleStatus = record.status === 'archived' ? 'draft' : record.status === 'in_review' ? 'draft' : record.status;
    const saved = await repo.addVersion({
      id,
      expectedVersion: input.expectedVersion,
      categoryId: input.categoryId === undefined ? record.categoryId : input.categoryId,
      audience: input.audience ?? record.audience,
      reviewDueAt: input.reviewDueAt === undefined ? record.reviewDueAt : input.reviewDueAt,
      version: this.newVersion(input, actor.userId),
      status,
    });
    if (!saved) throw new ConflictError('Outra pessoa salvou este artigo antes. Recarregue para ver a versão mais nova.', 'article_changed');
    await this.audit.record(actor, { action: 'kb.article_updated', resourceType: 'kb_article', resourceId: id, metadata: { version: saved.currentVersion } });
    return this.getManaged(id, actor);
  }

  async submit(actor: AuditActor & { userId: string; role: UserRole }, id: string): Promise<KnowledgeManageArticle> {
    const repo = this.repo();
    const record = await repo.findById(id);
    if (!record) throw new NotFoundError('Artigo não encontrado.');
    if (record.status !== 'draft' && !(record.status === 'published' && record.publishedVersion !== record.currentVersion)) {
      throw new ConflictError('Só rascunhos (ou alterações ainda não publicadas) vão para revisão.', 'invalid_transition');
    }
    await repo.setStatus({ id, status: 'in_review' });
    await this.audit.record(actor, { action: 'kb.article_submitted', resourceType: 'kb_article', resourceId: id, metadata: { version: record.currentVersion } });
    return this.getManaged(id, actor);
  }

  private async publishBlocker(record: KbArticleRecord, viewer: { userId: string; role: UserRole }): Promise<string | null> {
    if (!hasPermission(viewer.role, 'kb:publish')) return 'Seu perfil não pode publicar artigos.';
    if (record.status === 'archived') return 'Restaure o artigo antes de publicar.';
    if (record.status === 'published' && record.publishedVersion === record.currentVersion) return 'A versão atual já está publicada.';
    const policy = await this.settings.get('knowledge.policy');
    if (policy.requireSecondReviewer && record.lastEditorId === viewer.userId) return 'A política exige que outra pessoa da equipe revise e publique.';
    return null;
  }

  async publish(actor: AuditActor & { userId: string; role: UserRole }, id: string): Promise<KnowledgeManageArticle> {
    const repo = this.repo();
    const record = await repo.findById(id);
    if (!record) throw new NotFoundError('Artigo não encontrado.');
    const blocked = await this.publishBlocker(record, actor);
    if (blocked) throw new ConflictError(blocked, 'publish_blocked');
    await repo.setStatus({ id, status: 'published', publishedVersion: record.currentVersion, reviewedBy: actor.userId, publishedAt: this.now() });
    await this.audit.record(actor, { action: 'kb.article_published', resourceType: 'kb_article', resourceId: id, metadata: { version: record.currentVersion } });
    return this.getManaged(id, actor);
  }

  async archive(actor: AuditActor & { userId: string; role: UserRole }, id: string): Promise<KnowledgeManageArticle> {
    if (!hasPermission(actor.role, 'kb:publish')) throw new ForbiddenError('Seu perfil não pode arquivar artigos.', 'permission_denied');
    const repo = this.repo();
    const record = await repo.findById(id);
    if (!record) throw new NotFoundError('Artigo não encontrado.');
    if (record.status === 'archived') throw new ConflictError('O artigo já está arquivado.', 'invalid_transition');
    await repo.setStatus({ id, status: 'archived' });
    await this.audit.record(actor, { action: 'kb.article_archived', resourceType: 'kb_article', resourceId: id });
    return this.getManaged(id, actor);
  }

  async restore(actor: AuditActor & { userId: string; role: UserRole }, id: string): Promise<KnowledgeManageArticle> {
    const repo = this.repo();
    const record = await repo.findById(id);
    if (!record) throw new NotFoundError('Artigo não encontrado.');
    if (record.status !== 'archived') throw new ConflictError('Só artigos arquivados podem ser restaurados.', 'invalid_transition');
    await repo.setStatus({ id, status: 'draft', publishedVersion: null, publishedAt: null });
    await this.audit.record(actor, { action: 'kb.article_updated', resourceType: 'kb_article', resourceId: id, metadata: { restored: true } });
    return this.getManaged(id, actor);
  }
}
