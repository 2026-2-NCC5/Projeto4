import type { DbPool } from '../db/pool.js';
import { discoverTargets, pause, parsePage, siteKey, type Fetcher, type SiteBlock, type SiteFolder, type SitePage, type SiteTarget } from './siteSync.js';

/** Páginas do site da FECAP guardadas pelo job diário (migration 018). */
export interface SitePageRecord extends SitePage {
  status: 'active' | 'gone' | 'failed';
  failCount: number;
  fetchedAt: Date;
}

export interface SitePageStore {
  listActive(): Promise<SitePage[]>;
  /** estado de todas as páginas conhecidas (para decidir o que reler) */
  states(): Promise<Array<{ url: string; lastmod: string | null; status: SitePageRecord['status']; failCount: number; fetchedAt: Date }>>;
  save(page: SitePage, at: Date): Promise<void>;
  markFailed(target: SiteTarget, at: Date): Promise<void>;
  /** páginas que saíram do site (ou notícias antigas) deixam de entrar no cérebro */
  markGone(urls: string[]): Promise<number>;
  stats(): Promise<{ pages: number; lastFetchedAt: string | null }>;
}

interface Row {
  url: string;
  folder: SiteFolder;
  title: string;
  blocks: SiteBlock[];
  lastmod: string | null;
}

export class PgSitePageStore implements SitePageStore {
  constructor(private readonly pool: DbPool) {}

  async listActive(): Promise<SitePage[]> {
    const { rows } = await this.pool.query<Row>(`select url, folder, title, blocks, to_char(lastmod, 'YYYY-MM-DD') as lastmod from assistant_site_pages where status = 'active' order by url`);
    return rows;
  }

  async states() {
    const { rows } = await this.pool.query<{ url: string; lastmod: string | null; status: SitePageRecord['status']; fail_count: number; fetched_at: Date }>(
      `select url, to_char(lastmod, 'YYYY-MM-DD') as lastmod, status, fail_count, fetched_at from assistant_site_pages`,
    );
    return rows.map((row) => ({ url: row.url, lastmod: row.lastmod, status: row.status, failCount: row.fail_count, fetchedAt: row.fetched_at }));
  }

  async save(page: SitePage, at: Date): Promise<void> {
    await this.pool.query(
      `insert into assistant_site_pages (url, folder, title, blocks, lastmod, status, fail_count, fetched_at)
       values ($1, $2, $3, $4::jsonb, $5, 'active', 0, $6)
       on conflict (url) do update set folder = excluded.folder, title = excluded.title, blocks = excluded.blocks,
         lastmod = excluded.lastmod, status = 'active', fail_count = 0, fetched_at = excluded.fetched_at`,
      [page.url, page.folder, page.title.slice(0, 300), JSON.stringify(page.blocks), page.lastmod, at],
    );
  }

  async markFailed(target: SiteTarget, at: Date): Promise<void> {
    // página que já estava no cérebro continua com o conteúdo anterior; só conta a falha
    await this.pool.query(
      `insert into assistant_site_pages (url, folder, title, lastmod, status, fail_count, fetched_at)
       values ($1, $2, $1, null, 'failed', 1, $3)
       on conflict (url) do update set fail_count = assistant_site_pages.fail_count + 1, fetched_at = excluded.fetched_at`,
      [target.url, target.folder, at],
    );
  }

  async markGone(urls: string[]): Promise<number> {
    if (urls.length === 0) return 0;
    const result = await this.pool.query(`update assistant_site_pages set status = 'gone' where url = any($1::text[]) and status <> 'gone'`, [urls]);
    return result.rowCount ?? 0;
  }

  async stats(): Promise<{ pages: number; lastFetchedAt: string | null }> {
    const { rows } = await this.pool.query<{ pages: string; last: Date | null }>(`select count(*) filter (where status = 'active')::text as pages, max(fetched_at) as last from assistant_site_pages`);
    return { pages: Number(rows[0]?.pages ?? 0), lastFetchedAt: rows[0]?.last?.toISOString() ?? null };
  }
}

/** Sem banco (dev/testes). */
export class MemorySitePageStore implements SitePageStore {
  readonly pages = new Map<string, SitePageRecord>();

  async listActive(): Promise<SitePage[]> {
    return [...this.pages.values()].filter((page) => page.status === 'active').map(({ url, folder, title, lastmod, blocks }) => ({ url, folder, title, lastmod, blocks }));
  }

