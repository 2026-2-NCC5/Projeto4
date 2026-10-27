import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/createApp.js';
import { createLogger } from '../../src/config/logger.js';
import { ConflictError } from '../../src/errors/AppError.js';
import { contentMatchesType, sanitizeFileName, signAttachmentLink } from '../../src/support/attachments.js';
import { addBusinessDays, pauseSla, resumeSla, slaStatus, startSla } from '../../src/support/sla.js';
import type { SupportRepository } from '../../src/support/types.js';
import { buildFixtureData, USERS } from '../support/fixtures.js';
import { createInMemoryRepositories } from '../support/inMemoryRepositories.js';
import { bearer, buildTestConfig, createTestApp, loginAs } from '../support/testApp.js';

const TZ = 'America/Sao_Paulo';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF').toString('base64');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).toString('base64');
const EXE = Buffer.from('MZ\x90\x00\x03\x00\x00\x00').toString('base64');

/** Relógio controlado: quarta-feira, 16/09/2026, 12h em São Paulo. */
function clock(start = '2026-09-16T15:00:00.000Z') {
  let current = new Date(start);
  return {
    now: () => current,
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

function setup(options: { supportPush?: { sendToUser: ReturnType<typeof vi.fn> } } = {}) {
  const time = clock();
  const repos = createInMemoryRepositories(buildFixtureData());
  const app = createApp({ config: buildTestConfig(), repos, logger: createLogger('silent'), now: time.now, ...(options.supportPush ? { supportPush: options.supportPush } : {}) });
  return { app, repos, time };
}

const ticketBody = (overrides: Record<string, unknown> = {}) => ({
  clientRequestId: `req-${Math.random().toString(36).slice(2, 12)}`,
  categoryId: 'financial',
  subcategoryId: 'unidentified_payment',
  subject: 'Pagamento ainda não consta',
  description: 'Paguei o boleto da parcela de setembro e o portal ainda mostra em aberto.',
  ...overrides,
});

async function sessions(app: Parameters<typeof loginAs>[0]) {
  const student = await loginAs(app);
  const other = await loginAs(app, USERS.student2.email);
  const staff = await loginAs(app, USERS.staff.email);
  return { student: bearer(student.accessToken), other: bearer(other.accessToken), staff: bearer(staff.accessToken) };
}

describe('Atendimento — abertura', () => {
  it('cria o chamado com protocolo, recebimento automático, prazo e aviso; reenvio é idempotente', async () => {
    const { app } = setup();
    const auth = await sessions(app);
    const body = ticketBody();
    const created = await request(app).post('/api/support/tickets').set(auth.student).send(body);
    expect(created.status).toBe(201);
    const ticket = created.body.data;
    expect(ticket.protocol).toMatch(/^ASA-2026-\d{5}$/);
    expect(ticket).toMatchObject({ status: 'received', priority: 'normal', categoryLabel: 'Financeiro', subcategoryLabel: 'Pagamento não identificado', assignedTeam: 'Atendimento ASA', canReply: true, canCancel: true, canRate: false, canReopen: false });
    expect(ticket.events.map((event: { type: string }) => event.type)).toEqual(['ticket_created', 'ticket_received']);
    expect(ticket.sla).toMatchObject({ status: 'on_track', targetBusinessDays: 2, startedAt: '2026-09-16T15:00:00.000Z', dueAt: '2026-09-18T15:00:00.000Z' });

    const replay = await request(app).post('/api/support/tickets').set(auth.student).send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.data.id).toBe(ticket.id);

    const notifications = await request(app).get('/api/support/notifications').set(auth.student);
    expect(notifications.body.data.unreadCount).toBe(1);
    expect(notifications.body.data.items[0]).toMatchObject({ kind: 'ticket_received', ticketId: ticket.id, protocol: ticket.protocol });
  });

  it('valida campos com mensagens amigáveis e recusa campos que o estudante não controla', async () => {
    const { app } = setup();
    const auth = await sessions(app);
    const short = await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody({ description: 'curto' }));
    expect(short.status).toBe(400);
    expect(short.body.error.details[0]).toMatchObject({ field: 'description', message: 'Conte um pouco mais sobre sua solicitação.' });

    const urgent = await request(app).post('/api/support/tickets').set(auth.student).send({ ...ticketBody(), priority: 'urgent' });
    expect(urgent.status).toBe(400);
    const spoof = await request(app).post('/api/support/tickets').set(auth.student).send({ ...ticketBody(), studentId: 'student-demo-002' });
    expect(spoof.status).toBe(400);

    const category = await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody({ categoryId: 'nope' }));
    expect(category.status).toBe(400);
    const missingType = await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody({ subcategoryId: null }));
    expect(missingType.status).toBe(400);
    expect(missingType.body.error.details[0].field).toBe('subcategoryId');
    const wrongType = await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody({ subcategoryId: 'transcript' }));
    expect(wrongType.status).toBe(400);
  });

  it('exige sessão; equipe não usa as rotas do estudante e estudante não usa as da equipe', async () => {
    const { app } = setup();
    const auth = await sessions(app);
    expect((await request(app).get('/api/support/tickets')).status).toBe(401);
    expect((await request(app).get('/api/support/tickets').set(auth.staff)).status).toBe(403);
    expect((await request(app).get('/api/support/staff/tickets').set(auth.student)).status).toBe(403);
    const catalog = await request(app).get('/api/support/catalog').set(auth.student);
    expect(catalog.status).toBe(200);
    expect(catalog.body.data.categories).toHaveLength(10);
    expect(catalog.body.data.limits).toMatchObject({ descriptionMaxLength: 1500, maxAttachmentBytes: 5 * 1024 * 1024 });
  });
});

