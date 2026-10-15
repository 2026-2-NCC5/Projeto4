import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { bearer, createTestApp, loginAs } from '../support/testApp.js';
import { USERS } from '../support/fixtures.js';

describe('endpoints do estudante', () => {
  it('GET /api/student/me devolve o perfil derivado da sessão', async () => {
    const { app } = createTestApp();
    const session = await loginAs(app);
    const response = await request(app).get('/api/student/me').set(bearer(session.accessToken));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: 'student-demo-001', fullName: 'Estudante Exemplo', registrationNumber: 'DEMO-2026-001', role: 'student' });
  });

  it('GET /api/student/summary agrega disciplinas, pendências, médias e última análise', async () => {
    const { app } = createTestApp();
    const session = await loginAs(app);
    const response = await request(app).get('/api/student/summary').set(bearer(session.accessToken));
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      subjectsCount: 2,
      pendingCount: 1,
      attentionCount: 0,
      averageScore: 7.6,
      averageAttendanceRate: 0.95,
      lastAnalysis: null,
    });
  });

  it('GET /api/student/subjects, assessments, attendance e pending-items retornam dados do próprio estudante', async () => {
    const { app } = createTestApp();
    const session = await loginAs(app);
    const subjects = await request(app).get('/api/student/subjects').set(bearer(session.accessToken));
    expect(subjects.status).toBe(200);
    expect(subjects.body.data).toHaveLength(2);
    expect(subjects.body.data[1]).toMatchObject({ id: 'subject-demo-002', name: 'Banco de Dados', averageScore: 7, attendanceRate: 1, pendingCount: 1, attention: false });

    const assessments = await request(app).get('/api/student/assessments').set(bearer(session.accessToken));
    expect(assessments.body.data).toHaveLength(3);

    const attendance = await request(app).get('/api/student/attendance').set(bearer(session.accessToken));
    expect(attendance.body.data[0]).toMatchObject({ subjectId: 'subject-demo-001', attendanceRate: 0.9 });

    const pending = await request(app).get('/api/student/pending-items').set(bearer(session.accessToken));
    expect(pending.body.data).toEqual([
      expect.objectContaining({ id: 'pending-demo-001', subjectName: 'Banco de Dados', status: 'pending' }),
    ]);
  });

  it('estudante sem dados recebe listas vazias e resumo nulo (EMPTY, não erro)', async () => {
    const { app } = createTestApp();
    const session = await loginAs(app, USERS.student6.email);
    const summary = await request(app).get('/api/student/summary').set(bearer(session.accessToken));
    expect(summary.status).toBe(200);
    expect(summary.body.data).toMatchObject({ subjectsCount: 0, pendingCount: 0, averageScore: null, averageAttendanceRate: null, lastAnalysis: null });
    const subjects = await request(app).get('/api/student/subjects').set(bearer(session.accessToken));
    expect(subjects.body.data).toEqual([]);
  });

  it('usuário institucional autenticado recebe 403 em recursos exclusivos de estudante', async () => {
    const { app } = createTestApp();
    const session = await loginAs(app, USERS.staff.email);
    expect(session.student).toBeNull();
    const response = await request(app).get('/api/student/summary').set(bearer(session.accessToken));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('rota inexistente devolve 404 no formato padrão', async () => {
    const { app } = createTestApp();
    const response = await request(app).get('/api/nao-existe');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.requestId).toMatch(/^req-/);
  });
});
