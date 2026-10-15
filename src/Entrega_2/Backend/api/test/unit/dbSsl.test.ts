import { describe, expect, it } from 'vitest';
import { databaseHost, isRemoteDatabaseUrl, resolveSsl } from '../../src/db/pool.js';

const LOCAL = 'postgres://asa:asa_dev_password@localhost:5432/asa_conecta';
const COMPOSE = 'postgres://asa:asa_dev_password@db:5432/asa_conecta';
const SUPABASE = 'postgresql://postgres.lxfssnqxsxiywfndsfdn:secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres';

describe('db/pool TLS', () => {
  it('extrai o host e classifica local vs remoto', () => {
    expect(databaseHost(LOCAL)).toBe('localhost');
    expect(databaseHost('postgres://u:p@[::1]:5432/x')).toBe('::1');
    expect(databaseHost('nao-e-url')).toBeNull();
    expect(isRemoteDatabaseUrl(LOCAL)).toBe(false);
    expect(isRemoteDatabaseUrl(COMPOSE)).toBe(false);
    expect(isRemoteDatabaseUrl(SUPABASE)).toBe(true);
  });

  it('auto: TLS apenas para hosts remotos', () => {
    expect(resolveSsl(LOCAL)).toBe(false);
    expect(resolveSsl(COMPOSE, { mode: 'auto' })).toBe(false);
    expect(resolveSsl(SUPABASE)).toEqual({ rejectUnauthorized: false });
  });

  it('require/disable ignoram o host', () => {
    expect(resolveSsl(LOCAL, { mode: 'require' })).toEqual({ rejectUnauthorized: false });
    expect(resolveSsl(SUPABASE, { mode: 'disable' })).toBe(false);
  });
});