describe('Atendimento — acesso e consulta', () => {
  it('o estudante só vê os próprios chamados (403 para outro estudante, 404 para inexistente)', async () => {
    const { app } = setup();
    const auth = await sessions(app);
    const created = await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody());
    const id = created.body.data.id as string;
    expect((await request(app).get(`/api/support/tickets/${id}`).set(auth.other)).status).toBe(403);
    expect((await request(app).post(`/api/support/tickets/${id}/messages`).set(auth.other).send({ clientMessageId: 'msg-12345678', content: 'oi' })).status).toBe(403);
    expect((await request(app).post(`/api/support/tickets/${id}/cancel`).set(auth.other).send({})).status).toBe(403);
    expect((await request(app).get('/api/support/tickets/ticket-inexistente').set(auth.student)).status).toBe(404);
    const otherList = await request(app).get('/api/support/tickets').set(auth.other);
    expect(otherList.body.data.items).toEqual([]);
  });

  it('lista com filtro por situação, busca (protocolo, assunto, categoria sem acento) e paginação por cursor', async () => {
    const { app } = setup();
    const auth = await sessions(app);
    const first = await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody());
    await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody({ categoryId: 'enrollment', subcategoryId: 'reenrollment', subject: 'Dúvida sobre rematrícula' }));
    const third = await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody({ categoryId: 'documents', subcategoryId: 'transcript', subject: 'Histórico escolar' }));
    await request(app).post(`/api/support/tickets/${third.body.data.id}/cancel`).set(auth.student).send({});

    const all = await request(app).get('/api/support/tickets').set(auth.student);
    expect(all.body.data.counts).toMatchObject({ all: 3, active: 2, finished: 1, waitingStudent: 0 });
    const active = await request(app).get('/api/support/tickets?status=received').set(auth.student);
    expect(active.body.data.items).toHaveLength(2);
    expect((await request(app).get('/api/support/tickets?status=bogus').set(auth.student)).status).toBe(400);

    const byCategory = await request(app).get('/api/support/tickets?search=matricula').set(auth.student);
    expect(byCategory.body.data.items.map((item: { subject: string }) => item.subject)).toEqual(['Dúvida sobre rematrícula']);
    const byProtocol = await request(app).get(`/api/support/tickets?search=${encodeURIComponent(first.body.data.protocol.slice(-5))}`).set(auth.student);
    expect(byProtocol.body.data.items[0].id).toBe(first.body.data.id);

    const page1 = await request(app).get('/api/support/tickets?limit=2').set(auth.student);
    expect(page1.body.data.items).toHaveLength(2);
    expect(page1.body.data.nextCursor).toEqual(expect.any(String));
    const page2 = await request(app).get(`/api/support/tickets?limit=2&cursor=${page1.body.data.nextCursor}`).set(auth.student);
    expect(page2.body.data.items).toHaveLength(1);
    expect(page2.body.data.nextCursor).toBeNull();
    const ids = [...page1.body.data.items, ...page2.body.data.items].map((item: { id: string }) => item.id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('Atendimento — fluxo completo com a equipe', () => {
  it('triagem → encaminhamento → pedido de ação → resposta → resolução → avaliação → reabertura', async () => {
    const push = { sendToUser: vi.fn(async () => undefined) };
    const { app, time } = setup({ supportPush: push });
    const auth = await sessions(app);
    const created = await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody());
    const id = created.body.data.id as string;

    expect((await request(app).post(`/api/support/staff/tickets/${id}/status`).set(auth.staff).send({ status: 'triage' })).status).toBe(200);
    const assigned = await request(app).post(`/api/support/staff/tickets/${id}/assign`).set(auth.staff).send({ team: 'Financeiro', publicNote: 'Encaminhado ao setor financeiro.' });
    expect(assigned.body.data).toMatchObject({ status: 'assigned', assignedTeam: 'Financeiro' });
    await request(app).post(`/api/support/staff/tickets/${id}/notes`).set(auth.staff).send({ content: 'Conferir extrato do banco X (interno).' });

    time.advance(2 * HOUR);
    const asked = await request(app)
      .post(`/api/support/staff/tickets/${id}/messages`)
      .set(auth.staff)
      .send({ content: 'Precisamos do comprovante para continuar.', requestAction: { title: 'Comprovante de pagamento', description: 'Envie o comprovante da parcela de setembro.', expectsAttachment: true } });
    expect(asked.status).toBe(201);
    expect(asked.body.data.events.some((event: { visibility: string }) => event.visibility === 'internal')).toBe(true);

    const waiting = (await request(app).get(`/api/support/tickets/${id}`).set(auth.student)).body.data;
    expect(waiting).toMatchObject({ status: 'waiting_student', requiresStudentAction: true, unreadCount: 1, pendingAction: { title: 'Comprovante de pagamento', expectsAttachment: true } });
    expect(waiting.sla.status).toBe('paused');
    expect(waiting.messages[0]).toMatchObject({ senderType: 'agent', senderName: 'Financeiro', readAt: null });
    // privacidade: nota interna nunca chega ao estudante; nenhum id de atendente é exposto
    expect(waiting.events.map((event: { type: string }) => event.type)).not.toContain('internal_note');
    expect(JSON.stringify(waiting)).not.toContain('extrato do banco');
    expect(JSON.stringify(waiting)).not.toContain(USERS.staff.id);
    const unread = (await request(app).get('/api/support/notifications').set(auth.student)).body.data;
    expect(unread.items.map((item: { kind: string }) => item.kind)).toContain('action_required');

    const read = await request(app).post(`/api/support/tickets/${id}/read`).set(auth.student);
    expect(read.body.data.unreadCount).toBe(0);

    time.advance(1 * DAY);
    const upload = await request(app).post('/api/support/uploads').set(auth.student).send({ name: 'comprovante.pdf', mimeType: 'application/pdf', contentBase64: PDF });
    expect(upload.status).toBe(201);
    const replied = await request(app).post(`/api/support/tickets/${id}/messages`).set(auth.student).send({ clientMessageId: 'msg-abcdef12', content: 'Segue o comprovante.', attachmentIds: [upload.body.data.id] });
    expect(replied.status).toBe(201);
    expect(replied.body.data).toMatchObject({ status: 'in_analysis', pendingAction: null, requiresStudentAction: false });
    // o prazo foi estendido pelo tempo em pausa (1 dia)
    expect(new Date(replied.body.data.sla.dueAt).getTime()).toBe(new Date(waiting.sla.dueAt).getTime() + 1 * DAY);
    expect(replied.body.data.messages[1].attachments[0]).toMatchObject({ name: 'comprovante.pdf', uploadedBy: 'student' });
    const repeated = await request(app).post(`/api/support/tickets/${id}/messages`).set(auth.student).send({ clientMessageId: 'msg-abcdef12', content: 'Segue o comprovante.' });
    expect(repeated.body.data.messages).toHaveLength(2);

    const resolved = await request(app).post(`/api/support/staff/tickets/${id}/resolve`).set(auth.staff).send({ resolution: 'A compensação foi identificada e sua situação financeira foi atualizada.' });
    expect(resolved.body.data.status).toBe('resolved');
    const done = (await request(app).get(`/api/support/tickets/${id}`).set(auth.student)).body.data;
    expect(done).toMatchObject({ canRate: true, canReopen: true, canReply: false, canCancel: false, resolution: 'A compensação foi identificada e sua situação financeira foi atualizada.' });
    expect(done.sla.status).toBe('completed');

    expect((await request(app).post(`/api/support/tickets/${id}/rating`).set(auth.student).send({ rating: 5, comment: 'Rápido!' })).status).toBe(201);
    const again = await request(app).post(`/api/support/tickets/${id}/rating`).set(auth.student).send({ rating: 4 });
    expect(again.status).toBe(409);
    expect(again.body.error.reason).toBe('already_rated');
    expect((await request(app).post(`/api/support/tickets/${id}/rating`).set(auth.student).send({ rating: 7 })).status).toBe(400);

    const reopened = await request(app).post(`/api/support/tickets/${id}/reopen`).set(auth.student).send({ reason: 'O portal ainda mostra a parcela em aberto.' });
    expect(reopened.body.data).toMatchObject({ status: 'reopened', reopenedCount: 1, canReply: true });
    const types = reopened.body.data.events.map((event: { type: string }) => event.type);
    // histórico é auditoria: a resolução anterior continua registrada
    expect(types).toEqual(expect.arrayContaining(['ticket_resolved', 'rating_submitted', 'ticket_reopened']));
    expect(types.indexOf('ticket_resolved')).toBeLessThan(types.indexOf('ticket_reopened'));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(push.sendToUser).toHaveBeenCalledWith(USERS.student1.id, expect.objectContaining({ title: 'O ASA precisa de você', data: expect.objectContaining({ type: 'support_ticket', ticketId: id }) }));
  });

  it('regras de transição: equipe não define waiting_student/resolved direto; chamado finalizado não muda', async () => {
    const { app } = setup();
    const auth = await sessions(app);
    const id = (await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody())).body.data.id as string;
    const direct = await request(app).post(`/api/support/staff/tickets/${id}/status`).set(auth.staff).send({ status: 'waiting_student' });
    expect(direct.status).toBe(400);
    expect((await request(app).post(`/api/support/staff/tickets/${id}/status`).set(auth.staff).send({ status: 'received' })).status).toBe(400);
    expect((await request(app).post(`/api/support/staff/tickets/${id}/assign`).set(auth.staff).send({ team: 'Equipe Fantasma' })).status).toBe(400);

    await request(app).post(`/api/support/tickets/${id}/cancel`).set(auth.student).send({ reason: 'Resolvi presencialmente.' });
    expect((await request(app).post(`/api/support/staff/tickets/${id}/status`).set(auth.staff).send({ status: 'in_analysis' })).status).toBe(409);
    const reply = await request(app).post(`/api/support/tickets/${id}/messages`).set(auth.student).send({ clientMessageId: 'msg-00000001', content: 'Oi' });
    expect(reply.status).toBe(409);
    expect(reply.body.error.reason).toBe('ticket_not_open');
    expect((await request(app).post(`/api/support/tickets/${id}/cancel`).set(auth.student).send({})).status).toBe(409);
    expect((await request(app).post(`/api/support/tickets/${id}/reopen`).set(auth.student).send({ reason: 'Ainda preciso de ajuda com isso.' })).status).toBe(409);
  });

  it('reabertura só dentro da janela de 7 dias após a resolução', async () => {
    const { app, time } = setup();
    const auth = await sessions(app);
    const id = (await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody())).body.data.id as string;
    await request(app).post(`/api/support/staff/tickets/${id}/resolve`).set(auth.staff).send({ resolution: 'Situação regularizada no sistema financeiro.' });
    time.advance(8 * DAY);
    const late = await request(app).post(`/api/support/tickets/${id}/reopen`).set(auth.student).send({ reason: 'Ainda preciso de ajuda com isso.' });
    expect(late.status).toBe(409);
    expect(late.body.error.reason).toBe('reopen_not_allowed');
  });

  it('a Home recebe um único destaque: ação pendente antes de mensagens novas e do restante', async () => {
    const { app } = setup();
    const auth = await sessions(app);
    const empty = await request(app).get('/api/support/overview').set(auth.student);
    expect(empty.body.data).toMatchObject({ activeCount: 0, highlight: null });
    const a = (await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody())).body.data.id as string;
    await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody({ subject: 'Outro assunto qualquer' }));
    await request(app)
      .post(`/api/support/staff/tickets/${a}/messages`)
      .set(auth.staff)
      .send({ content: 'Precisamos de um documento.', requestAction: { title: 'Documento', description: 'Envie o documento solicitado.' } });
    const overview = (await request(app).get('/api/support/overview').set(auth.student)).body.data;
    expect(overview).toMatchObject({ activeCount: 2, waitingStudentCount: 1, unreadMessagesCount: 1 });
    expect(overview.highlight.id).toBe(a);
  });
});

