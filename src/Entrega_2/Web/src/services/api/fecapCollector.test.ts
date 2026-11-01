import { afterEach, describe, expect, it, vi } from 'vitest';
import { fecapCollectorApi } from './fecapCollector';

afterEach(() => vi.unstubAllGlobals());

describe('agente local do Portal FECAP', () => {
  it('consulta somente localhost, envia token e não habilita cookies nem cache', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ authenticated: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    await fecapCollectorApi.status('token-local-de-teste');

    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit & { targetAddressSpace: string }];
    expect(url.origin).toBe('http://127.0.0.1:8765');
    expect(url.pathname).toBe('/api/v1/portal/status');
    expect(init.headers).toEqual({ Authorization: 'Bearer token-local-de-teste' });
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
    expect(init.targetAddressSpace).toBe('loopback');
  });

  it('filtra a pesquisa no agente local e exibe erros sem vazar detalhes de rede', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ detail: 'Nenhuma leitura local disponível.' }), { status: 404 }));
    vi.stubGlobal('fetch', fetch);

    await expect(fecapCollectorApi.data('token-local', 'nota')).rejects.toThrow('Nenhuma leitura local disponível.');
    const [url] = fetch.mock.calls[0] as unknown as [URL];
    expect(url.searchParams.get('q')).toBe('nota');
  });
});
