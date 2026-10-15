import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { bearer, createTestApp, loginAs } from '../support/testApp.js';
import { DEMO_PASSWORD, USERS } from '../support/fixtures.js';

describe('autenticação', () => {
  it('login com credenciais fictícias válidas retorna sessão com tokens e estudante', async () => {
    const { app } = createTestApp();
    const response = await request(app).post('/api/auth/login').send({ email: USERS.student1.email, password: DEMO_PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeTypeOf('string');
    expect(response.body.data.refreshToken).toBeTypeOf('string');
    expect(response.body.data.expiresIn).toBeGreaterThan(0);
    expect(response.body.data.user).toEqual({ id: USERS.student1.id, fullName: 'Estudante Exemplo', email: USERS.student1.email, role: 'student' });
    expect(response.body.data.student).toEqual({ id: 'student-demo-001', registrationNumber: 'DEMO-2026-001', program: 'Ciências da Computação' });
    expect(response.body.meta.requestId).toMatch(/^req-/);
    expect(response.body.meta.correlationId).toMatch(/^corr-/);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('senha incorreta ou usuário inexistente retornam 401 com o mesmo código', async () => {
    const { app } = createTestApp();
    const wrong = await request(app).post('/api/auth/login').send({ email: USERS.student1.email, password: 'errada' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ninguem@demo.asa', password: DEMO_PASSWORD });
    for (const response of [wrong, unknown]) {
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.reason).toBe('invalid_credentials');
    }
  });

  it('conta desativada: senha correta → 403 account_disabled; senha errada continua 401', async () => {
    const { app } = createTestApp();
    const correct = await request(app).post('/api/auth/login').send({ email: USERS.inactive.email, password: DEMO_PASSWORD });
    expect(correct.status).toBe(403);
    expect(correct.body.error.reason).toBe('account_disabled');
    const wrong = await request(app).post('/api/auth/login').send({ email: USERS.inactive.email, password: 'Errada@123' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.reason).toBe('invalid_credentials');
  });

  it('valida o corpo do login (400 VALIDATION_ERROR)', async () => {
    const { app } = createTestApp();
    const response = await request(app).post('/api/auth/login').send({ email: 'nao-e-email', password: '' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const fields = response.body.error.details.map((detail: { field: string }) => detail.field);
    expect(fields).toContain('email');
    expect(fields).toContain('password');
  });

  it('refresh rotaciona o token e invalida o anterior', async () => {
    const { app } = createTestApp();
    const session = await loginAs(app);
    const refreshed = await request(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.refreshToken).not.toBe(session.refreshToken);
    const reused = await request(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(reused.status).toBe(401);
    expect(reused.body.error.reason).toBe('session_expired');
  });

  it('logout revoga a sessão e o access token deixa de valer', async () => {
    const { app } = createTestApp();
    const session = await loginAs(app);
    const before = await request(app).get('/api/student/me').set(bearer(session.accessToken));
    expect(before.status).toBe(200);
    const logout = await request(app).post('/api/auth/logout').set(bearer(session.accessToken)).send({ refreshToken: session.refreshToken });
    expect(logout.status).toBe(204);
    const after = await request(app).get('/api/student/me').set(bearer(session.accessToken));
    expect(after.status).toBe(401);
    expect(after.body.error.reason).toBe('session_revoked');
    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(refresh.status).toBe(401);
  });

  it('token expirado é identificado como token_expired', async () => {
    const { app } = createTestApp({ configOverrides: { jwt: { secret: 'test-secret-not-for-production-0123456789', expiresIn: '1ms', issuer: 'asa-conecta-api', audience: 'asa-conecta-mobile' } } });
    const session = await loginAs(app);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const response = await request(app).get('/api/student/me').set(bearer(session.accessToken));
    expect(response.status).toBe(401);
    expect(response.body.error.reason).toBe('token_expired');
  });

  it('token inválido ou ausente retorna 401', async () => {
    const { app } = createTestApp();
    const missing = await request(app).get('/api/student/me');
    expect(missing.status).toBe(401);
    expect(missing.body.error.reason).toBe('missing_token');
    const invalid = await request(app).get('/api/student/me').set(bearer('abc.def.ghi'));
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.reason).toBe('token_invalid');
  });
});
