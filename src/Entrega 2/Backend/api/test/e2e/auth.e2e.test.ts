/**
 * E2E da autenticação com dependências reais: PostgreSQL (TEST_DATABASE_URL) e SMTP real
 * entregando no Mailpit (docker compose up -d mailpit). O código de recuperação é lido
 * da caixa do Mailpit, como um estudante leria no e-mail.
 *
 *   E2E_WRITE_EVIDENCE=1 npm run test:e2e   → documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/evidence/e2e/auth-last-run.{md,json}
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_VERSION } from '../../src/app.js';
import { createMailer } from '../../src/mail/mailer.js';
import { prepareDatabase, TEST_DATABASE_URL, type DatabaseHandle } from '../support/database.js';
import { flushEvidence, recordEvidence } from '../support/evidence.js';
import { bearer, buildTestConfig, createTestApp } from '../support/testApp.js';

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:8025';
const SMTP_HOST = process.env.E2E_SMTP_HOST ?? '127.0.0.1';
const SMTP_PORT = Number(process.env.E2E_SMTP_PORT ?? 1025);

async function mailpitReachable(): Promise<boolean> {
  try {
    return (await fetch(`${MAILPIT_URL}/api/v1/info`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

const runE2E = Boolean(TEST_DATABASE_URL) && (await mailpitReachable());

async function waitForCode(email: string, notBefore: number, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=5`);
    const { messages } = (await search.json()) as { messages: Array<{ ID: string; Created: string }> };
    const recent = messages.find((message) => new Date(message.Created).getTime() >= notBefore - 1000);
    if (recent) {
      const detail = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${recent.ID}`)).json()) as { Text: string };
      const code = detail.Text.match(/é: (\d+)/)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Nenhum código recebido para ${email} no Mailpit`);
}

describe.runIf(runE2E)('E2E — autenticação com PostgreSQL e SMTP reais (Mailpit)', () => {
  let db: DatabaseHandle;
  const email = `e2e.auth.${Date.now()}@edu.fecap.br`;
  const registrationNumber = String(Date.now()).slice(-8);

  beforeAll(async () => {
    db = await prepareDatabase();
  });

  afterAll(async () => {
    flushEvidence({ agentServiceUrl: 'n/a', apiVersion: API_VERSION }, { baseName: 'auth-last-run', title: 'Evidência E2E da autenticação — ASA Conecta' });
    await db?.close();
  });

  function api() {
    const base = buildTestConfig();
    const config = { ...base, mail: { transport: 'smtp' as const, smtp: { host: SMTP_HOST, port: SMTP_PORT, secure: false, user: undefined, pass: undefined }, from: 'ASA Conecta E2E <e2e@asa-conecta.local>' } };
    return createTestApp({ repos: db.repos, configOverrides: { mail: config.mail }, mailer: createMailer(config) }).app;
  }

  it('E2E-AUTH-001 cadastro → login mantido → recuperação por e-mail → nova senha → sessões antigas revogadas', async () => {
    const app = api();
    const register = await request(app).post('/api/auth/register').send({
      fullName: 'Estudante E2E Autenticação', email, password: 'Primeira#2026', registrationNumber, programCode: 'CCOMP', rememberMe: true,
    });
    expect(register.status).toBe(201);
    const firstSession = register.body.data;

    const login = await request(app).post('/api/auth/login').send({ email, password: 'Primeira#2026', rememberMe: true });
    expect(login.body.data).toMatchObject({ rememberMe: true, refreshExpiresIn: 30 * 86400 });

    const requestedAt = Date.now();
    const forgot = await request(app).post('/api/auth/forgot-password').send({ email });
    expect(forgot.status).toBe(202);
    const code = await waitForCode(email, requestedAt);
    expect(code).toMatch(/^\d{6}$/);

    const verify = await request(app).post('/api/auth/verify-reset-code').send({ email, code });
    expect(verify.status).toBe(200);
    const reset = await request(app).post('/api/auth/reset-password').send({ resetToken: verify.body.data.resetToken, newPassword: 'Segunda#2026' });
    expect(reset.status).toBe(200);

    const oldRefresh = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.data.refreshToken });
    const oldAccess = await request(app).get('/api/student/me').set(bearer(firstSession.accessToken));
    const newLogin = await request(app).post('/api/auth/login').send({ email, password: 'Segunda#2026' });
    const oldPassword = await request(app).post('/api/auth/login').send({ email, password: 'Primeira#2026' });
    const passed = oldRefresh.status === 401 && oldAccess.status === 401 && newLogin.status === 200 && oldPassword.status === 401;
    recordEvidence({
      scenario: 'E2E-AUTH-001', title: 'Cadastro, recuperação por e-mail real e redefinição', student: 'conta criada no teste', correlationId: newLogin.body.meta?.correlationId ?? 'n/a',
      requestId: newLogin.body.meta?.requestId ?? null, runId: null, httpStatus: newLogin.status,
      outcome: `register ${register.status} · forgot ${forgot.status} · verify ${verify.status} · reset ${reset.status} · refresh antigo ${oldRefresh.status} · senha antiga ${oldPassword.status}`,
      expected: 'sessões antigas revogadas e nova senha válida', passed,
      details: { codeLength: code.length, rememberMe: login.body.data.rememberMe, oldRefreshReason: oldRefresh.body.error?.reason, oldAccessReason: oldAccess.body.error?.reason },
    });
    expect(passed).toBe(true);
    const stored = await db.pool.query('select code_hash from password_resets pr join users u on u.id = pr.user_id where u.email = $1', [email]);
    expect(JSON.stringify(stored.rows)).not.toContain(code);
  });

  it('E2E-AUTH-002 biometria: credencial de dispositivo entra sem senha e é revogada', async () => {
    const app = api();
    const session = (await request(app).post('/api/auth/login').send({ email, password: 'Segunda#2026' })).body.data;
    const enroll = await request(app).post('/api/auth/biometric/enroll').set(bearer(session.accessToken)).send({ deviceLabel: 'E2E' });
    const bioLogin = await request(app).post('/api/auth/biometric/login').send({ credentialId: enroll.body.data.credentialId, credential: enroll.body.data.credential });
    await request(app).post('/api/auth/biometric/revoke').set(bearer(bioLogin.body.data.accessToken)).send({ credentialId: enroll.body.data.credentialId });
    const afterRevoke = await request(app).post('/api/auth/biometric/login').send({ credentialId: enroll.body.data.credentialId, credential: enroll.body.data.credential });
    const passed = enroll.status === 201 && bioLogin.status === 200 && bioLogin.body.data.rememberMe === true && afterRevoke.status === 401;
    recordEvidence({
      scenario: 'E2E-AUTH-002', title: 'Login biométrico com credencial de dispositivo', student: 'conta criada no teste', correlationId: bioLogin.body.meta?.correlationId ?? 'n/a',
      requestId: bioLogin.body.meta?.requestId ?? null, runId: null, httpStatus: bioLogin.status,
      outcome: `enroll ${enroll.status} · login ${bioLogin.status} · após revogar ${afterRevoke.status} (${afterRevoke.body.error?.reason})`, expected: '201 · 200 · 401', passed, details: {},
    });
    expect(passed).toBe(true);
  });

  it('E2E-AUTH-003 proteção: código errado esgota tentativas e login bloqueia após 5 falhas', async () => {
    const app = api();
    const requestedAt = Date.now();
    await request(app).post('/api/auth/forgot-password').send({ email });
    const code = await waitForCode(email, requestedAt);
    const wrong = code === '000000' ? '111111' : '000000';
    const reasons: string[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      reasons.push((await request(app).post('/api/auth/verify-reset-code').send({ email, code: wrong })).body.error.reason);
    }
    const locked = await request(app).post('/api/auth/verify-reset-code').send({ email, code });
    for (let attempt = 0; attempt < 5; attempt += 1) await request(app).post('/api/auth/login').send({ email, password: 'Errada#0000' });
    const blocked = await request(app).post('/api/auth/login').send({ email, password: 'Segunda#2026' });
    const passed = reasons.at(-1) === 'code_locked' && locked.body.error?.reason === 'code_locked' && blocked.status === 429;
    recordEvidence({
      scenario: 'E2E-AUTH-003', title: 'Limites de tentativas (código e login)', student: 'conta criada no teste', correlationId: blocked.body.error?.correlationId ?? 'n/a',
      requestId: blocked.body.error?.requestId ?? null, runId: null, httpStatus: blocked.status,
      outcome: `verify: ${reasons.join(', ')} · código correto após bloqueio: ${locked.body.error?.reason} · login: ${blocked.status} ${blocked.body.error?.reason}`,
      expected: 'code_locked · 429 too_many_attempts', passed, details: { retryAfterSeconds: blocked.body.error?.retryAfterSeconds },
    });
    expect(passed).toBe(true);
  });
});
