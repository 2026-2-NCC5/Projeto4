import { randomUUID } from 'node:crypto';
import type { Logger } from '../config/logger.js';
import type { DbPool } from '../db/pool.js';

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

export interface PgLeaseLeaderLockOptions {
  /** nome da tarefa em job_leases */
  name?: string;
  /** validade de cada concessão; o líder renova a cada ciclo, antes de expirar */
  ttlMs: number;
  /** identificação desta instância (padrão: aleatória) */
  holder?: string;
  now?: () => Date;
}

/**
 * Concessão com prazo na tabela job_leases (migration 012). Tomar ou renovar é um UPDATE condicional
 * atômico: não reserva conexão, funciona pelo pooler em modo transação e entre funções serverless,
 * worker residente e réplicas. Se o líder some, a concessão expira e outra instância assume.
 */
export class PgLeaseLeaderLock implements LeaderLock {
  private leaseUntil = 0;
  private readonly name: string;
  private readonly holder: string;
  private readonly now: () => Date;

  constructor(
    private readonly pool: DbPool,
    private readonly logger: Logger,
    private readonly options: PgLeaseLeaderLockOptions,
  ) {
    this.name = options.name ?? 'asa_conecta.queue_monitor';
    this.holder = options.holder ?? `instance-${randomUUID()}`;
    this.now = options.now ?? (() => new Date());
  }

  get held(): boolean {
    return this.leaseUntil > this.now().getTime();
  }

  async acquire(): Promise<boolean> {
    const wasHeld = this.held;
    try {
      // o relógio do banco decide a expiração: instâncias com relógios diferentes não disputam a mesma janela
      const { rows } = await this.pool.query<{ lease_until: Date }>(
        `insert into job_leases (name, holder, lease_until)
         values ($1, $2, now() + $3::double precision * interval '1 millisecond')
         on conflict (name) do update set holder = excluded.holder, lease_until = excluded.lease_until, updated_at = now()
           where job_leases.lease_until <= now() or job_leases.holder = excluded.holder
         returning lease_until`,
        [this.name, this.holder, this.options.ttlMs],
      );
      if (!rows[0]) {
        if (wasHeld) this.logger.warn({ status: 'queue_leader_lost' }, 'queue monitor leadership lost');
        this.leaseUntil = 0;
        return false;
      }
      // margem local: a instância deixa de se considerar líder um pouco antes de o banco liberar a vaga
      this.leaseUntil = this.now().getTime() + Math.max(0, this.options.ttlMs - 1000);
      if (!wasHeld) this.logger.info({ status: 'queue_leader_acquired' }, 'queue monitor leadership acquired');
      return true;
    } catch (error) {
      this.leaseUntil = 0;
      this.logger.warn({ status: 'queue_leader_unavailable', error_message: error instanceof Error ? error.message : 'unknown' }, 'queue leader lease unavailable');
      return false;
    }
  }

  async release(): Promise<void> {
    if (this.leaseUntil === 0) return;
    this.leaseUntil = 0;
    try {
      await this.pool.query('update job_leases set lease_until = now(), updated_at = now() where name = $1 and holder = $2', [this.name, this.holder]);
    } catch {
      // a concessão expira sozinha
    }
  }
}
