import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { HttpMetrics } from '../../src/observability/metrics.js';
import { createTestApp } from '../support/testApp.js';

/** Observabilidade: GET /metrics (Prometheus) com latência/erros por rota, CPU, memória e acesso por token. */

const TOKEN = 'metrics-token-de-teste-0123456789';

function appWithMetrics(token: string | null) {
  return createTestApp({ configOverrides: { metrics: { token } } }).app;
}

function sample(text: string, name: string, labelFragment: string): number | null {
  const line = text.split('\n').find((item) => item.startsWith(name) && item.includes(labelFragment));
  return line ? Number(line.slice(line.lastIndexOf(' ') + 1)) : null;
}

describe('GET /metrics', () => {
  it('não existe sem METRICS_TOKEN (404 no formato padrão de erro)', async () => {
    const response = await request(appWithMetrics(null)).get('/metrics');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('exige o token: sem cabeçalho ou com token errado responde 401', async () => {
    const app = appWithMetrics(TOKEN);
    const missing = await request(app).get('/metrics');
    expect(missing.status).toBe(401);
    expect(missing.headers['www-authenticate']).toContain('Bearer');
    const wrong = await request(app).get('/metrics').set('Authorization', 'Bearer outro-token-qualquer-0123456789');
    expect(wrong.status).toBe(401);
    expect(wrong.text).not.toContain('asa_http_requests_total');
  });

  it('expõe contadores por rota (molde, sem IDs), latência, CPU e memória', async () => {
    const app = appWithMetrics(TOKEN);
    await request(app).get('/api/auth/policy').expect(200);
    await request(app).get('/api/auth/policy').expect(200);
    await request(app).get('/api/student/me').expect(401);
    await request(app).get('/rota-que-nao-existe/123').expect(404);

    const response = await request(app).get('/metrics').set('Authorization', `Bearer ${TOKEN}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.headers['cache-control']).toBe('no-store');
    const text = response.text;

    expect(sample(text, 'asa_http_requests_total', 'route="/api/auth/policy",status_code="200"')).toBe(2);
    expect(sample(text, 'asa_http_requests_total', 'route="/api/student/me",status_code="401"')).toBe(1);
    // rota desconhecida não vira rótulo (cardinalidade limitada, sem identificadores da URL)
    expect(sample(text, 'asa_http_requests_total', 'route="unmatched",status_code="404"')).toBe(1);
    expect(text).not.toContain('rota-que-nao-existe');
    // a própria coleta não entra nas métricas HTTP
    expect(text).not.toContain('route="/metrics"');

    expect(sample(text, 'asa_http_request_duration_seconds_count', 'route="/api/auth/policy"')).toBe(2);
    expect(sample(text, 'asa_http_request_duration_seconds_bucket', 'route="/api/auth/policy",le="+Inf"')).toBe(2);
    expect(sample(text, 'process_cpu_seconds_total', '')).toBeGreaterThan(0);
    expect(sample(text, 'process_resident_memory_bytes', '')).toBeGreaterThan(0);
    expect(text).toContain('# TYPE asa_http_request_duration_seconds histogram');
    expect(text).toMatch(/nodejs_eventloop_lag_seconds\{quantile="0.99"\} \d/);
  });
});

describe('HttpMetrics', () => {
  it('histograma cumulativo: cada observação conta em todos os limites maiores ou iguais', () => {
    const metrics = new HttpMetrics({ version: 'teste' });
    metrics.observe('GET', '/health', 200, 0.03);
    metrics.observe('GET', '/health', 503, 1.7);
    const text = metrics.render();
    expect(sample(text, 'asa_http_request_duration_seconds_bucket', 'le="0.025"')).toBe(0);
    expect(sample(text, 'asa_http_request_duration_seconds_bucket', 'le="0.05"')).toBe(1);
    expect(sample(text, 'asa_http_request_duration_seconds_bucket', 'le="2.5"')).toBe(2);
    expect(sample(text, 'asa_http_request_duration_seconds_bucket', 'le="+Inf"')).toBe(2);
    expect(sample(text, 'asa_http_request_duration_seconds_sum', 'route="/health"')).toBeCloseTo(1.73, 5);
    expect(sample(text, 'asa_http_requests_total', 'status_code="503"')).toBe(1);
  });

  it('informa o pool do banco (em uso e requisições esperando conexão)', () => {
    const text = new HttpMetrics({ version: 'teste' }).render({ totalCount: 10, idleCount: 3, waitingCount: 4 });
    expect(sample(text, 'asa_db_pool_connections', 'state="in_use"')).toBe(7);
    expect(sample(text, 'asa_db_pool_connections', 'state="waiting"')).toBe(4);
  });

  it('escapa valores de rótulo', () => {
    const metrics = new HttpMetrics({ version: 'teste' });
    metrics.observe('GET', '/a"b\\c', 200, 0.001);
    expect(metrics.render()).toContain('route="/a\\"b\\\\c"');
  });
});
