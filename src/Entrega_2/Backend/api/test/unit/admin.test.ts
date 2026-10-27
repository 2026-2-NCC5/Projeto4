import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { SlaPolicyResolver } from '../../src/admin/adminService.js';
import { automationEngineOf } from '../../src/createApp.js';
import { buildFixtureData, DEMO_PASSWORD, USERS } from '../support/fixtures.js';
import { MemoryAdminRepository } from '../support/inMemoryAdmin.js';
import { createInMemoryRepositories } from '../support/inMemoryRepositories.js';
import { createClock, MemoryMailer } from '../support/memoryMailer.js';
import { bearer, buildTestConfig, createTestApp, loginAs } from '../support/testApp.js';

const TICKET = {
  categoryId: 'financial',
  subcategoryId: 'bill',
  subject: 'Boleto não chegou',
  description: 'O boleto de outubro não apareceu no portal do aluno até agora.',
};

type AuditItems = { audit: { items: Array<{ action: string; actorUserId: string | null; resourceId: string | null; metadata: Record<string, unknown> }> } };

/** App em memória com a administração (metas de SLA e automações) disponível. */
function adminApp(options: { now?: () => Date; mailer?: MemoryMailer } = {}) {
  const repos = createInMemoryRepositories(buildFixtureData());
  const adminRepo = new MemoryAdminRepository(repos);
  repos.admin = adminRepo;
  const { app } = createTestApp({ repos, ...(options.now ? { now: options.now } : {}), ...(options.mailer ? { mailer: options.mailer } : {}) });
  const auditItems = () => (repos as unknown as AuditItems).audit.items;
  return { app, repos, adminRepo, auditItems };
}

describe('administração: autorização no servidor', () => {
  it('aluno e equipe recebem 403 (auditado); sem sessão, 401; administração acessa', async () => {
    const { app, auditItems } = adminApp();
    const student = await loginAs(app);
    const staff = await loginAs(app, USERS.staff.email, DEMO_PASSWORD);
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
    for (const path of ['/api/admin/users', '/api/admin/permissions', '/api/admin/sla-policies', '/api/admin/automations', '/api/admin/health', '/api/admin/settings', '/api/admin/integrations']) {
      expect((await request(app).get(path).set(bearer(student.accessToken))).status).toBe(403);
      expect((await request(app).get(path).set(bearer(staff.accessToken))).status).toBe(403);
      expect((await request(app).get(path).set(bearer(admin.accessToken))).status).toBe(200);
    }
    expect(auditItems().some((item) => item.action === 'authz.denied' && item.actorUserId === USERS.staff.id)).toBe(true);
  });

  it('matriz de permissões: administração não lê conteúdo de chamados', async () => {
    const { app } = adminApp();
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const response = await request(app).get('/api/admin/permissions').set(bearer(admin.accessToken));
    const roles = response.body.data.roles as Array<{ role: string; permissions: string[] }>;
    expect(roles.map((role) => role.role).sort()).toEqual(['institutional_staff', 'student', 'technical_admin']);
    const adminRole = roles.find((role) => role.role === 'technical_admin')!;
    expect(adminRole.permissions).toContain('tickets:read:metadata');
    expect(adminRole.permissions).not.toContain('tickets:read:any');
    expect(response.body.data.permissions.every((item: { label: string; group: string }) => item.label.length > 0 && item.group.length > 0)).toBe(true);
  });

  it('sem PostgreSQL, metas de SLA e automações respondem 503 explícito (nunca dados inventados)', async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const response = await request(app).get('/api/admin/sla-policies').set(bearer(admin.accessToken));
    expect(response.status).toBe(503);
    expect(response.body.error.details?.reason ?? response.body.error.reason).toBe('database_required');
  });
});

