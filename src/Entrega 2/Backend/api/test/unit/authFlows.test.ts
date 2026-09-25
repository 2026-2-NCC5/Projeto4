import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AuthSession } from '../../src/contracts/mobileApi.v1.js';
import { AUTH_RATE_LIMITS } from '../../src/routes/index.js';
import { buildFixtureData, DEMO_PASSWORD, USERS } from '../support/fixtures.js';
import { createInMemoryRepositories } from '../support/inMemoryRepositories.js';
import { createClock, MemoryMailer } from '../support/memoryMailer.js';
import { bearer, buildTestConfig, createTestApp, loginAs } from '../support/testApp.js';

const MINUTE = 60_000;

function setup(options: { mailAvailable?: boolean; rateLimit?: boolean; biometric?: boolean } = {}) {
  const clock = createClock();
  const mailer = new MemoryMailer(options.mailAvailable ?? true);
  const repos = createInMemoryRepositories(buildFixtureData());
  const base = buildTestConfig();
  const { app, config } = createTestApp({
    repos,
    mailer,
    now: clock.now,
    configOverrides: {
      rateLimit: { enabled: options.rateLimit ?? true },
      auth: { ...base.auth, biometric: { ...base.auth.biometric, enabled: options.biometric ?? true } },
    },
  });
  return { app, repos, mailer, clock, config };
}

const VALID_REGISTRATION = {
  fullName: 'Aluna Nova Exemplo',
  email: 'aluna.nova@edu.fecap.br',
  password: 'Senha@Forte1',
  registrationNumber: '25000001',
  programCode: 'CCOMP',
  rememberMe: true,
};

describe('política pública e catálogo', () => {
  it('GET /api/auth/policy expõe as regras usadas pelo backend', async () => {
    const { app } = setup();
    const response = await request(app).get('/api/auth/policy');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      password: { minLength: 8, maxLength: 128, requireUppercase: true, requireLowercase: true, requireDigit: true, requireSymbol: true },
      allowedEmailDomains: ['edu.fecap.br', 'fecap.br', 'demo.asa'],
      registrationNumber: { pattern: '^\\d{8}$', example: '24026962' },
      resetCode: { length: 6, ttlSeconds: 600, resendCooldownSeconds: 60, maxAttempts: 5 },
      session: { rememberMeDays: 30, shortSessionHours: 12 },
      biometric: { enabled: true, credentialTtlDays: 30 },
      legal: { termsUrl: null, privacyUrl: null },
      passwordRecoveryAvailable: true,
    });
  });

  it('GET /api/auth/programs lista cursos', async () => {
    const { app } = setup();
    const response = await request(app).get('/api/auth/programs');
    expect(response.body.data.map((item: { code: string }) => item.code)).toEqual(['ADM', 'ADS', 'CCOMP']);
  });
});

