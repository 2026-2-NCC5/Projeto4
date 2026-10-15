import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, messageForError, onSessionExpired, setCsrfToken } from './client';

type Reply = { status: number; body?: unknown };

function stubFetch(handler: (path: string, init: RequestInit) => Reply) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const reply = handler(String(input), init ?? {});
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const error = (code: string, reason?: string) => ({ error: { code, message: 'erro', reason, requestId: 'req-1', correlationId: 'corr-1' } });

describe('cliente HTTP do portal', () => {
  beforeEach(() => {
    document.cookie = 'asa_csrf=token-do-cookie-0123456789abcdef0123456789abcdef; path=/';
    setCsrfToken(null);
  });
  afterEach(() => {
    document.cookie = 'asa_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('desembrulha { data } e envia cookies da mesma origem e correlação', async () => {
    const fetchMock = stubFetch(() => ({ status: 200, body: { data: { ok: true }, meta: {} } }));
    await expect(api.get('/api/x')).resolves.toEqual({ ok: true });
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.credentials).toBe('same-origin');
    expect(new Headers(init.headers).get('X-Correlation-Id')).toMatch(/^corr-web-/);
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBeNull();
  });

  it('alterações levam o token CSRF do cookie (double submit)', async () => {
    const fetchMock = stubFetch(() => ({ status: 201, body: { data: { id: 1 } } }));
    await api.post('/api/support/tickets', { a: 1 });
    expect(new Headers(fetchMock.mock.calls[0]![1]!.headers).get('X-CSRF-Token')).toBe('token-do-cookie-0123456789abcdef0123456789abcdef');
  });

  it('401 por token expirado: uma única renovação compartilhada e nova tentativa', async () => {
    let refreshed = false;
    const fetchMock = stubFetch((path) => {
      if (path === '/api/web/auth/refresh') {
        refreshed = true;
        return { status: 200, body: { data: { csrfToken: 'novo' } } };
      }
      return refreshed ? { status: 200, body: { data: { path } } } : { status: 401, body: error('UNAUTHORIZED', 'token_expired') };
    });
    const results = await Promise.all([api.get('/api/a'), api.get('/api/b')]);
    expect(results).toEqual([{ path: '/api/a' }, { path: '/api/b' }]);
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/web/auth/refresh')).toHaveLength(1);
  });

  it('outra aba renovou primeiro: a renovação desta falha, mas a nova tentativa usa os cookies novos e não desloga', async () => {
    const listener = vi.fn();
    const off = onSessionExpired(listener);
    let calls = 0;
    stubFetch((path) => {
      // o refresh desta aba chega com o token antigo (já rotacionado pela outra aba)
      if (path === '/api/web/auth/refresh') return { status: 401, body: error('UNAUTHORIZED', 'session_expired') };
      calls += 1;
      return calls === 1 ? { status: 401, body: error('UNAUTHORIZED', 'token_expired') } : { status: 200, body: { data: { ok: true } } };
    });
    await expect(api.get('/api/x')).resolves.toEqual({ ok: true });
    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it('sessão realmente expirada: renovação falha, nova tentativa falha e o aviso de sessão expirada dispara uma vez', async () => {
    const listener = vi.fn();
    const off = onSessionExpired(listener);
    stubFetch((path) => (path === '/api/web/auth/refresh' ? { status: 401, body: error('UNAUTHORIZED', 'session_expired') } : { status: 401, body: error('UNAUTHORIZED', 'token_expired') }));
    await expect(api.get('/api/x')).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('401 de sessão encerrada não tenta renovar e avisa que a sessão expirou', async () => {
    const listener = vi.fn();
    const off = onSessionExpired(listener);
    const fetchMock = stubFetch(() => ({ status: 401, body: error('UNAUTHORIZED', 'session_revoked') }));
    await expect(api.get('/api/auth/me')).rejects.toMatchObject({ kind: 'unauthorized', reason: 'session_revoked' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/web/auth/refresh')).toBe(false);
    off();
  });

  it('403 csrf_failed busca um token novo e tenta de novo uma única vez', async () => {
    let attempts = 0;
    const fetchMock = stubFetch((path) => {
      if (path === '/api/web/auth/csrf') return { status: 200, body: { data: { csrfToken: 'renovado' } } };
      attempts += 1;
      return attempts === 1 ? { status: 403, body: error('FORBIDDEN', 'csrf_failed') } : { status: 200, body: { data: { ok: true } } };
    });
    await expect(api.post('/api/notifications', { read: true })).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/notifications')).toHaveLength(2);
  });

  it('classifica falhas e nunca expõe mensagem técnica para conflito sem texto', async () => {
    stubFetch(() => ({ status: 409, body: error('CONFLICT', 'slot_unavailable') }));
    const caught = await api.post('/api/appointments', {}).catch((reason: unknown) => reason);
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).kind).toBe('conflict');
    expect((caught as ApiError).requestId).toBe('req-1');
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    const network = await api.get('/api/x').catch((reason: unknown) => reason);
    expect((network as ApiError).kind).toMatch(/network|offline/);
    expect(messageForError(network)).toMatch(/servidor|conexão/);
  });
});
