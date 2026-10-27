import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { hasPermission, permissionsFor, ROLE_PERMISSIONS } from '../../src/auth/permissions.js';
import { deviceLabelFrom, parseCookies } from '../../src/auth/webSession.js';
import { loadConfig } from '../../src/config/env.js';
import { createLogger } from '../../src/config/logger.js';
import { seedDecision } from '../../src/db/seed.js';
import { sanitizeAuditMetadata } from '../../src/platform/auditService.js';
import { SettingsService } from '../../src/platform/settingsService.js';
import type { AppConfig } from '../../src/config/env.js';
import { DEMO_PASSWORD, USERS } from '../support/fixtures.js';
import { MemorySettingsRepository } from '../support/inMemoryPlatform.js';
import { bearer, buildTestConfig, createTestApp, loginAs } from '../support/testApp.js';
import { WebClient, WEB_ORIGIN } from '../support/webClient.js';

const AGENT_URL = 'http://agent-service:8000';

const TICKET = {
  categoryId: 'financial',
  subcategoryId: 'bill',
  subject: 'Boleto não chegou',
  description: 'O boleto de outubro não apareceu no portal do aluno até agora.',
};

describe('matriz de permissões (servidor)', () => {
  it('aluno só tem permissões próprias; equipe atende; administração não lê conteúdo de chamados', () => {
    expect(hasPermission('student', 'tickets:create:own')).toBe(true);
    expect(hasPermission('student', 'tickets:read:any')).toBe(false);
    expect(hasPermission('student', 'users:manage')).toBe(false);
    expect(hasPermission('institutional_staff', 'tickets:read:any')).toBe(true);
    expect(hasPermission('institutional_staff', 'tickets:internal_note')).toBe(true);
    expect(hasPermission('institutional_staff', 'users:manage')).toBe(false);
    expect(hasPermission('technical_admin', 'users:manage')).toBe(true);
    expect(hasPermission('technical_admin', 'tickets:read:any')).toBe(false);
    expect(hasPermission('technical_admin', 'tickets:internal_note')).toBe(false);
    expect(hasPermission('technical_admin', 'academic:read:own')).toBe(false);
  });

  it('cada papel tem lista sem repetição e todos podem gerenciar as próprias sessões', () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>) {
      const list = permissionsFor(role);
      expect(new Set(list).size).toBe(list.length);
      expect(list).toContain('account:sessions:own');
    }
  });
});

describe('utilitários de sessão web e auditoria', () => {
  it('lê cookies ignorando pares malformados e codificação inválida', () => {
    expect(parseCookies('a=1; b=%E0%A4%A; c="x y"; =z; d')).toEqual({ a: '1', c: 'x y' });
    expect(parseCookies(undefined)).toEqual({});
  });

  it('rótulo do aparelho é curto e nunca guarda o user-agent completo', () => {
    expect(deviceLabelFrom('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', 'web')).toBe('Chrome no Linux');
    expect(deviceLabelFrom('Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/141.0', 'web')).toBe('Firefox no Windows');
    expect(deviceLabelFrom('okhttp/4.12.0', 'mobile')).toBe('Aplicativo ASA Conecta');
    expect(deviceLabelFrom(undefined, 'mobile')).toBe('Aplicativo ASA Conecta');
  });

  it('metadados de auditoria descartam credenciais, contato e conteúdo livre', () => {
    const clean = sanitizeAuditMetadata({ reason: 'invalid_credentials', password: 'x', refreshToken: 'y', email: 'a@b.c', content: 'texto', count: 3, nested: { a: 1 }, long: 'x'.repeat(500) });
    expect(clean).toEqual({ reason: 'invalid_credentials', count: 3, long: expect.stringMatching(/^x{199}…$/) });
  });
});

