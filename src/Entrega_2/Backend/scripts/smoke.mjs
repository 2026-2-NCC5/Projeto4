#!/usr/bin/env node
// ASA Conecta — smoke test de uma implantação (local, preview ou produção). Sem dependências: Node 20+.
//
//   node scripts/smoke.mjs https://asa-conecta.vercel.app
//   SMOKE_EMAIL=estudante.exemplo@demo.asa SMOKE_PASSWORD='Demo@2026' node scripts/smoke.mjs http://localhost:3000
//
// Variáveis:
//   SMOKE_BASE_URL     URL base (ou 1º argumento). Obrigatória.
//   SMOKE_EMAIL/SMOKE_PASSWORD  conta para os fluxos autenticados (aluno). Sem elas, só as verificações públicas.
//   SMOKE_WEB=1        a mesma origem serve o portal web (Vercel Services): verifica página, rotas do SPA e cabeçalhos.
//   SMOKE_BYPASS_TOKEN segredo de "Protection Bypass for Automation" da Vercel (previews protegidos).
//   SMOKE_TIMEOUT_MS   timeout de cada requisição (padrão 20000).
//
// Nada destrutivo: lê dados, faz login/logout da conta informada e uma pergunta ao assistente (registro de uso).
// Sai com código 1 se qualquer verificação falhar (uso em pipelines).

const baseUrl = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? '').replace(/\/+$/, '');
if (!baseUrl) {
  console.error('Informe a URL: node scripts/smoke.mjs <url> (ou SMOKE_BASE_URL)');
  process.exit(2);
}
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 20_000);
const bypass = process.env.SMOKE_BYPASS_TOKEN;
const results = [];

async function call(method, path, { body, token, headers = {} } = {}) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
      'x-correlation-id': `smoke-${Date.now()}`,
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // corpo não-JSON (HTML do portal, por exemplo)
  }
  return { status: response.status, headers: response.headers, json, text, ms: Date.now() - started };
}

async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? '', ms: Date.now() - started });
  } catch (error) {
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error), ms: Date.now() - started });
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const errorCode = (res) => res.json?.error?.code ?? '?';

await check('GET /health — API, banco e Agent Service', async () => {
  const res = await call('GET', '/health');
  expect(res.json?.data, `HTTP ${res.status} sem envelope JSON (a rota chegou na API?)`);
  const { status, database, agentService, version } = res.json.data;
  expect(database === 'up', `banco: ${database}`);
  expect(agentService === 'up', `Agent Service: ${agentService}`);
  expect(res.status === 200 && status === 'ok', `HTTP ${res.status} status=${status}`);
  expect(res.headers.get('x-request-id'), 'sem x-request-id');
  return `v${version} · ${res.ms} ms`;
});

await check('GET /api/platform/info — contrato e modo de dados', async () => {
  const res = await call('GET', '/api/platform/info');
  expect(res.status === 200, `HTTP ${res.status}`);
  const data = res.json?.data ?? {};
  expect(data.contractVersion, 'sem contractVersion');
  // informação pública: revalidada a cada uso (no-cache); dados de usuário usam no-store
  expect(/no-(store|cache)/.test(res.headers.get('cache-control') ?? ''), `Cache-Control inesperado: ${res.headers.get('cache-control')}`);
  return `contrato ${data.contractVersion} · ambiente ${data.environment ?? '?'} · dados ${res.headers.get('x-asa-data-mode') ?? '?'}`;
});

await check('GET /health/queue — monitor da fila', async () => {
  const res = await call('GET', '/health/queue');
  expect([200, 503].includes(res.status) && res.json?.data?.status, `HTTP ${res.status}`);
  return `fila ${res.json.data.status}`;
});

await check('rota privada sem credencial → 401', async () => {
  const res = await call('GET', '/api/auth/me');
  expect(res.status === 401 && errorCode(res) === 'UNAUTHORIZED', `HTTP ${res.status} ${errorCode(res)}`);
});

await check('token inválido → 401', async () => {
  const res = await call('GET', '/api/student/me', { token: 'token-invalido' });
  expect(res.status === 401, `HTTP ${res.status} ${errorCode(res)}`);
});

await check('entrada inválida → 400 VALIDATION_ERROR', async () => {
  const res = await call('POST', '/api/auth/login', { body: { email: 'nao-e-email', password: '' } });
  expect(res.status === 400 && errorCode(res) === 'VALIDATION_ERROR', `HTTP ${res.status} ${errorCode(res)}`);
});

