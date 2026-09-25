import * as Network from 'expo-network';

import { TIMEOUTS } from '../config/services';
import type { ApiError, ApiErrorBody, ApiErrorCode, ApiErrorDetail, ApiSuccess } from '../types/api';

export type ApiErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'dependency'
  | 'contract'
  | 'timeout'
  | 'network'
  | 'offline'
  | 'server'
  /** 429 RATE_LIMITED — `retryAfterSeconds` indica quando tentar de novo. */
  | 'rate_limited'
  /** Requisição abortada pelo chamador (ex.: usuário cancelou) — não é uma falha para exibir. */
  | 'cancelled'
  | 'unknown';

export interface ApiClientErrorInit {
  kind: ApiErrorKind;
  message: string;
  code?: ApiErrorCode | undefined;
  reason?: string | undefined;
  requestId?: string | undefined;
  correlationId?: string | undefined;
  status?: number | undefined;
  details?: ApiErrorDetail[] | undefined;
  retryAfterSeconds?: number | undefined;
  attemptsRemaining?: number | undefined;
}

/** Erro normalizado — a única forma de erro que sai do apiClient. Nunca carrega token ou senha. */
export class ApiClientError extends Error {
  readonly kind: ApiErrorKind;
  readonly code: ApiErrorCode | undefined;
  readonly reason: string | undefined;
  readonly requestId: string | undefined;
  readonly correlationId: string | undefined;
  readonly status: number | undefined;
  readonly details: ApiErrorDetail[] | undefined;
  /** Segundos até poder tentar novamente (429: corpo `retryAfterSeconds` ou header Retry-After). */
  readonly retryAfterSeconds: number | undefined;
  /** Tentativas restantes (ex.: código de verificação incorreto). */
  readonly attemptsRemaining: number | undefined;

  constructor(init: ApiClientErrorInit) {
    super(init.message);
    this.name = 'ApiClientError';
    this.kind = init.kind;
    this.code = init.code;
    this.reason = init.reason;
    this.requestId = init.requestId;
    this.correlationId = init.correlationId;
    this.status = init.status;
    this.details = init.details;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.attemptsRemaining = init.attemptsRemaining;
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError || (typeof error === 'object' && error !== null && (error as { name?: string }).name === 'ApiClientError');
}

/** `auth: true` exige token e trata 401 como sessão inválida; `'optional'` envia o token se houver, sem encerrar sessão. */
export type AuthMode = boolean | 'optional';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: AuthMode;
  timeoutMs?: number;
  correlationId?: string;
  headers?: Record<string, string>;
  /** Cancelamento externo (ex.: usuário tocou em "Cancelar"). Abortar → erro kind 'cancelled'. */
  signal?: AbortSignal;
}

export interface ApiClientConfig {
  baseUrl: string;
  /** Retorna o access token atual (ou null). Nunca é logado. */
  getAccessToken: () => string | null;
  /** Tenta renovar a sessão; retorna o novo access token ou null quando não for possível. */
  refreshSession?: () => Promise<string | null>;
  /** Chamado quando a sessão é considerada inválida (401 não recuperável). */
  onUnauthorized?: (error: ApiClientError) => void;
  /** Injetável em testes. */
  fetchFn?: typeof fetch;
}

let config: ApiClientConfig | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function configureApiClient(next: ApiClientConfig): void {
  config = next;
  refreshInFlight = null;
}

export function getApiClientConfig(): ApiClientConfig | null {
  return config;
}

/** Restaura o estado inicial (apenas para testes). */
export function resetApiClientForTests(): void {
  config = null;
  refreshInFlight = null;
}

function randomHex(length: number): string {
  let out = '';
  while (out.length < length) {
    out += Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  }
  return out.slice(0, length);
}

