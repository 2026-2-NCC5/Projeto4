import type { Request } from 'express';
import { hmacHex } from '../auth/secrets.js';
import type { UserRole } from '../contracts/mobileApi.v1.js';
import type { Logger } from '../config/logger.js';
import type { AuditChannel, AuditEventRecord, AuditMetadata, AuditOutcome, AuditQuery, AuditRepository } from './types.js';

/** Quem fez e de onde (montado a partir da requisição; nunca do corpo). */
export interface AuditActor {
  userId: string | null;
  role: UserRole | null;
  channel: AuditChannel;
  ip?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
}

export interface AuditEntry {
  action: string;
  outcome?: AuditOutcome;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Chaves que nunca entram na trilha (credenciais, contato e conteúdo livre). */
const FORBIDDEN_KEY = /pass|token|secret|cookie|authorization|email|e-mail|phone|telefone|cpf|content|message|body|text|ip$/i;
const MAX_STRING = 200;

/** Mantém só valores simples, curtos e sem chaves sensíveis. */
export function sanitizeAuditMetadata(metadata: Record<string, unknown> | undefined): AuditMetadata {
  const result: AuditMetadata = {};
  if (!metadata) return result;
  for (const [key, value] of Object.entries(metadata).slice(0, 20)) {
    if (FORBIDDEN_KEY.test(key)) continue;
    if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) result[key] = value;
    else if (typeof value === 'string') result[key] = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING - 1)}…` : value;
  }
  return result;
}

/**
 * Trilha de auditoria da plataforma. Gravar nunca derruba a requisição: uma falha vira log de erro
 * (a ação já aconteceu e o log estruturado continua com request_id/correlation_id).
 */
export class AuditService {
  private readonly key: string;

  constructor(
    private readonly repo: AuditRepository,
    secret: string,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {
    // chave própria, derivada do segredo do servidor (o IP nunca é gravado em claro)
    this.key = hmacHex(secret, 'asa-conecta:audit-pseudonymization');
  }

  /** Pseudônimo estável (HMAC) — permite correlacionar tentativas sem guardar o dado pessoal. */
  pseudonymize(value: string): string {
    return hmacHex(this.key, value).slice(0, 32);
  }

  actorFrom(req: Request): AuditActor {
    return {
      userId: req.auth?.userId ?? null,
      role: req.auth?.role ?? null,
      channel: req.auth?.channel ?? (req.headers.authorization ? 'mobile' : 'web'),
      ip: req.ip ?? null,
      requestId: req.ctx?.requestId ?? null,
      correlationId: req.ctx?.correlationId ?? null,
    };
  }

  async record(actor: AuditActor, entry: AuditEntry): Promise<void> {
    try {
      await this.repo.insert({
        occurredAt: this.now(),
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: entry.action,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId ?? null,
        outcome: entry.outcome ?? 'success',
        channel: actor.channel,
        ipHash: actor.ip ? this.pseudonymize(actor.ip) : null,
        requestId: actor.requestId ?? null,
        correlationId: actor.correlationId ?? null,
        metadata: sanitizeAuditMetadata(entry.metadata),
      });
    } catch (error) {
      this.logger.error({ action: entry.action, error_type: error instanceof Error ? error.name : typeof error }, 'audit event not recorded');
    }
  }

  /** Atalho para rotas: autor e rastreabilidade vêm da requisição. */
  recordFor(req: Request, entry: AuditEntry): Promise<void> {
    return this.record(this.actorFrom(req), entry);
  }

  list(query: AuditQuery): Promise<{ items: AuditEventRecord[]; total: number }> {
    return this.repo.list(query);
  }
}
