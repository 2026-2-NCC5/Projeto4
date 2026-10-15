import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareDatabase, TEST_DATABASE_URL, type DatabaseHandle } from '../support/database.js';
import { DEMO_PASSWORD } from '../support/fixtures.js';
import { bearer, createTestApp, loginAs } from '../support/testApp.js';
import { WebClient } from '../support/webClient.js';

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

// Segunda-feira, 16/11/2026, 08:00 em São Paulo — longe dos agendamentos fictícios do seed (datas relativas a hoje)
const NOW = () => new Date('2026-11-16T11:00:00.000Z');
const TUE_0900 = '2026-11-17T12:00:00.000Z';
const WED_1400 = '2026-11-18T17:00:00.000Z';
const WED_1430 = '2026-11-18T17:30:00.000Z';

let seq = 0;
const key = () => `req-appt-${Date.now()}-${(seq += 1)}`;
const booking = (startsAt: string, extra: Record<string, unknown> = {}) => ({ clientRequestId: key(), topicId: 'documents', startsAt, mode: 'presencial', ...extra });

describeDb('integração agendamentos ↔ PostgreSQL (migration 007, sem reserva dupla)', () => {
  let db: DatabaseHandle;

  beforeAll(async () => {
    db = await prepareDatabase();
  });

  afterAll(async () => {
    await db?.close();
  });

  const app = () => createTestApp({ repos: db.repos, now: NOW }).app;

  it('horários livres vêm da disponibilidade cadastrada, no fuso do ASA e com antecedência mínima', async () => {
    const student = await loginAs(app(), 'estudante.regular@demo.asa', DEMO_PASSWORD);
    const response = await request(app()).get('/api/appointments/slots?from=2026-11-16&to=2026-11-17').set(bearer(student.accessToken));
    expect(response.status).toBe(200);
    const [monday, tuesday] = response.body.data.days;
    // segunda: manhã do Atendente (09–12) começa às 10:00 por causa da antecedência de 2 h; tarde do Responsável 14–17
    expect(monday.slots[0].startsAt).toBe('2026-11-16T13:00:00.000Z');
    expect(monday.slots.filter((slot: { startsAt: string }) => slot.startsAt >= '2026-11-16T17:00:00.000Z')).toHaveLength(6);
    expect(tuesday.slots.map((slot: { mode: string }) => slot.mode)).toEqual(expect.arrayContaining(['presencial', 'online']));
    expect(tuesday.slots[0]).toMatchObject({ startsAt: TUE_0900, available: 1, location: expect.stringContaining('demonstração') });
    expect(JSON.stringify(response.body.data)).not.toMatch(/00000000-0000-4000-8000/);
  });

  it('reserva idempotente, reserva dupla impossível e conflito do próprio aluno', async () => {
    const staffLogin = await loginAs(app(), 'admin.plataforma@demo.asa', DEMO_PASSWORD);
    // segunda atendente na mesma manhã de terça (dois atendentes livres às 09:00)
    const extra = await request(app())
      .post('/api/asa/availability')
      .set(bearer(staffLogin.accessToken))
      .send({ attendantUserId: '00000000-0000-4000-8000-000000000099', weekday: 2, startTime: '09:00', endTime: '10:00', slotMinutes: 30, mode: 'presencial', location: 'Central de atendimento ASA (local de demonstração)', validFrom: '2026-11-01' });
    expect(extra.status).toBe(201);

    const a = await loginAs(app(), 'estudante.exemplo@demo.asa', DEMO_PASSWORD);
    const b = await loginAs(app(), 'estudante.regular@demo.asa', DEMO_PASSWORD);
    const c = await loginAs(app(), 'estudante.frequencia@demo.asa', DEMO_PASSWORD);
    const body = booking(TUE_0900);
    const first = await request(app()).post('/api/appointments').set(bearer(a.accessToken)).send(body);
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ protocol: expect.stringMatching(/^AGD-2026-\d{5}$/), status: 'scheduled', attendantLabel: 'Equipe ASA', channel: 'app', canCancel: true });
    // mesmo pedido de novo → mesmo agendamento (200)
    const again = await request(app()).post('/api/appointments').set(bearer(a.accessToken)).send(body);
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(first.body.data.id);
    // o mesmo aluno no mesmo horário com outro atendente livre → conflito do aluno
    const self = await request(app()).post('/api/appointments').set(bearer(a.accessToken)).send(booking(TUE_0900));
    expect(self.status).toBe(409);
    expect(self.body.error.reason).toBe('student_conflict');
    // outro aluno fica com o segundo atendente; o terceiro não tem mais vaga
    expect((await request(app()).post('/api/appointments').set(bearer(b.accessToken)).send(booking(TUE_0900))).status).toBe(201);
    const full = await request(app()).post('/api/appointments').set(bearer(c.accessToken)).send(booking(TUE_0900));
    expect(full.status).toBe(409);
    expect(full.body.error.reason).toBe('slot_unavailable');
    const { rows } = await db.pool.query("select count(*)::int as total from appointments where starts_at = $1 and status in ('scheduled','confirmed')", [TUE_0900]);
    expect(rows[0].total).toBe(2);
  });

  it('mesmo horário em dois locais: a reserva fica no local escolhido; local inexistente → 409', async () => {
    const admin = await loginAs(app(), 'admin.plataforma@demo.asa', DEMO_PASSWORD);
    // quinta 19/11 às 10:00: a central (seed, atendente …098) e uma segunda sala (atendente …099)
    const roomB = await request(app())
      .post('/api/asa/availability')
      .set(bearer(admin.accessToken))
      .send({ attendantUserId: '00000000-0000-4000-8000-000000000099', weekday: 4, startTime: '10:00', endTime: '10:30', slotMinutes: 30, mode: 'presencial', location: 'Sala B (local de demonstração)', validFrom: '2026-11-01' });
    expect(roomB.status).toBe(201);
    const student = await loginAs(app(), 'estudante.multiplo@demo.asa', DEMO_PASSWORD);
    const slots = await request(app()).get('/api/appointments/slots?from=2026-11-19&to=2026-11-19&mode=presencial').set(bearer(student.accessToken));
    const atTen = (slots.body.data.days[0].slots as Array<{ startsAt: string; location: string | null }>).filter((slot) => slot.startsAt === '2026-11-19T13:00:00.000Z');
    expect(atTen.map((slot) => slot.location).sort()).toEqual(['Central de atendimento ASA (local de demonstração)', 'Sala B (local de demonstração)']);

    const nowhere = await request(app()).post('/api/appointments').set(bearer(student.accessToken)).send(booking('2026-11-19T13:00:00.000Z', { location: 'Sala Z' }));
    expect(nowhere.status).toBe(409);
    expect(nowhere.body.error.reason).toBe('slot_unavailable');
    const chosen = await request(app()).post('/api/appointments').set(bearer(student.accessToken)).send(booking('2026-11-19T13:00:00.000Z', { location: 'Sala B (local de demonstração)' }));
    expect(chosen.status).toBe(201);
    expect(chosen.body.data.location).toBe('Sala B (local de demonstração)');
    const { rows } = await db.pool.query<{ attendant_user_id: string }>('select attendant_user_id from appointments where id = $1', [chosen.body.data.id]);
    expect(rows[0]!.attendant_user_id).toBe('00000000-0000-4000-8000-000000000099');
  });

  it('concorrência: dois alunos disputando o último horário → exatamente um consegue', async () => {
    const d = await loginAs(app(), 'estudante.desempenho@demo.asa', DEMO_PASSWORD);
    const e = await loginAs(app(), 'estudante.semdados@demo.asa', DEMO_PASSWORD);
    const results = await Promise.all([
      request(app()).post('/api/appointments').set(bearer(d.accessToken)).send(booking(WED_1400)),
      request(app()).post('/api/appointments').set(bearer(e.accessToken)).send(booking(WED_1400)),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    const { rows } = await db.pool.query("select count(*)::int as total from appointments where starts_at = $1 and status in ('scheduled','confirmed')", [WED_1400]);
    expect(rows[0].total).toBe(1);
  });

  it('concorrência forte: cinco alunos no mesmo horário de um único atendente → um 201, quatro 409, nunca 500 (deadlock tratado)', async () => {
    // sexta 20/11 às 14:00 (São Paulo): só o atendente …099 atende nesse horário
    const FRI_1400 = '2026-11-20T17:00:00.000Z';
    const emails = ['estudante.regular@demo.asa', 'estudante.frequencia@demo.asa', 'estudante.validacao@demo.asa', 'estudante.multiplo@demo.asa', 'estudante.inconsistente@demo.asa'];
    const sessions = await Promise.all(emails.map((email) => loginAs(app(), email, DEMO_PASSWORD)));
    const results = await Promise.all(sessions.map((session) => request(app()).post('/api/appointments').set(bearer(session.accessToken)).send(booking(FRI_1400))));
    const statuses = results.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    for (const response of results.filter((item) => item.status === 409)) expect(response.body.error.reason).toBe('slot_unavailable');
    const { rows } = await db.pool.query("select count(*)::int as total from appointments where starts_at = $1 and status in ('scheduled','confirmed')", [FRI_1400]);
    expect(rows[0].total).toBe(1);
  });

  it('remarcar é atômico; cancelar avisa a equipe; outro aluno não acessa; calendário .ics', async () => {
    const student = new WebClient(app());
    await student.login('estudante.inconsistente@demo.asa');
    const created = await student.send('post', '/api/appointments', booking('2026-11-18T18:00:00.000Z', { topicId: 'financial', notes: 'Dúvida sobre boleto' }));
    expect(created.status).toBe(201);
    expect(created.body.data.channel).toBe('web');
    const id = created.body.data.id as string;

    // horário indisponível (já reservado no teste anterior): nada muda
    const blocked = await student.send('post', `/api/appointments/${id}/reschedule`, { clientRequestId: key(), startsAt: WED_1400 });
    expect(blocked.status).toBe(409);
    expect((await student.get(`/api/appointments/${id}`)).body.data.status).toBe('scheduled');

    const moved = await student.send('post', `/api/appointments/${id}/reschedule`, { clientRequestId: key(), startsAt: WED_1430 });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({ startsAt: WED_1430, rescheduledFromId: id, status: 'scheduled' });
    const old = await student.get(`/api/appointments/${id}`);
    expect(old.body.data).toMatchObject({ status: 'cancelled', cancelledBy: 'student', cancelReason: 'Remarcado pelo aluno' });

    const other = await loginAs(app(), 'estudante.validacao@demo.asa', DEMO_PASSWORD);
    expect((await request(app()).get(`/api/appointments/${moved.body.data.id}`).set(bearer(other.accessToken))).status).toBe(403);
    expect((await request(app()).post(`/api/appointments/${moved.body.data.id}/cancel`).set(bearer(other.accessToken)).send({})).status).toBe(403);

    const ics = await student.get(`/api/appointments/${moved.body.data.id}/calendar.ics`);
    expect(ics.status).toBe(200);
    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.text).toContain('DTSTART:20261118T173000Z');

    const cancelled = await student.send('post', `/api/appointments/${moved.body.data.id}/cancel`, { reason: 'Resolvi pelo e-mail' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('cancelled');
    const notice = await db.pool.query("select title from user_notifications where resource_id = $1 and kind = 'appointment_cancelled'", [moved.body.data.id]);
    expect(notice.rows.length).toBeGreaterThan(0);
  });

  it('equipe: agenda com nomes, confirmação avisa o aluno, transições inválidas recusadas', async () => {
    const staff = new WebClient(app());
    await staff.login('atendente.asa@demo.asa');
    const agenda = await staff.get('/api/asa/appointments?from=2026-11-16&to=2026-11-20');
    expect(agenda.status).toBe(200);
    const item = agenda.body.data.items.find((row: { startsAt: string; status: string; attendant: { fullName: string } }) => row.startsAt === TUE_0900 && row.attendant.fullName.startsWith('Atendente'));
    expect(item.student).toMatchObject({ fullName: 'Estudante Exemplo', registrationNumber: 'DEMO-2026-001' });

    expect((await staff.send('patch', `/api/asa/appointments/${item.id}`, { status: 'completed' })).body.error.reason).toBe('invalid_transition');
    expect((await staff.send('patch', `/api/asa/appointments/${item.id}`, { status: 'cancelled' })).status).toBe(400);
    const confirmed = await staff.send('patch', `/api/asa/appointments/${item.id}`, { status: 'confirmed', staffNotes: 'Separar histórico antes' });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe('confirmed');
    expect(confirmed.body.data.events.some((event: { visibility: string }) => event.visibility === 'internal')).toBe(false); // confirmação vira evento público; nota fica na ficha

    const student = await loginAs(app(), 'estudante.exemplo@demo.asa', DEMO_PASSWORD);
    const seen = await request(app()).get(`/api/appointments/${item.id}`).set(bearer(student.accessToken));
    expect(seen.body.data.status).toBe('confirmed');
    expect(JSON.stringify(seen.body.data)).not.toContain('Separar histórico antes');
    const inbox = await request(app()).get('/api/notifications').set(bearer(student.accessToken));
    expect(inbox.body.data.items.some((notification: { kind: string }) => notification.kind === 'appointment_confirmed')).toBe(true);

    const dashboard = await request(app()).get('/api/asa/dashboard').set(bearer((await loginAs(app(), 'atendente.asa@demo.asa', DEMO_PASSWORD)).accessToken));
    expect(dashboard.body.data.appointmentsToday).not.toBeNull();
  });

  it('disponibilidade: própria sim, de outra pessoa não; sobreposição recusada', async () => {
    const staff = await loginAs(app(), 'atendente.asa@demo.asa', DEMO_PASSWORD);
    const own = await request(app()).post('/api/asa/availability').set(bearer(staff.accessToken)).send({ weekday: 6, startTime: '09:00', endTime: '11:00', slotMinutes: 30, mode: 'online' });
    expect(own.status).toBe(201);
    const overlap = await request(app()).post('/api/asa/availability').set(bearer(staff.accessToken)).send({ weekday: 6, startTime: '10:00', endTime: '12:00', slotMinutes: 30, mode: 'presencial' });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.reason).toBe('availability_overlap');
    const foreign = await request(app())
      .post('/api/asa/availability')
      .set(bearer(staff.accessToken))
      .send({ attendantUserId: '00000000-0000-4000-8000-000000000099', weekday: 6, startTime: '13:00', endTime: '14:00', slotMinutes: 30, mode: 'online' });
    expect(foreign.status).toBe(403);
    const paused = await request(app()).patch(`/api/asa/availability/${own.body.data.id}`).set(bearer(staff.accessToken)).send({ active: false });
    expect(paused.body.data.active).toBe(false);
    const student = await loginAs(app(), 'estudante.exemplo@demo.asa', DEMO_PASSWORD);
    expect((await request(app()).post('/api/asa/availability').set(bearer(student.accessToken)).send({ weekday: 6, startTime: '13:00', endTime: '14:00', slotMinutes: 30, mode: 'online' })).status).toBe(403);
  });
});
