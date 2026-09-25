import { z } from 'zod';
import type { AssistantConversationContext, AssistantEntities, AssistantIntent, AssistantScreenContext } from '../contracts/mobileApi.v1.js';
import { ASSISTANT_INTENTS } from './intents.js';
import type { SubjectRef } from './subjects.js';

export type PolicyReason = 'injection' | 'third_party';
export type AdminTarget = 'attendance' | 'grade' | 'enrollment' | 'record';

/** Detalhes internos da interpretação (não expostos ao mobile). */
export interface InterpretationDetails {
  policyReason?: PolicyReason;
  adminTarget?: AdminTarget;
  vagueReference?: boolean;
  unmatchedSubject?: string;
  subjectNotEnrolled?: boolean;
  ambiguousSubjectIds?: string[];
  followUp?: boolean;
  lowConfidence?: boolean;
  rejected?: boolean;
}

export interface Interpretation {
  intent: AssistantIntent;
  confidence: number;
  entities: AssistantEntities;
  details: InterpretationDetails;
}

export interface InterpreterInput {
  text: string;
  /** disciplinas matriculadas + catálogo (sem dados de outros estudantes) */
  subjects: SubjectRef[];
  context: AssistantConversationContext;
  /** tela visível no app quando a mensagem foi enviada (só desambigua perguntas curtas) */
  currentScreen?: AssistantScreenContext;
}

/**
 * Qualquer interpretador (regras hoje; LLM no futuro) devolve um objeto NÃO confiável.
 * A saída só é usada depois de `validateInterpretation`.
 */
export interface IntentInterpreter {
  readonly name: string;
  interpret(input: InterpreterInput): unknown | Promise<unknown>;
}

const idPattern = /^[A-Za-z0-9._:-]{1,128}$/;

/** Allow-list de destinos de navegação (mesma do contrato). */
export const NAVIGATION_TARGETS = [
  'home',
  'academic.subjects',
  'academic.assessments',
  'academic.attendance',
  'academic.pending',
  'assistant',
  'assistant.analysis',
  'services',
  'history',
  'profile',
  'subject',
  'recommendation',
  'run',
] as const;

/** Telas que o app pode informar como contexto. */
export const SCREEN_CONTEXTS = [
  'home',
  'academic.subjects',
  'academic.assessments',
  'academic.attendance',
  'academic.pending',
  'assistant',
  'services',
  'history',
  'profile',
  'recommendation',
  'run',
] as const;

const interpretationSchema = z
  .object({
    intent: z.enum(ASSISTANT_INTENTS),
    confidence: z.number().min(0).max(1),
    entities: z
      .object({
        subjectId: z.string().regex(idPattern).optional(),
        subjectName: z.string().min(1).max(120).optional(),
        period: z.enum(['today', 'tomorrow', 'this_week', 'next_week', 'overdue']).optional(),
        assessmentType: z.enum(['exam', 'assignment', 'project', 'other']).optional(),
        screen: z.enum(NAVIGATION_TARGETS).optional(),
      })
      .strict(),
    details: z
      .object({
        policyReason: z.enum(['injection', 'third_party']).optional(),
        adminTarget: z.enum(['attendance', 'grade', 'enrollment', 'record']).optional(),
        vagueReference: z.boolean().optional(),
        unmatchedSubject: z.string().max(120).optional(),
        subjectNotEnrolled: z.boolean().optional(),
        ambiguousSubjectIds: z.array(z.string().regex(idPattern)).max(10).optional(),
        followUp: z.boolean().optional(),
        lowConfidence: z.boolean().optional(),
        rejected: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export const UNKNOWN_INTERPRETATION: Interpretation = { intent: 'unknown', confidence: 0, entities: {}, details: {} };

/**
 * Validação obrigatória entre o interpretador e a execução:
 * schema estrito → allow-list de intenções → disciplina precisa pertencer ao estudante
 * → confiança mínima. Nada aqui pode definir identidade (não existe campo de estudante).
 */
export function validateInterpretation(
  raw: unknown,
  options: { enrolledSubjectIds: Set<string>; minConfidence: number },
): Interpretation {
  const parsed = interpretationSchema.safeParse(raw);
  if (!parsed.success) {
    return { ...UNKNOWN_INTERPRETATION, details: { rejected: true } };
  }
  const interpretation: Interpretation = {
    intent: parsed.data.intent,
    confidence: parsed.data.confidence,
    entities: { ...parsed.data.entities },
    details: { ...parsed.data.details },
  };

  if (interpretation.entities.subjectId && !options.enrolledSubjectIds.has(interpretation.entities.subjectId)) {
    delete interpretation.entities.subjectId;
    interpretation.details.subjectNotEnrolled = true;
  }
  if (interpretation.details.ambiguousSubjectIds) {
    interpretation.details.ambiguousSubjectIds = interpretation.details.ambiguousSubjectIds.filter((id) =>
      options.enrolledSubjectIds.has(id),
    );
  }
  if (interpretation.intent === 'open_screen' && !interpretation.entities.screen) {
    return { ...UNKNOWN_INTERPRETATION, details: { rejected: true } };
  }
  if (interpretation.intent !== 'unknown' && interpretation.confidence < options.minConfidence) {
    return {
      intent: 'unknown',
      confidence: interpretation.confidence,
      entities: {},
      details: { lowConfidence: true },
    };
  }
  return interpretation;
}