describe('login com "Manter conectado" e proteção contra força bruta', () => {
  it('rememberMe define a validade do refresh token e é preservado na rotação', async () => {
    const { app } = setup();
    const short = await request(app).post('/api/auth/login').send({ email: USERS.student1.email, password: DEMO_PASSWORD });
    expect(short.body.data).toMatchObject({ rememberMe: false, refreshExpiresIn: 12 * 3600 });
    const long = await request(app).post('/api/auth/login').send({ email: USERS.student1.email, password: DEMO_PASSWORD, rememberMe: true });
    expect(long.body.data).toMatchObject({ rememberMe: true, refreshExpiresIn: 30 * 86400 });
    const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken: long.body.data.refreshToken });
    expect(refreshed.body.data).toMatchObject({ rememberMe: true, refreshExpiresIn: 30 * 86400 });
  });

  it('sessão curta expira no servidor após o prazo', async () => {
    const { app, clock } = setup();
    const session = (await request(app).post('/api/auth/login').send({ email: USERS.student1.email, password: DEMO_PASSWORD })).body.data as AuthSession;
    clock.advance(12 * 60 * MINUTE + 1000);
    const response = await request(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(response.status).toBe(401);
    expect(response.body.error.reason).toBe('session_expired');
  });

  it('5 senhas erradas bloqueiam o e-mail por 15 min (429 + Retry-After), inclusive e-mail inexistente', async () => {
    const { app, clock } = setup();
    for (const email of [USERS.student2.email, 'ninguem@edu.fecap.br']) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const wrong = await request(app).post('/api/auth/login').send({ email, password: 'Errada@123' });
        expect(wrong.status).toBe(401);
      }
      const blocked = await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
      expect(blocked.status).toBe(429);
      expect(blocked.body.error).toMatchObject({ code: 'RATE_LIMITED', reason: 'too_many_attempts' });
      expect(blocked.body.error.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.headers['retry-after']).toBe(String(blocked.body.error.retryAfterSeconds));
    }
    clock.advance(15 * MINUTE + 1000);
    const afterWindow = await request(app).post('/api/auth/login').send({ email: USERS.student2.email, password: DEMO_PASSWORD });
    expect(afterWindow.status).toBe(200);
  });

  it('limite por IP nas tentativas de login', async () => {
    const { app } = setup();
    let last = 0;
    for (let index = 0; index <= AUTH_RATE_LIMITS.login.max; index += 1) {
      last = (await request(app).post('/api/auth/login').send({ email: `ip${index}@edu.fecap.br`, password: 'Errada@123' })).status;
    }
    expect(last).toBe(429);
  });
});

describe('cadastro', () => {
  it('cria conta de estudante, autentica e permite novo login', async () => {
    const { app, repos } = setup();
    const response = await request(app).post('/api/auth/register').send(VALID_REGISTRATION);
    expect(response.status).toBe(201);
    const session = response.body.data as AuthSession;
    expect(session).toMatchObject({ rememberMe: true, user: { fullName: 'Aluna Nova Exemplo', email: 'aluna.nova@edu.fecap.br', role: 'student' } });
    expect(session.student).toMatchObject({ registrationNumber: '25000001', program: 'Ciências da Computação' });
    expect(session.student?.id).toMatch(/^student-/);
    const stored = repos.data.users.find((user) => user.email === 'aluna.nova@edu.fecap.br');
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(JSON.stringify(repos.data.users)).not.toContain('Senha@Forte1');
    const me = await request(app).get('/api/student/me').set(bearer(session.accessToken));
    expect(me.body.data.registrationNumber).toBe('25000001');
    const login = await request(app).post('/api/auth/login').send({ email: 'ALUNA.NOVA@edu.fecap.br', password: 'Senha@Forte1' });
    expect(login.status).toBe(200);
  });

  it('valida domínio, RA, política de senha e curso com detalhes por campo', async () => {
    const { app } = setup();
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...VALID_REGISTRATION, email: 'aluna@gmail.com', registrationNumber: '12AB', password: 'fraca', programCode: 'XYZ' });
    expect(response.status).toBe(400);
    expect(response.body.error.reason).toBe('email_domain_not_allowed');
    const fields = response.body.error.details.map((detail: { field: string }) => detail.field);
    expect(fields).toEqual(expect.arrayContaining(['email', 'registrationNumber', 'password', 'programCode']));
    const passwordMessages = response.body.error.details.filter((detail: { field: string }) => detail.field === 'password').map((detail: { message: string }) => detail.message);
    expect(passwordMessages).toEqual(expect.arrayContaining(['A senha deve ter pelo menos 8 caracteres.', 'A senha deve ter uma letra maiúscula.', 'A senha deve ter um número.', 'A senha deve ter um caractere especial.']));
  });

  it('e-mail ou RA já cadastrados → 409 account_exists com mensagem genérica', async () => {
    const { app } = setup();
    const email = await request(app).post('/api/auth/register').send({ ...VALID_REGISTRATION, email: USERS.student1.email });
    expect(email.status).toBe(409);
    expect(email.body.error.reason).toBe('account_exists');
    const ra = await request(app).post('/api/auth/register').send({ ...VALID_REGISTRATION, email: 'outra@edu.fecap.br', registrationNumber: 'DEMO-2026-001'.replace(/\D/g, '').padEnd(8, '0') });
    expect([201, 409]).toContain(ra.status);
    await request(app).post('/api/auth/register').send(VALID_REGISTRATION);
    const duplicateRa = await request(app).post('/api/auth/register').send({ ...VALID_REGISTRATION, email: 'terceira@edu.fecap.br' });
    expect(duplicateRa.status).toBe(409);
    expect(duplicateRa.body.error.message).not.toMatch(/RA|e-mail já/i);
  });

  it('campos desconhecidos (ex.: role) são rejeitados', async () => {
    const { app } = setup();
    const response = await request(app).post('/api/auth/register').send({ ...VALID_REGISTRATION, role: 'technical_admin' });
    expect(response.status).toBe(400);
  });
});

