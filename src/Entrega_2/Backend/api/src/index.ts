import { attachDatabasePool } from '@vercel/functions';
import type { Express } from 'express';
import { createRuntime } from './runtime.js';

/**
 * Entrada da Vercel: o app Express vira uma Vercel Function (Fluid compute). Nada de app.listen nem de laços
 * no processo — a instância pode ser suspensa entre requisições:
 * - fila presencial sob demanda (cada leitura atualiza o estado; concessão no banco evita consultas duplicadas);
 * - varredura dos prazos e atualização da fila por /api/internal/jobs/* (Vercel Cron ou agendador externo);
 * - migrations fora do ciclo de requisições (npm run db:migrate no deploy, nunca na subida da função).
 *
 * É o arquivo que a Vercel detecta (src/index.ts com import de express); a fábrica do app fica em createApp.ts.
 */
const runtime = createRuntime('serverless');

// fecha as conexões ociosas antes de a instância ser suspensa (sem vazar conexões no pooler do banco)
attachDatabasePool(runtime.pool);

const app: Express = runtime.app;

export default app;