describe('seeds de demonstração', () => {
  const base = (overrides: Partial<AppConfig> = {}) => ({ ...buildTestConfig(), databaseUrl: 'postgres://asa:x@localhost:5432/asa_conecta', ...overrides });

  it('rodam só com a flag, fora de produção e em banco local (ou remoto com opt-in)', () => {
    const config = base();
    expect(seedDecision(config)).toEqual({ allowed: true });
    expect(seedDecision({ ...config, demo: { ...config.demo, seedEnabled: false } })).toMatchObject({ allowed: false, reason: 'DEMO_SEED_ENABLED=false' });
    expect(seedDecision({ ...config, nodeEnv: 'production' })).toMatchObject({ allowed: false, reason: 'ambiente de produção' });
    expect(seedDecision({ ...config, appEnv: 'production' })).toMatchObject({ allowed: false });
    expect(seedDecision({ ...config, demo: { ...config.demo, dataEnabled: false } })).toMatchObject({ allowed: false });
    const remote = { ...config, databaseUrl: 'postgresql://user:x@aws-0-sa-east-1.pooler.supabase.com:5432/postgres' };
    expect(seedDecision(remote)).toMatchObject({ allowed: false, reason: expect.stringContaining('DEMO_SEED_ALLOW_REMOTE') });
    expect(seedDecision({ ...remote, demo: { ...remote.demo, seedAllowRemote: true } })).toEqual({ allowed: true });
  });
});

describe('configuração da plataforma', () => {
  it('fila presencial: simulador por padrão fora de produção; em produção fica desativada até escolher a fonte', () => {
    const dev = loadConfig({ NODE_ENV: 'development', JWT_SECRET: 'x'.repeat(40) });
    expect(dev.queue).toMatchObject({ provider: 'mock', providerExplicit: false, sourceAuthorized: false, enabled: true });
    const prod = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), AGENT_SERVICE_URL: AGENT_URL });
    expect(prod.queue.enabled).toBe(false);
    expect(prod.queue.disabledReason).toMatch(/ASA_QUEUE_PROVIDER/);
    const explicit = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), AGENT_SERVICE_URL: AGENT_URL, ASA_QUEUE_PROVIDER: 'fecap' });
    expect(explicit.queue).toMatchObject({ provider: 'fecap', enabled: true, providerExplicit: true });
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), AGENT_SERVICE_URL: AGENT_URL, ASA_QUEUE_PROVIDER: 'demo' })).toThrow(/mock não é permitido/);
    expect(loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), ASA_QUEUE_PROVIDER: 'demo' }).queue.provider).toBe('mock');
  });

  it('produção exige AGENT_SERVICE_URL explícita (sem cair no localhost)', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), ASA_QUEUE_ENABLED: 'false' })).toThrow(/AGENT_SERVICE_URL/);
    expect(loadConfig({ NODE_ENV: 'development', JWT_SECRET: 'x'.repeat(40) }).agentService.url).toBe('http://localhost:8000');
  });

  it('padrões da Vercel: proxy confiável, SSE abaixo do limite da função, anexos que cabem em 4,5 MB', () => {
    const vercel = loadConfig({ JWT_SECRET: 'x'.repeat(40), VERCEL: '1', VERCEL_REGION: 'gru1' });
    expect(vercel.platform).toEqual({ vercel: true, region: 'gru1' });
    expect(vercel.trustProxy).toBe(true);
    expect(vercel.queue.streamMaxSeconds).toBe(240);
    expect(vercel.support.maxAttachmentBytes).toBe(3 * 1024 * 1024);
    // base64 do maior anexo + JSON cabe no corpo de 4,5 MB da função
    expect(Math.ceil((vercel.support.maxAttachmentBytes * 4) / 3) + 1024).toBeLessThan(4_500_000);
    const local = loadConfig({ JWT_SECRET: 'x'.repeat(40) });
    expect(local.platform.vercel).toBe(false);
    expect(local.trustProxy).toBe(false);
    expect(local.queue.streamMaxSeconds).toBe(300);
    expect(local.support.maxAttachmentBytes).toBe(5 * 1024 * 1024);
    expect(local.jobs.cronSecret).toBeNull();
    expect(local.database.poolMax).toBe(10);
    // valores explícitos vencem os padrões da plataforma
    const explicit = loadConfig({ JWT_SECRET: 'x'.repeat(40), VERCEL: '1', TRUST_PROXY: 'false', ASA_QUEUE_STREAM_MAX_SECONDS: '120', DATABASE_POOL_MAX: '3', CRON_SECRET: 'c'.repeat(32) });
    expect(explicit.trustProxy).toBe(false);
    expect(explicit.queue.streamMaxSeconds).toBe(120);
    expect(explicit.database.poolMax).toBe(3);
    expect(explicit.jobs.cronSecret).toBe('c'.repeat(32));
    expect(() => loadConfig({ JWT_SECRET: 'x'.repeat(40), CRON_SECRET: 'curto' })).toThrow(/CRON_SECRET/);
  });

  it('na Vercel o portal do próprio deploy (preview, branch e produção) é origem aceita no CSRF; fora dela, não', () => {
    const preview = loadConfig({
      JWT_SECRET: 'x'.repeat(40),
      VERCEL: '1',
      WEB_ORIGINS: 'https://asa.fecap.br',
      VERCEL_URL: 'asa-conecta-abc123-nucleo.vercel.app',
      VERCEL_BRANCH_URL: 'asa-conecta-git-main-nucleo.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'asa-conecta.vercel.app',
    });
    expect(preview.web.origins).toEqual([
      'https://asa.fecap.br',
      'https://asa-conecta-abc123-nucleo.vercel.app',
      'https://asa-conecta-git-main-nucleo.vercel.app',
      'https://asa-conecta.vercel.app',
    ]);
    // valor estranho na variável de sistema não vira origem
    expect(loadConfig({ JWT_SECRET: 'x'.repeat(40), VERCEL: '1', VERCEL_URL: 'evil.com/path' }).web.origins).not.toContain('https://evil.com/path');
    expect(loadConfig({ JWT_SECRET: 'x'.repeat(40), VERCEL_URL: 'asa-conecta.vercel.app' }).web.origins).not.toContain('https://asa-conecta.vercel.app');
  });

  it('cookies Secure em produção, origens do portal validadas e modo demonstração ligado por padrão', () => {
    expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), AGENT_SERVICE_URL: AGENT_URL, ASA_QUEUE_ENABLED: 'false' }).web.cookieSecure).toBe(true);
    const dev = loadConfig({ NODE_ENV: 'development', JWT_SECRET: 'x'.repeat(40) });
    expect(dev.web.cookieSecure).toBe(false);
    expect(dev.web.origins).toContain(WEB_ORIGIN);
    expect(dev.demo.dataEnabled).toBe(true);
    expect(dev.appEnv).toBe('development');
    expect(() => loadConfig({ JWT_SECRET: 'x'.repeat(40), WEB_ORIGINS: 'javascript:alert(1)' })).toThrow(/WEB_ORIGINS/);
  });
});

