import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createPool, withTransaction, type DbPool } from './pool.js';
import { resolveDatabaseDir } from './paths.js';

/**
 * Runner de migrations SQL: aplica database/migrations/*.sql em ordem
 * lexicográfica, uma única vez cada (tabela schema_migrations).
 */
export async function runMigrations(pool: DbPool, log: (message: string) => void = console.log): Promise<string[]> {
  const dir = path.join(resolveDatabaseDir(), 'migrations');
  await pool.query(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const applied = new Set((await pool.query<{ name: string }>('select name from schema_migrations')).rows.map((row) => row.name));
  const files = readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();
  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(dir, file), 'utf8');
    await withTransaction(pool, async (client) => {
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
    });
    newlyApplied.push(file);
    log(`migration aplicada: ${file}`);
  }
  if (newlyApplied.length === 0) log('nenhuma migration pendente');
  return newlyApplied;
}

async function main(): Promise<void> {
  const { loadConfig } = await import('../config/env.js');
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error('DATABASE_URL não configurada');
  const pool = createPool(config.databaseUrl, config.databaseSsl);
  try {
    await runMigrations(pool);
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
