import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import type { AssistantBrainOverview, AssistantKnowledgeGapStatus, AssistantKnowledgeGapUpdate } from '../contracts/mobileApi.v1.js';
import { ok } from '../controllers/respond.js';
import { NotFoundError } from '../errors/AppError.js';
import type { GroundingArticle } from '../knowledge/service.js';
import { requirePermission, type DeniedAccessRecorder } from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validate.js';
import type { AuditService } from '../platform/auditService.js';
import type { Logger } from '../config/logger.js';
import type { GapStore } from './gaps.js';
import { BrainIndex } from './index.js';
import { runSiteSync, type SitePageStore } from './siteStore.js';
import { boilerplateOf, curatedSources, siteKey, siteNote, type Fetcher } from './siteSync.js';
import type { BrainNote, BrainSnapshot } from './vault.js';

/** Job diário do site: de onde ler e quanto ler por execução. */
export interface BrainSiteSync {
  store: SitePageStore;
  fetchText: Fetcher;
  maxPages: number;
  budgetMs: number;
  delayMs: number;
}

/** O cérebro relê as páginas do banco a cada 10 minutos (o job roda uma vez por dia). */
const SITE_CACHE_MS = 10 * 60_000;
const NEWS_DAYS = 365;
const REFRESH_DAYS = 30;

/**
 * Cérebro do assistente: notas do vault (compiladas no deploy) + páginas do site da FECAP que o job diário
 * guarda no banco (valem sem novo deploy) + memória das perguntas que ficaram sem resposta.
 */
export class BrainService {
  private index: BrainIndex;
  private siteLoadedAt = 0;
  private sitePages = 0;
  private loading: Promise<void> | null = null;

  constructor(
    private readonly snapshot: BrainSnapshot,
    private readonly gaps: GapStore,
    private readonly logger: Logger,
    private readonly now: () => Date,
    private readonly llmEnabled: boolean,
    private readonly site: BrainSiteSync | null = null,
  ) {
    this.index = new BrainIndex(snapshot);
  }

  /** Junta as páginas do banco ao vault: a versão do banco (mais nova) substitui a nota gerada da mesma URL. */
  private async refreshSite(force = false): Promise<void> {
    if (!this.site || (!force && Date.now() - this.siteLoadedAt < SITE_CACHE_MS)) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const pages = await this.site!.store.listActive();
        const boilerplate = boilerplateOf(pages);
        const fresh = pages.map((page) => siteNote(page, boilerplate)).filter((note): note is BrainNote => note !== null);
        const replaced = new Set(fresh.map((note) => siteKey(note.sourceUrl!)));
        const curated = curatedSources(this.snapshot.notes);
        const kept = this.snapshot.notes.filter((note) => !(note.generated && note.sourceUrl && replaced.has(siteKey(note.sourceUrl))));
        const notes = [...kept, ...fresh.filter((note) => !curated.has(siteKey(note.sourceUrl!)))];
        this.index = new BrainIndex({ hash: fresh.length ? `${this.snapshot.hash}+site${fresh.length}` : this.snapshot.hash, notes });
        this.sitePages = fresh.length;
      } catch (error) {
        // sem banco ou tabela: segue só com o vault compilado
        this.logger.warn({ error_type: error instanceof Error ? error.name : typeof error }, 'brain site pages not loaded');
      } finally {
        this.siteLoadedAt = Date.now();
        this.loading = null;
      }
    })();
    return this.loading;
  }

  /** Trechos do cérebro para a IA. Nunca lança: falha vira "sem trechos". */
  async grounding(question: string, limit = 3): Promise<GroundingArticle[]> {
    try {
      await this.refreshSite();
      return this.index.grounding(question, limit);
    } catch (error) {
      this.logger.warn({ error_type: error instanceof Error ? error.name : typeof error }, 'brain search failed');
      return [];
    }
  }

  /** Job diário `fecap-site-sync`: lê o que mudou no site da FECAP e atualiza o cérebro. */
  async syncSite(): Promise<Record<string, unknown>> {
    if (!this.site) return { skipped: true };
    const result = await runSiteSync(this.site.store, {
      fetchText: this.site.fetchText,
      curated: curatedSources(this.snapshot.notes),
      now: this.now,
      maxPages: this.site.maxPages,
      budgetMs: this.site.budgetMs,
      delayMs: this.site.delayMs,
      newsDays: NEWS_DAYS,
      refreshDays: REFRESH_DAYS,
    });
    if (!result.unchanged) await this.refreshSite(true);
    return result;
  }

  /** Guarda a dúvida sem resposta (sem dados de quem perguntou). Não bloqueia nem derruba a conversa. */
  recordGap(question: string, channel: 'text' | 'voice'): void {
    void this.gaps.record(question, channel, this.now()).catch((error: unknown) => {
      this.logger.warn({ error_type: error instanceof Error ? error.name : typeof error }, 'brain gap not recorded');
    });
  }

  async overview(filter: { status?: AssistantKnowledgeGapStatus; limit: number }): Promise<AssistantBrainOverview> {
    await this.refreshSite();
    const [gaps, site] = await Promise.all([this.gaps.list(filter), this.site ? this.site.store.stats().catch(() => null) : Promise.resolve(null)]);
    return { brain: { ...this.index.stats(), llmEnabled: this.llmEnabled, site: site ? { pages: this.sitePages, lastFetchedAt: site.lastFetchedAt } : null }, gaps };
  }

  async updateGap(id: string, input: AssistantKnowledgeGapUpdate, actorId: string | null) {
    const gap = await this.gaps.setStatus(id, { status: input.status, resolutionNote: input.resolutionNote?.trim() || null, actorId, at: this.now() });
    if (!gap) throw new NotFoundError('Pergunta não encontrada.', 'gap_not_found');
    return gap;
  }
}

export const gapUpdateSchema = z.object({
  status: z.enum(['open', 'resolved', 'ignored']),
  resolutionNote: z.string().trim().max(500).nullable().optional(),
}).strict();

type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap = (handler: AsyncHandler): RequestHandler => (req, res, next: NextFunction) => {
  handler(req, res).catch(next);
};

const STATUSES = new Set<AssistantKnowledgeGapStatus>(['open', 'resolved', 'ignored']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Painel: quem cuida da base de conhecimento vê o cérebro e resolve as lacunas. */
export function createBrainRouter(deps: { brain: BrainService; audit: AuditService; authed: RequestHandler; onDenied: DeniedAccessRecorder }): Router {
  const router = Router();
  const can = (permission: Parameters<typeof requirePermission>[0]) => requirePermission(permission, deps.onDenied);
  router.get('/api/assistant-brain', deps.authed, can('kb:read:all'), wrap(async (req, res) => {
    const status = typeof req.query.status === 'string' && STATUSES.has(req.query.status as AssistantKnowledgeGapStatus) ? (req.query.status as AssistantKnowledgeGapStatus) : undefined;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    ok(req, res, await deps.brain.overview({ status, limit }));
  }));
  router.patch('/api/assistant-brain/gaps/:id', deps.authed, can('kb:write'), validateBody(gapUpdateSchema), wrap(async (req, res) => {
    const id = String(req.params.id ?? '');
    if (!UUID.test(id)) throw new NotFoundError('Pergunta não encontrada.', 'gap_not_found');
    const body = req.body as AssistantKnowledgeGapUpdate;
    const gap = await deps.brain.updateGap(id, body, req.auth!.userId);
    await deps.audit.recordFor(req, { action: 'assistant.gap_updated', resourceType: 'assistant_gap', resourceId: id, metadata: { status: body.status } });
    ok(req, res, gap);
  }));
  return router;
}