await check('rota inexistente → 404 JSON (sem página de erro do framework)', async () => {
  const res = await call('GET', '/api/nao-existe');
  expect(res.status === 404 && errorCode(res) === 'NOT_FOUND', `HTTP ${res.status} ${errorCode(res)}`);
});

await check('tarefas internas exigem segredo', async () => {
  const res = await call('GET', '/api/internal/jobs/sla-scan', { token: 'segredo-errado-segredo-errado' });
  expect([401, 404].includes(res.status), `HTTP ${res.status}`);
  return res.status === 404 ? 'desativadas (sem CRON_SECRET)' : 'protegidas';
});

await check('cabeçalhos de segurança da API', async () => {
  const res = await call('GET', '/api/platform/info');
  expect(res.headers.get('x-content-type-options') === 'nosniff', 'sem X-Content-Type-Options');
  expect(!res.headers.get('x-powered-by'), 'X-Powered-By exposto');
});

if (process.env.SMOKE_WEB === '1') {
  await check('portal web: página inicial', async () => {
    const res = await call('GET', '/', { headers: { accept: 'text/html' } });
    expect(res.status === 200 && res.text.includes('id="root"'), `HTTP ${res.status}`);
    expect(res.headers.get('content-security-policy'), 'sem Content-Security-Policy');
    return `${res.ms} ms`;
  });
  await check('portal web: rota do SPA cai no index.html', async () => {
    const res = await call('GET', '/aluno/chamados', { headers: { accept: 'text/html' } });
    expect(res.status === 200 && res.text.includes('id="root"'), `HTTP ${res.status}`);
  });
  await check('portal web: sessão por cookie na mesma origem (CSRF)', async () => {
    const res = await call('GET', '/api/web/auth/csrf');
    expect(res.status === 200 && res.json?.data?.csrfToken, `HTTP ${res.status} ${errorCode(res)}`);
  });
}

const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;
if (email && password) {
  let session = null;
  await check('login (aluno)', async () => {
    const res = await call('POST', '/api/auth/login', { body: { email, password } });
    expect(res.status === 200 && res.json?.data?.accessToken, `HTTP ${res.status} ${errorCode(res)}`);
    session = res.json.data;
    return `papel ${session.user?.role ?? '?'}`;
  });
  if (session) {
    const token = session.accessToken;
    await check('GET /api/auth/me (sem cache compartilhado)', async () => {
      const res = await call('GET', '/api/auth/me', { token });
      expect(res.status === 200 && res.json?.data?.user?.email === email, `HTTP ${res.status}`);
      expect(res.headers.get('cache-control')?.includes('no-store'), `Cache-Control: ${res.headers.get('cache-control')}`);
    });
    for (const path of ['/api/student/me', '/api/student/summary', '/api/student/subjects', '/api/student/pending-items']) {
      await check(`GET ${path} (dados do banco)`, async () => {
        const res = await call('GET', path, { token });
        expect(res.status === 200 && res.json?.data !== undefined, `HTTP ${res.status} ${errorCode(res)}`);
        return `${res.ms} ms`;
      });
    }
    await check('GET /api/support/catalog (limite de anexos)', async () => {
      const res = await call('GET', '/api/support/catalog', { token });
      expect(res.status === 200, `HTTP ${res.status}`);
      return `anexo até ${Math.round(res.json.data.limits.maxAttachmentBytes / 1024 / 1024)} MiB`;
    });
    await check('GET /api/queue/status', async () => {
      const res = await call('GET', '/api/queue/status', { token });
      expect(res.status === 200, `HTTP ${res.status} ${errorCode(res)}`);
      return `sincronização ${res.json.data.queue.sync.status}`;
    });
    await check('POST /api/assistant/message (assistente com dados autorizados)', async () => {
      const res = await call('POST', '/api/assistant/message', { token, body: { inputType: 'text', text: 'Quais são minhas pendências?' } });
      expect(res.status === 200 && res.json?.data?.intent, `HTTP ${res.status} ${errorCode(res)}`);
      return `intenção ${res.json.data.intent}`;
    });
    await check('logout e refresh token revogado → 401', async () => {
      const out = await call('POST', '/api/auth/logout', { token, body: { refreshToken: session.refreshToken } });
      expect([200, 204].includes(out.status), `logout HTTP ${out.status}`);
      const res = await call('POST', '/api/auth/refresh', { body: { refreshToken: session.refreshToken } });
      expect(res.status === 401, `refresh depois do logout: HTTP ${res.status}`);
    });
  }
}

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(`${r.ok ? 'OK  ' : 'FALHA'} ${r.name.padEnd(width)}  ${r.detail}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram em ${baseUrl}`);
process.exit(failed > 0 ? 1 : 0);
