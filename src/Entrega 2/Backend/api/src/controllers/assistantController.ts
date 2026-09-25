import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ASSISTANT_INTENTS } from '../assistant/intents.js';
import { SCREEN_CONTEXTS } from '../assistant/interpretation.js';
import type { AssistantMessageRequest } from '../contracts/mobileApi.v1.js';
import { NotFoundError } from '../errors/AppError.js';
import type { AssistantService } from '../services/assistantService.js';
import { ok } from './respond.js';

const contextId = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);

/**
 * Corpo estrito: campos desconhecidos (ex.: studentId) são rejeitados com 400.
 * O texto é tratado como dado não confiável.
 */
export const assistantMessageSchema = z
  .object({
    inputType: z.enum(['voice', 'text']),
    text: z.string().trim().min(1, 'A pergunta não pode ser vazia.').max(500, 'A pergunta deve ter no máximo 500 caracteres.'),
    conversationContext: z
      .object({
        lastIntent: z.enum(ASSISTANT_INTENTS).optional(),
        lastSubjectId: contextId.optional(),
        lastRecommendationId: contextId.optional(),
        lastRunId: contextId.optional(),
      })
      .strict()
      .optional(),
    currentScreen: z.enum(SCREEN_CONTEXTS).optional(),
    clientMetrics: z
      .object({ speechRecognitionMs: z.number().int().min(0).max(300_000).optional() })
      .strict()
      .optional(),
  })
  .strict();

export function assistantEnabled(enabled: boolean) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    if (!enabled) return next(new NotFoundError('O assistente conversacional está desabilitado neste ambiente.'));
    next();
  };
}

export function createAssistantController(assistant: AssistantService) {
  return {
    async message(req: Request, res: Response): Promise<void> {
      const body = req.body as AssistantMessageRequest;
      ok(req, res, await assistant.handleMessage(req.student!, body, req.ctx, req.log));
    },
  };
}