describe('administração: contas', () => {
  it('convite cria conta da equipe com senha inutilizável, envia código e audita sem dados pessoais', async () => {
    const mailer = new MemoryMailer();
    const { app, repos, auditItems } = adminApp({ mailer });
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const response = await request(app)
      .post('/api/admin/users')
      .set(bearer(admin.accessToken))
      .send({ fullName: '  Nova   Atendente ', email: 'Nova.Atendente@FECAP.br', role: 'institutional_staff' });
    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({ fullName: 'Nova Atendente', email: 'nova.atendente@fecap.br', role: 'institutional_staff', isActive: true, lastLoginAt: null });
    expect(response.body.data.invitation.sent).toBe(true);
    expect(mailer.sent.at(-1)?.to).toBe('nova.atendente@fecap.br');
    expect(mailer.sent.at(-1)?.text).not.toMatch(/senha:\s*\S+/i);
    // a senha aleatória nunca é conhecida: entrar com qualquer senha falha
    expect((await request(app).post('/api/auth/login').send({ email: 'nova.atendente@fecap.br', password: DEMO_PASSWORD })).status).toBe(401);
    const created = await repos.users.findByEmail('nova.atendente@fecap.br');
    const entry = auditItems().find((item) => item.action === 'user.invited' && item.resourceId === created!.id);
    expect(entry?.metadata).toMatchObject({ role: 'institutional_staff', invitationSent: true });
    expect(JSON.stringify(entry)).not.toContain('nova.atendente');
  });

  it('convite: domínio externo 400, aluno não é convidado, e-mail repetido 409; sem e-mail configurado avisa', async () => {
    const { app } = adminApp({ mailer: new MemoryMailer(false) });
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const invite = (body: object) => request(app).post('/api/admin/users').set(bearer(admin.accessToken)).send(body);
    expect((await invite({ fullName: 'Pessoa Externa', email: 'pessoa@gmail.com', role: 'institutional_staff' })).status).toBe(400);
    expect((await invite({ fullName: 'Aluno Convidado', email: 'aluno@edu.fecap.br', role: 'student' })).status).toBe(400);
    expect((await invite({ fullName: 'Responsável', email: USERS.staff.email, role: 'institutional_staff' })).status).toBe(409);
    const withoutMail = await invite({ fullName: 'Equipe Sem Email', email: 'equipe.sememail@fecap.br', role: 'technical_admin' });
    expect(withoutMail.status).toBe(201);
    expect(withoutMail.body.data.invitation).toMatchObject({ sent: false });
  });

  it('ninguém muda o próprio papel; aluno não vira equipe; mudança de papel encerra as sessões na hora', async () => {
    const { app, auditItems } = adminApp();
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const staff = await loginAs(app, USERS.staff.email, DEMO_PASSWORD);
    const patch = (id: string, body: object) => request(app).patch(`/api/admin/users/${id}`).set(bearer(admin.accessToken)).send(body);

    const self = await patch(USERS.admin.id, { role: 'institutional_staff' });
    expect(self.status).toBe(403);
    expect(self.body.error.reason ?? self.body.error.details?.reason).toBe('self_change');
    expect((await patch(USERS.admin.id, { isActive: false })).status).toBe(403);
    const studentChange = await patch(USERS.student1.id, { role: 'institutional_staff' });
    expect(studentChange.status).toBe(409);
    expect((await patch(USERS.staff.id, { role: 'student' })).status).toBe(400);
    expect((await patch(USERS.staff.id, {})).status).toBe(400);

    expect((await request(app).get('/api/asa/dashboard').set(bearer(staff.accessToken))).status).not.toBe(401);
    const promoted = await patch(USERS.staff.id, { role: 'technical_admin' });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data).toMatchObject({ role: 'technical_admin', roleLabel: 'Administração' });
    // o token antigo (papel antigo) deixa de valer imediatamente
    expect((await request(app).get('/api/auth/me').set(bearer(staff.accessToken))).status).toBe(401);
    expect(auditItems().some((item) => item.action === 'user.role_changed' && item.resourceId === USERS.staff.id && item.metadata.to === 'technical_admin')).toBe(true);
  });

  it('desativar conta encerra as sessões e bloqueia novo login; reativar volta a permitir', async () => {
    const { app } = adminApp();
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const student = await loginAs(app);
    const off = await request(app).patch(`/api/admin/users/${USERS.student1.id}`).set(bearer(admin.accessToken)).send({ isActive: false });
    expect(off.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(bearer(student.accessToken))).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: USERS.student1.email, password: DEMO_PASSWORD })).status).not.toBe(200);
    await request(app).patch(`/api/admin/users/${USERS.student1.id}`).set(bearer(admin.accessToken)).send({ isActive: true });
    expect((await request(app).post('/api/auth/login').send({ email: USERS.student1.email, password: DEMO_PASSWORD })).status).toBe(200);
  });

  it('a última administração ativa não pode ser rebaixada nem desativada (checagem no repositório)', async () => {
    const { repos } = adminApp();
    await expect(repos.users.update(USERS.admin.id, { isActive: false }, { keepActiveAdmin: true })).rejects.toMatchObject({ reason: 'last_admin' });
    await expect(repos.users.update(USERS.admin.id, { role: 'institutional_staff' }, { keepActiveAdmin: true })).rejects.toMatchObject({ reason: 'last_admin' });
    expect((await repos.users.findById(USERS.admin.id))?.isActive).toBe(true);
  });

  it('encerrar sessões de outra conta: o acesso para na próxima requisição', async () => {
    const { app } = adminApp();
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const student = await loginAs(app);
    const revoked = await request(app).post(`/api/admin/users/${USERS.student1.id}/revoke-sessions`).set(bearer(admin.accessToken));
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.revoked).toBeGreaterThanOrEqual(1);
    expect((await request(app).get('/api/auth/me').set(bearer(student.accessToken))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(bearer(admin.accessToken))).status).toBe(200);
  });
});