describe('parâmetros institucionais (SettingsService)', () => {
  it('usa padrões honestos, valida o formato e grava o novo valor', async () => {
    const repo = new MemorySettingsRepository();
    const settings = new SettingsService(repo, createLogger('silent'));
    expect(await settings.get('asa.public_links')).toEqual([]);
    expect(await settings.get('institution.announcement')).toBeNull();
    await expect(settings.update('asa.public_links', [{ label: 'Portal', url: 'http://inseguro.example' }], USERS.admin.id)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(settings.update('nao.existe', 1, USERS.admin.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const result = await settings.update('institution.announcement', { text: 'Atendimento até 18h hoje.', tone: 'attention' }, USERS.admin.id);
    expect(result.previous).toBeNull();
    expect(await settings.get('institution.announcement')).toEqual({ text: 'Atendimento até 18h hoje.', tone: 'attention' });
    const listed = (await settings.list()).find((item) => item.key === 'institution.announcement');
    expect(listed).toMatchObject({ isDefault: false, updatedBy: USERS.admin.id });
  });
});

describe('GET /api/platform/info', () => {
  it('é público e informa modo DEMONSTRAÇÃO, fonte acadêmica fictícia e recursos ativos', async () => {
    const { app } = createTestApp();
    const response = await request(app).get('/api/platform/info');
    expect(response.status).toBe(200);
    expect(response.headers['x-asa-data-mode']).toBe('demo');
    expect(response.body.data).toMatchObject({
      name: 'ASA Conecta',
      dataMode: 'demo',
      dataModeLabel: 'DEMONSTRAÇÃO — Dados fictícios',
      academicSource: { provider: 'demo', status: 'demo' },
      features: { tickets: true, appointments: true, knowledgeBase: true, notifications: true, realtime: false },
      assistant: { provider: 'existing', jev: { status: 'planned', enabled: false } },
      queue: { source: 'demo', authorized: false },
      links: [],
      announcement: null,
    });
  });

  it('com o modo demonstração desligado: INSTITUCIONAL e dados acadêmicos indisponíveis', async () => {
    const config = buildTestConfig();
    const { app } = createTestApp({ configOverrides: { demo: { ...config.demo, dataEnabled: false } } });
    const response = await request(app).get('/api/platform/info');
    expect(response.body.data).toMatchObject({ dataMode: 'institutional', dataModeLabel: 'INSTITUCIONAL — Dados autorizados', academicSource: { status: 'unavailable' } });
  });
});

describe('GET /api/auth/me (mesma conta no app e no portal)', () => {
  it('Bearer do app devolve perfil, papel, permissões efetivas e sessão do canal mobile', async () => {
    const { app } = createTestApp();
    const session = await loginAs(app);
    const response = await request(app).get('/api/auth/me').set(bearer(session.accessToken));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      user: { id: USERS.student1.id, role: 'student' },
      roleLabel: 'Aluno',
      student: { id: 'student-demo-001' },
      isDemo: true,
      session: { channel: 'mobile', current: true },
    });
    expect(response.body.data.permissions).toContain('tickets:create:own');
    expect(response.body.data.permissions).not.toContain('tickets:read:any');
  });

  it('sem credencial responde 401', async () => {
    const { app } = createTestApp();
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });
});

describe('sessão do portal por cookie HttpOnly + CSRF', () => {
  it('login web grava cookies HttpOnly/SameSite=Strict e nunca devolve tokens no corpo', async () => {
    const { app } = createTestApp();
    const web = new WebClient(app);
    const response = await web.login(USERS.student1.email);
    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeUndefined();
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(response.body.data.csrfToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    const access = web.jar.get('asa_at');
    const refresh = web.jar.get('asa_rt');
    expect(access?.attributes).toMatchObject({ httponly: true, samesite: 'Strict', path: '/api' });
    expect(refresh?.attributes).toMatchObject({ httponly: true, samesite: 'Strict', path: '/api/web/auth' });
    // sem "Manter conectado" o refresh é cookie de sessão do navegador
    expect(refresh?.attributes['max-age']).toBeUndefined();
    expect(web.jar.get('asa_csrf')?.attributes.httponly).toBeUndefined();

    const me = await web.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ user: { id: USERS.student1.id }, session: { channel: 'web', deviceLabel: null } });
  });

  it('login sem token CSRF ou de origem desconhecida é recusado (403 csrf_failed)', async () => {
    const { app } = createTestApp();
    const web = new WebClient(app);
    await web.get('/api/web/auth/csrf');
    const noHeader = await web.send('post', '/api/web/auth/login', { email: USERS.student1.email, password: DEMO_PASSWORD }, { csrf: false });
    expect(noHeader.status).toBe(403);
    expect(noHeader.body.error.reason).toBe('csrf_failed');
    const foreign = await web.send('post', '/api/web/auth/login', { email: USERS.student1.email, password: DEMO_PASSWORD }, { origin: 'https://atacante.example' });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.reason).toBe('csrf_failed');
  });

  it('alteração autenticada por cookie exige CSRF; com o token o chamado é criado pelo portal', async () => {
    const { app } = createTestApp();
    const web = new WebClient(app);
    await web.login(USERS.student1.email);
    const withoutCsrf = await web.send('post', '/api/support/tickets', { ...TICKET, clientRequestId: 'req-web-0001' }, { csrf: false });
    expect(withoutCsrf.status).toBe(403);
    expect(withoutCsrf.body.error.reason).toBe('csrf_failed');
    const created = await web.send('post', '/api/support/tickets', { ...TICKET, clientRequestId: 'req-web-0001' });
    expect(created.status).toBe(201);
    expect(created.body.data.protocol).toMatch(/^ASA-\d{4}-\d{5}$/);
    expect(created.body.data.channel).toBe('web');
  });

  it('Bearer continua sem CSRF (o navegador não o envia sozinho)', async () => {
    const { app } = createTestApp();
    const session = await loginAs(app);
    const created = await request(app).post('/api/support/tickets').set(bearer(session.accessToken)).set('Origin', 'https://outro.example').send({ ...TICKET, clientRequestId: 'req-app-0001' });
    expect(created.status).toBe(201);
    expect(created.body.data.channel).toBe('app');
  });

  it('renovação web gira o refresh token; o antigo deixa de valer e não renova sessão do app', async () => {
    const { app } = createTestApp();
    const web = new WebClient(app);
    await web.login(USERS.student1.email, DEMO_PASSWORD, true);
    expect(Number(web.jar.get('asa_rt')?.attributes['max-age'])).toBeGreaterThan(86_400);
    const oldRefresh = web.jar.get('asa_rt')!.value;
    const refreshed = await web.send('post', '/api/web/auth/refresh');
    expect(refreshed.status).toBe(200);
    expect(web.jar.get('asa_rt')!.value).not.toBe(oldRefresh);
    // token web antigo não serve mais, nem no endpoint do app (canal diferente)
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh })).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: web.jar.get('asa_rt')!.value })).status).toBe(401);
    expect((await web.get('/api/auth/me')).status).toBe(200);
  });

  it('logout web revoga a sessão e limpa os cookies; o access token antigo deixa de valer', async () => {
    const { app } = createTestApp();
    const web = new WebClient(app);
    await web.login(USERS.student1.email);
    const oldAccess = web.jar.get('asa_at')!.value;
    const logout = await web.send('post', '/api/web/auth/logout');
    expect(logout.status).toBe(204);
    expect(web.jar.has('asa_at')).toBe(false);
    const reused = await request(app).get('/api/auth/me').set('Cookie', `asa_at=${oldAccess}`);
    expect(reused.status).toBe(401);
    expect(reused.body.error.reason).toBe('session_revoked');
  });
});

