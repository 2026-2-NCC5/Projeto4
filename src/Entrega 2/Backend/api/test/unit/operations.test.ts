import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '../../src/auth/permissions.js';
import type { Permission } from '../../src/contracts/mobileApi.v1.js';
import { csvCell, localMidnight, parsePeriod } from '../../src/operations/operationsService.js';
import { DEMO_PASSWORD, USERS } from '../support/fixtures.js';
import { bearer, createTestApp, loginAs } from '../support/testApp.js';

const TZ = 'America/Sao_Paulo';
const ticket = (id: string) => ({
  clientRequestId: `req-ops-${id}`,
  categoryId: 'documents',
  subcategoryId: 'transcript',
  subject: `Histórico ${id}`,
  description: 'Preciso do histórico escolar atualizado para um estágio.',
});

describe('relatórios e períodos', () => {
  it('células CSV neutralizam fórmulas e escapam aspas/separadores', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+55 11')).toBe("'+55 11");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(4)).toBe('4');
  });

  it('período em datas locais do ASA (meia-noite de São Paulo) com padrão de 30 dias', () => {
    expect(localMidnight('2026-10-14', TZ).toISOString()).toBe('2026-10-14T03:00:00.000Z');
    const now = new Date('2026-10-15T02:30:00.000Z'); // 14/10 às 23h30 em São Paulo
    const period = parsePeriod({}, now, TZ);
    expect(period.to).toBe('2026-10-14');
    expect(period.from).toBe('2026-09-15');
    expect(period.toInstant.toISOString()).toBe('2026-10-15T03:00:00.000Z');
    expect(() => parsePeriod({ from: '2026-10-10', to: '2026-10-01' }, now, TZ)).toThrow(/posterior/);
    expect(() => parsePeriod({ from: '2024-01-01', to: '2026-10-01' }, now, TZ)).toThrow(/366/);
    expect(() => parsePeriod({ from: 'ontem' }, now, TZ)).toThrow(/AAAA-MM-DD/);
  });
});

describe('fila da equipe: filtros, leitura e auditoria própria', () => {
  it('"meus"/"sem atendente", mensagens do aluno não lidas e confirmação de leitura', async () => {
    const { app } = createTestApp();
    const studentA = await loginAs(app, USERS.student1.email, DEMO_PASSWORD);
    const studentB = await loginAs(app, USERS.student2.email, DEMO_PASSWORD);
    const staff = await loginAs(app, USERS.staff.email, DEMO_PASSWORD);
    const first = await request(app).post('/api/support/tickets').set(bearer(studentA.accessToken)).send(ticket('1'));
    await request(app).post('/api/support/tickets').set(bearer(studentB.accessToken)).send(ticket('2'));
    const id = first.body.data.id as string;

    expect((await request(app).post(`/api/support/staff/tickets/${id}/assign`).set(bearer(staff.accessToken)).send({ team: 'Secretaria Acadêmica' })).status).toBe(200);
    // encaminhar não torna quem encaminhou responsável: o chamado fica sem atendente na nova equipe
    const forwarded = await request(app).get('/api/support/staff/tickets?assigned=unassigned').set(bearer(staff.accessToken));
    expect(forwarded.body.data.items.map((item: { id: string }) => item.id)).toContain(id);
    const noticesBefore = (await request(app).get('/api/support/notifications').set(bearer(studentA.accessToken))).body.data.items.length as number;
    // "Assumir" (mesma equipe, situação inalterada) é interno: nenhum aviso novo nem evento público para o aluno
    const claimed = await request(app).post(`/api/support/staff/tickets/${id}/assign`).set(bearer(staff.accessToken)).send({ team: 'Secretaria Acadêmica' });
    expect(claimed.status).toBe(200);
    expect(claimed.body.data.events.at(-1)).toMatchObject({ type: 'ticket_assigned', visibility: 'internal' });
    expect((await request(app).get('/api/support/notifications').set(bearer(studentA.accessToken))).body.data.items).toHaveLength(noticesBefore);
    const studentTimeline = (await request(app).get(`/api/support/tickets/${id}`).set(bearer(studentA.accessToken))).body.data.events as Array<{ title: string }>;
    expect(studentTimeline.filter((item) => item.title.startsWith('Encaminhado para Secretaria'))).toHaveLength(1);
    expect(studentTimeline.some((item) => item.title.startsWith('Atendimento assumido por'))).toBe(false);
    const mine = await request(app).get('/api/support/staff/tickets?assigned=mine').set(bearer(staff.accessToken));
    expect(mine.body.data.items.map((item: { id: string }) => item.id)).toEqual([id]);
    expect(mine.body.data.items[0].staff).toMatchObject({ studentName: 'Estudante Exemplo', registrationNumber: 'DEMO-2026-001', assignedAgentName: 'Responsável Exemplo', assignedTeam: 'Secretaria Acadêmica', channel: 'app' });
    const unassigned = await request(app).get('/api/support/staff/tickets?assigned=unassigned').set(bearer(staff.accessToken));
    expect(unassigned.body.data.items).toHaveLength(1);
    expect(unassigned.body.data.items[0].id).not.toBe(id);

    await request(app).post(`/api/support/tickets/${id}/messages`).set(bearer(studentA.accessToken)).send({ clientMessageId: 'msg-ops-0001', content: 'Consegue enviar em PDF?' });
    const unread = await request(app).get('/api/support/staff/tickets?unread=1').set(bearer(staff.accessToken));
    expect(unread.body.data.items.map((item: { id: string }) => item.id)).toEqual([id]);
    expect(unread.body.data.items[0].unreadCount).toBe(1);

    const detail = await request(app).get(`/api/support/staff/tickets/${id}`).set(bearer(staff.accessToken));
    expect(detail.body.data.unreadFromStudent).toBe(1);
    expect(detail.body.data.assignedAgent).toMatchObject({ id: USERS.staff.id });
    const read = await request(app).post(`/api/support/staff/tickets/${id}/read`).set(bearer(staff.accessToken));
    expect(read.body.data.unreadFromStudent).toBe(0);
    // o aluno vê que a equipe leu (read_at preenchido na própria mensagem)
    const seen = await request(app).get(`/api/support/tickets/${id}`).set(bearer(studentA.accessToken));
    const message = seen.body.data.messages.find((item: { content: string }) => item.content === 'Consegue enviar em PDF?');
    expect(message.readAt).not.toBeNull();

    const sorted = await request(app).get('/api/support/staff/tickets?sort=due').set(bearer(staff.accessToken));
    const dues = sorted.body.data.items.map((item: { sla: { dueAt: string } }) => item.sla.dueAt);
    expect([...dues].sort()).toEqual(dues);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const mineAudit = await request(app).get('/api/audit/mine').set(bearer(staff.accessToken));
    expect(mineAudit.status).toBe(200);
    expect(mineAudit.body.data.items.map((item: { action: string }) => item.action)).toEqual(expect.arrayContaining(['ticket.assigned', 'auth.login']));
    expect(mineAudit.body.data.items.every((item: { actor: { userId: string } }) => item.actor.userId === USERS.staff.id)).toBe(true);
  });
});