describe('administração: metas de SLA', () => {
  it('meta gravada vale para chamados abertos depois; os já abertos mantêm o prazo da abertura', async () => {
    const clock = createClock(new Date('2026-10-05T13:00:00.000Z')); // segunda-feira, 10h em São Paulo
    const { app } = adminApp({ now: clock.now });
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const student = await loginAs(app);
    const before = await request(app).post('/api/support/tickets').set(bearer(student.accessToken)).send({ ...TICKET, clientRequestId: 'req-sla-before-1' });
    expect(before.status).toBe(201);
    const defaultDays = before.body.data.sla.targetBusinessDays as number;

    const policies = await request(app).get('/api/admin/sla-policies').set(bearer(admin.accessToken));
    const financial = policies.body.data.find((item: { categoryId: string }) => item.categoryId === 'financial');
    expect(financial).toMatchObject({ isDefault: true, resolutionBusinessDays: defaultDays, defaultResolutionBusinessDays: defaultDays });

    const update = await request(app).put('/api/admin/sla-policies/financial').set(bearer(admin.accessToken)).send({ firstResponseHours: 8, resolutionBusinessDays: 1 });
    expect(update.status).toBe(200);
    expect(update.body.data.find((item: { categoryId: string }) => item.categoryId === 'financial')).toMatchObject({ isDefault: false, resolutionBusinessDays: 1, firstResponseHours: 8 });
    expect((await request(app).put('/api/admin/sla-policies/financial').set(bearer(admin.accessToken)).send({ firstResponseHours: 0, resolutionBusinessDays: 1 })).status).toBe(400);
    expect((await request(app).put('/api/admin/sla-policies/nao-existe').set(bearer(admin.accessToken)).send({ firstResponseHours: 8, resolutionBusinessDays: 1 })).status).toBe(404);

    // o catálogo (formulário de abertura e página de SLA) mostra a meta vigente
    const catalog = await request(app).get('/api/support/catalog').set(bearer(student.accessToken));
    expect(catalog.body.data.categories.find((item: { id: string }) => item.id === 'financial').slaBusinessDays).toBe(1);
    const after = await request(app).post('/api/support/tickets').set(bearer(student.accessToken)).send({ ...TICKET, clientRequestId: 'req-sla-after-01' });
    expect(after.body.data.sla.targetBusinessDays).toBe(1);
    expect(after.body.data.sla.dueAt).toBe('2026-10-06T13:00:00.000Z');
    const unchanged = await request(app).get(`/api/support/tickets/${before.body.data.id}`).set(bearer(student.accessToken));
    expect(unchanged.body.data.sla.targetBusinessDays).toBe(defaultDays);
  });

  it('primeira resposta: prazo gravado na abertura pela meta da categoria; resposta da equipe cumpre; sem resposta vence', async () => {
    const clock = createClock(new Date('2026-10-05T13:00:00.000Z'));
    const { app } = adminApp({ now: clock.now });
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const student = await loginAs(app);
    const staff = await loginAs(app, USERS.staff.email, DEMO_PASSWORD);
    await request(app).put('/api/admin/sla-policies/financial').set(bearer(admin.accessToken)).send({ firstResponseHours: 8, resolutionBusinessDays: 3 });
    const catalog = await request(app).get('/api/support/catalog').set(bearer(student.accessToken));
    expect(catalog.body.data.categories.find((item: { id: string }) => item.id === 'financial').firstResponseHours).toBe(8);
    expect(catalog.body.data.categories.find((item: { id: string }) => item.id === 'academic').firstResponseHours).toBe(24);

    const answered = await request(app).post('/api/support/tickets').set(bearer(student.accessToken)).send({ ...TICKET, clientRequestId: 'req-first-resp-01' });
    expect(answered.body.data.firstResponse).toEqual({ dueAt: '2026-10-05T21:00:00.000Z', respondedAt: null, status: 'pending' });
    clock.advance(2 * 3_600_000);
    const reply = await request(app).post(`/api/support/staff/tickets/${answered.body.data.id}/messages`).set(bearer(staff.accessToken)).send({ content: 'Já estamos verificando o seu boleto.' });
    expect(reply.status).toBe(201);
    const met = await request(app).get(`/api/support/tickets/${answered.body.data.id}`).set(bearer(student.accessToken));
    expect(met.body.data.firstResponse).toMatchObject({ status: 'met', respondedAt: '2026-10-05T15:00:00.000Z' });

    const ignored = await request(app).post('/api/support/tickets').set(bearer(student.accessToken)).send({ ...TICKET, clientRequestId: 'req-first-resp-02' });
    clock.advance(9 * 3_600_000);
    const overdue = await request(app).get(`/api/support/staff/tickets/${ignored.body.data.id}`).set(bearer(staff.accessToken));
    expect(overdue.body.data.firstResponse).toMatchObject({ status: 'overdue', respondedAt: null });
    // o aluno cancela antes de qualquer resposta: a meta deixa de se aplicar
    await request(app).post(`/api/support/tickets/${ignored.body.data.id}/cancel`).set(bearer(student.accessToken)).send({});
    const cancelled = await request(app).get(`/api/support/tickets/${ignored.body.data.id}`).set(bearer(student.accessToken));
    expect(cancelled.body.data.firstResponse.status).toBe('not_applicable');
  });

  it('falha ao ler as metas nunca impede a abertura: vale o padrão do catálogo', async () => {
    const repo = new MemoryAdminRepository({ support: createInMemoryRepositories(buildFixtureData()).support });
    repo.failListPolicies = true;
    const resolver = new SlaPolicyResolver(repo, () => new Date());
    expect(await resolver.resolutionDays('financial', 3)).toBe(3);
    expect(await resolver.firstResponseHours('financial')).toBe(24);
    expect(await new SlaPolicyResolver(null, () => new Date()).resolutionDays('academic', 5)).toBe(5);
  });
});