describe('sessões por aparelho/navegador', () => {
  it('lista app e portal da mesma conta, encerra outra sessão e "sair de todos"', async () => {
    const { app } = createTestApp();
    const mobile = await loginAs(app);
    const web = new WebClient(app);
    await web.login(USERS.student1.email);

    const list = await web.get('/api/auth/sessions');
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(2);
    const current = list.body.data.items.find((item: { current: boolean }) => item.current);
    const other = list.body.data.items.find((item: { current: boolean }) => !item.current);
    expect(current.channel).toBe('web');
    expect(other.channel).toBe('mobile');

    expect((await web.send('delete', `/api/auth/sessions/${other.id}`)).status).toBe(204);
    const mobileMe = await request(app).get('/api/auth/me').set(bearer(mobile.accessToken));
    expect(mobileMe.status).toBe(401);
    expect(mobileMe.body.error.reason).toBe('session_revoked');
    // a sessão de outra pessoa nunca é encontrada
    expect((await web.send('delete', '/api/auth/sessions/00000000-0000-4000-8000-00000000abcd')).status).toBe(404);

    const second = await loginAs(app);
    const others = await web.send('post', '/api/auth/sessions/revoke-others');
    expect(others.body.data.revoked).toBe(1);
    expect((await request(app).get('/api/auth/me').set(bearer(second.accessToken))).status).toBe(401);
    expect((await web.get('/api/auth/me')).status).toBe(200);

    expect((await web.send('post', '/api/auth/logout-all')).status).toBe(204);
    expect((await web.get('/api/auth/me')).status).toBe(401);
  });
});

