import type { Logger } from '../config/logger.js';
import type { DbClient, DbPool } from '../db/pool.js';

/**
 * Garante UM monitor consultando a fonte, mesmo com várias instâncias da API
 * (as demais leem o snapshot compartilhado no banco).
 */
export interface LeaderLock {
  readonly held: boolean;
  /** Tenta obter (ou confirmar) a liderança. Barato quando já é líder. */
  acquire(): Promise<boolean>;
  release(): Promise<void>;
}

/** Uma instância só (testes, execução sem banco): sempre líder. */
export class LocalLeaderLock implements LeaderLock {
  held = false;

  async acquire() {
    this.held = true;
    return true;
  }

  async release() {
    this.held = false;
  }
}

/**
 * Advisory lock de sessão do PostgreSQL (já faz parte da arquitetura; dispensa Redis). A conexão fica
 * reservada enquanto a instância é líder; se ela cair, o lock é liberado pelo banco e outra assume.
 */
export class PgAdvisoryLeaderLock implements LeaderLock {
  private client: DbClient | null = null;
  held = false;

  constructor(
    private readonly pool: DbPool,
    private readonly logger: Logger,
    private readonly lockName = 'asa_conecta.queue_monitor',
  ) {}

  async acquire(): Promise<boolean> {
    if (this.held && this.client) return true;
    let client: DbClient | null = null;
    try {
      client = await this.pool.connect();
      const { rows } = await client.query<{ locked: boolean }>('select pg_try_advisory_lock(hashtext($1)) as locked', [this.lockName]);
      if (!rows[0]?.locked) {
        client.release();
        return false;
      }
      client.on('error', (error) => {
        this.logger.warn({ status: 'queue_leader_lost', error_message: error.message }, 'queue monitor leadership lost');
        this.held = false;
        this.client = null;
      });
      this.client = client;
      this.held = true;
      this.logger.info({ status: 'queue_leader_acquired' }, 'queue monitor leadership acquired');
      return true;
    } catch (error) {
      client?.release();
      this.logger.warn({ status: 'queue_leader_unavailable', error_message: error instanceof Error ? error.message : 'unknown' }, 'queue leader lock unavailable');
      return false;
    }
  }

  async release(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.held = false;
    if (!client) return;
    try {
      await client.query('select pg_advisory_unlock(hashtext($1))', [this.lockName]);
    } catch {
      // conexão já encerrada: o banco liberou o lock
    } finally {
      client.release();
    }
  }
}
