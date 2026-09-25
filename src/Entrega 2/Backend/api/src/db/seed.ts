import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createPool, withTransaction, type DbPool } from './pool.js';
import { resolveDatabaseDir } from './paths.js';

/** Aplica database/seeds/*.sql (idempotentes: usam on conflict do nothing). */
export async function runSeeds(pool: DbPool, log: (message: string) => void = console.log): Promise<string[]> {
  const dir = path.join(resolveDatabaseDir(), 'seeds');
  const files = readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(dir, file), 'utf8');
    await withTransaction(pool, async (client) => {
      await client.query(sql);
    });
    log(`seed aplicado: ${file}`);
  }
  return files;
}

async function main(): Promise<void> {
  const { loadConfig } = await import('../config/env.js');
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error('DATABASE_URL não configurada');
  const pool = createPool(config.databaseUrl, config.databaseSsl);
  try {
    await runSeeds(pool);
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
