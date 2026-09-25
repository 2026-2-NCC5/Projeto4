import * as Network from 'expo-network';

import { ApiClientError, configureApiClient, createCorrelationId, request, resetApiClientForTests } from '../services/apiClient';

import { abortingFetch, errorEnvelope, fakeResponse, okEnvelope } from './support/fakeFetch';

describe('apiClient', () => {
  const onUnauthorized = jest.fn();
  const refreshSession = jest.fn<Promise<string | null>, []>();
  let fetchFn: jest.Mock;
  let token: string | null;

  function configure() {
    configureApiClient({
      baseUrl: 'http://api.test',
      getAccessToken: () => token,
      refreshSession,
      onUnauthorized,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
  }

  beforeEach(() => {
    token = 'old-token';
    fetchFn = jest.fn();
    onUnauthorized.mockReset();
    refreshSession.mockReset();
    configure();
  });

  afterEach(() => resetApiClientForTests());

  it('devolve data do envelope e envia Authorization + x-correlation-id', async () => {
    fetchFn.mockResolvedValueOnce(fakeResponse(200, okEnvelope({ id: 'me' })));
    const data = await request<{ id: string }>('/api/student/me', { correlationId: 'corr-flow' });
    expect(data).toEqual({ id: 'me' });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/student/me');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer old-token');
    expect(headers['x-correlation-id']).toBe('corr-flow');
  });

  it('401 token_expired → faz refresh uma vez e repete a chamada com o novo token', async () => {
    fetchFn
      .mockResolvedValueOnce(fakeResponse(401, errorEnvelope('UNAUTHORIZED', 'Sessão expirada.', { reason: 'token_expired' })))
      .mockResolvedValueOnce(fakeResponse(200, okEnvelope([1, 2])));
    refreshSession.mockResolvedValueOnce('new-token');

    const data = await request<number[]>('/api/student/subjects');

    expect(data).toEqual([1, 2]);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const retryHeaders = (fetchFn.mock.calls[1] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe('Bearer new-token');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('401 token_expired com refresh falhando → onUnauthorized e erro unauthorized', async () => {
    fetchFn.mockResolvedValueOnce(fakeResponse(401, errorEnvelope('UNAUTHORIZED', 'Sessão expirada.', { reason: 'token_expired' })));
    refreshSession.mockRejectedValueOnce(new ApiClientError({ kind: 'unauthorized', message: 'expirou', reason: 'session_expired' }));

    await expect(request('/api/student/subjects')).rejects.toMatchObject({ kind: 'unauthorized', reason: 'token_expired' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('401 token_invalid → não tenta refresh e encerra a sessão', async () => {
    fetchFn.mockResolvedValueOnce(fakeResponse(401, errorEnvelope('UNAUTHORIZED', 'Token inválido.', { reason: 'token_invalid' })));
    await expect(request('/api/student/me')).rejects.toMatchObject({ kind: 'unauthorized', reason: 'token_invalid', status: 401 });
    expect(refreshSession).not.toHaveBeenCalled();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('401 em rota sem auth (login) → erro unauthorized sem encerrar sessão', async () => {
    fetchFn.mockResolvedValueOnce(fakeResponse(401, errorEnvelope('UNAUTHORIZED', 'E-mail ou senha inválidos.', { reason: 'invalid_credentials' })));
    await expect(request('/api/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'x' }, auth: false })).rejects.toMatchObject({
      kind: 'unauthorized',
      reason: 'invalid_credentials',
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
    const headers = (fetchFn.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('503 DEPENDENCY_ERROR → kind dependency com ids de rastreabilidade dos headers', async () => {
    fetchFn.mockResolvedValueOnce(
      fakeResponse(503, errorEnvelope('DEPENDENCY_ERROR', 'Não foi possível concluir a análise. Tente novamente.'), {
        'x-request-id': 'req-h',
        'x-correlation-id': 'corr-h',
      }),
    );
    await expect(request('/api/agent/analyze', { method: 'POST', body: {} })).rejects.toMatchObject({
      kind: 'dependency',
      code: 'DEPENDENCY_ERROR',
      status: 503,
      requestId: 'req-h',
      correlationId: 'corr-h',
    });
  });

  it('504 TIMEOUT da API → kind timeout', async () => {
    fetchFn.mockResolvedValueOnce(fakeResponse(504, errorEnvelope('TIMEOUT', 'demorou')));
    await expect(request('/api/agent/analyze', { method: 'POST', body: {} })).rejects.toMatchObject({ kind: 'timeout', status: 504 });
  });

  it('502 CONTRACT_ERROR → kind contract', async () => {
    fetchFn.mockResolvedValueOnce(fakeResponse(502, errorEnvelope('CONTRACT_ERROR', 'incompatível')));
    await expect(request('/api/agent/analyze', { method: 'POST', body: {} })).rejects.toMatchObject({ kind: 'contract', status: 502 });
  });

  it('403 → forbidden; 404 → not_found; 400 → validation com details', async () => {
    fetchFn.mockResolvedValueOnce(fakeResponse(403, errorEnvelope('FORBIDDEN', 'sem acesso')));
    await expect(request('/api/agent/recommendations/x')).rejects.toMatchObject({ kind: 'forbidden' });
    fetchFn.mockResolvedValueOnce(fakeResponse(404, errorEnvelope('NOT_FOUND', 'nada')));
    await expect(request('/api/agent/history/x')).rejects.toMatchObject({ kind: 'not_found' });
    fetchFn.mockResolvedValueOnce(fakeResponse(400, errorEnvelope('VALIDATION_ERROR', 'inválido', { details: [{ field: 'email', message: 'E-mail inválido.' }] })));
    await expect(request('/api/auth/login', { auth: false, method: 'POST', body: {} })).rejects.toMatchObject({
      kind: 'validation',
      details: [{ field: 'email', message: 'E-mail inválido.' }],
    });
  });

  it('abort por timeout local → kind timeout', async () => {
    fetchFn = abortingFetch();
    configure();
    await expect(request('/api/agent/analyze', { method: 'POST', body: {}, timeoutMs: 5 })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('abort por signal externo (usuário cancelou) → kind cancelled, sem virar timeout', async () => {
    fetchFn = abortingFetch();
    configure();
    const controller = new AbortController();
    const pending = request('/api/assistant/message', { method: 'POST', body: { inputType: 'text', text: 'oi' }, timeoutMs: 10_000, signal: controller.signal, correlationId: 'corr-cancel' });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled', correlationId: 'corr-cancel' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('signal já abortado → cancelled sem chamar fetch', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(request('/api/assistant/message', { method: 'POST', body: {}, signal: controller.signal })).rejects.toMatchObject({ kind: 'cancelled' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('signal externo não abortado: timeout local continua sendo timeout', async () => {
    fetchFn = abortingFetch();
    configure();
    const controller = new AbortController();
    await expect(request('/api/assistant/message', { method: 'POST', body: {}, timeoutMs: 5, signal: controller.signal })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('falha de rede sem conexão → kind offline; com conexão → kind network', async () => {
    const getNetworkState = Network.getNetworkStateAsync as jest.Mock;
    fetchFn.mockRejectedValueOnce(new TypeError('Network request failed'));
    getNetworkState.mockResolvedValueOnce({ isConnected: false, isInternetReachable: false });
    await expect(request('/api/student/me')).rejects.toMatchObject({ kind: 'offline' });

    fetchFn.mockRejectedValueOnce(new TypeError('Network request failed'));
    getNetworkState.mockResolvedValueOnce({ isConnected: true, isInternetReachable: true });
    await expect(request('/api/student/me')).rejects.toMatchObject({ kind: 'network' });
  });

  it('resposta 2xx fora do envelope → kind contract', async () => {
    fetchFn.mockResolvedValueOnce(fakeResponse(200, { foo: 'bar' }));
    await expect(request('/api/student/me')).rejects.toMatchObject({ kind: 'contract' });
  });

  it('204 → undefined', async () => {
    fetchFn.mockResolvedValueOnce(fakeResponse(204, undefined));
    await expect(request('/api/auth/logout', { method: 'POST', body: {}, auth: 'optional' })).resolves.toBeUndefined();
  });

  it('createCorrelationId gera ids no formato corr-<uuid>', () => {
    const id = createCorrelationId();
    expect(id).toMatch(/^corr-[0-9a-f-]{36}$/i);
    expect(createCorrelationId()).not.toBe(id);
  });
});