describe('Atendimento — anexos', () => {
  it('valida tipo, tamanho e conteúdo; só o dono vincula; link assinado expira e não pode ser adulterado', async () => {
    const { app, time } = setup();
    const auth = await sessions(app);
    expect((await request(app).post('/api/support/uploads').set(auth.student).send({ name: 'virus.exe', mimeType: 'application/x-msdownload', contentBase64: EXE })).status).toBe(400);
    const disguised = await request(app).post('/api/support/uploads').set(auth.student).send({ name: 'comprovante.pdf', mimeType: 'application/pdf', contentBase64: EXE });
    expect(disguised.status).toBe(400);
    expect(disguised.body.error.reason).toBe('file_type_mismatch');
    const huge = Buffer.alloc(5 * 1024 * 1024 + 10, 0x41);
    huge.write('%PDF', 0);
    const tooLarge = await request(app).post('/api/support/uploads').set(auth.student).send({ name: 'grande.pdf', mimeType: 'application/pdf', contentBase64: huge.toString('base64') });
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body.error.reason).toBe('file_too_large');

    const othersUpload = await request(app).post('/api/support/uploads').set(auth.other).send({ name: 'foto.png', mimeType: 'image/png', contentBase64: PNG });
    expect(othersUpload.status).toBe(201);
    const stolen = await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody({ attachmentIds: [othersUpload.body.data.id] }));
    expect(stolen.status).toBe(400);
    expect(stolen.body.error.reason).toBe('attachment_unavailable');

    const mine = await request(app).post('/api/support/uploads').set(auth.student).send({ name: '../../etc/comprovante.pdf', mimeType: 'application/pdf', contentBase64: PDF });
    const created = await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody({ attachmentIds: [mine.body.data.id] }));
    expect(created.status).toBe(201);
    const attachment = created.body.data.attachments[0];
    expect(attachment).toMatchObject({ name: 'comprovante.pdf', mimeType: 'application/pdf', uploadedBy: 'student' });
    expect(created.body.data.events.map((event: { type: string }) => event.type)).toContain('file_uploaded');
    // já vinculado: não pode ser reaproveitado nem apagado
    expect((await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody({ attachmentIds: [mine.body.data.id] }))).status).toBe(400);
    expect((await request(app).delete(`/api/support/uploads/${mine.body.data.id}`).set(auth.student)).status).toBe(404);

    const link = await request(app).get(`/api/support/tickets/${created.body.data.id}/attachments/${attachment.id}/link`).set(auth.student);
    expect(link.status).toBe(200);
    expect((await request(app).get(`/api/support/tickets/${created.body.data.id}/attachments/${attachment.id}/link`).set(auth.other)).status).toBe(403);
    const file = await request(app).get(link.body.data.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('application/pdf');
    expect(file.headers['content-disposition']).toContain('comprovante.pdf');
    expect(file.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(file.body as Buffer).toString('base64')).toBe(PDF);

    const tampered = link.body.data.url.replace(/sig=([0-9a-f])/, (_m: string, c: string) => `sig=${c === 'a' ? 'b' : 'a'}`);
    expect((await request(app).get(tampered)).status).toBe(403);
    time.advance(6 * 60 * 1000);
    expect((await request(app).get(link.body.data.url)).status).toBe(403);
  });

  it('remover um envio pendente apaga o arquivo; ids inválidos não quebram a API', async () => {
    const { app } = setup();
    const auth = await sessions(app);
    const upload = await request(app).post('/api/support/uploads').set(auth.student).send({ name: 'print.png', mimeType: 'image/png', contentBase64: PNG });
    expect((await request(app).delete(`/api/support/uploads/${upload.body.data.id}`).set(auth.other)).status).toBe(404);
    expect((await request(app).delete(`/api/support/uploads/${upload.body.data.id}`).set(auth.student)).status).toBe(204);
    expect((await request(app).get('/api/support/files/nao-e-uuid?exp=1&sig=abc')).status).toBe(403);
  });
});