describe('autorização no servidor (fila da equipe)', () => {
  it('aluno e administração não leem a fila de chamados; equipe ASA lê', async () => {
    const { app, repos } = createTestApp();
    const student = await loginAs(app);
    const admin = await loginAs(app, USERS.admin.email);
    const staff = await loginAs(app, USERS.staff.email);
    expect((await request(app).get('/api/support/staff/tickets').set(bearer(student.accessToken))).status).toBe(403);
    const denied = await request(app).get('/api/support/staff/tickets').set(bearer(admin.accessToken));
    expect(denied.status).toBe(403);
    expect(denied.body.error.reason).toBe('permission_denied');
    expect((await request(app).get('/api/support/staff/tickets').set(bearer(staff.accessToken))).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const audit = (repos as unknown as { audit: { items: Array<{ action: string; actorUserId: string | null; outcome: string }> } }).audit.items;
    expect(audit.some((item) => item.action === 'authz.denied' && item.actorUserId === USERS.admin.id && item.outcome === 'denied')).toBe(true);
  });
});

describe('central de avisos unificada', () => {
  it('avisos do chamado aparecem no inbox e marcar como lido sincroniza com o app', async () => {
    const { app } = createTestApp();
    const session = await loginAs(app);
    await request(app).post('/api/support/tickets').set(bearer(session.accessToken)).send({ ...TICKET, clientRequestId: 'req-inbox-0001' });
    const inbox = await request(app).get('/api/notifications').set(bearer(session.accessToken));
    expect(inbox.status).toBe(200);
    expect(inbox.body.data.unreadCount).toBe(1);
    expect(inbox.body.data.items[0]).toMatchObject({ category: 'support', kind: 'ticket_received', resource: { type: 'ticket' }, readAt: null });
    const read = await request(app).patch('/api/notifications').set(bearer(session.accessToken)).send({ read: true });
    expect(read.body.data.unreadCount).toBe(0);
    const appView = await request(app).get('/api/support/notifications').set(bearer(session.accessToken));
    expect(appView.body.data.unreadCount).toBe(0);
    expect((await request(app).patch('/api/notifications').set(bearer(session.accessToken)).send({ read: false })).status).toBe(400);
  });

  it('preferências de push por categoria (push indisponível neste ambiente fica explícito)', async () => {
    const { app } = createTestApp();
    const session = await loginAs(app);
    const updated = await request(app)
      .patch('/api/notifications/preferences')
      .set(bearer(session.accessToken))
      .send({ items: [{ category: 'appointment', pushEnabled: false }] });
    expect(updated.status).toBe(200);
    expect(updated.body.data.items.find((item: { category: string }) => item.category === 'appointment').pushEnabled).toBe(false);
    expect(['available', 'unavailable']).toContain(updated.body.data.pushDelivery);
  });
});

describe('modo demonstração desligado (isolamento)', () => {
  const disabled = () => {
    const config = buildTestConfig();
    return createTestApp({ configOverrides: { demo: { ...config.demo, dataEnabled: false } } });
  };

  it('contas fictícias não entram (403 demo_account_disabled) e o domínio demo.asa sai da política de cadastro', async () => {
    const { app } = disabled();
    const response = await request(app).post('/api/auth/login').send({ email: USERS.student1.email, password: DEMO_PASSWORD });
    expect(response.status).toBe(403);
    expect(response.body.error.reason).toBe('demo_account_disabled');
    const policy = await request(app).get('/api/auth/policy');
    expect(policy.body.data.allowedEmailDomains).not.toContain('demo.asa');
  });

  it('conta real não recebe dados fictícios: acadêmico responde 503 academic_source_unavailable', async () => {
    const { app } = disabled();
    const registered = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Pessoa Real Teste', email: 'pessoa.real@edu.fecap.br', password: 'Senha@Forte2026', registrationNumber: '24026962' });
    expect(registered.status).toBe(201);
    const summary = await request(app).get('/api/student/summary').set(bearer(registered.body.data.accessToken));
    expect(summary.status).toBe(503);
    expect(summary.body.error.reason).toBe('academic_source_unavailable');
    const tickets = await request(app).get('/api/support/tickets').set(bearer(registered.body.data.accessToken));
    expect(tickets.status).toBe(200);
  });
});

describe('auditoria de autenticação', () => {
  it('registra login web e falha de login sem e-mail em claro', async () => {
    const { app, repos } = createTestApp();
    const web = new WebClient(app);
    await web.login(USERS.student1.email);
    await web.login(USERS.student2.email, 'senha-errada');
    const items = (repos as unknown as { audit: { items: Array<{ action: string; channel: string; metadata: Record<string, unknown>; actorUserId: string | null }> } }).audit.items;
    const success = items.find((item) => item.action === 'auth.login');
    expect(success).toMatchObject({ channel: 'web', actorUserId: USERS.student1.id });
    const failure = items.find((item) => item.action === 'auth.login_failed');
    expect(failure?.metadata).toMatchObject({ reason: 'invalid_credentials' });
    expect(JSON.stringify(items)).not.toContain(USERS.student2.email);
  });
});

describe('fila presencial: origem dos dados explícita', () => {
  it('com o simulador, o status da fila diz que os dados são de demonstração', async () => {
    const { app } = createTestApp();
    const session = await loginAs(app);
    const response = await request(app).get('/api/queue/status').set(bearer(session.accessToken));
    expect(response.status).toBe(200);
    expect(response.body.data.queue.sync.source).toEqual({ kind: 'demo', label: 'Simulação — dados fictícios de demonstração', authorized: true });
  });
});
