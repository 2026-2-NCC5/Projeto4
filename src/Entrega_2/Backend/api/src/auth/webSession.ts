import { timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import type { AuthSession } from '../contracts/mobileApi.v1.js';
import { ForbiddenError } from '../errors/AppError.js';
import { randomToken } from './secrets.js';

/**
 * Sessão do portal web (ADR-008): os tokens da MESMA autenticação do app ficam em cookies HttpOnly,
 * nunca em localStorage. Requisições que alteram dados com cookie exigem CSRF por "double submit"
 * (cabeçalho X-CSRF-Token igual ao cookie asa_csrf) e origem permitida (WEB_ORIGINS).
 * O app continua usando Authorization: Bearer, que não é enviado automaticamente pelo navegador.
 */
export const ACCESS_COOKIE = 'asa_at';
export const REFRESH_COOKIE = 'asa_rt';
export const CSRF_COOKIE = 'asa_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Cookie de acesso vale para toda a API; o de renovação só chega às rotas de sessão web. */
export const ACCESS_COOKIE_PATH = '/api';
export const REFRESH_COOKIE_PATH = '/api/web/auth';

export interface WebCookieConfig {
  secure: boolean;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const isSafeMethod = (method: string): boolean => SAFE_METHODS.has(method.toUpperCase());

/** Leitor mínimo de cookies (RFC 6265): ignora pares malformados e valores com codificação inválida. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    if (!/^[A-Za-z0-9_-]+$/.test(name) || name in result) continue;
    let value = part.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      // valor inválido: ignorado
    }
  }
  return result;
}

export function readCookie(req: Request, name: string): string | undefined {
  return parseCookies(req.headers.cookie)[name];
}

function baseOptions(config: WebCookieConfig): CookieOptions {
  return { secure: config.secure, sameSite: 'strict' };
}

/** Grava os cookies de sessão e devolve o token CSRF (novo a cada login/renovação). */
export function setSessionCookies(res: Response, session: AuthSession, config: WebCookieConfig): string {
  const csrfToken = randomToken(32);
  res.cookie(ACCESS_COOKIE, session.accessToken, { ...baseOptions(config), httpOnly: true, path: ACCESS_COOKIE_PATH, maxAge: session.expiresIn * 1000 });
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...baseOptions(config),
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
    // sem "Manter conectado": cookie de sessão do navegador (some ao fechar), além do prazo curto no servidor
    ...(session.rememberMe ? { maxAge: session.refreshExpiresIn * 1000 } : {}),
  });
  setCsrfCookie(res, csrfToken, config);
  return csrfToken;
}

export function setCsrfCookie(res: Response, token: string, config: WebCookieConfig): void {
  // legível pelo JavaScript do portal (por isso não é HttpOnly): é o segredo do "double submit", não uma credencial
  res.cookie(CSRF_COOKIE, token, { ...baseOptions(config), httpOnly: false, path: '/' });
}

export function clearSessionCookies(res: Response, config: WebCookieConfig): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(config), httpOnly: true, path: ACCESS_COOKIE_PATH });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions(config), httpOnly: true, path: REFRESH_COOKIE_PATH });
}

/** Garante um token CSRF (reaproveita o do cookie quando já existe). */
export function ensureCsrfToken(req: Request, res: Response, config: WebCookieConfig): string {
  const existing = readCookie(req, CSRF_COOKIE);
  if (existing && /^[A-Za-z0-9_-]{32,128}$/.test(existing)) return existing;
  const token = randomToken(32);
  setCsrfCookie(res, token, config);
  return token;
}

function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function originOf(req: Request): string | null {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin !== 'null') return origin.replace(/\/+$/, '');
  const referer = req.headers.referer;
  if (typeof referer === 'string') {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Valida CSRF de uma requisição autenticada por cookie: origem permitida (ou mesma origem do host)
 * e cabeçalho igual ao cookie. Lança 403 `csrf_failed` em qualquer divergência.
 */
export function assertCsrf(req: Request, allowedOrigins: readonly string[]): void {
  const origin = originOf(req);
  const host = req.headers.host ? `${req.protocol}://${req.headers.host}` : null;
  const fetchSite = req.headers['sec-fetch-site'];
  const originAllowed = origin ? allowedOrigins.includes(origin) || origin === host : fetchSite === 'same-origin';
  if (!originAllowed) throw new ForbiddenError('Origem da requisição não permitida.', 'csrf_failed');
  const cookie = readCookie(req, CSRF_COOKIE);
  const header = req.headers[CSRF_HEADER];
  const sent = Array.isArray(header) ? header[0] : header;
  if (!cookie || !sent || !sameToken(cookie, sent)) {
    throw new ForbiddenError('Token de segurança ausente ou inválido. Recarregue a página.', 'csrf_failed');
  }
}

/**
 * Rótulo curto do aparelho/navegador para a lista de sessões ("Chrome no Windows").
 * Nunca guarda o user-agent completo (minimização).
 */
export function deviceLabelFrom(userAgent: string | undefined, channel: 'mobile' | 'web'): string | null {
  if (!userAgent) return channel === 'mobile' ? 'Aplicativo ASA Conecta' : null;
  const ua = userAgent.slice(0, 512);
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /Expo|okhttp|CFNetwork|Darwin/.test(ua)
              ? 'Aplicativo ASA Conecta'
              : null;
  const system = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iOS/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  if (browser && system) return `${browser} no ${system}`;
  return browser ?? system ?? (channel === 'mobile' ? 'Aplicativo ASA Conecta' : 'Navegador');
}