describe('administração: automações', () => {
  it('regra nasce desligada; ligada, avisa a equipe na abertura uma única vez por chamado', async () => {
    const { app, adminRepo } = adminApp();
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const student = await loginAs(app);
    const staff = await loginAs(app, USERS.staff.email, DEMO_PASSWORD);
    const created = await request(app)
      .post('/api/admin/automations')
      .set(bearer(admin.accessToken))
      .send({ name: 'Avisar financeiro', trigger: 'ticket_created', conditions: { categoryIds: ['financial'] }, action: 'notify_staff' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ enabled: false, actionParams: { audience: 'team' }, runs: { applied: 0 } });

    const first = await request(app).post('/api/support/tickets').set(bearer(student.accessToken)).send({ ...TICKET, clientRequestId: 'req-auto-off-001' });
    expect(adminRepo.runs).toHaveLength(0);

    await request(app).patch(`/api/admin/automations/${created.body.data.id}`).set(bearer(admin.accessToken)).send({ enabled: true });
    const second = await request(app).post('/api/support/tickets').set(bearer(student.accessToken)).send({ ...TICKET, clientRequestId: 'req-auto-on-0001' });
    expect(second.status).toBe(201);
    const inbox = await request(app).get('/api/notifications').set(bearer(staff.accessToken));
    const notices = inbox.body.data.items.filter((item: { kind: string }) => item.kind === 'automation_ticket_created');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ resource: { type: 'ticket', id: second.body.data.id } });
    expect(notices[0].body).toContain(second.body.data.protocol);

    // repetir o gatilho para o mesmo chamado não gera nova execução nem novo aviso (idempotência)
    const engine = automationEngineOf(app)!;
    const ticket = await adminRepo['repos'].support.findTicket(second.body.data.id);
    await engine.onTicketCreated(ticket!);
    expect(adminRepo.runs.filter((run) => run.ticketId === second.body.data.id)).toHaveLength(1);
    const again = await request(app).get('/api/notifications').set(bearer(staff.accessToken));
    expect(again.body.data.items.filter((item: { kind: string }) => item.kind === 'automation_ticket_created')).toHaveLength(1);

    // categoria fora da condição não dispara
    await request(app).post('/api/support/tickets').set(bearer(student.accessToken)).send({ categoryId: 'other', subject: 'Dúvida geral', description: 'Tenho uma dúvida geral sobre o atendimento do ASA.', clientRequestId: 'req-auto-other-1' });
    expect(adminRepo.runs).toHaveLength(1);
    const runs = await request(app).get(`/api/admin/automations/${created.body.data.id}/runs`).set(bearer(admin.accessToken));
    expect(runs.body.data[0]).toMatchObject({ status: 'applied', trigger: 'ticket_created', ticketProtocol: second.body.data.protocol });
    expect(first.status).toBe(201);
  });

  it('prazo excedido: eleva a prioridade como evento interno (o aluno não vê) e a varredura é idempotente', async () => {
    const clock = createClock(new Date('2026-10-05T13:00:00.000Z'));
    const { app, repos } = adminApp({ now: clock.now });
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const student = await loginAs(app);
    const staff = await loginAs(app, USERS.staff.email, DEMO_PASSWORD);
    await request(app)
      .post('/api/admin/automations')
      .set(bearer(admin.accessToken))
      .send({ name: 'Excedido vira urgente', trigger: 'sla_overdue', action: 'raise_priority', actionParams: { priority: 'urgent' }, enabled: true });
    const near = await request(app)
      .post('/api/admin/automations')
      .set(bearer(admin.accessToken))
      .send({ name: 'Prazo próximo avisa', trigger: 'sla_near_deadline', action: 'notify_staff', enabled: true });
    expect(near.status).toBe(201);
    const opened = await request(app).post('/api/support/tickets').set(bearer(student.accessToken)).send({ ...TICKET, clientRequestId: 'req-auto-sla-001' });
    const engine = automationEngineOf(app)!;
    expect(await engine.scanSla()).toBe(0);

    clock.advance(30 * 86_400_000);
    expect(await engine.scanSla()).toBe(1);
    expect(await engine.scanSla()).toBe(0);
    const stored = await repos.support.findTicket(opened.body.data.id);
    expect(stored?.priority).toBe('urgent');

    const staffView = await request(app).get(`/api/support/staff/tickets/${opened.body.data.id}`).set(bearer(staff.accessToken));
    expect(staffView.body.data.events.some((event: { type: string; title: string }) => event.type === 'priority_changed' && event.title.includes('automação'))).toBe(true);
    const studentView = await request(app).get(`/api/support/tickets/${opened.body.data.id}`).set(bearer(student.accessToken));
    expect(studentView.body.data.events.some((event: { type: string }) => event.type === 'priority_changed')).toBe(false);
    // "prazo próximo" não dispara para chamado que já passou do prazo
    const inbox = await request(app).get('/api/notifications').set(bearer(staff.accessToken));
    expect(inbox.body.data.items.some((item: { kind: string }) => item.kind === 'automation_sla_near_deadline')).toBe(false);
  });

  it('interruptor geral desligado (Configurações → Recursos ativos): nenhuma regra roda', async () => {
    const { app, adminRepo } = adminApp();
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const student = await loginAs(app);
    await request(app).post('/api/admin/automations').set(bearer(admin.accessToken)).send({ name: 'Avisar sempre', trigger: 'ticket_created', action: 'notify_staff', enabled: true });
    const toggles = await request(app)
      .put('/api/admin/settings/features.toggles')
      .set(bearer(admin.accessToken))
      .send({ value: { appointments: true, knowledgeBase: true, assistantKnowledgeAnswers: true, automations: false } });
    expect(toggles.status).toBe(200);
    const list = await request(app).get('/api/admin/automations').set(bearer(admin.accessToken));
    expect(list.body.data.engineEnabled).toBe(false);
    await request(app).post('/api/support/tickets').set(bearer(student.accessToken)).send({ ...TICKET, clientRequestId: 'req-auto-toggle-1' });
    expect(adminRepo.runs).toHaveLength(0);
  });

  it('validação: categoria desconhecida e parâmetro fora da ação são recusados', async () => {
    const { app } = adminApp();
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const create = (body: object) => request(app).post('/api/admin/automations').set(bearer(admin.accessToken)).send(body);
    expect((await create({ name: 'Ruim', trigger: 'ticket_created', action: 'notify_staff', conditions: { categoryIds: ['inexistente'] } })).status).toBe(400);
    expect((await create({ name: 'Ruim', trigger: 'ticket_created', action: 'raise_priority', actionParams: { priority: 'normal' } })).status).toBe(400);
    expect((await create({ name: 'Ruim', trigger: 'ticket_closed', action: 'notify_staff' })).status).toBe(400);
    expect((await create({ name: 'Mensagem ao aluno', trigger: 'ticket_created', action: 'message_student' })).status).toBe(400);
  });
});

