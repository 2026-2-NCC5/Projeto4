import type { KnowledgeArticleStatus } from '../contracts/mobileApi.v1.js';
import { withTransaction, type DbClient, type DbPool } from '../db/pool.js';
import { ConflictError } from '../errors/AppError.js';
import type { KbArticleRecord, KbArticleWithVersion, KbNewVersion, KbSearchRow, KbVersionRecord, KnowledgeRepository } from './types.js';

const ARTICLE = `a.id, a.slug, a.category_id, a.audience, a.status, a.current_version, a.published_version, a.is_demo, a.owner_user_id,
  a.last_editor_id, le.full_name as last_editor_name, a.reviewed_by, a.published_at, to_char(a.review_due_at, 'YYYY-MM-DD') as review_due_at,
  a.created_at, a.updated_at`;
const VERSION = `v.article_id as v_article_id, v.version as v_version, v.title as v_title, v.summary as v_summary, v.body as v_body,
  v.source_label as v_source_label, v.source_url as v_source_url, v.change_note as v_change_note, v.created_by as v_created_by,
  vu.full_name as v_created_by_name, v.created_at as v_created_at`;

interface ArticleRow {
  id: string;
  slug: string;
  category_id: string | null;
  audience: KbArticleRecord['audience'];
  status: KnowledgeArticleStatus;
  current_version: number;
  published_version: number | null;
  is_demo: boolean;
  owner_user_id: string | null;
  last_editor_id: string | null;
  last_editor_name: string | null;
  reviewed_by: string | null;
  published_at: Date | null;
  review_due_at: string | null;
  created_at: Date;
  updated_at: Date;
}

interface VersionRow {
  v_article_id: string;
  v_version: number;
  v_title: string;
  v_summary: string;
  v_body: string;
  v_source_label: string | null;
  v_source_url: string | null;
  v_change_note: string | null;
  v_created_by: string | null;
  v_created_by_name: string | null;
  v_created_at: Date;
}

