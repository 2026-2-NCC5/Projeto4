// Teste de carga local: jornada do aluno na API + chamadas diretas ao serviço do agente.
//
//   docker compose ... --profile carga run --rm k6 run -o experimental-prometheus-rw \
//     -e PERFIL=rampa -e RODADA=antes /scripts/jornada-aluno.js
//
// PERFIL: fumaca (1 VU, 30 s) | rampa (0 → 100 VUs com tempo de leitura, ~7 min) |
//         estresse (5 → 100 jornadas/s sem pausa, ~6 min) | constante (40 VUs, 3 min).
// RODADA: nome do arquivo de resultado em /resultados (ex.: antes, depois).
// Usa contas de teste próprias (carga.NN@edu.fecap.br) criadas no banco LOCAL pelo setup; nunca rode contra produção.
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import exec from 'k6/execution';

const BASE_URL = __ENV.BASE_URL || 'http://api:3000';
const AGENT_URL = __ENV.AGENT_URL || 'http://agent-service:8000';
const AGENT_TOKEN = __ENV.AGENT_SERVICE_TOKEN || '';
const PASSWORD = __ENV.LOAD_TEST_PASSWORD;
const PERFIL = __ENV.PERFIL || 'fumaca';
const RODADA = __ENV.RODADA || PERFIL;
const CONTAS = Number(__ENV.CONTAS || 8);
// no estresse a jornada não tem tempo de leitura: mede a vazão máxima do servidor
const pausa = (min, max) => { if (PERFIL !== 'estresse') sleep(Math.random() * (max - min) + min); };

if (/vercel\.app|fecap\.br/.test(BASE_URL)) {
  throw new Error('jornada-aluno.js cria contas de teste: use apenas contra o ambiente local (producao-leve.js é o teste de produção).');
}

const AGENT_PAYLOAD = open('/contracts/request.scenario-002.json');

const PERFIS = {
  fumaca: {
    jornada: { executor: 'constant-vus', vus: 1, duration: '30s' },
    agente: { executor: 'constant-arrival-rate', rate: 1, timeUnit: '1s', duration: '30s', preAllocatedVUs: 2 },
  },
  rampa: {
    jornada: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 10 },
        { duration: '1m', target: 25 },
        { duration: '1m30s', target: 50 },
        { duration: '1m30s', target: 100 },
        { duration: '1m', target: 100 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
    agente: {
      executor: 'ramping-arrival-rate',
      startRate: 2,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 60,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '3m', target: 20 },
        { duration: '1m30s', target: 20 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  // estresse: jornadas iniciadas por segundo, sem tempo de leitura, até saturar 1 vCPU (ponto de joelho)
  estresse: {
    jornada: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 400,
      stages: [
        { duration: '1m', target: 20 },
        { duration: '1m', target: 40 },
        { duration: '1m', target: 60 },
        { duration: '1m', target: 80 },
        { duration: '1m', target: 100 },
        { duration: '30s', target: 0 },
      ],
    },
    agente: { executor: 'constant-arrival-rate', rate: 5, timeUnit: '1s', duration: '5m30s', preAllocatedVUs: 10, maxVUs: 40 },
  },
  constante: {
    jornada: { executor: 'constant-vus', vus: 40, duration: '3m' },
    agente: { executor: 'constant-arrival-rate', rate: 10, timeUnit: '1s', duration: '3m', preAllocatedVUs: 20, maxVUs: 40 },
  },
};

const cenarios = PERFIS[PERFIL];
if (!cenarios) throw new Error(`PERFIL desconhecido: ${PERFIL}`);

export const options = {
  scenarios: {
    jornada: { ...cenarios.jornada, exec: 'jornada', tags: { cenario: 'jornada' } },
    agente: { ...cenarios.agente, exec: 'agente', tags: { cenario: 'agente' } },
  },
  thresholds: {
    'http_req_failed{cenario:jornada}': ['rate<0.01'],
    'http_req_failed{cenario:agente}': ['rate<0.01'],
    'http_req_duration{cenario:jornada}': ['p(95)<1000'],
    'http_req_duration{cenario:agente}': ['p(95)<500'],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  setupTimeout: '2m',
};

const assistenteDuracao = new Trend('asa_assistente_duracao', true);
const respostasSemFonte = new Counter('asa_assistente_sem_fonte');
const respostasAbstidas = new Counter('asa_assistente_abstencoes');

const PERGUNTAS = [
  'Como faço para pedir a segunda via do boleto?',
  'Quero trancar a matrícula, o que preciso fazer?',
  'Onde consigo o atestado de matrícula?',
  'Como funciona o FIES na FECAP?',
  'Qual o horário de atendimento do ASA?',
  'Como solicito revisão de nota?',
  'Preciso de ajuda com bolsa de estudos',
  'Como faço a rematrícula?',
  'Onde vejo vagas de estágio?',
  'Como agendar atendimento com o ASA?',
];
const BUSCAS = ['boleto', 'matrícula', 'estágio', 'bolsa', 'biblioteca', 'documentos'];

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function ra(n) {
  return String(90000000 + n);
}

export function setup() {
  if (!PASSWORD) throw new Error('Defina LOAD_TEST_PASSWORD (observability/.env).');
  const tokens = [];
  for (let i = 1; i <= CONTAS; i += 1) {
    const email = `carga.${String(i).padStart(2, '0')}@edu.fecap.br`;
    let login = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({ email, password: PASSWORD }), { headers: JSON_HEADERS, tags: { name: 'setup' } });
    if (login.status === 401) {
      const cadastro = http.post(
        `${BASE_URL}/api/auth/register`,
        JSON.stringify({ fullName: `Conta de Carga ${String(i).padStart(2, '0')}`, email, password: PASSWORD, registrationNumber: ra(i) }),
        { headers: JSON_HEADERS, tags: { name: 'setup' } },
      );
      if (cadastro.status !== 201 && cadastro.status !== 200) {
        throw new Error(`cadastro de ${email} falhou: ${cadastro.status} ${cadastro.body}`);
      }
      login = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({ email, password: PASSWORD }), { headers: JSON_HEADERS, tags: { name: 'setup' } });
    }
    if (login.status !== 200) throw new Error(`login de ${email} falhou: ${login.status} ${login.body}`);
    tokens.push(login.json('data.accessToken'));
  }
  return { tokens };
}