describe('administração: integrações, saúde e parâmetros', () => {
  it('integrações: JEV e SSO aparecem como planejados; nenhum valor de segredo na resposta', async () => {
    const { app } = adminApp();
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const response = await request(app).get('/api/admin/integrations').set(bearer(admin.accessToken));
    expect(response.status).toBe(200);
    const byId = Object.fromEntries((response.body.data as Array<{ id: string; state: string }>).map((item) => [item.id, item.state]));
    expect(byId).toMatchObject({ jev: 'planned', 'fecap-sso': 'planned', 'agent-service': 'error' });
    expect(JSON.stringify(response.body)).not.toContain('test-secret-not-for-production');
  });

  it('saúde: versão, ambiente e serviços com estado explícito', async () => {
    const { app } = adminApp();
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const response = await request(app).get('/api/admin/health').set(bearer(admin.accessToken));
    expect(response.status).toBe(200);
    expect(response.body.data.api).toMatchObject({ version: '1.0.0', environment: expect.any(String) });
    expect(response.body.data.agentService).toMatchObject({ status: 'down', latencyMs: null });
    expect(['up', 'degraded']).toContain(response.body.data.database.status);
  });

  it('parâmetros: valor inválido 400; alteração registrada na auditoria com quem alterou', async () => {
    const { app, auditItems } = adminApp();
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const bad = await request(app).put('/api/admin/settings/appointments.policy').set(bearer(admin.accessToken)).send({ value: { minLeadHours: -1 } });
    expect(bad.status).toBe(400);
    // horários do mesmo dia sobrepostos são recusados no servidor, com mensagem em português
    const overlap = await request(app)
      .put('/api/admin/settings/asa.business_hours')
      .set(bearer(admin.accessToken))
      .send({ value: { days: [{ weekday: 1, intervals: [{ start: '08:00', end: '12:00' }, { start: '11:00', end: '14:00' }] }], note: null } });
    expect(overlap.status).toBe(400);
    expect(JSON.stringify(overlap.body.error.details)).toContain('não podem se sobrepor');
    const good = await request(app)
      .put('/api/admin/settings/institution.announcement')
      .set(bearer(admin.accessToken))
      .send({ value: { text: 'Atendimento do ASA em horário especial nesta semana.', tone: 'info' } });
    expect(good.status).toBe(200);
    const announcement = good.body.data.find((item: { key: string }) => item.key === 'institution.announcement');
    expect(announcement).toMatchObject({ isDefault: false, updatedBy: 'Administração (demonstração)' });
    expect(auditItems().some((item) => item.action === 'settings.updated' && item.resourceId === 'institution.announcement')).toBe(true);
  });
});

describe('validação e recursos desligados', () => {
  it('mensagens de validação do zod chegam em português', async () => {
    const { app } = adminApp();
    const admin = await loginAs(app, USERS.admin.email, DEMO_PASSWORD);
    const response = await request(app).put('/api/admin/sla-policies/financial').set(bearer(admin.accessToken)).send({ firstResponseHours: 999, resolutionBusinessDays: 1 });
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body.error.details)).toMatch(/Grande demais/);
  });

  it('assistente desligado: 404 com motivo estável feature_disabled', async () => {
    const base = buildTestConfig();
    const { app } = createTestApp({ configOverrides: { assistant: { ...base.assistant, enabled: false } } });
    const student = await loginAs(app);
    const response = await request(app).post('/api/assistant/message').set(bearer(student.accessToken)).send({ message: 'Quais são minhas notas?' });
    expect(response.status).toBe(404);
    expect(response.body.error.reason).toBe('feature_disabled');
  });
});
