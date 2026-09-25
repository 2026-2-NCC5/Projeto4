import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AgentService } from '../services/agentService.js';
import { ok } from './respond.js';

/** Corpo vazio: a identidade do estudante vem da sessão; student_id no corpo é rejeitado. */
export const analyzeSchema = z.object({}).strict();

export function createAgentController(agents: AgentService) {
  return {
    async analyze(req: Request, res: Response): Promise<void> {
      const analysis = await agents.analyze(req.student!.id, req.ctx, req.log);
      ok(req, res, analysis, 201);
    },
    async recommendations(req: Request, res: Response): Promise<void> {
      ok(req, res, await agents.getLatest(req.student!.id));
    },
    async recommendation(req: Request, res: Response): Promise<void> {
      ok(req, res, await agents.getRecommendation(req.student!.id, String(req.params.id)));
    },
    async history(req: Request, res: Response): Promise<void> {
      const limit = Number(req.query.limit ?? 20);
      ok(req, res, await agents.listHistory(req.student!.id, Number.isFinite(limit) ? limit : 20));
    },
    async run(req: Request, res: Response): Promise<void> {
      ok(req, res, await agents.getRun(req.student!.id, String(req.params.runId)));
    },
  };
}
