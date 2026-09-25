import 'dotenv/config';
import { createPool, type DbPool } from '../../src/db/pool.js';
import { resetDatabase } from '../../src/db/reset.js';
import { createPgRepositories } from '../../src/repositories/pgRepositories.js';
import type { Repositories } from '../../src/repositories/types.js';

/**
 * Banco real para testes de integração/E2E. Exige TEST_DATABASE_URL (banco descartável).
 * Os testes são pulados quando a variável não existe.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';

/** Os testes recriam o schema: só aceita bancos claramente de teste/CI (ou ALLOW_DB_RESET=1). */
function assertDisposableDatabase(url: string): void {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!/(test|ci)/i.test(name) && process.env.ALLOW_DB_RESET !== '1') {
    throw new Error(`Recusando recriar o banco "${name}": use TEST_DATABASE_URL apontando para um banco de teste (ex.: asa_conecta_test).`);
  }
}

export interface DatabaseHandle {
  pool: DbPool;
  repos: Repositories;
  close(): Promise<void>;
}

export async function prepareDatabase(): Promise<DatabaseHandle> {
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL não definida para testes de integração');
  if (/prod/i.test(TEST_DATABASE_URL)) throw new Error('Recusando resetar um banco com "prod" na URL');
  assertDisposableDatabase(TEST_DATABASE_URL);
  const pool = createPool(TEST_DATABASE_URL);
  await resetDatabase(pool, () => undefined);
  return { pool, repos: createPgRepositories(pool), close: () => pool.end() };
}
