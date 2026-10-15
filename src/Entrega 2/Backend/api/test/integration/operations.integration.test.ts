import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareDatabase, TEST_DATABASE_URL, type DatabaseHandle } from '../support/database.js';
import { DEMO_PASSWORD } from '../support/fixtures.js';
import { bearer, buildTestConfig, createTestApp, loginAs } from '../support/testApp.js';
import { WebClient } from '../support/webClient.js';

const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

describeDb('integração operação do ASA ↔ PostgreSQL (painel, métricas, CSV, alunos atendidos)', () => {
  let db: DatabaseHandle;

  beforeAll(async () => {
    db = await prepareDatabase();
  });

  afterAll(async () => {
    await db?.close();
  });

  it('painel bate com o banco e lista chamados em risco ordenados pelo prazo', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const staff = await loginAs(app, 'atendente.asa@demo.asa', DEMO_PASSWORD);
    const response = await request(app).get('/api/asa/dashboard').set(bearer(staff.accessToken));
    expect(response.status).toBe(200);
    const { rows } = await db.pool.query<{ open: number; waiting: number }>(
      "select count(*) filter (where status not in ('resolved','closed','cancelled'))::int as open, count(*) filter (where status = 'waiting_student')::int as waiting from support_tickets",
    );
    expect(response.body.data.tickets.open).toBe(rows[0]!.open);
    expect(response.body.data.tickets.waitingStudent).toBe(rows[0]!.waiting);
    expect(response.body.data.source).toMatchObject({ dataMode: 'demo', timezone: 'America/Sao_Paulo' });
    const dues = response.body.data.atRisk.map((item: { sla: { dueAt: string } }) => item.sla.dueAt);
    expect([...dues].sort()).toEqual(dues);
  });

  it('métricas: série diária completa, indicadores do banco e origem declarada', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const admin = await loginAs(app, 'admin.plataforma@demo.asa', DEMO_PASSWORD);
    const response = await request(app).get('/api/asa/metrics?from=2026-09-01&to=2026-10-31').set(bearer(admin.accessToken));
    expect(response.status).toBe(200);
    const data = response.body.data;
    expect(data.series).toHaveLength(61);
    expect(data.series[0].date).toBe('2026-09-01');
    const created = data.series.reduce((sum: number, point: { created: number }) => sum + point.created, 0);
    expect(created).toBe(data.kpis.created);
    const { rows } = await db.pool.query<{ total: number }>(
      "select count(*)::int as total from support_tickets where created_at >= '2026-09-01T03:00:00Z' and created_at < '2026-11-01T03:00:00Z'",
    );
    expect(data.kpis.created).toBe(rows[0]!.total);
    expect(data.byCategory.every((item: { label: string }) => item.label.length > 0)).toBe(true);
    expect(data.source.description).toMatch(/support_tickets/);
  });

  it('CSV para a equipe: sem dados pessoais, com proteção contra fórmula e registrado na auditoria', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const web = new WebClient(app);
    await web.login('atendente.asa@demo.asa');
    const response = await web.get('/api/asa/reports/tickets.csv?from=2026-01-01&to=2026-12-31');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('chamados_2026-01-01_a_2026-12-31.csv');
    const body = response.text;
    expect(body.startsWith('﻿protocolo;aberto_em;')).toBe(true);
    expect(body).toMatch(/ASA-\d{4}-\d{5}/);
    expect(body).not.toMatch(/@demo\.asa|Estudante Exemplo|DEMO-2026-0/);
    const audit = await db.pool.query("select actor_role, metadata from audit_events where action = 'report.exported' order by seq desc limit 1");
    expect(audit.rows[0]).toMatchObject({ actor_role: 'institutional_staff' });
  });

  it('alunos atendidos: só quem tem histórico com o ASA, e cada consulta de contexto é auditada', async () => {
    const { app } = createTestApp({ repos: db.repos });
    const staff = await loginAs(app, 'atendente.asa@demo.asa', DEMO_PASSWORD);
    const list = await request(app).get('/api/asa/students?search=exemplo').set(bearer(staff.accessToken));
    expect(list.status).toBe(200);
    const item = list.body.data.items.find((row: { fullName: string }) => row.fullName === 'Estudante Exemplo');
    expect(item).toMatchObject({ registrationNumber: 'DEMO-2026-001' });
    const detail = await request(app).get(`/api/asa/students/${item.studentId}`).set(bearer(staff.accessToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.accessLogged).toBe(true);
    expect(detail.body.data.tickets.length).toBe(item.ticketsTotal);
    expect(JSON.stringify(detail.body.data)).not.toMatch(/averageScore|attendanceRate|assessments/);
    const audit = await db.pool.query("select resource_id from audit_events where action = 'student_context.viewed' order by seq desc limit 1");
    expect(audit.rows[0]?.resource_id).toBe(item.studentId);
    // aluno sem nenhum atendimento não aparece (finalidade)
    await db.pool.query(
      "insert into users (id, email, password_hash, full_name, role, is_demo) values ('00000000-0000-4000-8000-0000000000bb', 'sem.atendimento@demo.asa', 'x', 'Sem Atendimento', 'student', true) on conflict do nothing",
    );
    await db.pool.query("insert into students (id, user_id, registration_number) values ('student-sem-atendimento', '00000000-0000-4000-8000-0000000000bb', 'DEMO-2026-099') on conflict do nothing");
    expect((await request(app).get('/api/asa/students/student-sem-atendimento').set(bearer(staff.accessToken))).status).toBe(404);
  });

  it('modo demonstração desligado: chamados de contas fictícias somem da fila e dos indicadores', async () => {
    const base = buildTestConfig();
    const demoOff = createTestApp({ repos: db.repos, configOverrides: { demo: { ...base.demo, dataEnabled: false } } });
    // a equipe "real" só existe com o modo desligado: cria uma conta não-demo direto no banco
    await db.pool.query(
      "insert into users (id, email, password_hash, full_name, role) select '00000000-0000-4000-8000-0000000000aa', 'atendente.real@fecap.br', password_hash, 'Atendente Real', 'institutional_staff' from users where email = 'atendente.asa@demo.asa' on conflict do nothing",
    );
    const staff = await loginAs(demoOff.app, 'atendente.real@fecap.br', DEMO_PASSWORD);
    const queue = await request(demoOff.app).get('/api/support/staff/tickets').set(bearer(staff.accessToken));
    expect(queue.status).toBe(200);
    expect(queue.body.data.items).toHaveLength(0);
    const dashboard = await request(demoOff.app).get('/api/asa/dashboard').set(bearer(staff.accessToken));
    expect(dashboard.body.data.tickets.open).toBe(0);
    expect(dashboard.body.data.source.dataMode).toBe('institutional');
  });
});