describe('Atendimento — avisos e concorrência', () => {
  it('marcar avisos como lidos (todos ou por id)', async () => {
    const { app } = setup();
    const auth = await sessions(app);
    const a = (await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody())).body.data.id as string;
    await request(app).post(`/api/support/staff/tickets/${a}/status`).set(auth.staff).send({ status: 'triage' });
    const list = (await request(app).get('/api/support/notifications').set(auth.student)).body.data;
    expect(list.unreadCount).toBe(2);
    const one = await request(app).post('/api/support/notifications/read').set(auth.student).send({ ids: [list.items[0].id] });
    expect(one.body.data.unreadCount).toBe(1);
    const all = await request(app).post('/api/support/notifications/read').set(auth.student).send({});
    expect(all.body.data.unreadCount).toBe(0);
  });

  it('alteração com versão desatualizada é recusada (controle de concorrência otimista)', async () => {
    const { app, repos } = setup();
    const auth = await sessions(app);
    const id = (await request(app).post('/api/support/tickets').set(auth.student).send(ticketBody())).body.data.id as string;
    const support: SupportRepository = repos.support;
    const ticket = await support.findTicket(id);
    await support.applyChanges({ ticketId: id, expectedVersion: ticket!.version, patch: { status: 'triage' }, events: [], messages: [], attachments: [], notifications: [], now: new Date() });
    await expect(support.applyChanges({ ticketId: id, expectedVersion: ticket!.version, patch: { status: 'in_analysis' }, events: [], messages: [], attachments: [], notifications: [], now: new Date() })).rejects.toBeInstanceOf(ConflictError);
  });

  it('createTestApp padrão também expõe o Atendimento', async () => {
    const { app } = createTestApp();
    const session = await loginAs(app);
    expect((await request(app).get('/api/support/overview').set(bearer(session.accessToken))).status).toBe(200);
  });
});

