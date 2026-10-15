import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { AppConfig } from '../config/env.js';
import { createPool, databaseHost, isRemoteDatabaseUrl, withTransaction, type DbPool } from './pool.js';
import { resolveDatabaseDir } from './paths.js';

/**
 * Seeds fictícios só rodam em banco de desenvolvimento/teste identificado (DEMO_DATA_POLICY):
 * nunca em produção e, em banco remoto, só com DEMO_SEED_ALLOW_REMOTE=true (banco de demonstração).
 */
export function seedDecision(config: Pick<AppConfig, 'nodeEnv' | 'appEnv' | 'databaseUrl' | 'demo'>): { allowed: true } | { allowed: false; reason: string } {
  if (!config.demo.seedEnabled) return { allowed: false, reason: 'DEMO_SEED_ENABLED=false' };
  if (config.nodeEnv === 'production' || config.appEnv === 'production') return { allowed: false, reason: 'ambiente de produção' };
  if (!config.demo.dataEnabled) return { allowed: false, reason: 'DEMO_DATA_ENABLED=false (dados fictícios desligados)' };
  if (config.databaseUrl && isRemoteDatabaseUrl(config.databaseUrl) && !config.demo.seedAllowRemote) {
    return { allowed: false, reason: `banco remoto (${databaseHost(config.databaseUrl)}); defina DEMO_SEED_ALLOW_REMOTE=true só para um banco de demonstração` };
  }
  return { allowed: true };
}

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
  const decision = seedDecision(config);
  if (!decision.allowed) {
    // não é erro: o container segue para a API sem dados fictícios
    console.log(`seeds de demonstração ignorados: ${decision.reason}`);
    return;
  }
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
