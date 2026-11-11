import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildOfficialArticles, type OfficialArticle, type OfficialSnapshot } from '../knowledge/official.js';
import { createPool, databaseHost, withTransaction, type DbPool } from './pool.js';
import { resolveDatabaseDir } from './paths.js';

/**
 * Conteúdo OFICIAL da base de conhecimento (database/content/), diferente dos seeds fictícios:
 * pode ser aplicado em qualquer ambiente, inclusive produção. Hoje: a Cesta de Serviços pública do ASA.
 *
 * Idempotente e conservador: artigo que já existe (mesmo id ou slug) não é alterado, então edições da
 * equipe do ASA no painel nunca são sobrescritas. Para trazer uma versão nova, edite pelo painel.
 */
export function loadOfficialSnapshot(file = path.join(resolveDatabaseDir(), 'content', 'asa_cesta_de_servicos.json')): OfficialSnapshot {
  return JSON.parse(readFileSync(file, 'utf8')) as OfficialSnapshot;
}

export async function applyOfficialContent(pool: DbPool, articles: OfficialArticle[]): Promise<{ inserted: number; skipped: number }> {
  return withTransaction(pool, async (client) => {
    let inserted = 0;
    for (const article of articles) {
      const created = await client.query(
        `insert into kb_articles (id, slug, category_id, audience, status, current_version, published_version, is_demo, published_at, review_due_at)
         values ($1, $2, $3, 'student', 'published', 1, 1, false, $4, $5)
         on conflict do nothing`,
        [article.id, article.slug, article.categoryId, article.publishedAt, article.reviewDueAt],
      );
      if (created.rowCount === 0) continue;
      await client.query(
        `insert into kb_article_versions (article_id, version, title, summary, body, source_label, source_url, change_note, search_document)
         values ($1, 1, $2, $3, $4, $5, $6, $7, $8)`,
        [article.id, article.title, article.summary, article.body, article.sourceLabel, article.sourceUrl, article.changeNote, article.searchDocument],
      );
      inserted += 1;
    }
    return { inserted, skipped: articles.length - inserted };
  });
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const articles = buildOfficialArticles(loadOfficialSnapshot());
  if (dryRun) {
    console.log(`${articles.length} artigos oficiais prontos (simulação, nada gravado)`);
    return;
  }
  const { loadConfig } = await import('../config/env.js');
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error('DATABASE_URL não configurada');
  const pool = createPool(config.databaseUrl, config.databaseSsl);
  try {
    const result = await applyOfficialContent(pool, articles);
    console.log(`conteúdo oficial em ${databaseHost(config.databaseUrl) ?? 'banco'}: ${result.inserted} artigos novos, ${result.skipped} já existiam (mantidos)`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
