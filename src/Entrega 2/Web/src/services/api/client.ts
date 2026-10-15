import type { ApiError as ApiErrorEnvelope, ApiErrorDetail } from '@/types/api';

/**
 * Cliente HTTP do portal. Mesma API e mesmo envelope do app, com sessão por cookie HttpOnly:
 * - `credentials: 'same-origin'` (o navegador envia os cookies; JavaScript nunca vê os tokens);
 * - toda alteração leva X-CSRF-Token (cookie asa_csrf, "double submit");
 * - 401 por token expirado → uma única renovação compartilhada (POST /api/web/auth/refresh) e nova tentativa;
 * - 403 `csrf_failed` → busca um token CSRF novo e tenta de novo uma vez;
 * - nada de repetição automática em escrita além disso (sem duplicar chamados ou agendamentos).
 */

export type ApiErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'dependency'
  | 'timeout'
  | 'contract'
  | 'server'
  | 'network'
  | 'offline'
  | 'cancelled';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string | null;
  readonly reason: string | null;
  readonly details: ApiErrorDetail[];
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(kind: ApiErrorKind, message: string, init: { status?: number; code?: string | null; reason?: string | null; details?: ApiErrorDetail[]; requestId?: string | null; retryAfterSeconds?: number | null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = init.status ?? 0;
    this.code = init.code ?? null;
    this.reason = init.reason ?? null;
    this.details = init.details ?? [];
    this.requestId = init.requestId ?? null;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }

  /** Mensagem de campo (validação) quando a API apontou o campo. */
  fieldMessage(field: string): string | null {
    return this.details.find((detail) => detail.field === field)?.message ?? null;
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** false: rota pública (sem tentativa de renovação em 401) */
  auth?: boolean;
  /** resposta binária/texto (CSV) em vez do envelope JSON */
  raw?: boolean;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const CSRF_COOKIE = 'asa_csrf';
const UNSAFE = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

let csrfMemory: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
const expiredListeners = new Set<() => void>();

/** Avisado quando a sessão não pode mais ser renovada (o SessionProvider volta para o login). */
export function onSessionExpired(listener: () => void): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

export function setCsrfToken(token: string | null): void {
  csrfMemory = token;
}

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : null;
}

export function currentCsrfToken(): string | null {
  return readCsrfCookie() ?? csrfMemory;
}

function correlationId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `corr-web-${random}`;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${path}${path.includes('?') ? '&' : '?'}${text}` : path;
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status === 502) return 'contract';
  if (status === 503) return 'dependency';
  if (status === 504) return 'timeout';
  return 'server';
}

async function toApiError(response: Response): Promise<ApiError> {
  let envelope: ApiErrorEnvelope | null = null;
  try {
    envelope = (await response.json()) as ApiErrorEnvelope;
  } catch {
    envelope = null;
  }
  const body = envelope?.error;
  const retryHeader = Number(response.headers.get('retry-after'));
  return new ApiError(kindForStatus(response.status), body?.message ?? `Erro ${response.status}`, {
    status: response.status,
    code: body?.code ?? null,
    reason: body?.reason ?? null,
    details: body?.details ?? [],
    requestId: body?.requestId ?? response.headers.get('x-request-id'),
    retryAfterSeconds: body?.retryAfterSeconds ?? (Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : null),
  });
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const method = options.method ?? 'GET';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const headers: Record<string, string> = { Accept: options.raw ? 'text/csv, application/json' : 'application/json', 'X-Correlation-Id': correlationId() };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (UNSAFE.has(method)) {
    const token = currentCsrfToken();
    if (token) headers['X-CSRF-Token'] = token;
  }
  try {
    return await fetch(buildUrl(path, options.query), {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw new ApiError('cancelled', 'Requisição cancelada.');
    if (controller.signal.aborted) throw new ApiError('timeout', 'O servidor demorou para responder. Tente novamente.');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ApiError('offline', 'Você está sem conexão com a internet.');
    throw new ApiError('network', 'Não foi possível falar com o servidor. Verifique sua conexão.', { reason: error instanceof Error ? error.name : null });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/** Renovação única compartilhada por todas as requisições que receberem 401 ao mesmo tempo. */
export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await send('/api/web/auth/refresh', { method: 'POST', timeoutMs: 10_000 });
        if (!response.ok) return false;
        const body = (await response.json()) as { data?: { csrfToken?: string } };
        if (body.data?.csrfToken) setCsrfToken(body.data.csrfToken);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

let csrfInFlight: Promise<string | null> | null = null;

/**
 * Garante o token CSRF. Uma única busca compartilhada (abas/efeitos simultâneos não geram tokens
 * diferentes que se sobrescrevem) e, com `reuse`, aproveita o cookie que já existe.
 */
export function fetchCsrfToken(options: { reuse?: boolean } = {}): Promise<string | null> {
  const existing = options.reuse ? readCsrfCookie() : null;
  if (existing) {
    setCsrfToken(existing);
    return Promise.resolve(existing);
  }
  if (!csrfInFlight) {
    csrfInFlight = (async () => {
      try {
        const response = await send('/api/web/auth/csrf', { method: 'GET', timeoutMs: 10_000 });
        if (!response.ok) return null;
        const body = (await response.json()) as { data?: { csrfToken?: string } };
        setCsrfToken(body.data?.csrfToken ?? null);
        return body.data?.csrfToken ?? null;
      } catch {
        return null;
      }
    })().finally(() => {
      csrfInFlight = null;
    });
  }
  return csrfInFlight;
}

const RENEWABLE = new Set(['token_expired', 'missing_token']);

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options);

  if (response.status === 403 && UNSAFE.has(options.method ?? 'GET')) {
    const error = await toApiError(response.clone());
    if (error.reason === 'csrf_failed' && (await fetchCsrfToken())) response = await send(path, options);
  }

  if (response.status === 401 && options.auth !== false) {
    const error = await toApiError(response.clone());
    if (error.reason && RENEWABLE.has(error.reason)) {
      // tenta de novo mesmo se a renovação falhar: outra aba pode ter renovado primeiro (o refresh antigo deixa de
      // valer, mas os cookies novos já estão no navegador). Só depois disso a sessão é dada como encerrada.
      await refreshSession();
      response = await send(path, options);
    }
    if (response.status === 401) {
      for (const listener of expiredListeners) listener();
      throw await toApiError(response);
    }
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  if (options.raw) return (await response.text()) as T;
  const text = await response.text();
  if (!text) return undefined as T;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError('contract', 'Resposta inesperada do servidor.', { status: response.status });
  }
  if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) throw new ApiError('contract', 'Resposta inesperada do servidor.', { status: response.status });
  return (parsed as { data: T }).data;
}

export const api = {
  get: <T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) => apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) => apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) => apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) => apiRequest<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) => apiRequest<T>(path, { ...options, method: 'DELETE' }),
};

/** Texto para a pessoa (nunca detalhes técnicos). */
export function messageForError(error: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  if (!isApiError(error)) return fallback;
  switch (error.kind) {
    case 'offline':
      return 'Você está sem conexão. Verifique a internet e tente novamente.';
    case 'network':
      return 'Não foi possível falar com o servidor. Tente novamente em instantes.';
    case 'timeout':
      return 'O servidor demorou para responder. Tente novamente.';
    case 'unauthorized':
      return 'Sua sessão expirou. Entre novamente.';
    case 'forbidden':
      return error.reason === 'feature_disabled' ? 'Este recurso está desativado neste ambiente.' : error.message || 'Seu perfil não tem acesso a este recurso.';
    case 'not_found':
      return 'Não encontramos o que você procurava.';
    case 'rate_limited':
      return error.retryAfterSeconds ? `Muitas tentativas. Aguarde ${error.retryAfterSeconds} s e tente novamente.` : 'Muitas tentativas. Aguarde e tente novamente.';
    case 'dependency':
      return error.message || 'Um serviço necessário está indisponível no momento.';
    case 'validation':
    case 'conflict':
      return error.message || fallback;
    default:
      return fallback;
  }
}
