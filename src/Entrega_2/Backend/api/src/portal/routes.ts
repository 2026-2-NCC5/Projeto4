import { createHash, randomBytes } from 'node:crypto';
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { ok } from '../controllers/respond.js';
import { withTransaction, type DbPool } from '../db/pool.js';
import { RateLimitedError, UnauthorizedError, ValidationError } from '../errors/AppError.js';

export interface PortalRouteDeps { pool: DbPool; authed: RequestHandler; asStudent: RequestHandler }
type AsyncHandler = (req: Request, res: Response) => Promise<void>;
const wrap = (handler: AsyncHandler): RequestHandler => (req, res, next: NextFunction) => { handler(req, res).catch(next); };
const routeSchema = z.object({
  route: z.string().max(2048), title: z.string().max(300), category: z.string().max(80), parentRoute: z.string().max(2048).nullable(),
  depth: z.number().int().min(0).max(8), stateSignature: z.string().max(128), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  discoveredAt: z.string().datetime(), links: z.array(z.object({ label: z.string().max(300), url: z.string().max(2048), relation: z.string().max(40), inScope: z.boolean(), readOnlyCandidate: z.boolean() }).strict()).max(1000),
  tabs: z.array(z.string().max(300)).max(100), tables: z.array(z.object({ headers: z.array(z.string().max(300)).max(100), rows: z.array(z.array(z.string().max(1000)).max(100)).max(500) }).strict()).max(100),
  forms: z.array(z.unknown()).max(100), documents: z.array(z.unknown()).max(300), warnings: z.array(z.string().max(500)).max(100), text: z.string().max(20000),
}).strict();
const syncSchema = z.object({
  sessionId: z.string().min(1).max(128), startedAt: z.string().datetime(), finishedAt: z.string().datetime().nullable(),
  authStatus: z.string().max(40), scraplingVersion: z.string().max(40), parserVersion: z.string().max(40), pagesDiscovered: z.number().int().min(0).max(10000), pagesVisited: z.number().int().min(0).max(10000),
  recordsExtracted: z.number().int().min(0).max(100000), errors: z.array(z.object({ route: z.string().max(2048), code: z.string().max(100), message: z.string().max(500) }).strict()).max(500),
  routes: z.array(routeSchema).max(300),
}).strict();

function hashToken(token: string): Buffer { return createHash('sha256').update(token).digest(); }
function bearer(req: Request): string {
  const value = req.headers.authorization;
  if (!value?.startsWith('Bearer ')) throw new UnauthorizedError('Token de sincronização ausente.', 'missing_sync_token');
  return value.slice(7).trim();
}

