import { readFileSync } from 'node:fs';
import pg from 'pg';

const { Pool, types } = pg;

// numeric/decimal (OID 1700) e bigint (20) chegam como string por padrão; convertemos para number.
types.setTypeParser(1700, (value: string) => Number(value));
types.setTypeParser(20, (value: string) => Number(value));
// date (1082) como string YYYY-MM-DD, sem fuso.
types.setTypeParser(1082, (value: string) => value);

export type DbPool = pg.Pool;
export type DbClient = pg.PoolClient;

/**
 * auto    → TLS para hosts remotos (Supabase e outros provedores gerenciados), sem TLS para hosts locais.
 * require → TLS sempre (sem verificar a cadeia, salvo se `caFile` for informado).
 * disable → nunca (apenas desenvolvimento local).
 */
export type DatabaseSslMode = 'auto' | 'require' | 'disable';

export interface DatabaseSslOptions {
  mode?: DatabaseSslMode;
  /** Certificado raiz do provedor (PEM). Com ele a cadeia é verificada (equivale a sslmode=verify-full). */
  caFile?: string | undefined;
}

export type ResolvedSsl = false | { rejectUnauthorized: boolean; ca?: string };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'db']);

/** Host da URL de conexão (sem porta nem colchetes de IPv6); null se a URL for inválida. */
export function databaseHost(databaseUrl: string): string | null {
  try {
    const host = new URL(databaseUrl).hostname;
    return host ? host.replace(/^\[(.*)\]$/, '$1').toLowerCase() : null;
  } catch {
    return null;
  }
}

/** true para qualquer host que não seja a máquina local nem o serviço `db` do docker compose. */
export function isRemoteDatabaseUrl(databaseUrl: string): boolean {
  const host = databaseHost(databaseUrl);
  return host !== null && !LOCAL_HOSTS.has(host);
}

/**
 * Decide o TLS do pool. Provedores gerenciados (Supabase) assinam o certificado do servidor com uma
 * CA própria, fora da cadeia confiada pelo Node; sem `caFile` a conexão é cifrada mas a cadeia não é
 * verificada. Se a URL trouxer `sslmode=`, o `pg` dá preferência ao parâmetro da URL.
 */
export function resolveSsl(databaseUrl: string, options: DatabaseSslOptions = {}): ResolvedSsl {
  const mode = options.mode ?? 'auto';
  if (mode === 'disable') return false;
  if (mode === 'auto' && !isRemoteDatabaseUrl(databaseUrl)) return false;
  if (options.caFile) return { rejectUnauthorized: true, ca: readFileSync(options.caFile, 'utf8') };
  return { rejectUnauthorized: false };
}

export function createPool(databaseUrl: string, ssl: DatabaseSslOptions = {}): DbPool {
  return new Pool({ connectionString: databaseUrl, ssl: resolveSsl(databaseUrl, ssl), max: 10, idleTimeoutMillis: 10_000 });
}

export async function withTransaction<T>(pool: DbPool, fn: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