export function jornada(data) {
  const token = data.tokens[(exec.vu.idInTest - 1) % data.tokens.length];
  const auth = { headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` } };

  group('abrir o app', () => {
    const info = http.get(`${BASE_URL}/api/platform/info`, { tags: { name: 'GET /api/platform/info' } });
    check(info, { 'info 200': (r) => r.status === 200 });
    const me = http.get(`${BASE_URL}/api/student/me`, { ...auth, tags: { name: 'GET /api/student/me' } });
    check(me, { 'perfil 200': (r) => r.status === 200 });
  });
  pausa(1, 3);

  group('perguntar ao assistente', () => {
    const pergunta = PERGUNTAS[Math.floor(Math.random() * PERGUNTAS.length)];
    const resposta = http.post(`${BASE_URL}/api/assistant/message`, JSON.stringify({ inputType: 'text', text: pergunta }), {
      ...auth,
      tags: { name: 'POST /api/assistant/message' },
    });
    assistenteDuracao.add(resposta.timings.duration);
    const ok = check(resposta, { 'assistente 200': (r) => r.status === 200 });
    if (ok) {
      // resposta com fonte oficial (artigo da base) ou abstenção explícita: nunca uma resposta inventada
      const body = resposta.json('data');
      if (body.abstained) respostasAbstidas.add(1);
      else if (!Array.isArray(body.sources) || body.sources.length === 0) respostasSemFonte.add(1);
    }
  });
  pausa(1, 3);

  group('consultar a base e os chamados', () => {
    const termo = BUSCAS[Math.floor(Math.random() * BUSCAS.length)];
    const base = http.get(`${BASE_URL}/api/knowledge-base?search=${encodeURIComponent(termo)}`, { ...auth, tags: { name: 'GET /api/knowledge-base' } });
    check(base, { 'base 200': (r) => r.status === 200 });
    const chamados = http.get(`${BASE_URL}/api/support/tickets`, { ...auth, tags: { name: 'GET /api/support/tickets' } });
    check(chamados, { 'chamados 200': (r) => r.status === 200 });
  });

  if (Math.random() < 0.2) {
    const saude = http.get(`${BASE_URL}/health`, { tags: { name: 'GET /health' } });
    check(saude, { 'health 200': (r) => r.status === 200 });
  }
  pausa(1, 3);
}

export function agente() {
  const headers = { ...JSON_HEADERS, ...(AGENT_TOKEN ? { Authorization: `Bearer ${AGENT_TOKEN}` } : {}) };
  const resposta = http.post(`${AGENT_URL}/internal/v1/student-agent/evaluate`, AGENT_PAYLOAD, { headers, tags: { name: 'POST agent evaluate' } });
  check(resposta, {
    'agente 200': (r) => r.status === 200,
    'agente com recomendação explicável': (r) => r.status === 200 && r.json('status') === 'recommendation',
  });
}

export function handleSummary(data) {
  return {
    stdout: `\nResumo salvo em /resultados/k6-${RODADA}.json\n`,
    [`/resultados/k6-${RODADA}.json`]: JSON.stringify(data, null, 2),
  };
}