describe('recuperação de senha', () => {
  const email = USERS.student1.email;

  it('resposta idêntica para e-mail existente e inexistente; código só é enviado a quem existe', async () => {
    const { app, mailer, repos } = setup();
    const existing = await request(app).post('/api/auth/forgot-password').send({ email });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'ninguem@edu.fecap.br' });
    expect(existing.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(existing.body.data).toEqual(unknown.body.data);
    expect(existing.body.data).toEqual({
      message: 'Se encontrarmos uma conta vinculada a esse e-mail, você receberá as instruções para continuar.',
      codeLength: 6,
      expiresInSeconds: 600,
      resendAvailableInSeconds: 60,
    });
    expect(mailer.sent).toHaveLength(1);
    const code = mailer.lastCodeFor(email)!;
    expect(code).toMatch(/^\d{6}$/);
    expect(repos.resets[0]!.codeHash).not.toContain(code);
    expect(mailer.sent[0]!.subject).toContain(code);
  });

  it('fluxo completo: código → token → nova senha; sessões e biometria revogadas; token de uso único', async () => {
    const { app, mailer, repos } = setup();
    const session = await loginAs(app, email);
    const enroll = await request(app).post('/api/auth/biometric/enroll').set(bearer(session.accessToken)).send({ deviceLabel: 'Android de teste' });
    expect(enroll.status).toBe(201);

    await request(app).post('/api/auth/forgot-password').send({ email });
    const verify = await request(app).post('/api/auth/verify-reset-code').send({ email, code: mailer.lastCodeFor(email) });
    expect(verify.status).toBe(200);
    const { resetToken } = verify.body.data as { resetToken: string };

    const reset = await request(app).post('/api/auth/reset-password').send({ resetToken, newPassword: 'NovaSenha#2026' });
    expect(reset.status).toBe(200);
    expect(reset.body.data.message).toBe('Senha redefinida com sucesso.');

    expect((await request(app).post('/api/auth/login').send({ email, password: DEMO_PASSWORD })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email, password: 'NovaSenha#2026' })).status).toBe(200);
    const oldAccess = await request(app).get('/api/student/me').set(bearer(session.accessToken));
    expect(oldAccess.body.error.reason).toBe('session_revoked');
    const bio = await request(app).post('/api/auth/biometric/login').send({ credentialId: enroll.body.data.credentialId, credential: enroll.body.data.credential });
    expect(bio.body.error.reason).toBe('biometric_credential_invalid');
    const reuse = await request(app).post('/api/auth/reset-password').send({ resetToken, newPassword: 'OutraSenha#2026' });
    expect(reuse.body.error.reason).toBe('reset_token_invalid');
    expect(repos.resets[0]!.usedAt).not.toBeNull();
  });

  it('código incorreto informa tentativas; após o limite, bloqueia o código', async () => {
    const { app, mailer } = setup({ rateLimit: false });
    await request(app).post('/api/auth/forgot-password').send({ email });
    const correct = mailer.lastCodeFor(email)!;
    const wrong = correct === '000000' ? '111111' : '000000';
    const remaining: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await request(app).post('/api/auth/verify-reset-code').send({ email, code: wrong });
      expect(response.body.error.reason).toBe('code_invalid');
      remaining.push(response.body.error.attemptsRemaining);
    }
    expect(remaining).toEqual([4, 3, 2, 1]);
    const fifth = await request(app).post('/api/auth/verify-reset-code').send({ email, code: wrong });
    expect(fifth.body.error.reason).toBe('code_locked');
    const evenCorrect = await request(app).post('/api/auth/verify-reset-code').send({ email, code: correct });
    expect(evenCorrect.body.error.reason).toBe('code_locked');
  });

  it('e-mail inexistente produz as mesmas respostas de tentativa (sem enumeração)', async () => {
    const { app } = setup({ rateLimit: false });
    const reasons: Array<[string, number]> = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app).post('/api/auth/verify-reset-code').send({ email: 'ninguem@edu.fecap.br', code: '123456' });
      reasons.push([response.body.error.reason, response.body.error.attemptsRemaining]);
    }
    expect(reasons).toEqual([['code_invalid', 4], ['code_invalid', 3], ['code_invalid', 2], ['code_invalid', 1], ['code_locked', 0]]);
  });

  it('expiração só é revelada com o código correto', async () => {
    const { app, mailer, clock } = setup();
    await request(app).post('/api/auth/forgot-password').send({ email });
    const code = mailer.lastCodeFor(email)!;
    clock.advance(10 * MINUTE + 1000);
    const wrong = await request(app).post('/api/auth/verify-reset-code').send({ email, code: code === '000000' ? '111111' : '000000' });
    expect(wrong.body.error.reason).toBe('code_invalid');
    const expired = await request(app).post('/api/auth/verify-reset-code').send({ email, code });
    expect(expired.body.error.reason).toBe('code_expired');
  });

  it('reenvio respeita cooldown, gera novo código e invalida o anterior; limite de envios', async () => {
    const { app, mailer, clock } = setup({ rateLimit: false });
    await request(app).post('/api/auth/forgot-password').send({ email });
    const first = mailer.lastCodeFor(email)!;
    const early = await request(app).post('/api/auth/resend-reset-code').send({ email });
    expect(early.status).toBe(202);
    expect(mailer.sent).toHaveLength(1);

    clock.advance(61_000);
    await request(app).post('/api/auth/resend-reset-code').send({ email });
    expect(mailer.sent).toHaveLength(2);
    const second = mailer.lastCodeFor(email)!;
    if (first !== second) {
      const old = await request(app).post('/api/auth/verify-reset-code').send({ email, code: first });
      expect(old.body.error.reason).toBe('code_invalid');
    }
    for (let send = 0; send < 6; send += 1) {
      clock.advance(61_000);
      await request(app).post('/api/auth/resend-reset-code').send({ email });
    }
    expect(mailer.sent).toHaveLength(5);
  });

  it('token de redefinição expira', async () => {
    const { app, mailer, clock } = setup();
    await request(app).post('/api/auth/forgot-password').send({ email });
    const verify = await request(app).post('/api/auth/verify-reset-code').send({ email, code: mailer.lastCodeFor(email) });
    clock.advance(15 * MINUTE + 1000);
    const reset = await request(app).post('/api/auth/reset-password').send({ resetToken: verify.body.data.resetToken, newPassword: 'NovaSenha#2026' });
    expect(reset.body.error.reason).toBe('reset_token_invalid');
  });

  it('nova senha fraca é rejeitada com os requisitos', async () => {
    const { app, mailer } = setup();
    await request(app).post('/api/auth/forgot-password').send({ email });
    const verify = await request(app).post('/api/auth/verify-reset-code').send({ email, code: mailer.lastCodeFor(email) });
    const reset = await request(app).post('/api/auth/reset-password').send({ resetToken: verify.body.data.resetToken, newPassword: 'abc' });
    expect(reset.status).toBe(400);
    expect(reset.body.error.reason).toBe('weak_password');
    expect(reset.body.error.details.length).toBeGreaterThan(1);
  });

  it('sem e-mail configurado: 503 recovery_unavailable e política indica indisponível', async () => {
    const { app } = setup({ mailAvailable: false });
    const response = await request(app).post('/api/auth/forgot-password').send({ email });
    expect(response.status).toBe(503);
    expect(response.body.error.reason).toBe('recovery_unavailable');
    const policy = await request(app).get('/api/auth/policy');
    expect(policy.body.data.passwordRecoveryAvailable).toBe(false);
  });
});