describe('Atendimento — prazos e arquivos (unidades)', () => {
  it('dias úteis pulam o fim de semana no fuso da instituição', () => {
    // sexta 18/09/2026 12h → +1 dia útil = segunda 21/09
    expect(addBusinessDays(new Date('2026-09-18T15:00:00Z'), 1, TZ).toISOString()).toBe('2026-09-21T15:00:00.000Z');
    expect(addBusinessDays(new Date('2026-09-16T15:00:00Z'), 3, TZ).toISOString()).toBe('2026-09-21T15:00:00.000Z');
  });

  it('situação do prazo: no prazo → atenção → próximo → excedido; pausa e retomada estendem o prazo', () => {
    const start = new Date('2026-09-14T12:00:00Z');
    const sla = startSla(5, start, TZ);
    const at = (ms: number) => new Date(start.getTime() + ms);
    const total = sla.dueAt.getTime() - start.getTime();
    expect(slaStatus(sla, at(total * 0.2))).toBe('on_track');
    expect(slaStatus(sla, at(total * 0.6))).toBe('attention');
    expect(slaStatus(sla, at(total * 0.9))).toBe('near_deadline');
    expect(slaStatus(sla, at(total + 1))).toBe('overdue');
    const paused = pauseSla(sla, at(HOUR));
    expect(slaStatus(paused, at(total + DAY))).toBe('paused');
    const resumed = resumeSla(paused, at(HOUR + DAY));
    expect(resumed.dueAt.getTime()).toBe(sla.dueAt.getTime() + DAY);
  });

  it('nomes de arquivo seguros e assinatura binária conferida', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\aluno\\comprovante "final".pdf')).toBe('comprovante final.pdf');
    expect(sanitizeFileName('\u0000\u0007')).toBe('arquivo');
    expect(sanitizeFileName(`${'a'.repeat(200)}.pdf`)).toHaveLength(120);
    expect(contentMatchesType('application/pdf', Buffer.from(PDF, 'base64'))).toBe(true);
    expect(contentMatchesType('image/png', Buffer.from(PDF, 'base64'))).toBe(false);
    expect(contentMatchesType('text/plain', Buffer.from([0x41, 0x00, 0x42]))).toBe(false);
    expect(signAttachmentLink('s'.repeat(40), 'id-1', new Date(0)).url).toMatch(/^\/api\/support\/files\/id-1\?exp=300000&sig=[0-9a-f]{64}$/);
  });
});