const mapArticle = (row: ArticleRow): KbArticleRecord => ({
  id: row.id,
  slug: row.slug,
  categoryId: row.category_id,
  audience: row.audience,
  status: row.status,
  currentVersion: row.current_version,
  publishedVersion: row.published_version,
  isDemo: row.is_demo,
  ownerUserId: row.owner_user_id,
  lastEditorId: row.last_editor_id,
  lastEditorName: row.last_editor_name,
  reviewedBy: row.reviewed_by,
  publishedAt: row.published_at,
  reviewDueAt: row.review_due_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapVersion = (row: VersionRow): KbVersionRecord => ({
  articleId: row.v_article_id,
  version: row.v_version,
  title: row.v_title,
  summary: row.v_summary,
  body: row.v_body,
  sourceLabel: row.v_source_label,
  sourceUrl: row.v_source_url,
  changeNote: row.v_change_note,
  createdBy: row.v_created_by,
  createdByName: row.v_created_by_name,
  createdAt: row.v_created_at,
});

const withVersion = (row: ArticleRow & VersionRow): KbArticleWithVersion => ({ ...mapArticle(row), shown: mapVersion(row) });

/**
 * Visível para leitura pública: tem versão publicada e não está arquivado. A situação do fluxo editorial
 * (rascunho/em revisão de uma alteração) não tira do ar a versão já publicada.
 */
const PUBLICLY_VISIBLE = "a.published_version is not null and a.status <> 'archived'";

const FROM = (versionColumn: 'published_version' | 'current_version') => `
  from kb_articles a
  join kb_article_versions v on v.article_id = a.id and v.version = a.${versionColumn}
  left join users le on le.id = a.last_editor_id
  left join users vu on vu.id = v.created_by`;

async function insertVersion(client: DbClient, articleId: string, version: number, input: KbNewVersion): Promise<void> {
  await client.query(
    `insert into kb_article_versions (article_id, version, title, summary, body, source_label, source_url, change_note, created_by, search_document)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [articleId, version, input.title, input.summary, input.body, input.sourceLabel, input.sourceUrl, input.changeNote, input.createdBy, input.searchDocument],
  );
}

export class PgKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly pool: DbPool) {}

  async listPublished(filter: { audience: string[]; categoryId?: string; limit: number; offset: number; includeDemo?: boolean }): Promise<{ items: KbArticleWithVersion[]; total: number }> {
    const { rows } = await this.pool.query<ArticleRow & VersionRow & { total: number }>(
      `select ${ARTICLE}, ${VERSION}, count(*) over ()::int as total ${FROM('published_version')}
        where ${PUBLICLY_VISIBLE} and ($5::boolean or not a.is_demo) and a.audience = any($1::text[]) and ($2::text is null or a.category_id = $2)
        order by v.title limit $3 offset $4`,
      [filter.audience, filter.categoryId ?? null, filter.limit, filter.offset, filter.includeDemo ?? true],
    );
    return { items: rows.map(withVersion), total: rows[0]?.total ?? 0 };
  }

  async search(filter: Parameters<KnowledgeRepository['search']>[0]): Promise<{ items: KbSearchRow[]; total: number }> {
    const column = filter.scope === 'published' ? 'published_version' : 'current_version';
    // leitura: só o que tem versão publicada (mesmo com alteração em revisão); gestão: filtro opcional de situação
    // ($5 sempre tipado)
    const statuses = filter.scope === 'published' ? null : (filter.statuses ?? null);
    const statusSql = filter.scope === 'published' ? `(${PUBLICLY_VISIBLE} and $5::text[] is null and ($7::boolean or not a.is_demo))` : '($5::text[] is null or a.status = any($5)) and $7::boolean is not null';
    const { rows } = await this.pool.query<ArticleRow & VersionRow & { score: number; excerpt: string; search_document: string; total: number }>(
      `select ${ARTICLE}, ${VERSION}, ts_rank_cd(v.search_vector, q.query) as score,
              ts_headline('portuguese', v.summary || ' ' || v.body, q.query, 'MaxWords=28, MinWords=8, MaxFragments=1, StartSel="", StopSel=""') as excerpt,
              v.search_document, count(*) over ()::int as total
         ${FROM(column)}
         cross join to_tsquery('portuguese', $1) as q(query)
        where ${statusSql} and a.audience = any($2::text[]) and ($3::text is null or a.category_id = $3) and v.search_vector @@ q.query
        order by score desc, v.title
        limit $4 offset $6`,
      [filter.tsQuery, filter.audience, filter.categoryId ?? null, filter.limit, statuses, filter.offset, filter.includeDemo ?? true],
    );
    return {
      items: rows.map((row) => ({ ...withVersion(row), score: Number(row.score), excerpt: row.excerpt, searchDocument: row.search_document })),
      total: rows[0]?.total ?? 0,
    };
  }

  async findPublished(idOrSlug: string, audience: string[], includeDemo = true): Promise<KbArticleWithVersion | null> {
    const { rows } = await this.pool.query<ArticleRow & VersionRow>(
      `select ${ARTICLE}, ${VERSION} ${FROM('published_version')} where (a.id = $1 or a.slug = $1) and ${PUBLICLY_VISIBLE} and ($3::boolean or not a.is_demo) and a.audience = any($2::text[])`,
      [idOrSlug, audience, includeDemo],
    );
    return rows[0] ? withVersion(rows[0]) : null;
  }

  async listManaged(filter: { statuses?: KnowledgeArticleStatus[]; categoryId?: string; limit: number; offset: number }) {
    const [list, counts] = await Promise.all([
      this.pool.query<ArticleRow & VersionRow & { total: number }>(
        `select ${ARTICLE}, ${VERSION}, count(*) over ()::int as total ${FROM('current_version')}
          where ($1::text[] is null or a.status = any($1)) and ($2::text is null or a.category_id = $2)
          order by a.updated_at desc, a.id limit $3 offset $4`,
        [filter.statuses ?? null, filter.categoryId ?? null, filter.limit, filter.offset],
      ),
      this.pool.query<{ status: KnowledgeArticleStatus; total: number }>('select status, count(*)::int as total from kb_articles group by status'),
    ]);
    return {
      items: list.rows.map(withVersion),
      total: list.rows[0]?.total ?? 0,
      counts: Object.fromEntries(counts.rows.map((row) => [row.status, row.total])) as Partial<Record<KnowledgeArticleStatus, number>>,
    };
  }

  async findById(id: string): Promise<KbArticleRecord | null> {
    const { rows } = await this.pool.query<ArticleRow>(`select ${ARTICLE} from kb_articles a left join users le on le.id = a.last_editor_id where a.id = $1`, [id]);
    return rows[0] ? mapArticle(rows[0]) : null;
  }

  async getVersion(id: string, version: number): Promise<KbVersionRecord | null> {
    const { rows } = await this.pool.query<VersionRow>(
      `select ${VERSION} from kb_article_versions v left join users vu on vu.id = v.created_by where v.article_id = $1 and v.version = $2`,
      [id, version],
    );
    return rows[0] ? mapVersion(rows[0]) : null;
  }

  async listVersions(id: string): Promise<KbVersionRecord[]> {
    const { rows } = await this.pool.query<VersionRow>(
      `select ${VERSION} from kb_article_versions v left join users vu on vu.id = v.created_by where v.article_id = $1 order by v.version desc`,
      [id],
    );
    return rows.map(mapVersion);
  }

  async create(input: Parameters<KnowledgeRepository['create']>[0]): Promise<KbArticleRecord> {
    try {
      await withTransaction(this.pool, async (client) => {
        await client.query(
          `insert into kb_articles (id, slug, category_id, audience, status, current_version, owner_user_id, last_editor_id, review_due_at)
           values ($1, $2, $3, $4, 'draft', 1, $5, $5, $6)`,
          [input.id, input.slug, input.categoryId, input.audience, input.version.createdBy, input.reviewDueAt],
        );
        await insertVersion(client, input.id, 1, input.version);
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictError('Já existe um artigo com este endereço (slug).', 'slug_taken');
      throw error;
    }
    return (await this.findById(input.id))!;
  }

  async addVersion(input: Parameters<KnowledgeRepository['addVersion']>[0]): Promise<KbArticleRecord | null> {
    const saved = await withTransaction(this.pool, async (client) => {
      const { rows } = await client.query<{ current_version: number }>(
        `update kb_articles set current_version = current_version + 1, category_id = $3, audience = $4, review_due_at = $5, status = $6, last_editor_id = $7
          where id = $1 and current_version = $2 returning current_version`,
        [input.id, input.expectedVersion, input.categoryId, input.audience, input.reviewDueAt, input.status, input.version.createdBy],
      );
      const next = rows[0]?.current_version;
      if (!next) return false;
      await insertVersion(client, input.id, next, input.version);
      return true;
    });
    return saved ? this.findById(input.id) : null;
  }

  async setStatus(input: Parameters<KnowledgeRepository['setStatus']>[0]): Promise<KbArticleRecord | null> {
    const has = (key: keyof typeof input) => Object.prototype.hasOwnProperty.call(input, key);
    const result = await this.pool.query(
      `update kb_articles set status = $2,
          published_version = case when $3 then $4 else published_version end,
          reviewed_by = case when $5 then $6 else reviewed_by end,
          published_at = case when $7 then $8 else published_at end
        where id = $1`,
      [input.id, input.status, has('publishedVersion'), input.publishedVersion ?? null, has('reviewedBy'), input.reviewedBy ?? null, has('publishedAt'), input.publishedAt ?? null],
    );
    return (result.rowCount ?? 0) > 0 ? this.findById(input.id) : null;
  }
}
