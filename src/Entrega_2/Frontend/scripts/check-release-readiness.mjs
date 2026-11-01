const baseUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
const timeoutMs = 8_000;
const problems = [];

if (!baseUrl) {
  console.error('BLOQUEADO: defina EXPO_PUBLIC_API_URL com a API institucional.');
  process.exit(1);
}

let apiUrl;
try {
  apiUrl = new URL(baseUrl);
} catch {
  console.error('BLOQUEADO: EXPO_PUBLIC_API_URL não é uma URL válida.');
  process.exit(1);
}

if (apiUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(apiUrl.hostname)) {
  problems.push('A URL da API precisa usar HTTPS fora do ambiente local.');
}

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${path}`);
  return response.json();
}

function unwrap(payload) {
  return payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
}

try {
  const health = unwrap(await get('/health'));
  if (health?.status !== 'ok' || health?.database !== 'up' || health?.agentService !== 'up') {
    problems.push('Health check da API, banco ou serviço de agentes não está saudável.');
  } else {
    console.warn('OK: API, banco e serviço de agentes saudáveis.');
  }
} catch (error) {
  problems.push(`Health check indisponível (${error instanceof Error ? error.message : 'erro de rede'}).`);
}

try {
  const platform = unwrap(await get('/api/platform/info'));
  if (platform?.dataMode !== 'institutional') problems.push('API não está em dataMode institutional.');
  if (platform?.academicSource?.provider !== 'institutional' || platform?.academicSource?.status !== 'available') {
    problems.push('Fonte acadêmica institucional não está disponível.');
  }
} catch (error) {
  problems.push(`Informações públicas da plataforma indisponíveis (${error instanceof Error ? error.message : 'erro de rede'}).`);
}

try {
  const policy = unwrap(await get('/api/auth/policy'));
  const domains = Array.isArray(policy?.allowedEmailDomains) ? policy.allowedEmailDomains.map((value) => String(value).toLowerCase()) : [];
  if (!domains.includes('edu.fecap.br') || !domains.includes('fecap.br')) {
    problems.push('A política de autenticação não inclui os domínios institucionais edu.fecap.br e fecap.br.');
  }
  if (domains.some((domain) => domain.includes('demo') || domain === 'example.com')) {
    problems.push('A política de autenticação ainda aceita um domínio de demonstração.');
  }
  if (policy?.passwordRecoveryAvailable !== true) problems.push('Recuperação de senha por e-mail não está disponível.');
  if (!policy?.legal?.termsUrl || !policy?.legal?.privacyUrl) problems.push('Termos de uso e política de privacidade ainda não estão configurados.');
} catch (error) {
  problems.push(`Política pública de autenticação indisponível (${error instanceof Error ? error.message : 'erro de rede'}).`);
}

if (problems.length) {
  console.error('\nBLOQUEADO: o app ainda não atende aos requisitos para distribuição com dados reais.');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.warn('OK: verificações públicas passaram. Isso não substitui homologação institucional, teste de contas reais nem revisão de privacidade.');