/** Gera um id de correlação por fluxo, no formato aceito pela API (`corr-<uuid>`). */
export function createCorrelationId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) {
    try {
      return `corr-${cryptoObj.randomUUID()}`;
    } catch {
      // cai no fallback abaixo
    }
  }
  const hex = randomHex(32);
  return `corr-${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function kindFromStatus(status: number, code: ApiErrorCode | undefined): ApiErrorKind {
  if (status === 429 || code === 'RATE_LIMITED') return 'rate_limited';
  if (code === 'DEPENDENCY_ERROR' || status === 503) return 'dependency';
  if (code === 'TIMEOUT' || status === 504) return 'timeout';
  if (code === 'CONTRACT_ERROR' || status === 502) return 'contract';
  if (status === 400 || code === 'VALIDATION_ERROR') return 'validation';
  if (status === 401 || code === 'UNAUTHORIZED') return 'unauthorized';
  if (status === 403 || code === 'FORBIDDEN') return 'forbidden';
  if (status === 404 || code === 'NOT_FOUND') return 'not_found';
  if (status >= 500) return 'server';
  return 'unknown';
}

function isApiErrorBody(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) return false;
  const error = (value as { error?: unknown }).error;
  return typeof error === 'object' && error !== null && typeof (error as ApiErrorBody).code === 'string';
}

function isApiSuccessBody(value: unknown): value is ApiSuccess<unknown> {
  return typeof value === 'object' && value !== null && 'data' in value;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function headerId(response: Response, name: string): string | undefined {
  try {
    return response.headers?.get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

function nonNegativeInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.ceil(value) : undefined;
}

/** Header Retry-After: segundos ("120") ou data HTTP. */
export function parseRetryAfter(raw: string | null | undefined, now: number = Date.now()): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

async function detectConnectivityKind(): Promise<'offline' | 'network'> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (state.isConnected === false || state.isInternetReachable === false) return 'offline';
  } catch {
    // sem informação de rede: assume falha genérica de rede
  }
  return 'network';
}

function requireConfig(): ApiClientConfig {
  if (!config) {
    throw new ApiClientError({ kind: 'unknown', message: 'Cliente de API não configurado.' });
  }
  return config;
}

async function runRefresh(cfg: ApiClientConfig): Promise<string | null> {
  if (!cfg.refreshSession) return null;
  if (!refreshInFlight) {
    refreshInFlight = cfg
      .refreshSession()
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function cancelledError(correlationId: string): ApiClientError {
  return new ApiClientError({ kind: 'cancelled', message: 'Requisição cancelada.', correlationId });
}

async function performFetch(
  cfg: ApiClientConfig,
  path: string,
  options: RequestOptions,
  token: string | null,
  correlationId: string,
): Promise<Response> {
  const external = options.signal;
  if (external?.aborted) throw cancelledError(correlationId);

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? TIMEOUTS.API_TIMEOUT_MS;
  let cancelledByCaller = false;
  const onExternalAbort = () => {
    cancelledByCaller = true;
    controller.abort();
  };
  external?.addEventListener('abort', onExternalAbort);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'x-correlation-id': correlationId,
    ...(options.headers ?? {}),
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const fetchFn = cfg.fetchFn ?? fetch;
  try {
    return await fetchFn(`${cfg.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (cancelledByCaller) throw cancelledError(correlationId);
    if (name === 'AbortError' || controller.signal.aborted) {
      throw new ApiClientError({ kind: 'timeout', message: 'Tempo limite excedido.', correlationId });
    }
    const kind = await detectConnectivityKind();
    throw new ApiClientError({
      kind,
      message: kind === 'offline' ? 'Sem conexão com a internet.' : 'Falha de comunicação com o servidor.',
      correlationId,
    });
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onExternalAbort);
  }
}

async function toClientError(response: Response, correlationId: string): Promise<ApiClientError> {
  const body = await readJson(response);
  const apiError = isApiErrorBody(body) ? body.error : null;
  const kind = kindFromStatus(response.status, apiError?.code);
  return new ApiClientError({
    kind,
    status: response.status,
    code: apiError?.code,
    reason: apiError?.reason,
    details: apiError?.details,
    retryAfterSeconds: nonNegativeInt(apiError?.retryAfterSeconds) ?? parseRetryAfter(headerId(response, 'retry-after')),
    attemptsRemaining: nonNegativeInt(apiError?.attemptsRemaining),
    message: apiError?.message ?? `Falha na requisição (${response.status}).`,
    requestId: headerId(response, 'x-request-id') ?? apiError?.requestId,
    correlationId: headerId(response, 'x-correlation-id') ?? apiError?.correlationId ?? correlationId,
  });
}

/**
 * Executa uma requisição à API e devolve apenas `data` do envelope de sucesso.
 * - Timeout via AbortController (config/services.ts);
 * - 401 `token_expired` em rotas autenticadas → refresh único e repetição;
 * - qualquer outro 401 em rota autenticada → onUnauthorized (sessão encerrada localmente);
 * - falha de rede → 'offline' (sem conexão) ou 'network';
 * - `signal` externo abortado → 'cancelled' (o timeout local continua sendo 'timeout').
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const cfg = requireConfig();
  const auth: AuthMode = options.auth ?? true;
  const correlationId = options.correlationId ?? createCorrelationId();
  const token = auth ? cfg.getAccessToken() : null;

  let response = await performFetch(cfg, path, options, token, correlationId);

  if (response.status === 401 && auth === true) {
    const firstError = await toClientError(response, correlationId);
    if (firstError.reason === 'token_expired') {
      const newToken = await runRefresh(cfg);
      if (newToken) {
        response = await performFetch(cfg, path, options, newToken, correlationId);
        if (response.status !== 401) return parseSuccess<T>(response, correlationId, options.signal);
        const retryError = await toClientError(response, correlationId);
        cfg.onUnauthorized?.(retryError);
        throw retryError;
      }
    }
    cfg.onUnauthorized?.(firstError);
    throw firstError;
  }

  return parseSuccess<T>(response, correlationId, options.signal);
}

async function parseSuccess<T>(response: Response, correlationId: string, signal?: AbortSignal): Promise<T> {
  // Cancelado enquanto a resposta chegava: o chamador não deve receber dados nem erro de API.
  if (signal?.aborted) throw cancelledError(correlationId);
  if (!response.ok) {
    throw await toClientError(response, correlationId);
  }
  if (response.status === 204) return undefined as T;
  const body = await readJson(response);
  if (body === null) return undefined as T;
  if (!isApiSuccessBody(body)) {
    throw new ApiClientError({
      kind: 'contract',
      status: response.status,
      message: 'Resposta da API em formato inesperado.',
      requestId: headerId(response, 'x-request-id'),
      correlationId: headerId(response, 'x-correlation-id') ?? correlationId,
    });
  }
  return body.data as T;
}

export const apiClient = { request, configure: configureApiClient, createCorrelationId };
