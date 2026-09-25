import type { NextFunction, Request, Response } from 'express';
import { RateLimitedError } from '../errors/AppError.js';

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Limitador em memória por janela fixa. Suficiente para uma instância da API;
 * com várias réplicas deve ser trocado por um armazenamento compartilhado (ex.: Redis).
 */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly options: { windowMs: number; max: number; maxKeys?: number },
    private readonly now: () => number = Date.now,
  ) {}

  private current(key: string): Window {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + this.options.windowMs };
      this.windows.set(key, window);
      this.prune(now);
    }
    return window;
  }

  private prune(now: number): void {
    const maxKeys = this.options.maxKeys ?? 10_000;
    if (this.windows.size <= maxKeys) return;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now || this.windows.size > maxKeys) this.windows.delete(key);
    }
  }

  private result(window: Window): LimitResult {
    return {
      allowed: window.count <= this.options.max,
      remaining: Math.max(0, this.options.max - window.count),
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - this.now()) / 1000)),
    };
  }

  /** Conta uma ocorrência e informa se ainda está dentro do limite. */
  hit(key: string): LimitResult {
    const window = this.current(key);
    window.count += 1;
    return this.result(window);
  }

  /** Consulta sem contar. */
  peek(key: string): LimitResult {
    const window = this.windows.get(key);
    if (!window || window.resetAt <= this.now()) return { allowed: true, remaining: this.options.max, retryAfterSeconds: 0 };
    return { ...this.result(window), allowed: window.count < this.options.max };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }
}

/** Middleware de limite por IP (e rota). Responde 429 RATE_LIMITED com Retry-After. */
export function rateLimitByIp(name: string, limiter: FixedWindowLimiter, enabled: boolean) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!enabled) return next();
    const result = limiter.hit(`${name}:${req.ip ?? 'unknown'}`);
    if (!result.allowed) {
      req.log?.warn({ status: 'rate_limited', limiter: name, retry_after_seconds: result.retryAfterSeconds }, 'rate limit exceeded');
      return next(new RateLimitedError(result.retryAfterSeconds));
    }
    next();
  };
}
