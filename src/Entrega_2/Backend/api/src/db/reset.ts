import { createPool, databaseHost, isRemoteDatabaseUrl, type DbPool } from './pool.js';
import { runMigrations } from './migrate.js';
import { runSeeds } from './seed.js';

export interface ResetOptions {
  /** URL do banco alvo: bancos remotos (Supabase) só são recriados com `allowRemote`. */
  databaseUrl?: string;
  allowRemote?: boolean;
}

/**
 * Recria o schema public do zero e reaplica migrations + seeds. Bloqueado em produção e, por
 * padrão, em bancos remotos (ALLOW_REMOTE_DB_RESET=true libera de forma explícita).
 */
export async function resetDatabase(pool: DbPool, log: (message: string) => void = console.log, options: ResetOptions = {}): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('db:reset é bloqueado em produção');
  }
  if (options.databaseUrl && isRemoteDatabaseUrl(options.databaseUrl) && !options.allowRemote) {
    throw new Error(`db:reset é bloqueado para bancos remotos (${databaseHost(options.databaseUrl)}). Defina ALLOW_REMOTE_DB_RESET=true se tiver certeza.`);
  }
  await pool.query('drop schema if exists public cascade');
  await pool.query('create schema public');
  log('schema public recriado');
  await runMigrations(pool, log);
  await runSeeds(pool, log);
}

async function main(): Promise<void> {
  const { loadConfig } = await import('../config/env.js');
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error('DATABASE_URL não configurada');
  const pool = createPool(config.databaseUrl, config.databaseSsl);
  try {
    await resetDatabase(pool, console.log, { databaseUrl: config.databaseUrl, allowRemote: config.allowRemoteDbReset });
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
