import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { whatsAppModuleOf } from '../../src/createApp.js';
import { resolveDatabaseDir } from '../../src/db/paths.js';
import { FAKE_SIGNATURE_HEADER, FakeProvider } from '../../src/support/whatsapp/providers/fakeProvider.js';
import type { WhatsAppModule } from '../../src/support/whatsapp/module.js';
import { prepareDatabase, TEST_DATABASE_URL, type DatabaseHandle } from '../support/database.js';
import { DEMO_PASSWORD } from '../support/fixtures.js';
import { bearer, buildTestConfig, createTestApp, loginAs } from '../support/testApp.js';

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;
const STUDENT_A = 'estudante.exemplo@demo.asa';
const STUDENT_B = 'estudante.regular@demo.asa';
const STAFF = 'atendente.asa@demo.asa';
const ADMIN = 'admin.plataforma@demo.asa';
const OTHER_CONTACT = '+99900002222';

type Auth = { Authorization: string };

/**
 * Cenário-alvo do documento (§28), com banco real e provedor fake: nada sai para o WhatsApp.
 * A fila é acionada à mão (`autoKick: false`) para os testes observarem cada estado.
 */
describeDb('Central de Atendimento WhatsApp ↔ PostgreSQL', () => {
  let db: DatabaseHandle;
  let app: Express;
  let module: WhatsAppModule;
  let staff: Auth;
  let admin: Auth;
  let studentA: Auth;
  let studentB: Auth;
  let channelId: string;
  let sequence = 0;

  const simulate = (from: string, text: string, extra: Record<string, unknown> = {}) =>
    request(app).post('/api/admin/support/simulator/inbound').set(admin).send({ channelId, from, text, ...extra });
  const setConnection = (status: string) => request(app).post('/api/admin/support/simulator/connection').set(admin).send({ channelId, status });
  const openTicketFor = async (from: string, text = 'Preciso do comprovante de matrícula') => {
    const sent = await simulate(from, text);
    expect(sent.status).toBe(200);
    const list = await request(app).get('/api/support/staff/tickets?channel=whatsapp&limit=50').set(staff);
    const row = (list.body.data.items as Array<{ id: string; staff: { contactLabel: string | null } }>).find((item) => item.staff.contactLabel?.endsWith(from.slice(-4)));
    return row!.id;
  };
  const freshContact = () => {
    sequence += 1;
    return `+9990010${String(sequence).padStart(4, '0')}`;
  };
  const staffTicket = async (id: string) => (await request(app).get(`/api/support/staff/tickets/${id}`).set(staff)).body.data;
  const replyWhatsApp = (id: string, content = 'Vou conferir e já retorno.', extra: Record<string, unknown> = {}) =>
    request(app).post(`/api/support/staff/tickets/${id}/messages`).set(staff).send({ content, transport: 'whatsapp', clientMessageId: `client-${Date.now()}-${Math.random().toString(36).slice(2)}`, ...extra });
  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const closeOpenOutbox = async () => db.pool.query(`update support_outbox set status = 'failed' where status in ('pending', 'processing')`);

  beforeAll(async () => {
    db = await prepareDatabase();
    const baseConfig = buildTestConfig();
    const config = {
      ...baseConfig,
      rateLimit: { enabled: false },
      whatsapp: {
        ...baseConfig.whatsapp,
        provider: 'fake' as const,
        disabledReason: null,
        demoMode: true,
        outboundEnabled: true,
        sessionManagementEnabled: true,
        webhookSecret: 'segredo-de-teste-do-webhook-0123456789',
        piiKey: 'chave-de-teste-do-cofre-com-mais-de-32-caracteres',
      },
    };
    app = createTestApp({ repos: db.repos, configOverrides: config, whatsappOptions: { autoKick: false } }).app;
    module = whatsAppModuleOf(app)!;
    staff = bearer((await loginAs(app, STAFF, DEMO_PASSWORD)).accessToken);
    admin = bearer((await loginAs(app, ADMIN, DEMO_PASSWORD)).accessToken);
    studentA = bearer((await loginAs(app, STUDENT_A, DEMO_PASSWORD)).accessToken);
    studentB = bearer((await loginAs(app, STUDENT_B, DEMO_PASSWORD)).accessToken);
    // canal vem do seed de demonstração
    const channels = await request(app).get('/api/admin/support/channels').set(admin);
    expect(channels.status).toBe(200);
    expect(channels.body.data.items[0]).toMatchObject({ name: 'Canal de demonstração', provider: 'fake', isDemo: true, status: 'DISCONNECTED' });
    channelId = channels.body.data.items[0].id;
  });

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await setConnection('CONNECTED');
  });

  describe('conexão do canal e permissões', () => {
    it('status inicial é honesto: o canal nasce desconectado e o portal informa modo de demonstração', async () => {
      const fresh = await db.repos.whatsapp!.createChannel({ name: 'Outro canal', provider: 'fake', team: 'Atendimento ASA', publicNumber: null, authorizationReference: null, isDemo: true, createdBy: (await loginAs(app, ADMIN, DEMO_PASSWORD)).user.id, now: new Date() });
      expect(fresh.connection.status).toBe('DISCONNECTED');
      await db.pool.query('delete from support_channels where id = $1', [fresh.id]);
      const status = await request(app).get('/api/support/staff/whatsapp/status').set(staff);
      expect(status.status).toBe(200);
      expect(status.body.data).toMatchObject({ configured: true, demoMode: true, provider: 'fake' });
      expect(JSON.stringify(status.body.data)).not.toMatch(/segredo|webhookPath/);
    });

    it('QR e conexão só para a administração; aluno e equipe recebem 403', async () => {
      await setConnection('DISCONNECTED');
      expect((await request(app).post(`/api/admin/support/channels/${channelId}/connect`).set(staff)).status).toBe(403);
      expect((await request(app).post(`/api/admin/support/channels/${channelId}/connect`).set(studentA)).status).toBe(403);
      expect((await request(app).get('/api/admin/support/channels').set(staff)).status).toBe(403);
      const connect = await request(app).post(`/api/admin/support/channels/${channelId}/connect`).set(admin);
      expect(connect.status).toBe(200);
      expect(connect.body.data).toMatchObject({ action: 'qr', qr: { format: 'text' } });
      expect(connect.body.data.channel.status).toBe('QR_REQUIRED');
      // sem conexão confirmada não há "número conectado", mesmo que um já tenha sido visto antes
      expect(connect.body.data.channel.maskedNumber).toBeNull();
      expect(connect.headers['cache-control']).toContain('no-store');
      const audit = await db.pool.query(`select action from audit_events where action = 'channel.connect_requested'`);
      expect(audit.rowCount).toBeGreaterThan(0);
    });

    it('ADR-008: a administração não lê conversas, mesmo gerenciando o canal', async () => {
      const id = await openTicketFor(freshContact());
      expect((await request(app).get(`/api/support/staff/tickets/${id}`).set(admin)).status).toBe(403);
      expect((await request(app).get('/api/support/staff/events').set(admin)).status).toBe(403);
      expect((await request(app).get('/api/support/staff/tickets').set(admin)).status).toBe(403);
    });

    it('um canal por provedor no MVP', async () => {
      const second = await request(app).post('/api/admin/support/channels').set(admin).send({ name: 'Segundo', team: 'Atendimento ASA' });
      expect(second.status).toBe(409);
      expect(second.body.error.reason).toBe('channel_exists');
    });
  });

  describe('mensagem recebida', () => {
    it('contato desconhecido abre chamado "não identificado": só a equipe vê; nenhum estudante é criado', async () => {
      const before = await db.pool.query<{ total: number }>('select count(*)::int as total from students');
      const from = freshContact();
      const id = await openTicketFor(from, 'Olá, preciso de ajuda');
      const ticket = await staffTicket(id);
      expect(ticket).toMatchObject({ channel: 'whatsapp', student: null, status: 'received', conversation: { identified: false, contactLabel: `+•••• ${from.slice(-4)}`, replyBlock: null } });
      expect(ticket.messages[0]).toMatchObject({ senderType: 'contact', transport: 'whatsapp', content: 'Olá, preciso de ajuda', studentVisible: false });
      const after = await db.pool.query<{ total: number }>('select count(*)::int as total from students');
      expect(after.rows[0]!.total).toBe(before.rows[0]!.total);
      expect((await request(app).get(`/api/support/tickets/${id}`).set(studentA)).status).toBe(404);
      const unidentified = await request(app).get('/api/support/staff/tickets?unidentified=1&limit=50').set(staff);
      expect(unidentified.body.data.items.map((item: { id: string }) => item.id)).toContain(id);
      const counts = await request(app).get('/api/support/staff/inbox/counts').set(staff);
      expect(counts.body.data.unidentified).toBeGreaterThan(0);
    });

    it('telefone nunca fica em texto puro no banco nem aparece nas respostas', async () => {
      const from = freshContact();
      const id = await openTicketFor(from);
      const { rows } = await db.pool.query<Record<string, string | null>>('select contact_fingerprint, contact_encrypted, contact_masked from support_conversations c join support_tickets t on t.conversation_id = c.id where t.id = $1', [id]);
      const raw = JSON.stringify(rows[0]);
      expect(raw).not.toContain(from);
      expect(raw).not.toContain(from.slice(1));
      expect(JSON.stringify(await staffTicket(id))).not.toContain(from);
    });

    it('webhook duplicado não duplica mensagem nem efeito no chamado', async () => {
      const from = freshContact();
      const eventId = `dup-${from}`;
      const first = await simulate(from, 'Mensagem repetida', { providerEventId: eventId });
      const second = await simulate(from, 'Mensagem repetida', { providerEventId: eventId });
      expect(first.body.data).toMatchObject({ received: 1, duplicates: 0 });
      expect(second.body.data).toMatchObject({ received: 0, duplicates: 1 });
      const concurrent = await Promise.all(Array.from({ length: 5 }, () => simulate(from, 'Mensagem repetida', { providerEventId: eventId })));
      expect(concurrent.every((response) => response.body.data.duplicates === 1)).toBe(true);
      const { rows } = await db.pool.query<{ total: number }>(`select count(*)::int as total from support_ticket_messages where external_message_id = $1`, [eventId]);
      expect(rows[0]!.total).toBe(1);
      const tickets = await db.pool.query<{ total: number }>(`select count(*)::int as total from support_tickets t join support_conversations c on c.id = t.conversation_id where c.contact_masked like $1`, [`%${from.slice(-4)}`]);
      expect(tickets.rows[0]!.total).toBe(1);
    });

    it('mensagens concorrentes do mesmo contato não abrem dois chamados nem perdem mensagem', async () => {
      const from = freshContact();
      const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => simulate(from, `Mensagem ${index}`)));
      expect(responses.every((response) => response.status === 200)).toBe(true);
      // quem perdeu a corrida ficou guardado na inbox, com espera; aqui não é preciso esperar
      await db.pool.query(`update support_inbox_dedup set next_attempt_at = now() where status = 'failed'`);
      await module.ingest!.reprocessPending(200);
      const { rows } = await db.pool.query<{ tickets: number; messages: number }>(
        `select count(distinct t.id)::int as tickets, count(m.id)::int as messages
           from support_tickets t join support_conversations c on c.id = t.conversation_id join support_ticket_messages m on m.ticket_id = t.id
          where c.contact_masked like $1`,
        [`%${from.slice(-4)}`],
      );
      expect(rows[0]).toEqual({ tickets: 1, messages: 6 });
    });

    it('assinatura errada, corpo inválido e canal inexistente são recusados', async () => {
      const raw = JSON.stringify({ events: [] });
      expect((await request(app).post(`/api/internal/webhooks/fake/${channelId}`).set('Content-Type', 'application/json').send(raw)).status).toBe(401);
      expect((await request(app).post(`/api/internal/webhooks/fake/${channelId}`).set(FAKE_SIGNATURE_HEADER, 'sha256=00').set('Content-Type', 'application/json').send(raw)).status).toBe(401);
      const fake = module.provider as FakeProvider;
      const body = Buffer.from('não é json');
      expect((await request(app).post(`/api/internal/webhooks/fake/${channelId}`).set(FAKE_SIGNATURE_HEADER, fake.sign(body)).set('Content-Type', 'text/plain').send(body.toString())).status).toBe(400);
      const valid = Buffer.from(raw);
      expect((await request(app).post('/api/internal/webhooks/fake/00000000-0000-4000-8000-000000000000').set(FAKE_SIGNATURE_HEADER, fake.sign(valid)).set('Content-Type', 'application/json').send(raw)).status).toBe(404);
      expect((await request(app).post(`/api/internal/webhooks/fake/${channelId}`).set(FAKE_SIGNATURE_HEADER, fake.sign(valid)).set('Content-Type', 'application/json').send(raw)).status).toBe(200);
    });

    it('número real é recusado pelo simulador', async () => {
      const real = await request(app).post('/api/admin/support/simulator/inbound').set(admin).send({ channelId, from: '+5511999990000', text: 'x' });
      expect(real.status).toBe(400);
    });

    it('confirmação que chega antes da mensagem fica na inbox e é aplicada depois (fora de ordem)', async () => {
      const fake = module.provider as FakeProvider;
      const id = await openTicketFor(freshContact());
      const reply = await replyWhatsApp(id);
      expect(reply.status).toBe(202);
      const external = `fake-fora-de-ordem-${Date.now()}`;
      const raw = Buffer.from(JSON.stringify({ events: [{ kind: 'delivery', providerEventId: `status:${external}:delivered`, externalMessageId: external, state: 'delivered', errorCode: null, timestamp: new Date().toISOString() }] }));
      const early = await request(app).post(`/api/internal/webhooks/fake/${channelId}`).set(FAKE_SIGNATURE_HEADER, fake.sign(raw)).set('Content-Type', 'application/json').send(raw.toString());
      expect(early.status).toBe(200);
      const message = (await staffTicket(id)).messages.at(-1);
      expect(message.deliveryState).toBe('queued');
      await db.pool.query('update support_ticket_messages set external_message_id = $1 where id = $2', [external, message.id]);
      await db.pool.query('update support_inbox_dedup set next_attempt_at = now() where provider_event_id = $1', [`status:${external}:delivered`]);
      expect(await module.ingest!.reprocessPending(200)).toBeGreaterThan(0);
      expect((await staffTicket(id)).messages.at(-1).deliveryState).toBe('delivered');
      await closeOpenOutbox();
    });

    it('falha depois de gravar a mensagem: reprocessar completa o pedido para parar e a mídia, sem duplicar', async () => {
      const from = freshContact();
      const touch = db.repos.whatsapp!.touchConversation.bind(db.repos.whatsapp!);
      let fail = true;
      db.repos.whatsapp!.touchConversation = async (...args) => {
        if (fail) {
          fail = false;
          throw new Error('banco indisponível por um instante');
        }
        return touch(...args);
      };
      try {
        const sent = await simulate(from, 'sair', { kind: 'document', providerEventId: `falha-${from}` });
        expect(sent.status).toBe(200);
      } finally {
        db.repos.whatsapp!.touchConversation = touch;
      }
      const inbox = await db.pool.query<{ status: string; payload_encrypted: string | null }>('select status, payload_encrypted from support_inbox_dedup where provider_event_id = $1', [`msg:falha-${from}`]);
      expect(inbox.rows[0]!.status).toBe('failed');
      expect(inbox.rows[0]!.payload_encrypted).not.toBeNull();
      await db.pool.query('update support_inbox_dedup set next_attempt_at = now() where provider_event_id = $1', [`msg:falha-${from}`]);
      expect(await module.ingest!.reprocessPending()).toBeGreaterThan(0);
      const { rows } = await db.pool.query<{ opted_out_at: Date | null; messages: number; attachments: number }>(
        `select c.opted_out_at, (select count(*)::int from support_ticket_messages m where m.external_message_id = $2) as messages,
                (select count(*)::int from support_attachments a join support_ticket_messages m on m.id = a.message_id where m.external_message_id = $2) as attachments
           from support_conversations c where c.contact_masked like $1`,
        [`%${from.slice(-4)}`, `falha-${from}`],
      );
      expect(rows[0]).toMatchObject({ messages: 1, attachments: 1 });
      expect(rows[0]!.opted_out_at).not.toBeNull();
    });

    it('falha logo depois de consumir o código: reprocessar não transforma o código em mensagem', async () => {
      const from = freshContact();
      const state = await request(app).get('/api/support/me/whatsapp').set(studentA);
      const created = await request(app).post('/api/support/me/whatsapp/verifications').set(studentA).send({ consentAccepted: true, consentVersion: state.body.data.consentVersion });
      const code = created.body.data.code as string;
      const original = db.repos.whatsapp!.findActiveLink.bind(db.repos.whatsapp!);
      let fail = true;
      db.repos.whatsapp!.findActiveLink = async (fingerprint) => {
        if (fail) {
          fail = false;
          throw new Error('banco indisponível por um instante');
        }
        return original(fingerprint);
      };
      try {
        await simulate(from, code, { providerEventId: `codigo-${from}` });
      } finally {
        db.repos.whatsapp!.findActiveLink = original;
      }
      await db.pool.query('update support_inbox_dedup set next_attempt_at = now() where provider_event_id = $1', [`msg:codigo-${from}`]);
      await module.ingest!.reprocessPending();
      const { rows } = await db.pool.query<{ total: number }>('select count(*)::int as total from support_ticket_messages where external_message_id = $1', [`codigo-${from}`]);
      expect(rows[0]!.total).toBe(0);
      expect((await request(app).get(`/api/support/me/whatsapp/verifications/${created.body.data.id}`).set(studentA)).body.data.status).toBe('proven');
      await db.pool.query(`update support_contact_verifications set status = 'cancelled' where id = $1`, [created.body.data.id]);
    });

    it('linha ilegível não trava as outras; falhas têm espera crescente e podem ser refeitas pela administração', async () => {
      const from = freshContact();
      await db.pool.query(
        `insert into support_inbox_dedup (provider, channel_id, provider_event_id, kind, payload_encrypted, next_attempt_at) values ('fake', $1, $2, 'message', 'v1.lixo.lixo.lixo', now() - interval '1 hour')`,
        [channelId, `ilegivel-${from}`],
      );
      const create = db.repos.support.createTicket.bind(db.repos.support);
      db.repos.support.createTicket = async () => {
        throw new Error('falha passageira');
      };
      try {
        await simulate(from, 'Mensagem que vai falhar', { providerEventId: `espera-${from}` });
      } finally {
        db.repos.support.createTicket = create;
      }
      const failed = await db.pool.query<{ attempt_count: number; next_attempt_at: Date }>('select attempt_count, next_attempt_at from support_inbox_dedup where provider_event_id = $1', [`msg:espera-${from}`]);
      expect(failed.rows[0]!.attempt_count).toBe(1);
      expect(failed.rows[0]!.next_attempt_at.getTime()).toBeGreaterThan(Date.now());
      // antes da hora, nada é refeito; a linha ilegível é marcada e não impede as demais
      await module.ingest!.reprocessPending();
      expect((await db.pool.query<{ total: number }>('select count(*)::int as total from support_ticket_messages where external_message_id = $1', [`espera-${from}`])).rows[0]!.total).toBe(0);
      const unreadable = await db.pool.query<{ error_code: string }>('select error_code from support_inbox_dedup where provider_event_id = $1', [`ilegivel-${from}`]);
      expect(unreadable.rows[0]!.error_code).toBe('undecryptable');
      // a administração pede para refazer
      expect((await request(app).post('/api/admin/support/inbox/replay').set(staff)).status).toBe(403);
      const replay = await request(app).post('/api/admin/support/inbox/replay').set(admin);
      expect(replay.body.data.replayed).toBeGreaterThan(0);
      await module.ingest!.reprocessPending(200);
      expect((await db.pool.query<{ total: number }>('select count(*)::int as total from support_ticket_messages where external_message_id = $1', [`espera-${from}`])).rows[0]!.total).toBe(1);
      await db.pool.query(`delete from support_inbox_dedup where provider_event_id = $1`, [`ilegivel-${from}`]);
    });

    it('confirmação de algo digitado no aparelho é descartada depois de algumas tentativas', async () => {
      const fake = module.provider as FakeProvider;
      const external = `aparelho-${unique()}`;
      const raw = Buffer.from(JSON.stringify({ events: [{ kind: 'delivery', providerEventId: `status:${external}:sent`, externalMessageId: external, state: 'sent', errorCode: null, timestamp: new Date().toISOString() }] }));
      await request(app).post(`/api/internal/webhooks/fake/${channelId}`).set(FAKE_SIGNATURE_HEADER, fake.sign(raw)).set('Content-Type', 'application/json').send(raw.toString());
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await db.pool.query('update support_inbox_dedup set next_attempt_at = now() where provider_event_id = $1', [`status:${external}:sent`]);
        await module.ingest!.reprocessPending(200);
      }
      const { rows } = await db.pool.query<{ status: string; payload_encrypted: string | null }>('select status, payload_encrypted from support_inbox_dedup where provider_event_id = $1', [`status:${external}:sent`]);
      expect(rows[0]).toEqual({ status: 'ignored', payload_encrypted: null });
    });

    it('tipo não suportado não é descartado', async () => {
      const from = freshContact();
      await simulate(from, '', { kind: 'unsupported', text: undefined });
      const id = await openTicketFor(from, 'depois');
      const messages = (await staffTicket(id)).messages;
      expect(messages[0]).toMatchObject({ contentKind: 'unsupported' });
      expect(messages[0].content).toContain('não suportado');
    });
  });

  describe('resposta pelo WhatsApp', () => {
    it('fila → enviada → entregue, só com confirmação; status de entrega nunca muda o status do chamado', async () => {
      const id = await openTicketFor(freshContact());
      const reply = await replyWhatsApp(id, 'Seu comprovante está sendo preparado.');
      expect(reply.status).toBe(202);
      let message = reply.body.data.messages.at(-1);
      expect(message).toMatchObject({ senderType: 'agent', transport: 'whatsapp', deliveryState: 'queued' });
      const statusBefore = (await staffTicket(id)).status;

      expect(await module.outbox!.drain()).toMatchObject({ sent: 1 });
      message = (await staffTicket(id)).messages.at(-1);
      expect(message.deliveryState).toBe('sent');

      const delivered = await request(app).post('/api/admin/support/simulator/delivery').set(admin).send({ channelId, state: 'delivered' });
      expect(delivered.status).toBe(200);
      const after = await staffTicket(id);
      expect(after.messages.at(-1).deliveryState).toBe('delivered');
      expect(after.status).toBe(statusBefore);

      // confirmação atrasada não recua
      await request(app).post('/api/admin/support/simulator/delivery').set(admin).send({ channelId, state: 'sent' });
      expect((await staffTicket(id)).messages.at(-1).deliveryState).toBe('delivered');
    });

    it('idempotência: repetir a mesma chave não duplica mensagem nem envio', async () => {
      const id = await openTicketFor(freshContact());
      const key = `idem-${Date.now()}`;
      await replyWhatsApp(id, 'Uma vez só', { clientMessageId: key });
      await replyWhatsApp(id, 'Uma vez só', { clientMessageId: key });
      const ticket = await staffTicket(id);
      expect(ticket.messages.filter((item: { content: string }) => item.content === 'Uma vez só')).toHaveLength(1);
      const { rows } = await db.pool.query<{ total: number }>('select count(*)::int as total from support_outbox where ticket_id = $1', [id]);
      expect(rows[0]!.total).toBe(1);
      await closeOpenOutbox();
    });

    it('canal desconectado: nada entra na fila, erro real e nenhuma falsa entrega', async () => {
      const id = await openTicketFor(freshContact());
      const healthBefore = await request(app).get('/health');
      await setConnection('DISCONNECTED');
      const reply = await replyWhatsApp(id);
      expect(reply.status).toBe(409);
      expect(reply.body.error.reason).toBe('channel_disconnected');
      const ticket = await staffTicket(id);
      expect(ticket.conversation.replyBlock).toBe('channel_disconnected');
      expect(ticket.messages.filter((item: { senderType: string }) => item.senderType === 'agent')).toHaveLength(0);
      // o atendimento continua: chamado acessível e nota registrada
      const note = await request(app).post(`/api/support/staff/tickets/${id}/notes`).set(staff).send({ content: 'Canal fora do ar; retomar quando voltar.' });
      expect(note.status).toBe(201);
      // no chat do app só o estudante lê: num contato sem vínculo, a mensagem não chegaria a ninguém
      const nobody = await request(app).post(`/api/support/staff/tickets/${id}/messages`).set(staff).send({ content: 'Ninguém leria isto.' });
      expect(nobody.status).toBe(409);
      expect(nobody.body.error.reason).toBe('student_not_linked');
      // o canal fora do ar não muda a saúde da API acadêmica
      const healthAfter = await request(app).get('/health');
      expect(healthAfter.status).toBe(healthBefore.status);
      expect(JSON.stringify(healthAfter.body)).not.toMatch(/whatsapp/i);
    });

    it('falha temporária volta para a fila com espera; rejeição é definitiva e explícita', async () => {
      const id = await openTicketFor(freshContact());
      await replyWhatsApp(id);
      await request(app).post('/api/admin/support/simulator/next-send').set(admin).send({ channelId, mode: 'fail' });
      expect(await module.outbox!.drain()).toMatchObject({ retried: 1 });
      const queued = (await staffTicket(id)).messages.at(-1);
      expect(queued).toMatchObject({ deliveryState: 'queued', deliveryErrorCode: 'provider_http_503' });
      // antes da hora marcada nada sai
      expect(await module.outbox!.drain()).toMatchObject({ sent: 0 });
      await db.pool.query(`update support_outbox set next_attempt_at = now() where ticket_id = $1 and status = 'pending'`, [id]);
      expect(await module.outbox!.drain()).toMatchObject({ sent: 1 });
      expect((await staffTicket(id)).messages.at(-1).deliveryState).toBe('sent');
      await db.pool.query('update support_provider_connections set consecutive_failures = 0, circuit_open_until = null');

      const other = await openTicketFor(freshContact());
      await replyWhatsApp(other);
      await request(app).post('/api/admin/support/simulator/next-send').set(admin).send({ channelId, mode: 'reject' });
      expect(await module.outbox!.drain()).toMatchObject({ failed: 1 });
      expect((await staffTicket(other)).messages.at(-1)).toMatchObject({ deliveryState: 'failed', deliveryErrorCode: 'provider_rejected', canRetry: true });
    });

    it('timeout ambíguo vira "desconhecido": nunca reenvia sozinho e pede confirmação humana', async () => {
      const id = await openTicketFor(freshContact());
      await replyWhatsApp(id);
      await request(app).post('/api/admin/support/simulator/next-send').set(admin).send({ channelId, mode: 'timeout' });
      expect(await module.outbox!.drain()).toMatchObject({ unknown: 1 });
      const message = (await staffTicket(id)).messages.at(-1);
      expect(message).toMatchObject({ deliveryState: 'unknown', canRetry: true });
      expect(await module.outbox!.drain()).toMatchObject({ sent: 0 });
      const refused = await request(app).post(`/api/support/staff/tickets/${id}/messages/${message.id}/retry`).set(staff).send({});
      expect(refused.status).toBe(409);
      expect(refused.body.error.reason).toBe('delivery_unknown');
      const accepted = await request(app).post(`/api/support/staff/tickets/${id}/messages/${message.id}/retry`).set(staff).send({ confirmDuplicateRisk: true });
      expect(accepted.status).toBe(202);
      expect(await module.outbox!.drain()).toMatchObject({ sent: 1 });
      expect((await staffTicket(id)).messages.at(-1).deliveryState).toBe('sent');
    });

    it('envio interrompido por queda do processo fica "desconhecido", e pendentes sobrevivem ao reinício', async () => {
      const id = await openTicketFor(freshContact());
      await replyWhatsApp(id);
      // processo caiu no meio do envio: linha em andamento com a trava já vencida
      const [claimed] = await db.repos.whatsapp!.claimOutbox(1, new Date(), -1000);
      expect(claimed).toBeDefined();
      const summary = await module.outbox!.drain();
      expect(summary.unknown).toBe(1);
      expect((await staffTicket(id)).messages.at(-1).deliveryState).toBe('unknown');

      const other = await openTicketFor(freshContact());
      await replyWhatsApp(other);
      // "novo processo": outro app sobre o mesmo banco encontra o que ficou na fila
      const restarted = createTestApp({ repos: db.repos, configOverrides: { whatsapp: buildConfigWhatsApp() }, whatsappOptions: { autoKick: false } }).app;
      expect(await whatsAppModuleOf(restarted)!.outbox!.drain()).toMatchObject({ sent: 1 });
      expect((await staffTicket(other)).messages.at(-1).deliveryState).toBe('sent');
    });

    it('disjuntor: falhas seguidas degradam o canal e a resposta passa a ser recusada', async () => {
      const id = await openTicketFor(freshContact());
      await db.pool.query('update support_provider_connections set consecutive_failures = 4 where channel_id = $1', [channelId]);
      await replyWhatsApp(id);
      await request(app).post('/api/admin/support/simulator/next-send').set(admin).send({ channelId, mode: 'fail' });
      await module.outbox!.drain();
      const channel = await db.repos.whatsapp!.findChannel(channelId);
      expect(channel!.connection.status).toBe('DEGRADED');
      expect(channel!.connection.circuitOpenUntil).not.toBeNull();
      const blocked = await replyWhatsApp(id);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.reason).toBe('provider_unavailable');
      await db.pool.query('update support_provider_connections set consecutive_failures = 0, circuit_open_until = null');
      await closeOpenOutbox();
    });

    it('chamado de outra pessoa exige confirmação explícita, e dois atendentes não se sobrescrevem', async () => {
      const id = await openTicketFor(freshContact());
      const other = await db.pool.query<{ id: string }>(`select id from users where role = 'institutional_staff' and email <> $1 limit 1`, [STAFF]);
      if (other.rows[0]) {
        await db.pool.query('update support_tickets set assigned_agent_id = $1 where id = $2', [other.rows[0].id, id]);
        const refused = await replyWhatsApp(id);
        expect(refused.status).toBe(409);
        expect(refused.body.error.reason).toBe('assigned_to_other');
        expect((await replyWhatsApp(id, 'Assumindo', { overrideAssignee: true })).status).toBe(202);
        await closeOpenOutbox();
      }
      const current = await staffTicket(id);
      const stale = await request(app).post(`/api/support/staff/tickets/${id}/transfer`).set(staff).send({ team: 'Secretaria Acadêmica', reason: 'Motivo de teste', expectedVersion: current.version - 1 });
      expect(stale.status).toBe(409);
      expect(stale.body.error.reason).toBe('ticket_changed');
      const done = await request(app).post(`/api/support/staff/tickets/${id}/transfer`).set(staff).send({ team: 'Secretaria Acadêmica', reason: 'Motivo de teste', expectedVersion: current.version });
      expect(done.status).toBe(200);
      expect(done.body.data.assignedTeam).toBe('Secretaria Acadêmica');
      expect(done.body.data.events.some((item: { visibility: string; description: string | null }) => item.visibility === 'internal' && item.description === 'Motivo de teste')).toBe(true);
    });

    it('pedido para parar de receber bloqueia respostas até a pessoa voltar a escrever', async () => {
      const from = freshContact();
      const id = await openTicketFor(from);
      await simulate(from, 'SAIR');
      const blocked = await replyWhatsApp(id);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.reason).toBe('consent_required');
      await simulate(from, 'Voltei, preciso de ajuda');
      expect((await replyWhatsApp(id)).status).toBe(202);
      await closeOpenOutbox();
    });

    it('pedido para parar vale pela data: mensagem antiga atrasada não desfaz', async () => {
      const from = freshContact();
      const id = await openTicketFor(from);
      await simulate(from, 'SAIR');
      await db.pool.query(`update support_conversations set opted_out_at = now() + interval '1 minute' where contact_masked like $1`, [`%${from.slice(-4)}`]);
      // chega agora, mas foi escrita antes do pedido (o relógio do pedido está à frente)
      await simulate(from, 'mensagem atrasada');
      const blocked = await replyWhatsApp(id);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.reason).toBe('consent_required');
    });

    it('nova tentativa: esquece o id da anterior e sai com chave nova, em uma transação', async () => {
      const id = await openTicketFor(freshContact());
      await replyWhatsApp(id);
      await module.outbox!.drain();
      const sent = (await staffTicket(id)).messages.at(-1);
      expect(sent.deliveryState).toBe('sent');
      const external = (await db.pool.query<{ external_message_id: string }>('select external_message_id from support_ticket_messages where id = $1', [sent.id])).rows[0]!.external_message_id;
      expect(external).toBeTruthy();
      await request(app).post('/api/admin/support/simulator/delivery').set(admin).send({ channelId, state: 'failed' });
      const failed = (await staffTicket(id)).messages.at(-1);
      expect(failed.deliveryState).toBe('failed');
      const retried = await request(app).post(`/api/support/staff/tickets/${id}/messages/${failed.id}/retry`).set(staff).send({});
      expect(retried.status).toBe(202);
      expect((await db.pool.query<{ external_message_id: string | null }>('select external_message_id from support_ticket_messages where id = $1', [failed.id])).rows[0]!.external_message_id).toBeNull();
      const { rows } = await db.pool.query<{ dedupe_key: string }>('select dedupe_key from support_outbox where message_id = $1 order by created_at', [failed.id]);
      expect(new Set(rows.map((row) => row.dedupe_key)).size).toBe(2);
      expect(await module.outbox!.drain()).toMatchObject({ sent: 1 });
      const newId = (await db.pool.query<{ external_message_id: string }>('select external_message_id from support_ticket_messages where id = $1', [failed.id])).rows[0]!.external_message_id;
      expect(newId).toBeTruthy();
      expect(newId).not.toBe(external);
    });

    it('queda do worker depois do envio não desfaz a confirmação do provedor', async () => {
      const id = await openTicketFor(freshContact());
      await replyWhatsApp(id);
      await module.outbox!.drain();
      const message = (await staffTicket(id)).messages.at(-1);
      await request(app).post('/api/admin/support/simulator/delivery').set(admin).send({ channelId, state: 'delivered' });
      // simula o worker caindo entre gravar o envio e encerrar a linha da fila
      await db.pool.query(`update support_outbox set status = 'processing', locked_until = now() - interval '1 minute' where message_id = $1`, [message.id]);
      await module.outbox!.drain();
      const after = (await staffTicket(id)).messages.at(-1);
      expect(after).toMatchObject({ deliveryState: 'delivered', canRetry: false });
    });

    it('resposta pelo WhatsApp conta como primeira resposta, mesmo sem aparecer ao aluno', async () => {
      const id = await openTicketFor(freshContact());
      expect((await staffTicket(id)).firstResponse.respondedAt).toBeNull();
      await replyWhatsApp(id);
      expect((await staffTicket(id)).firstResponse.status).toBe('met');
      await closeOpenOutbox();
    });

    it('reabrir com outro chamado aberto na mesma conversa responde 409, não erro interno', async () => {
      const from = freshContact();
      const first = await openTicketFor(from);
      await request(app).post(`/api/support/staff/tickets/${first}/status`).set(staff).send({ status: 'closed' });
      await simulate(from, 'Assunto novo');
      const reopened = await request(app).post(`/api/support/staff/tickets/${first}/reopen`).set(staff).send({ reason: 'Tentando reabrir o antigo.' });
      expect(reopened.status).toBe(409);
      expect(reopened.body.error.reason).toBe('conversation_has_open_ticket');
    });

    it('nova mensagem depois de resolvido reabre; depois de encerrado abre outro chamado', async () => {
      const from = freshContact();
      const id = await openTicketFor(from);
      await request(app).post(`/api/support/staff/tickets/${id}/resolve`).set(staff).send({ resolution: 'Comprovante enviado por e-mail.' });
      await simulate(from, 'Não recebi');
      const reopened = await staffTicket(id);
      expect(reopened.status).toBe('reopened');
      await request(app).post(`/api/support/staff/tickets/${id}/status`).set(staff).send({ status: 'closed' });
      await simulate(from, 'Outro assunto');
      const { rows } = await db.pool.query<{ total: number }>(`select count(*)::int as total from support_tickets t join support_conversations c on c.id = t.conversation_id where c.contact_masked like $1`, [`%${from.slice(-4)}`]);
      expect(rows[0]!.total).toBe(2);
    });
  });

  describe('vínculo verificado', () => {
    const startLink = async (who: Auth) => {
      const state = await request(app).get('/api/support/me/whatsapp').set(who);
      const created = await request(app).post('/api/support/me/whatsapp/verifications').set(who).send({ consentAccepted: true, consentVersion: state.body.data.consentVersion });
      expect(created.status).toBe(201);
      return created.body.data as { id: string; code: string; status: string };
    };

    it('canal fora do ar: não entrega um código que nunca chegaria', async () => {
      await setConnection('DISCONNECTED');
      const state = await request(app).get('/api/support/me/whatsapp').set(studentA);
      expect(state.body.data.available).toBe(false);
      const refused = await request(app).post('/api/support/me/whatsapp/verifications').set(studentA).send({ consentAccepted: true, consentVersion: state.body.data.consentVersion });
      expect(refused.status).toBe(409);
      expect(refused.body.error.reason).toBe('provider_unavailable');
    });

    it('sem consentimento não começa; o código nunca fica em texto no banco', async () => {
      const refused = await request(app).post('/api/support/me/whatsapp/verifications').set(studentA).send({ consentAccepted: false, consentVersion: 'x' });
      expect(refused.status).toBe(400);
      const pending = await startLink(studentA);
      const { rows } = await db.pool.query('select * from support_contact_verifications where id = $1', [pending.id]);
      expect(JSON.stringify(rows[0])).not.toContain(pending.code.replace('ASA-', ''));
      expect((await request(app).get(`/api/support/me/whatsapp/verifications/${pending.id}`).set(studentB)).status).toBe(404);
    });

    it('fluxo completo: conversa anterior só aparece no app depois de prova + confirmação + autorização explícita', async () => {
      const from = freshContact();
      const id = await openTicketFor(from, 'Quero meu histórico');
      expect((await request(app).get(`/api/support/tickets/${id}`).set(studentA)).status).toBe(404);

      const pending = await startLink(studentA);
      expect(pending.code).toMatch(/^ASA-[A-Z2-9]{8}$/);
      const proof = await simulate(from, pending.code);
      expect(proof.status).toBe(200);
      const proven = await request(app).get(`/api/support/me/whatsapp/verifications/${pending.id}`).set(studentA);
      expect(proven.body.data).toMatchObject({ status: 'proven', contactMasked: `+•••• ${from.slice(-4)}`, code: null, previousTicketsCount: 1 });
      // o código não vira mensagem nem chamado
      expect((await staffTicket(id)).messages.some((item: { content: string }) => item.content.includes(pending.code))).toBe(false);

      // provar não basta: até confirmar, nada aparece
      expect((await request(app).get(`/api/support/tickets/${id}`).set(studentA)).status).toBe(404);

      const confirmed = await request(app).post(`/api/support/me/whatsapp/verifications/${pending.id}/confirm`).set(studentA).send({ linkPreviousTickets: true });
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.data.links).toHaveLength(1);
      const mine = await request(app).get(`/api/support/tickets/${id}`).set(studentA);
      expect(mine.status).toBe(200);
      expect(mine.body.data.channel).toBe('whatsapp');
      expect((await request(app).get(`/api/support/tickets/${id}`).set(studentB)).status).toBe(404);
      const audit = await db.pool.query(`select action from audit_events where action in ('whatsapp.link_confirmed', 'whatsapp.ticket_linked')`);
      expect(audit.rowCount).toBeGreaterThanOrEqual(2);

      // daqui em diante a conversa já nasce identificada
      await simulate(from, 'Mais uma coisa');
      const staffView = await staffTicket(id);
      expect(staffView.student.id).toBeTruthy();
      expect(staffView.conversation.identified).toBe(true);
      expect(staffView.messages.at(-1)).toMatchObject({ senderType: 'student', transport: 'whatsapp' });

      // sem autorização de espelhar, mensagens do WhatsApp não aparecem no app; o andamento sim
      expect(mine.body.data.messages).toHaveLength(0);
      const after = await request(app).get(`/api/support/tickets/${id}`).set(studentA);
      expect(after.body.data.messages).toHaveLength(0);
      expect(after.body.data.events.some((item: { title: string }) => item.title.includes('vinculado'))).toBe(true);

      // revogar desfaz o vínculo; os chamados continuam do estudante
      const linkId = confirmed.body.data.links[0].id;
      const revoked = await request(app).delete(`/api/support/me/whatsapp/links/${linkId}`).set(studentA);
      expect(revoked.body.data.links).toHaveLength(0);
      expect((await request(app).delete(`/api/support/me/whatsapp/links/${linkId}`).set(studentB)).status).toBe(404);
      expect((await request(app).get(`/api/support/tickets/${id}`).set(studentA)).status).toBe(200);
      // o chamado fica com o estudante, mas o número não escreve mais nele: a próxima mensagem abre outro, sem dono
      const before = (await staffTicket(id)).messages.length;
      const fresh = await simulate(from, 'Depois de revogar');
      expect(fresh.status).toBe(200);
      const detached = await staffTicket(id);
      expect(detached.messages).toHaveLength(before);
      expect(detached.conversation).toBeNull();
      const other = await db.pool.query<{ id: string; student_id: string | null }>(`select t.id, t.student_id from support_tickets t join support_conversations c on c.id = t.conversation_id where c.contact_masked like $1`, [`%${from.slice(-4)}`]);
      expect(other.rows).toHaveLength(1);
      expect(other.rows[0]!.student_id).toBeNull();
      expect(other.rows[0]!.id).not.toBe(id);
    });

    it('número que muda de dono: nada de um estudante chega ao outro, em nenhum sentido', async () => {
      const from = freshContact();
      const link = async (who: Auth, previous: boolean) => {
        const pending = await startLink(who);
        await simulate(from, pending.code);
        return request(app).post(`/api/support/me/whatsapp/verifications/${pending.id}/confirm`).set(who).send({ linkPreviousTickets: previous });
      };
      // A tem um chamado aberto pelo número
      const idA = await openTicketFor(from, 'Assunto da pessoa A');
      const linkedA = await link(studentA, true);
      expect((await request(app).get(`/api/support/tickets/${idA}`).set(studentA)).status).toBe(200);
      await request(app).delete(`/api/support/me/whatsapp/links/${linkedA.body.data.links[0].id}`).set(studentA);

      // a resposta sobre o chamado de A não pode mais sair pelo número
      const reply = await replyWhatsApp(idA, 'Dados do chamado de A');
      expect(reply.status).toBe(409);
      expect(reply.body.error.reason).toBe('no_whatsapp_conversation');

      // B verifica o mesmo número e escreve
      const linkedB = await link(studentB, false);
      expect(linkedB.status).toBe(200);
      await simulate(from, 'CONTEUDO DA PESSOA B', { kind: 'document' });
      const seenByA = JSON.stringify((await request(app).get(`/api/support/tickets/${idA}`).set(studentA)).body);
      expect(seenByA).not.toContain('CONTEUDO DA PESSOA B');
      expect(seenByA).not.toContain('Estudante Regular');
      const eventsA = JSON.stringify((await request(app).get(`/api/support/tickets/${idA}/events`).set(studentA)).body);
      expect(eventsA).not.toContain('Estudante Regular');
      expect(JSON.stringify((await staffTicket(idA)).messages)).not.toContain('CONTEUDO DA PESSOA B');
      // o que é de B fica com B
      const listB = await request(app).get('/api/support/tickets?limit=50').set(studentB);
      const idB = (listB.body.data.items as Array<{ id: string; subject: string; channel?: string }>).find((item) => item.subject === 'Atendimento pelo WhatsApp')?.id;
      expect(idB).toBeTruthy();
      expect(idB).not.toBe(idA);
      await request(app).delete(`/api/support/me/whatsapp/links/${linkedB.body.data.links[0].id}`).set(studentB);
    });

    it('depois de revogar, o número não reabre o chamado resolvido do estudante nem recebe resposta sobre ele', async () => {
      const from = freshContact();
      const id = await openTicketFor(from);
      const pending = await startLink(studentA);
      await simulate(from, pending.code);
      const linked = await request(app).post(`/api/support/me/whatsapp/verifications/${pending.id}/confirm`).set(studentA).send({ linkPreviousTickets: true });
      await request(app).post(`/api/support/staff/tickets/${id}/resolve`).set(staff).send({ resolution: 'Resolvido antes da revogação.' });
      await request(app).delete(`/api/support/me/whatsapp/links/${linked.body.data.links[0].id}`).set(studentA);
      await simulate(from, 'Oi de novo');
      expect((await request(app).get(`/api/support/tickets/${id}`).set(studentA)).body.data.status).toBe('resolved');
    });

    it('contato vinculado sem autorizar chamados anteriores continua "contato" no chamado sem dono', async () => {
      const from = freshContact();
      const id = await openTicketFor(from);
      const pending = await startLink(studentA);
      await simulate(from, pending.code);
      const linked = await request(app).post(`/api/support/me/whatsapp/verifications/${pending.id}/confirm`).set(studentA).send({ linkPreviousTickets: false });
      await simulate(from, 'Mensagem seguinte');
      const message = (await staffTicket(id)).messages.at(-1);
      expect(message).toMatchObject({ senderType: 'contact', content: 'Mensagem seguinte' });
      expect(message.senderName).not.toContain('Estudante Exemplo');
      await request(app).delete(`/api/support/me/whatsapp/links/${linked.body.data.links[0].id}`).set(studentA);
    });

    it('confirmar duas vezes ao mesmo tempo é sucesso, sem falso conflito nem revisão', async () => {
      const from = freshContact();
      const pending = await startLink(studentA);
      await simulate(from, pending.code);
      const [first, second] = await Promise.all([
        request(app).post(`/api/support/me/whatsapp/verifications/${pending.id}/confirm`).set(studentA).send({ linkPreviousTickets: false }),
        request(app).post(`/api/support/me/whatsapp/verifications/${pending.id}/confirm`).set(studentA).send({ linkPreviousTickets: false }),
      ]);
      expect([first.status, second.status]).toEqual([200, 200]);
      const view = await request(app).get(`/api/support/me/whatsapp/verifications/${pending.id}`).set(studentA);
      expect(view.body.data.status).toBe('confirmed');
      const reviews = await request(app).get('/api/admin/support/contact-reviews').set(admin);
      expect(reviews.body.data.items.map((item: { id: string }) => item.id)).not.toContain(pending.id);
      const repeat = await request(app).post(`/api/support/me/whatsapp/verifications/${pending.id}/confirm`).set(studentA).send({ linkPreviousTickets: false });
      expect(repeat.status).toBe(200);
      await request(app).delete(`/api/support/me/whatsapp/links/${first.body.data.links[0].id}`).set(studentA);
    });

    it('provar perto do fim do prazo do código ainda deixa o tempo prometido para confirmar', async () => {
      const from = freshContact();
      const pending = await startLink(studentA);
      await db.pool.query(`update support_contact_verifications set expires_at = now() + interval '20 seconds' where id = $1`, [pending.id]);
      await simulate(from, pending.code);
      const view = await request(app).get(`/api/support/me/whatsapp/verifications/${pending.id}`).set(studentA);
      expect(view.body.data.status).toBe('proven');
      expect(new Date(view.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now() + 10 * 60_000);
      await db.pool.query(`update support_contact_verifications set status = 'cancelled' where id = $1`, [pending.id]);
    });

    it('revisão humana demorada: transferir o vínculo dá prazo novo, e o estudante consegue confirmar', async () => {
      const from = freshContact();
      const first = await startLink(studentA);
      await simulate(from, first.code);
      await request(app).post(`/api/support/me/whatsapp/verifications/${first.id}/confirm`).set(studentA).send({ linkPreviousTickets: false });
      const second = await startLink(studentB);
      await simulate(from, second.code);
      // a revisão levou horas: prazo original já venceu
      await db.pool.query(`update support_contact_verifications set proven_at = now() - interval '5 hours', expires_at = now() - interval '4 hours' where id = $1`, [second.id]);
      const decided = await request(app).post(`/api/admin/support/contact-reviews/${second.id}/decision`).set(admin).send({ decision: 'transfer_link', reason: 'Identidade conferida com a secretaria.' });
      expect(decided.status).toBe(200);
      expect((await request(app).get('/api/support/me/whatsapp').set(studentA)).body.data.links).toEqual([]);
      const confirmed = await request(app).post(`/api/support/me/whatsapp/verifications/${second.id}/confirm`).set(studentB).send({ linkPreviousTickets: false });
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.data.links).toHaveLength(1);
      const audit = await db.pool.query<{ metadata: { justificativa?: string } }>(`select metadata from audit_events where action = 'whatsapp.link_review_decided' and resource_id = $1`, [second.id]);
      expect(audit.rows[0]!.metadata.justificativa).toContain('secretaria');
      await request(app).delete(`/api/support/me/whatsapp/links/${confirmed.body.data.links[0].id}`).set(studentB);
    });

    it('sem autorização, chamados anteriores não são trazidos', async () => {
      const from = freshContact();
      const id = await openTicketFor(from);
      const pending = await startLink(studentB);
      await simulate(from, pending.code);
      const confirmed = await request(app).post(`/api/support/me/whatsapp/verifications/${pending.id}/confirm`).set(studentB).send({ linkPreviousTickets: false });
      expect(confirmed.status).toBe(200);
      expect((await request(app).get(`/api/support/tickets/${id}`).set(studentB)).status).toBe(404);
      await request(app).delete(`/api/support/me/whatsapp/links/${confirmed.body.data.links[0].id}`).set(studentB);
    });

    it('conflito: número de outra conta vai para revisão humana, sem revelar nada ao estudante', async () => {
      const from = freshContact();
      const first = await startLink(studentA);
      await simulate(from, first.code);
      const linked = await request(app).post(`/api/support/me/whatsapp/verifications/${first.id}/confirm`).set(studentA).send({ linkPreviousTickets: false });
      expect(linked.status).toBe(200);

      const second = await startLink(studentB);
      await simulate(from, second.code);
      const view = await request(app).get(`/api/support/me/whatsapp/verifications/${second.id}`).set(studentB);
      expect(view.body.data.status).toBe('review_required');
      expect(view.body.data.contactMasked).toBeNull();
      expect(JSON.stringify(view.body.data)).not.toContain(from.slice(-4));
      const denied = await request(app).post(`/api/support/me/whatsapp/verifications/${second.id}/confirm`).set(studentB).send({ linkPreviousTickets: true });
      expect(denied.status).toBe(409);

      const reviews = await request(app).get('/api/admin/support/contact-reviews').set(admin);
      expect(reviews.body.data.items.map((item: { id: string }) => item.id)).toContain(second.id);
      expect((await request(app).get('/api/admin/support/contact-reviews').set(staff)).status).toBe(403);
      expect((await request(app).post(`/api/admin/support/contact-reviews/${second.id}/decision`).set(admin).send({ decision: 'reject', reason: 'Motivo da decisão de teste' })).status).toBe(200);
      await request(app).delete(`/api/support/me/whatsapp/links/${linked.body.data.links[0].id}`).set(studentA);
    });

    it('código errado ou de outro formato segue como mensagem comum, sem revelar nada', async () => {
      const from = freshContact();
      await simulate(from, 'ASA-AAAAAAAA');
      const id = await openTicketFor(from, 'seguinte');
      expect((await staffTicket(id)).messages.some((item: { content: string }) => item.content === 'ASA-AAAAAAAA')).toBe(true);
    });

    it('código expirado não prova nada', async () => {
      const from = freshContact();
      const pending = await startLink(studentB);
      await db.pool.query(`update support_contact_verifications set expires_at = now() - interval '1 minute' where id = $1`, [pending.id]);
      await simulate(from, pending.code);
      const view = await request(app).get(`/api/support/me/whatsapp/verifications/${pending.id}`).set(studentB);
      expect(view.body.data.status).toBe('expired');
    });
  });

  describe('tempo real e isolamento', () => {
    const feed = (who: Auth, path: string, since?: string, wait = 0) => request(app).get(`/api/support/${path}/events`).query({ ...(since ? { since } : {}), wait }).set(who);

    const linkedTicket = async (who: Auth) => {
      const from = freshContact();
      const id = await openTicketFor(from);
      const state = await request(app).get('/api/support/me/whatsapp').set(who);
      const pending = await request(app).post('/api/support/me/whatsapp/verifications').set(who).send({ consentAccepted: true, consentVersion: state.body.data.consentVersion });
      await simulate(from, pending.body.data.code);
      await request(app).post(`/api/support/me/whatsapp/verifications/${pending.body.data.id}/confirm`).set(who).send({ linkPreviousTickets: true });
      return { id, from };
    };

    it('mudança de situação chega ao aluno por long polling, com sequência monotônica; replay pelo cursor', async () => {
      const { id } = await linkedTicket(studentA);
      const start = await feed(studentA, 'me');
      expect(start.status).toBe(200);
      const cursor = start.body.data.nextCursor;
      expect(start.body.data.events).toEqual([]);

      const waiting = feed(studentA, 'me', cursor, 10);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const changed = await request(app).post(`/api/support/staff/tickets/${id}/status`).set(staff).send({ status: 'in_progress' });
      expect(changed.status).toBe(200);
      const received = await waiting;
      const statusEvent = received.body.data.events.find((item: { type: string; ticketId: string }) => item.type === 'support.ticket.status_changed' && item.ticketId === id);
      expect(statusEvent).toMatchObject({ schemaVersion: '1.0', audience: 'STUDENT_VISIBLE', data: { to: 'in_progress', publicLabel: 'Em atendimento' } });
      expect(statusEvent.actor).toEqual({ type: 'agent' });
      expect(statusEvent.correlationId).toBeNull();

      // voltar do segundo plano: reconciliar pelo cursor antigo entrega o mesmo evento, uma vez
      const replay = await feed(studentA, 'me', cursor);
      expect(replay.body.data.events.map((item: { eventId: string }) => item.eventId)).toContain(statusEvent.eventId);
      const caughtUp = await feed(studentA, 'me', received.body.data.nextCursor);
      expect(caughtUp.body.data.events.map((item: { eventId: string }) => item.eventId)).not.toContain(statusEvent.eventId);

      const { rows } = await db.pool.query<{ sequence: string }>('select sequence from support_event_log where ticket_id = $1 order by sequence', [id]);
      const sequences = rows.map((row) => Number(row.sequence));
      expect(sequences).toEqual([...new Set(sequences)].sort((a, b) => a - b));
    });

    it('evento de transação lenta não se perde: o cursor só passa do que já terminou', async () => {
      const { id } = await linkedTicket(studentA);
      const start = await feed(studentA, 'me');
      const client = await db.pool.connect();
      try {
        // transação "lenta" grava primeiro e ainda não terminou
        await client.query('begin');
        const student = await db.pool.query<{ student_id: string }>('select student_id from support_tickets where id = $1', [id]);
        await client.query(
          `insert into support_event_log (ticket_id, sequence, type, audience, student_id, actor_type, data) values ($1, 900001, 'support.ticket.status_changed', 'STUDENT_VISIBLE', $2, 'system', '{"title":"lento"}')`,
          [id, student.rows[0]!.student_id],
        );
        // outra, mais rápida, grava depois e termina antes
        await request(app).post(`/api/support/staff/tickets/${id}/status`).set(staff).send({ status: 'in_analysis' });
        const during = await feed(studentA, 'me', start.body.data.nextCursor);
        expect(during.body.data.events.every((item: { data: { title?: string } }) => item.data.title !== 'lento')).toBe(true);
        await client.query('commit');
        const after = await feed(studentA, 'me', during.body.data.nextCursor);
        expect(after.body.data.events.some((item: { data: { title?: string } }) => item.data.title === 'lento')).toBe(true);
      } finally {
        client.release();
      }
    });

    it('aluno B não recebe nada do chamado do aluno A: nem por REST, nem pelo feed, nem por anexo', async () => {
      const { id } = await linkedTicket(studentA);
      const start = await feed(studentB, 'me');
      await request(app).post(`/api/support/staff/tickets/${id}/status`).set(staff).send({ status: 'waiting_department' });
      const events = await feed(studentB, 'me', start.body.data.nextCursor);
      expect(events.body.data.events.filter((item: { ticketId: string }) => item.ticketId === id)).toEqual([]);
      for (const route of [`/api/support/tickets/${id}`, `/api/support/tickets/${id}/events`]) expect((await request(app).get(route).set(studentB)).status).toBe(404);
      expect((await request(app).post(`/api/support/tickets/${id}/messages`).set(studentB).send({ clientMessageId: 'msg-idor-0001', content: 'x' })).status).toBe(404);
      // identificador do cliente não muda o filtro
      const spoof = await request(app).get('/api/support/me/events').query({ studentId: 'student-demo-001', ticketId: id, since: start.body.data.nextCursor }).set(studentB);
      expect(spoof.body.data.events.filter((item: { ticketId: string }) => item.ticketId === id)).toEqual([]);
      // sem autenticação e com cursor inválido
      expect((await request(app).get('/api/support/me/events')).status).toBe(401);
      expect((await feed(studentB, 'me', 'cursor-invalido')).status).toBe(400);
    });

    it('nota interna nunca chega ao aluno: nem no chamado, nem no feed; a equipe vê', async () => {
      const { id } = await linkedTicket(studentA);
      const [startStudent, startStaff] = await Promise.all([feed(studentA, 'me'), feed(staff, 'staff')]);
      await request(app).post(`/api/support/staff/tickets/${id}/notes`).set(staff).send({ content: 'NOTA SIGILOSA DA EQUIPE' });
      const student = await feed(studentA, 'me', startStudent.body.data.nextCursor);
      expect(student.body.data.events.filter((item: { type: string }) => item.type === 'support.ticket.note_added')).toEqual([]);
      const team = await feed(staff, 'staff', startStaff.body.data.nextCursor);
      const note = team.body.data.events.find((item: { type: string; ticketId: string }) => item.type === 'support.ticket.note_added' && item.ticketId === id);
      expect(note).toMatchObject({ audience: 'STAFF_ONLY' });
      expect(JSON.stringify(team.body.data)).not.toContain('NOTA SIGILOSA');
      expect(JSON.stringify((await request(app).get(`/api/support/tickets/${id}`).set(studentA)).body)).not.toContain('NOTA SIGILOSA');
    });

    it('resposta só no WhatsApp não gera aviso nem "não lida" no app; o evento fica com a equipe', async () => {
      const { id } = await linkedTicket(studentA);
      const start = await feed(studentA, 'me');
      expect((await replyWhatsApp(id, 'SÓ NO WHATSAPP')).status).toBe(202);
      const student = await feed(studentA, 'me', start.body.data.nextCursor);
      expect(student.body.data.events.filter((item: { ticketId: string }) => item.ticketId === id)).toEqual([]);
      const view = await request(app).get(`/api/support/tickets/${id}`).set(studentA);
      expect(JSON.stringify(view.body)).not.toContain('SÓ NO WHATSAPP');
      expect(view.body.data.unreadCount).toBe(0);
      const notifications = await request(app).get('/api/support/notifications').set(studentA);
      expect(JSON.stringify(notifications.body)).not.toContain('SÓ NO WHATSAPP');
      await closeOpenOutbox();
    });

    it('log de eventos é só-inserção e não guarda conteúdo nem telefone', async () => {
      const from = freshContact();
      const id = await openTicketFor(from, 'CONTEÚDO PRIVADO DO ESTUDANTE');
      const { rows } = await db.pool.query('select data from support_event_log where ticket_id = $1', [id]);
      expect(rows.length).toBeGreaterThan(0);
      const stored = JSON.stringify(rows);
      expect(stored).not.toContain('CONTEÚDO PRIVADO');
      expect(stored).not.toContain(from);
      await expect(db.pool.query(`update support_event_log set data = '{}' where ticket_id = $1`, [id])).rejects.toThrow(/somente-inserção/);
    });

    it('cursor anterior ao que a retenção apagou pede recarga; depois do horizonte, não', async () => {
      const start = await feed(studentA, 'me');
      const old = start.body.data.nextCursor;
      await openTicketFor(freshContact());
      // nada apagado ainda: nenhum sinal de lacuna
      expect((await feed(studentA, 'me', old)).body.data.resyncRequired).toBe(false);
      const purged = await db.repos.supportFeed!.purgeOlderThan(new Date(Date.now() + 60_000));
      expect(purged).toBeGreaterThan(0);
      const after = await feed(studentA, 'me', old);
      expect(after.body.data.resyncRequired).toBe(true);
      // o cursor novo já está depois do que foi apagado
      expect((await feed(studentA, 'me', after.body.data.nextCursor)).body.data.resyncRequired).toBe(false);
    });

    it('conteúdo do webhook não fica guardado depois de processado', async () => {
      const from = freshContact();
      await simulate(from, 'TEXTO QUE NÃO DEVE FICAR NA INBOX', { providerEventId: `inbox-${from}` });
      const { rows } = await db.pool.query<{ status: string; payload_encrypted: string | null }>('select status, payload_encrypted from support_inbox_dedup where provider_event_id = $1', [`msg:inbox-${from}`]);
      expect(rows[0]).toEqual({ status: 'processed', payload_encrypted: null });
    });
  });

  describe('documentos', () => {
    it('anexo do WhatsApp entra só para a equipe; liberar exige vínculo; link expira; recusado nunca fica visível', async () => {
      const from = freshContact();
      await simulate(from, undefined as unknown as string, { kind: 'document' });
      const list = await request(app).get('/api/support/staff/tickets?channel=whatsapp&limit=50').set(staff);
      const id = (list.body.data.items as Array<{ id: string; staff: { contactLabel: string | null } }>).find((item) => item.staff.contactLabel?.endsWith(from.slice(-4)))!.id;
      let ticket = await staffTicket(id);
      const attachment = ticket.attachments[0];
      expect(attachment).toMatchObject({ mimeType: 'application/pdf', origin: 'whatsapp', studentVisible: false, reviewStatus: 'received', uploadedBy: 'contact' });
      expect(ticket.messages[0].attachments).toHaveLength(1);

      // sem vínculo não dá para liberar
      const noStudent = await request(app).patch(`/api/support/staff/tickets/${id}/attachments/${attachment.id}`).set(staff).send({ reviewStatus: 'released' });
      expect(noStudent.status).toBe(409);
      expect(noStudent.body.error.reason).toBe('student_not_linked');

      // equipe abre por link temporário assinado, e a abertura fica na auditoria
      const link = await request(app).get(`/api/support/staff/tickets/${id}/attachments/${attachment.id}/link`).set(staff);
      expect(link.status).toBe(200);
      const file = await request(app).get(link.body.data.url);
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toContain('application/pdf');
      expect(file.headers['content-security-policy']).toContain('sandbox');
      await new Promise((resolve) => setTimeout(resolve, 50));
      const audit = await db.pool.query(`select metadata from audit_events where action = 'ticket.attachment_accessed' and resource_id = $1`, [id]);
      expect(audit.rowCount).toBe(1);
      expect((await request(app).get(link.body.data.url.replace(/sig=[0-9a-f]+/, `sig=${'0'.repeat(64)}`))).status).toBe(403);

      // aluno vinculado sem liberação: nem metadados nem link
      const state = await request(app).get('/api/support/me/whatsapp').set(studentA);
      const pending = await request(app).post('/api/support/me/whatsapp/verifications').set(studentA).send({ consentAccepted: true, consentVersion: state.body.data.consentVersion });
      await simulate(from, pending.body.data.code);
      await request(app).post(`/api/support/me/whatsapp/verifications/${pending.body.data.id}/confirm`).set(studentA).send({ linkPreviousTickets: true });
      const mine = await request(app).get(`/api/support/tickets/${id}`).set(studentA);
      expect(mine.body.data.attachments).toEqual([]);
      expect((await request(app).get(`/api/support/tickets/${id}/attachments/${attachment.id}/link`).set(studentA)).status).toBe(404);
      expect((await request(app).get(`/api/support/tickets/${id}/attachments/${attachment.id}/link`).set(studentB)).status).toBe(404);

      // recusado continua invisível; liberado aparece e avisa
      const rejected = await request(app).patch(`/api/support/staff/tickets/${id}/attachments/${attachment.id}`).set(staff).send({ reviewStatus: 'rejected', studentVisible: true });
      expect(rejected.status).toBe(400);
      await request(app).patch(`/api/support/staff/tickets/${id}/attachments/${attachment.id}`).set(staff).send({ reviewStatus: 'rejected' });
      expect((await request(app).get(`/api/support/tickets/${id}`).set(studentA)).body.data.attachments).toEqual([]);
      const released = await request(app).patch(`/api/support/staff/tickets/${id}/attachments/${attachment.id}`).set(staff).send({ reviewStatus: 'released' });
      expect(released.status).toBe(200);
      ticket = await staffTicket(id);
      expect(ticket.attachments[0]).toMatchObject({ reviewStatus: 'released', studentVisible: true });
      const visible = await request(app).get(`/api/support/tickets/${id}`).set(studentA);
      expect(visible.body.data.attachments).toHaveLength(1);
      expect((await request(app).get(`/api/support/tickets/${id}/attachments/${attachment.id}/link`).set(studentA)).status).toBe(200);
      await request(app).delete(`/api/support/me/whatsapp/links/${(await request(app).get('/api/support/me/whatsapp').set(studentA)).body.data.links[0].id}`).set(studentA);
    });
  });

  describe('operação', () => {
    it('etiquetas, modelos de resposta aprovados, presença e métricas calculadas de eventos reais', async () => {
      const id = await openTicketFor(freshContact());
      const tagged = await request(app).put(`/api/support/staff/tickets/${id}/tags`).set(staff).send({ tags: ['Documentos', 'documentos', 'urgente'] });
      expect(tagged.body.data.tags).toEqual(['documentos', 'urgente']);
      const filtered = await request(app).get('/api/support/staff/tickets?tag=documentos&limit=50').set(staff);
      expect(filtered.body.data.items.map((item: { id: string }) => item.id)).toContain(id);
      expect((await staffTicket(id)).tags).toEqual(['documentos', 'urgente']);

      const draft = await request(app).post('/api/support/staff/saved-replies').set(staff).send({ title: 'Comprovante', body: 'Seu comprovante foi enviado.' });
      expect(draft.body.data.approvalStatus).toBe('draft');
      expect((await request(app).get('/api/support/staff/saved-replies').set(staff)).body.data.items.map((item: { id: string }) => item.id)).not.toContain(draft.body.data.id);
      await request(app).post(`/api/support/staff/saved-replies/${draft.body.data.id}/status`).set(staff).send({ approvalStatus: 'approved' });
      expect((await request(app).get('/api/support/staff/saved-replies').set(staff)).body.data.items.map((item: { id: string }) => item.id)).toContain(draft.body.data.id);
      expect((await request(app).post('/api/support/staff/saved-replies').set(studentA).send({ title: 'Teste', body: 'x' })).status).toBe(403);

      const presence = await request(app).post(`/api/support/staff/tickets/${id}/presence`).set(staff).send({ composing: true });
      expect(presence.body.data.viewers).toEqual([]);
      const someone = await db.pool.query<{ id: string; full_name: string }>(`select id, full_name from users where role = 'technical_admin' limit 1`);
      await db.repos.whatsapp!.touchPresence(id, someone.rows[0]!.id, true, new Date());
      const seen = await request(app).post(`/api/support/staff/tickets/${id}/presence`).set(staff).send({});
      expect(seen.body.data.viewers[0]).toMatchObject({ name: someone.rows[0]!.full_name, composing: true });

      const metrics = await request(app).get('/api/support/staff/whatsapp/metrics').set(staff);
      expect(metrics.status).toBe(200);
      expect(metrics.body.data.ticketsOpened).toBeGreaterThan(0);
      expect(metrics.body.data.inboundMessages).toBeGreaterThan(0);
      expect(metrics.body.data).toHaveProperty('medianFirstResponseMinutes');
      const health = await request(app).get('/api/admin/support/provider-health').set(admin);
      expect(health.body.data).toMatchObject({ provider: 'fake', demoMode: true });
      expect(health.body.data.outbox).toHaveProperty('pending');
    });

    it('reabertura pela equipe e transição inválida; chamado sem aluno não gera aviso', async () => {
      const id = await openTicketFor(freshContact());
      const resolved = await request(app).post(`/api/support/staff/tickets/${id}/resolve`).set(staff).send({ resolution: 'Resolvido no teste de reabertura.' });
      expect(resolved.status).toBe(200);
      const invalid = await request(app).post(`/api/support/staff/tickets/${id}/status`).set(staff).send({ status: 'in_progress' });
      expect(invalid.status).toBe(409);
      expect(invalid.body.error.reason).toBe('invalid_transition');
      const reopened = await request(app).post(`/api/support/staff/tickets/${id}/reopen`).set(staff).send({ reason: 'Faltou enviar o documento.' });
      expect(reopened.status).toBe(200);
      expect(reopened.body.data.status).toBe('reopened');
      const { rows } = await db.pool.query<{ total: number }>('select count(*)::int as total from support_notifications where ticket_id = $1', [id]);
      expect(rows[0]!.total).toBe(0);
    });

    it('painel conta mensagens de contato sem vínculo como não lidas; o CSV identifica o WhatsApp', async () => {
      await openTicketFor(freshContact());
      const dashboard = await request(app).get('/api/asa/dashboard').set(staff);
      expect(Number(JSON.stringify(dashboard.body.data).match(/"unreadFromStudents":(\d+)/)?.[1])).toBeGreaterThan(0);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const csv = await request(app).get(`/api/asa/reports/tickets.csv?from=${today}&to=${today}`).set(staff);
      expect(csv.status).toBe(200);
      expect(csv.text).toContain('WhatsApp');
    });

    it('administração continua vendo só metadados, inclusive de chamados sem estudante', async () => {
      const id = await openTicketFor(freshContact(), 'CONTEÚDO QUE A ADMINISTRAÇÃO NÃO LÊ');
      const list = await request(app).get('/api/admin/tickets?pageSize=100').set(admin);
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body)).not.toContain('CONTEÚDO QUE A ADMINISTRAÇÃO NÃO LÊ');
      expect(list.body.data.items.some((item: { id: string }) => item.id === id)).toBe(true);
    });

    it('tarefas agendadas rodam e são idempotentes', async () => {
      const first = await module.jobs['support-maintenance']!();
      expect(first).toHaveProperty('purgedEvents');
      expect(first).toHaveProperty('purgedFailedInbox');
      await expect(module.jobs['support-outbox']!()).resolves.toHaveProperty('sent');
      await expect(module.jobs['support-channel-health']!()).resolves.toHaveProperty('channels');
    });

    it('a reversão da migration é válida (executada em transação e desfeita)', async () => {
      const sql = readFileSync(path.join(resolveDatabaseDir(), 'rollback', '017_support_whatsapp.down.sql'), 'utf8');
      const client = await db.pool.connect();
      try {
        await client.query('begin');
        await client.query(sql);
        const { rows } = await client.query<{ total: number }>(`select count(*)::int as total from information_schema.tables where table_schema = current_schema() and table_name in ('support_channels', 'support_event_log', 'support_outbox')`);
        expect(rows[0]!.total).toBe(0);
        const column = await client.query(`select 1 from information_schema.columns where table_name = 'support_ticket_messages' and column_name = 'transport'`);
        expect(column.rowCount).toBe(0);
        await client.query('rollback');
      } finally {
        client.release();
      }
      const { rows } = await db.pool.query<{ total: number }>(`select count(*)::int as total from information_schema.tables where table_name = 'support_channels'`);
      expect(rows[0]!.total).toBe(1);
    });
  });

  function buildConfigWhatsApp() {
    return { ...buildTestConfig().whatsapp, provider: 'fake' as const, disabledReason: null, demoMode: true, outboundEnabled: true, sessionManagementEnabled: true, webhookSecret: 'segredo-de-teste-do-webhook-0123456789', piiKey: 'chave-de-teste-do-cofre-com-mais-de-32-caracteres' };
  }
});

