// Teste de carga LEVE em produção (Vercel gru1 + Supabase sa-east-1): só leituras públicas, sem login e sem
// escrita. A vazão máxima (10 req/s) está bem abaixo da cota do plano e do limite de conexões do banco,
// para não afetar quem usa o sistema. Mede latência real (TLS, CDN, função, banco) e o efeito do cold start.
//
//   docker run --rm -v "$PWD/observability/k6:/scripts:ro" -v "$PWD/observability/resultados:/resultados" \
//     -u "$(id -u):$(id -g)" grafana/k6:1.3.0 run /scripts/producao-leve.js
import http from 'k6/http';
import { check } from 'k6';

const API = __ENV.API_URL || 'https://asa-conecta-api.vercel.app';
const PORTAL = __ENV.PORTAL_URL || 'https://asa-conecta.vercel.app';
const RODADA = __ENV.RODADA || 'producao';

export const options = {
  scenarios: {
    leitura: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 10,
      maxVUs: 30,
      stages: [
        { duration: '1m', target: 5 },
        { duration: '2m', target: 5 },
        { duration: '1m', target: 10 },
        { duration: '1m', target: 10 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{rota:health}': ['p(95)<1500'],
    'http_req_duration{rota:info}': ['p(95)<800'],
    'http_req_duration{rota:portal}': ['p(95)<500'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  userAgent: 'asa-conecta-teste-de-carga/1.0 (Entrega 2 SO e Nuvem)',
};

export default function () {
  const sorteio = Math.random();
  if (sorteio < 0.4) {
    // /health consulta o banco e o serviço do agente a cada chamada: é a rota mais pesada aberta ao público
    const r = http.get(`${API}/health`, { tags: { rota: 'health', name: 'GET /health' } });
    check(r, { 'health 200 e ok': (res) => res.status === 200 && res.json('data.status') === 'ok' });
  } else if (sorteio < 0.8) {
    const r = http.get(`${API}/api/platform/info`, { tags: { rota: 'info', name: 'GET /api/platform/info' } });
    check(r, { 'info 200': (res) => res.status === 200 });
  } else {
    // portal estático servido pela CDN (cache)
    const r = http.get(`${PORTAL}/`, { tags: { rota: 'portal', name: 'GET portal /' } });
    check(r, { 'portal 200': (res) => res.status === 200 });
  }
}

export function handleSummary(data) {
  return {
    stdout: `\nResumo salvo em /resultados/k6-${RODADA}.json\n`,
    [`/resultados/k6-${RODADA}.json`]: JSON.stringify(data, null, 2),
  };
}
