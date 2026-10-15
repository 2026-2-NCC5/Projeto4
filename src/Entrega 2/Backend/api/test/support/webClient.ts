import type { Express } from 'express';
import request from 'supertest';
import { DEMO_PASSWORD } from './fixtures.js';

export const WEB_ORIGIN = 'http://localhost:5173';

export interface ParsedCookie {
  name: string;
  value: string;
  attributes: Record<string, string | true>;
}

export function parseSetCookie(header: string): ParsedCookie {
  const [pair, ...attributes] = header.split(';').map((part) => part.trim());
  const index = pair!.indexOf('=');
  const parsed: ParsedCookie = { name: pair!.slice(0, index), value: decodeURIComponent(pair!.slice(index + 1)), attributes: {} };
  for (const attribute of attributes) {
    const [key, ...rest] = attribute.split('=');
    parsed.attributes[key!.toLowerCase()] = rest.length > 0 ? rest.join('=') : true;
  }
  return parsed;
}

/** Navegador simplificado: guarda cookies das respostas e envia CSRF + Origin como o portal faz. */
export class WebClient {
  readonly jar = new Map<string, ParsedCookie>();
  csrfToken: string | null = null;

  constructor(
    private readonly app: Express,
    private readonly origin: string = WEB_ORIGIN,
  ) {}

  store(response: request.Response): void {
    const raw = response.headers['set-cookie'] as unknown;
    const headers = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
    for (const header of headers) {
      const cookie = parseSetCookie(header);
      const expired = cookie.attributes.expires && new Date(String(cookie.attributes.expires)).getTime() <= Date.now();
      if (expired || cookie.value === '') this.jar.delete(cookie.name);
      else this.jar.set(cookie.name, cookie);
    }
    const token = (response.body as { data?: { csrfToken?: string } } | undefined)?.data?.csrfToken;
    if (token) this.csrfToken = token;
  }

  cookieHeader(path: string): string {
    return [...this.jar.values()]
      .filter((cookie) => path.startsWith(String(cookie.attributes.path ?? '/')))
      .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
      .join('; ');
  }

  headers(path: string, options: { csrf?: boolean; origin?: string | null } = {}): Record<string, string> {
    const headers: Record<string, string> = {};
    const cookie = this.cookieHeader(path);
    if (cookie) headers.Cookie = cookie;
    if (options.origin !== null) headers.Origin = options.origin ?? this.origin;
    if (options.csrf !== false && this.csrfToken) headers['X-CSRF-Token'] = this.csrfToken;
    return headers;
  }

  async get(path: string) {
    const response = await request(this.app).get(path).set(this.headers(path, { csrf: false }));
    this.store(response);
    return response;
  }

  async send(method: 'post' | 'patch' | 'delete', path: string, body?: unknown, options: { csrf?: boolean; origin?: string | null } = {}) {
    const response = await request(this.app)[method](path).set(this.headers(path, options)).send(body as object);
    this.store(response);
    return response;
  }

  async login(email: string, password: string = DEMO_PASSWORD, rememberMe = false) {
    await this.get('/api/web/auth/csrf');
    return this.send('post', '/api/web/auth/login', { email, password, rememberMe });
  }
}
