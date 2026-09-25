/** Resposta mínima compatível com o que o apiClient consome (status, ok, headers.get, text). */
export function fakeResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const normalized = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => normalized[name.toLowerCase()] ?? null },
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
    json: async () => body,
  } as unknown as Response;
}

export function okEnvelope<T>(data: T, ids: { requestId?: string; correlationId?: string } = {}) {
  return { data, meta: { requestId: ids.requestId ?? 'req-1', correlationId: ids.correlationId ?? 'corr-1' } };
}

export function errorEnvelope(code: string, message: string, extra: { reason?: string; details?: unknown } = {}) {
  return { error: { code, message, ...extra, requestId: 'req-err', correlationId: 'corr-err' } };
}

export function abortingFetch(): jest.Mock {
  return jest.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
    });
  });
}
