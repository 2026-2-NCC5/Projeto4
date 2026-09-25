import { z } from 'zod';
import { ContractError } from '../errors/AppError.js';

/**
 * Contrato interno v1 Node.js ↔ Python Agent Service (snake_case).
 * Espelha contracts/agent/student-agent-{request,response}.v1.json.
 */
export const AGENT_CONTRACT_VERSION = '1.0';
export const AGENT_CONTRACT_SUPPORTED_MAJOR = 1;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato YYYY-MM-DD');

export const agentRequestSchema = z.object({
  contract_version: z.string().regex(/^1\.\d+$/),
  request_id: z.string().min(1),
  correlation_id: z.string().min(1),
  student_id: z.string().min(1),
  reference_date: isoDate.nullable().optional(),
  academic_context: z.object({
    subjects: z.array(
      z.object({
        id: z.string(),
        code: z.string(),
        name: z.string(),
        enrollment_status: z.enum(['active', 'completed', 'cancelled']).default('active'),
      }),
    ),
    pending_items: z.array(
      z.object({
        id: z.string(),
        subject_id: z.string().nullable(),
        type: z.string(),
        description: z.string().nullable(),
        due_date: isoDate.nullable(),
        status: z.enum(['pending', 'completed', 'overdue']),
      }),
    ),
    attendance: z.array(
      z.object({
        subject_id: z.string(),
        total_classes: z.number().int().min(0),
        attended_classes: z.number().int().min(0),
      }),
    ),
    assessments: z.array(
      z.object({
        id: z.string(),
        subject_id: z.string(),
        title: z.string(),
        type: z.enum(['exam', 'assignment', 'project', 'other']).default('other'),
        score: z.number().nullable(),
        max_score: z.number().positive(),
        applied_at: isoDate.nullable(),
      }),
    ),
  }),
});

export type AgentRequest = z.infer<typeof agentRequestSchema>;
export type AgentAcademicContext = AgentRequest['academic_context'];

export const agentEvidenceSchema = z.object({
  type: z.string(),
  description: z.string().min(1),
  source_reference: z.string().nullable(),
});

export const agentRecommendationSchema = z.object({
  id: z.string().regex(/^rec-/),
  type: z.string().min(1),
  message: z.string().min(1),
  evidence: z.array(agentEvidenceSchema).min(1),
  next_action: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  requires_human_validation: z.boolean(),
  priority: z.number().int().min(1),
  subject_id: z.string().nullable(),
});

export const agentResponseSchema = z
  .object({
    contract_version: z.string(),
    request_id: z.string(),
    correlation_id: z.string(),
    run_id: z.string().regex(/^run-/),
    agent: z.literal('student_agent'),
    agent_version: z.string().min(1),
    config_version: z.string().min(1),
    status: z.enum(['recommendation', 'no_action', 'abstained']),
    summary: z.string().min(1),
    recommendations: z.array(agentRecommendationSchema),
    confidence: z.number().min(0).max(1).nullable(),
    requires_human_validation: z.boolean(),
    abstained: z.boolean(),
    abstention_reason: z.string().nullable(),
    evaluated_at: z.string().min(1),
  })
  .strict();

export type AgentResponse = z.infer<typeof agentResponseSchema>;
export type AgentRecommendationDto = z.infer<typeof agentRecommendationSchema>;

export function parseContractMajor(version: unknown): number | null {
  if (typeof version !== 'string') return null;
  const head = version.split('.')[0] ?? '';
  return /^\d+$/.test(head) ? Number(head) : null;
}

/**
 * Valida a resposta do Agent Service. Rejeita explicitamente versões com
 * major diferente do suportado e qualquer payload fora do schema
 * (TASK-004 §25-26, §46-47). Nunca preenche campos ausentes.
 */
export function validateAgentResponse(payload: unknown, expectedRequestId?: string): AgentResponse {
  const version = (payload as { contract_version?: unknown } | null)?.contract_version;
  const major = parseContractMajor(version);
  if (major !== AGENT_CONTRACT_SUPPORTED_MAJOR) {
    throw new ContractError(
      `Versão de contrato incompatível: esperado ${AGENT_CONTRACT_SUPPORTED_MAJOR}.x, recebido ${typeof version === 'string' ? version : 'desconhecida'}.`,
      [{ field: 'contract_version', message: `esperado ${AGENT_CONTRACT_SUPPORTED_MAJOR}.x` }],
    );
  }
  const result = agentResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new ContractError('A resposta do serviço de análise não segue o contrato 1.x.', result.error.issues.slice(0, 10).map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    })));
  }
  if (expectedRequestId && result.data.request_id !== expectedRequestId) {
    throw new ContractError('A resposta do serviço de análise não corresponde à requisição enviada.', [
      { field: 'request_id', message: 'request_id divergente' },
    ]);
  }
  return result.data;
}