export function createPortalRouter(deps: PortalRouteDeps): Router {
  const router = Router();
  const studentId = (req: Request) => req.student!.id;

  router.post('/api/v1/portal/connect', deps.authed, deps.asStudent, wrap(async (req, res) => {
    const token = randomBytes(32).toString('base64url');
    const digest = hashToken(token).toString('hex');
    const connectionId = await withTransaction(deps.pool, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into portal_connections(student_id,token_hash) values($1,$2)
         on conflict (student_id) where revoked_at is null do update set token_hash=excluded.token_hash, created_at=now()
         returning id`, [studentId(req), digest],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('Falha ao criar conexão do portal.');
      await client.query('insert into portal_audit_events(connection_id,action,outcome) values($1,$2,$3)', [id, 'portal.connection.created', 'success']);
      return id;
    });
    // O token é mostrado somente nesta resposta e é vinculado ao estudante autenticado.
    ok(req, res, { connectionId, syncToken: token, issuedAt: new Date().toISOString() }, 201);
  }));

  router.post('/api/v1/portal/sync', async (req, res, next) => {
    try {
      const parsed = syncSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw new ValidationError('Inventário inválido.', parsed.error.issues.map((issue) => ({ field: issue.path.join('.') || 'body', message: issue.message })));
      const tokenHash = hashToken(bearer(req));
      const { rows: connectionRows } = await deps.pool.query<{ id: string; student_id: string }>('select id,student_id from portal_connections where token_hash=$1 and revoked_at is null', [tokenHash.toString('hex')]);
      const connection = connectionRows[0];
      if (!connection) throw new UnauthorizedError('Token de sincronização inválido ou revogado.', 'invalid_sync_token');
      const input = parsed.data;
      const state = input.errors.length === 0 ? (input.finishedAt ? 'completed' : 'running') : (input.finishedAt ? 'partial' : 'running');
      const client = await deps.pool.connect();
      try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtext($1))', [connection.id]);
        const recent = await client.query<{ count: number }>(
          "select count(*)::int as count from portal_sync_sessions where connection_id=$1 and started_at > now()-interval '1 minute'",
          [connection.id],
        );
        if ((recent.rows[0]?.count ?? 0) >= 5) throw new RateLimitedError(60);
        const result = await client.query<{ id: string }>(
          `insert into portal_sync_sessions(connection_id,client_session_id,status,started_at,finished_at,pages_discovered,pages_visited,records_extracted,error_count,metadata)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
           on conflict(connection_id,client_session_id) do update set status=excluded.status,finished_at=excluded.finished_at,pages_discovered=excluded.pages_discovered,pages_visited=excluded.pages_visited,records_extracted=excluded.records_extracted,error_count=excluded.error_count,metadata=excluded.metadata
           returning id`, [connection.id, input.sessionId, state, input.startedAt, input.finishedAt, input.pagesDiscovered, input.pagesVisited, input.recordsExtracted, input.errors.length, JSON.stringify({ authStatus: input.authStatus, errors: input.errors })],
        );
        const syncId = result.rows[0]!.id;
        await client.query('delete from portal_discovered_routes where sync_session_id=$1', [syncId]);
        if (input.routes.length) await client.query(
          `insert into portal_discovered_routes(sync_session_id,route_key,route_data,content_hash)
           select $1, item->>'stateSignature', item, item->>'contentHash'
           from jsonb_array_elements($2::jsonb) as entries(item)`, [syncId, JSON.stringify(input.routes)],
        );
        await client.query('update portal_connections set last_sync_at=now() where id=$1', [connection.id]);
        await client.query('insert into portal_audit_events(connection_id,action,outcome,detail) values($1,$2,$3,$4::jsonb)', [connection.id, 'portal.sync.received', state, JSON.stringify({ sessionId: input.sessionId, routes: input.routes.length, errors: input.errors.length })]);
        await client.query('commit');
        res.status(202).json({ data: { syncId, status: state, routeCount: input.routes.length }, meta: { requestId: req.ctx?.requestId ?? 'portal-sync', correlationId: req.ctx?.correlationId ?? 'portal-sync' } });
      } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
    } catch (error) { next(error); }
  });

  router.get('/api/v1/portal/status', deps.authed, deps.asStudent, wrap(async (req, res) => {
    const { rows } = await deps.pool.query('select id as "connectionId",created_at as "connectedAt",last_sync_at as "lastSyncAt",revoked_at as "revokedAt" from portal_connections where student_id=$1 order by created_at desc limit 1', [studentId(req)]);
    ok(req, res, rows[0] ?? null);
  }));
  router.get('/api/v1/portal/navigation', deps.authed, deps.asStudent, wrap(async (req, res) => {
    const { rows } = await deps.pool.query(
      `select s.client_session_id as "sessionId",s.status,s.started_at as "startedAt",r.route_data as route
       from portal_connections c join portal_sync_sessions s on s.connection_id=c.id
       join portal_discovered_routes r on r.sync_session_id=s.id
       where c.student_id=$1
       and s.started_at=(select max(s2.started_at) from portal_sync_sessions s2 where s2.connection_id=c.id)
       order by (r.route_data->>'depth')::int, r.route_data->>'title'`, [studentId(req)],
    );
    ok(req, res, rows);
  }));
  router.get('/api/v1/portal/sync-history', deps.authed, deps.asStudent, wrap(async (req, res) => {
    const { rows } = await deps.pool.query(
      `select s.client_session_id as "sessionId",s.status,s.started_at as "startedAt",s.finished_at as "finishedAt",s.pages_discovered as "pagesDiscovered",s.pages_visited as "pagesVisited",s.records_extracted as "recordsExtracted",s.error_count as "errorCount"
       from portal_connections c join portal_sync_sessions s on s.connection_id=c.id where c.student_id=$1 order by s.started_at desc limit 50`, [studentId(req)],
    );
    ok(req, res, rows);
  }));
  router.delete('/api/v1/portal/connection', deps.authed, deps.asStudent, wrap(async (req, res) => {
    await withTransaction(deps.pool, async (client) => {
      const result = await client.query<{ id: string }>('update portal_connections set revoked_at=now() where student_id=$1 and revoked_at is null returning id', [studentId(req)]);
      for (const row of result.rows) await client.query('insert into portal_audit_events(connection_id,action,outcome) values($1,$2,$3)', [row.id, 'portal.connection.revoked', 'success']);
    });
    ok(req, res, { disconnected: true });
  }));
  return router;
}