describeDb('Central de Atendimento: espelhamento autorizado', () => {
  it('com autorização configurada, mensagens do WhatsApp de contato vinculado aparecem no app', async () => {
    const db = await prepareDatabase();
    try {
      const base = buildTestConfig();
      const { app } = createTestApp({
        repos: db.repos,
        configOverrides: { rateLimit: { enabled: false }, whatsapp: { ...base.whatsapp, provider: 'fake', disabledReason: null, demoMode: true, outboundEnabled: true, sessionManagementEnabled: true, mirrorToApp: true, webhookSecret: 'segredo-de-teste-do-webhook-0123456789', piiKey: 'chave-de-teste-do-cofre-com-mais-de-32-caracteres' } },
        whatsappOptions: { autoKick: false },
      });
      const admin = bearer((await loginAs(app, ADMIN, DEMO_PASSWORD)).accessToken);
      const staff = bearer((await loginAs(app, STAFF, DEMO_PASSWORD)).accessToken);
      const student = bearer((await loginAs(app, STUDENT_A, DEMO_PASSWORD)).accessToken);
      const channels = await request(app).get('/api/admin/support/channels').set(admin);
      const channelId = channels.body.data.items[0].id as string;
      await request(app).post('/api/admin/support/simulator/connection').set(admin).send({ channelId, status: 'CONNECTED' });
      const state = await request(app).get('/api/support/me/whatsapp').set(student);
      const pending = await request(app).post('/api/support/me/whatsapp/verifications').set(student).send({ consentAccepted: true, consentVersion: state.body.data.consentVersion });
      await request(app).post('/api/admin/support/simulator/inbound').set(admin).send({ channelId, from: OTHER_CONTACT, text: pending.body.data.code });
      await request(app).post(`/api/support/me/whatsapp/verifications/${pending.body.data.id}/confirm`).set(student).send({ linkPreviousTickets: false });
      await request(app).post('/api/admin/support/simulator/inbound').set(admin).send({ channelId, from: OTHER_CONTACT, text: 'Mensagem espelhada' });
      const list = await request(app).get('/api/support/tickets').set(student);
      const id = (list.body.data.items as Array<{ id: string; subject: string }>).find((item) => item.subject === 'Atendimento pelo WhatsApp')!.id;
      const mine = await request(app).get(`/api/support/tickets/${id}`).set(student);
      expect(mine.body.data.messages).toMatchObject([{ content: 'Mensagem espelhada', senderType: 'student', transport: 'whatsapp' }]);
      const reply = await request(app).post(`/api/support/staff/tickets/${id}/messages`).set(staff).send({ content: 'Resposta espelhada', transport: 'whatsapp', clientMessageId: 'espelho-0001' });
      expect(reply.status).toBe(202);
      expect((await request(app).get(`/api/support/tickets/${id}`).set(student)).body.data.messages.map((item: { content: string }) => item.content)).toContain('Resposta espelhada');
    } finally {
      await db.close();
    }
  });
});