  async states() {
    return [...this.pages.values()].map((page) => ({ url: page.url, lastmod: page.lastmod, status: page.status, failCount: page.failCount, fetchedAt: page.fetchedAt }));
  }

  async save(page: SitePage, at: Date): Promise<void> {
    this.pages.set(page.url, { ...page, status: 'active', failCount: 0, fetchedAt: at });
  }

  async markFailed(target: SiteTarget, at: Date): Promise<void> {
    const current = this.pages.get(target.url);
    if (current) Object.assign(current, { failCount: current.failCount + 1, fetchedAt: at });
    else this.pages.set(target.url, { url: target.url, folder: target.folder, title: target.url, lastmod: null, blocks: [], status: 'failed', failCount: 1, fetchedAt: at });
  }

  async markGone(urls: string[]): Promise<number> {
    let changed = 0;
    for (const url of urls) {
      const page = this.pages.get(url);
      if (page && page.status !== 'gone') {
        page.status = 'gone';
        changed += 1;
      }
    }
    return changed;
  }

  async stats(): Promise<{ pages: number; lastFetchedAt: string | null }> {
    const all = [...this.pages.values()];
    const last = all.reduce<Date | null>((max, page) => (!max || page.fetchedAt > max ? page.fetchedAt : max), null);
    return { pages: all.filter((page) => page.status === 'active').length, lastFetchedAt: last?.toISOString() ?? null };
  }
}

export interface SiteSyncOptions {
  fetchText: Fetcher;
  curated: Set<string>;
  now: () => Date;
  /** máximo de páginas lidas por execução (o resto fica para a próxima) */
  maxPages: number;
  /** orçamento de tempo da execução (a função da Vercel tem limite) */
  budgetMs: number;
  delayMs: number;
  newsDays: number;
  /** relê páginas sem mudança no sitemap depois deste tempo */
  refreshDays: number;
}

export interface SiteSyncResult {
  [key: string]: number | boolean;
  targets: number;
  fetched: number;
  failed: number;
  gone: number;
  pending: number;
  /** true = nada mudou no cérebro */
  unchanged: boolean;
}

/**
 * Uma execução do job: descobre as páginas pelos sitemaps, marca as que saíram, e lê as novas, as alteradas
 * (lastmod do sitemap mais novo) e as antigas, até o limite. Idempotente; o que não couber fica para amanhã.
 */
export async function runSiteSync(store: SitePageStore, options: SiteSyncOptions): Promise<SiteSyncResult> {
  const startedAt = Date.now();
  const today = options.now().toISOString().slice(0, 10);
  const targets = await discoverTargets(options.fetchText, { today, newsDays: options.newsDays, curated: options.curated, delayMs: options.delayMs });
  const known = new Map((await store.states()).map((state) => [siteKey(state.url), state]));
  const wanted = new Set(targets.map((target) => siteKey(target.url)));
  const gone = await store.markGone([...known.values()].filter((state) => !wanted.has(siteKey(state.url))).map((state) => state.url));
  const staleBefore = options.now().getTime() - options.refreshDays * 86_400_000;
  const due = targets
    .map((target) => ({ target, state: known.get(siteKey(target.url)) }))
    .filter(({ target, state }) => {
      if (!state || state.status === 'gone') return true;
      if (state.status === 'failed') return state.failCount < 5;
      if (target.lastmod && (!state.lastmod || target.lastmod > state.lastmod)) return true;
      return state.fetchedAt.getTime() < staleBefore;
    })
    // novas primeiro, depois as alteradas, depois as mais antigas
    .sort((a, b) => Number(Boolean(a.state)) - Number(Boolean(b.state)) || (a.state?.fetchedAt.getTime() ?? 0) - (b.state?.fetchedAt.getTime() ?? 0));
  let fetched = 0;
  let failed = 0;
  let processed = 0;
  for (const { target } of due) {
    if (processed >= options.maxPages || Date.now() - startedAt > options.budgetMs) break;
    processed += 1;
    try {
      const { title, blocks } = parsePage(await options.fetchText(target.url));
      await store.save({ url: target.url, folder: target.folder, title, lastmod: target.lastmod, blocks }, options.now());
      fetched += 1;
    } catch {
      await store.markFailed(target, options.now());
      failed += 1;
    }
    await pause(options.delayMs);
  }
  return { targets: targets.length, fetched, failed, gone, pending: due.length - processed, unchanged: fetched === 0 && gone === 0 };
}
