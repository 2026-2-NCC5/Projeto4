import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { DbPool } from '../../src/db/pool.js';
import type { StudentRecord } from '../../src/types/domain.js';
import { createPortalRouter } from '../../src/portal/routes.js';

function testApp(pool: DbPool) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { ctx: { requestId: 'test-request', correlationId: 'test-correlation' } });
    next();
  });
  app.use(createPortalRouter({
    pool,
    authed: (_req, _res, next) => next(),
    asStudent: (req, _res, next) => {
      req.student = { id: 'student-owned-by-session' } as StudentRecord;
      next();
    },
  }));
  return app;
}

describe('Portal FECAP ASA API', () => {
  it('emite token pessoal uma vez e persiste somente seu hash', async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => ({ rows: sql.includes('portal_connections') ? [{ id: 'connection-id' }] : [] }));
    const pool = { connect: vi.fn(async () => ({ query, release: vi.fn() })) } as unknown as DbPool;
    const app = testApp(pool);
    const response = await request(app).post('/api/v1/portal/connect').send({});
    expect(response.status).toBe(201);
    expect(response.body.data.syncToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const connectionInsert = query.mock.calls.find(([sql]) => sql.includes('portal_connections'));
    expect(connectionInsert?.[1]?.[0]).toBe('student-owned-by-session');
    expect(connectionInsert?.[1]?.[1]).not.toBe(response.body.data.syncToken);
    expect(query.mock.calls.map(([sql]) => sql.trim().toLowerCase())).toEqual(expect.arrayContaining(['begin', 'commit']));
  });

  it('resolve status pelo estudante autenticado, sem aceitar identificador de outro usuário', async () => {
    const query = vi.fn(async (_sql: string, params?: unknown[]) => ({ rows: [{ connectionId: 'mine' }], owner: params?.[0] }));
    const response = await request(testApp({ query } as unknown as DbPool)).get('/api/v1/portal/status?studentId=someone-else');
    expect(response.status).toBe(200);
    expect(query.mock.calls[0]?.[1]?.[0]).toBe('student-owned-by-session');
    expect(response.body.data.connectionId).toBe('mine');
  });

  it('expõe capacidades honestas e não declara SSO ou integração acadêmica sem configuração', async () => {
    const response = await request(testApp({ query: vi.fn() } as unknown as DbPool)).get('/api/v1/portal/capabilities');
    expect(response.status).toBe(200);
    expect(response.body.data.officialAuthentication).toBe('not_configured');
    expect(response.body.data.officialApi).toBe('not_confirmed');
    expect(response.body.data.academicModules.grades).toBe('not_integrated');
    expect(response.body.data.officialPortalUrl).toBe('https://portal.fecap.br/');
  });

  it('recebe inventário validado com token pessoal e persiste sessão e rota numa transação', async () => {
    const connectionQuery = vi.fn(async () => ({ rows: [{ id: 'connection-id', student_id: 'student-owned-by-session' }] }));
    const clientQuery = vi.fn(async (sql: string, _params?: unknown[]) => ({ rows: sql.includes('portal_sync_sessions') ? [{ id: 'sync-id' }] : [] }));
    const pool = {
      query: connectionQuery,
      connect: vi.fn(async () => ({ query: clientQuery, release: vi.fn() })),
    } as unknown as DbPool;
    const payload = {
      sessionId: 'local-session-1', startedAt: '2026-10-31T10:00:00Z', finishedAt: '2026-10-31T10:00:10Z',
      authStatus: 'authenticated', scraplingVersion: '0.4.15', parserVersion: '0.1.0', recordsExtracted: 1,
      pagesDiscovered: 1, pagesVisited: 1, errors: [], routes: [{
        route: 'https://portal.fecap.br/#/home', title: 'Início', category: 'unclassified', parentRoute: null,
        depth: 0, stateSignature: 'state-1', contentHash: 'a'.repeat(64), discoveredAt: '2026-10-31T10:00:05Z',
        links: [], tabs: [], tables: [{ headers: ['Aviso'], rows: [['Conteúdo fictício']] }], forms: [], documents: [], warnings: [], text: 'Conteúdo fictício',
      }],
    };
    const response = await request(testApp(pool)).post('/api/v1/portal/sync').set('Authorization', 'Bearer personal-token').send(payload);
    expect(response.status).toBe(202);
    expect(response.body.data).toEqual({ syncId: 'sync-id', status: 'completed', routeCount: 1 });
    expect(connectionQuery).toHaveBeenCalledOnce();
    expect(clientQuery.mock.calls.map(([sql]) => sql.trim().toLowerCase())).toEqual(expect.arrayContaining(['begin', 'commit']));
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('portal_discovered_routes'), expect.any(Array));
    const persistedRoutes = clientQuery.mock.calls.find(([sql]) => sql.includes('insert into portal_discovered_routes'))?.[1]?.[1];
    expect(String(persistedRoutes)).not.toContain('Conteúdo fictício');
    expect(String(persistedRoutes)).not.toContain('portal.fecap.br/#/home');
    expect(String(persistedRoutes)).toContain('"title":"Início"');
  });
});
