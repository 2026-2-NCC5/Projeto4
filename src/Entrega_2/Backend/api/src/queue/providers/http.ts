import { QueueSourceError } from '../types.js';

export type FetchFn = typeof fetch;

/** Identificação educada nas requisições ao portal (uma única instância consulta a fonte). */
export const QUEUE_USER_AGENT = 'ASA-Conecta-QueueMonitor/1.0';

/** Cookies de sessão do portal (antiforgery e afinidade), apenas em memória. */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  store(response: Response): void {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const raw = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : (headers.get('set-cookie') ?? '').split(/,(?=\s*[^;,=\s]+=)/);
    for (const line of raw) {
      const pair = line.split(';')[0]?.trim();
      const eq = pair?.indexOf('=') ?? -1;
      if (!pair || eq <= 0) continue;
      this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

/** fetch com timeout; erros viram QueueSourceError (network/timeout/http). */
export async function fetchWithTimeout(fetchFn: FetchFn, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal, redirect: 'follow' });
  } catch (error) {
    if (controller.signal.aborted) throw new QueueSourceError('timeout', `tempo limite (${timeoutMs} ms) em ${new URL(url).pathname}`, { cause: error });
    throw new QueueSourceError('network', `falha de rede em ${new URL(url).pathname}`, { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

export async function readText(response: Response, url: string): Promise<string> {
  if (!response.ok) {
    throw new QueueSourceError('http', `HTTP ${response.status} em ${new URL(url).pathname}`, { status: response.status });
  }
  return response.text();
}