describe('biometria (credencial de dispositivo)', () => {
  it('enroll exige sessão; login biométrico cria sessão persistente; credencial errada é rejeitada', async () => {
    const { app, repos } = setup();
    expect((await request(app).post('/api/auth/biometric/enroll').send({})).status).toBe(401);
    const session = await loginAs(app, USERS.student1.email);
    const enroll = await request(app).post('/api/auth/biometric/enroll').set(bearer(session.accessToken)).send({ deviceLabel: 'Pixel' });
    expect(enroll.status).toBe(201);
    const { credentialId, credential, expiresInSeconds } = enroll.body.data;
    expect(expiresInSeconds).toBe(30 * 86400);
    expect(repos.credentials[0]!.tokenHash).not.toBe(credential);

    const login = await request(app).post('/api/auth/biometric/login').send({ credentialId, credential });
    expect(login.status).toBe(200);
    expect(login.body.data).toMatchObject({ rememberMe: true, user: { email: USERS.student1.email } });

    const wrong = await request(app).post('/api/auth/biometric/login').send({ credentialId, credential: `${credential.slice(0, -2)}xx` });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.reason).toBe('biometric_credential_invalid');
    const malformed = await request(app).post('/api/auth/biometric/login').send({ credentialId: 'nao-e-uuid', credential });
    expect(malformed.status).toBe(400);
  });

  it('revogação, expiração e isolamento entre usuários', async () => {
    const { app, clock } = setup();
    const owner = await loginAs(app, USERS.student1.email);
    const other = await loginAs(app, USERS.student2.email);
    const enroll = (await request(app).post('/api/auth/biometric/enroll').set(bearer(owner.accessToken)).send({})).body.data;

    await request(app).post('/api/auth/biometric/revoke').set(bearer(other.accessToken)).send({ credentialId: enroll.credentialId });
    expect((await request(app).post('/api/auth/biometric/login').send(enroll)).status).toBe(400); // expiresInSeconds extra → strict
    const body = { credentialId: enroll.credentialId, credential: enroll.credential };
    expect((await request(app).post('/api/auth/biometric/login').send(body)).status).toBe(200); // outro usuário não revoga

    clock.advance(31 * 86_400_000);
    expect((await request(app).post('/api/auth/biometric/login').send(body)).status).toBe(401);

    const fresh = await loginAs(app, USERS.student1.email);
    const second = (await request(app).post('/api/auth/biometric/enroll').set(bearer(fresh.accessToken)).send({})).body.data;
    expect((await request(app).post('/api/auth/biometric/revoke').set(bearer(fresh.accessToken)).send({ credentialId: second.credentialId })).status).toBe(204);
    expect((await request(app).post('/api/auth/biometric/login').send({ credentialId: second.credentialId, credential: second.credential })).status).toBe(401);
  });

  it('mantém no máximo 5 credenciais ativas por usuário', async () => {
    const { app, repos } = setup();
    const session = await loginAs(app, USERS.student1.email);
    for (let index = 0; index < 7; index += 1) {
      await request(app).post('/api/auth/biometric/enroll').set(bearer(session.accessToken)).send({});
    }
    expect(repos.credentials.filter((item) => !item.revokedAt)).toHaveLength(5);
  });

  it('biometria desabilitada por configuração → 404', async () => {
    const { app } = setup({ biometric: false });
    const session = await loginAs(app, USERS.student1.email);
    expect((await request(app).post('/api/auth/biometric/enroll').set(bearer(session.accessToken)).send({})).status).toBe(404);
  });
});
