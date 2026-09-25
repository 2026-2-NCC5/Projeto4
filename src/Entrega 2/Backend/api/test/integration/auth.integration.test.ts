import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareDatabase, TEST_DATABASE_URL, type DatabaseHandle } from '../support/database.js';
import { DEMO_PASSWORD } from '../support/fixtures.js';
import { MemoryMailer } from '../support/memoryMailer.js';
import { bearer, createTestApp, loginAs } from '../support/testApp.js';

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb('integração autenticação ↔ PostgreSQL', () => {
  let db: DatabaseHandle;

  beforeAll(async () => {
    db = await prepareDatabase();
  });

  afterAll(async () => {
    await db?.close();
  });

  const app = (mailer = new MemoryMailer()) => ({ ...createTestApp({ repos: db.repos, mailer }), mailer });

  it('catálogo de cursos vem da migration e cadastro cria users + students na mesma transação', async () => {
    const { app: api } = app();
    const programs = await request(api).get('/api/auth/programs');
    expect(programs.body.data).toContainEqual({ code: 'CCOMP', name: 'Ciências da Computação' });

    const response = await request(api).post('/api/auth/register').send({
      fullName: 'Estudante Cadastro Integração',
      email: 'cadastro.integracao@edu.fecap.br',
      password: 'Cadastro#2026',
      registrationNumber: '26000001',
      programCode: 'ADS',
      rememberMe: true,
    });
    expect(response.status).toBe(201);
    const { rows } = await db.pool.query(
      `select u.email, u.password_hash, u.role, s.registration_number, s.program, rs.remember_me
         from users u join students s on s.user_id = u.id join refresh_sessions rs on rs.user_id = u.id
        where u.email = 'cadastro.integracao@edu.fecap.br'`,
    );
    expect(rows[0]).toMatchObject({ role: 'student', registration_number: '26000001', program: 'Análise e Desenvolvimento de Sistemas', remember_me: true });
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$10\$/);

    const duplicate = await request(api).post('/api/auth/register').send({
      fullName: 'Outra Pessoa Exemplo', email: 'outra.integracao@edu.fecap.br', password: 'Cadastro#2026', registrationNumber: '26000001',
    });
    expect(duplicate.status).toBe(409);
    const orphan = await db.pool.query("select count(*)::int as count from users where email = 'outra.integracao@edu.fecap.br'");
    expect(orphan.rows[0].count).toBe(0); // rollback: nenhum usuário sem estudante
  });

  it('recuperação: código e token apenas como hash; redefinição revoga sessões e credenciais em transação', async () => {
    const { app: api, mailer } = app();
    const email = 'estudante.regular@demo.asa';
    const session = await loginAs(api, email, DEMO_PASSWORD);
    const enroll = await request(api).post('/api/auth/biometric/enroll').set(bearer(session.accessToken)).send({ deviceLabel: 'integração' });
    expect(enroll.status).toBe(201);

    expect((await request(api).post('/api/auth/forgot-password').send({ email })).status).toBe(202);
    const code = mailer.lastCodeFor(email)!;
    const stored = await db.pool.query('select pr.* from password_resets pr join users u on u.id = pr.user_id where u.email = $1', [email]);
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored.rows)).not.toContain(code);

    const verify = await request(api).post('/api/auth/verify-reset-code').send({ email, code });
    const resetToken = verify.body.data.resetToken as string;
    const verified = await db.pool.query('select reset_token_hash from password_resets where id = $1', [stored.rows[0].id]);
    expect(verified.rows[0].reset_token_hash).not.toBe(resetToken);

    expect((await request(api).post('/api/auth/reset-password').send({ resetToken, newPassword: 'Regular#Nova1' })).status).toBe(200);
    const state = await db.pool.query(
      `select (select count(*) from refresh_sessions rs where rs.user_id = u.id and rs.revoked_at is null)::int as active_sessions,
              (select count(*) from device_credentials dc where dc.user_id = u.id and dc.revoked_at is null)::int as active_credentials,
              (select count(*) from password_resets pr where pr.user_id = u.id and pr.used_at is not null)::int as used_resets
         from users u where u.email = $1`,
      [email],
    );
    expect(state.rows[0]).toEqual({ active_sessions: 0, active_credentials: 0, used_resets: 1 });
    expect((await request(api).post('/api/auth/login').send({ email, password: 'Regular#Nova1' })).status).toBe(200);
  });

  it('biometria: credencial persistida apenas como hash, com validade e uso registrado', async () => {
    const { app: api } = app();
    const session = await loginAs(api, 'estudante.exemplo@demo.asa', DEMO_PASSWORD);
    const enroll = (await request(api).post('/api/auth/biometric/enroll').set(bearer(session.accessToken)).send({ deviceLabel: 'Pixel' })).body.data;
    const row = (await db.pool.query('select * from device_credentials where id = $1', [enroll.credentialId])).rows[0];
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.token_hash).not.toBe(enroll.credential);
    expect(row.last_used_at).toBeNull();
    const login = await request(api).post('/api/auth/biometric/login').send({ credentialId: enroll.credentialId, credential: enroll.credential });
    expect(login.status).toBe(200);
    const used = (await db.pool.query('select last_used_at from device_credentials where id = $1', [enroll.credentialId])).rows[0];
    expect(used.last_used_at).not.toBeNull();
  });
});