describe('autorização da operação (servidor)', () => {
  it('escrita na fila exige a permissão da ação (não basta ler): perfil só leitura recebe 403', async () => {
    // perfil hipotético "equipe só leitura": mantém tickets:read:any, perde tickets:manage e tickets:internal_note
    const staffPermissions = ROLE_PERMISSIONS.institutional_staff as Permission[];
    const original = [...staffPermissions];
    staffPermissions.splice(0, staffPermissions.length, ...original.filter((item) => item !== 'tickets:manage' && item !== 'tickets:internal_note'));
    try {
      const { app } = createTestApp();
      const student = await loginAs(app, USERS.student1.email, DEMO_PASSWORD);
      const staff = await loginAs(app, USERS.staff.email, DEMO_PASSWORD);
      const created = await request(app).post('/api/support/tickets').set(bearer(student.accessToken)).send(ticket('ro'));
      const id = created.body.data.id as string;
      expect((await request(app).get(`/api/support/staff/tickets/${id}`).set(bearer(staff.accessToken))).status).toBe(200);
      const writes: Array<[string, object]> = [
        ['status', { status: 'in_analysis', expectedVersion: 1 }],
        ['assign', { team: 'Secretaria Acadêmica' }],
        ['messages', { clientMessageId: 'msg-readonly-01', content: 'Olá' }],
        ['notes', { content: 'Nota' }],
        ['priority', { priority: 'high' }],
        ['resolve', { resolution: 'Resolvido conforme combinado.' }],
      ];
      for (const [action, body] of writes) {
        const response = await request(app).post(`/api/support/staff/tickets/${id}/${action}`).set(bearer(staff.accessToken)).send(body);
        expect([action, response.status, response.body.error?.reason ?? response.body.error?.details?.reason]).toEqual([action, 403, 'permission_denied']);
      }
    } finally {
      staffPermissions.splice(0, staffPermissions.length, ...original);
    }
  });

  it('aluno não acessa painel nem relatórios; administração vê métricas agregadas mas não a fila', async () => {
    const { app } = createTestApp();
    const student = await loginAs(app);
    const admin = await loginAs(app, USERS.admin.email);
    const staff = await loginAs(app, USERS.staff.email);
    expect((await request(app).get('/api/asa/dashboard').set(bearer(student.accessToken))).status).toBe(403);
    expect((await request(app).get('/api/asa/reports/tickets.csv').set(bearer(student.accessToken))).status).toBe(403);
    expect((await request(app).get('/api/asa/students').set(bearer(student.accessToken))).status).toBe(403);
    expect((await request(app).get('/api/asa/dashboard').set(bearer(admin.accessToken))).status).toBe(403);
    expect((await request(app).get('/api/asa/students').set(bearer(admin.accessToken))).status).toBe(403);
    expect((await request(app).get('/api/admin/audit-events').set(bearer(staff.accessToken))).status).toBe(403);
    // sem PostgreSQL os indicadores não são inventados: 503 explícito
    const noDb = await request(app).get('/api/asa/metrics').set(bearer(admin.accessToken));
    expect(noDb.status).toBe(503);
    expect(noDb.body.error.reason).toBe('database_required');
    expect((await request(app).get('/api/admin/audit-events').set(bearer(admin.accessToken))).status).toBe(200);
  });
});
