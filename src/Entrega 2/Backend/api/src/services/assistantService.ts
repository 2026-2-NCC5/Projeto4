import { randomUUID } from 'node:crypto';
import type { IntentInterpreter } from '../assistant/interpretation.js';
import { validateInterpretation } from '../assistant/interpretation.js';
import { isControlIntent } from '../assistant/intents.js';
import { todayInTimezone } from '../assistant/phrasing.js';
import { RESPONDERS, type ResponderOutput } from '../assistant/responders.js';
import type { SubjectRef } from '../assistant/subjects.js';
import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import type {
  AssistantConversationContext,
  AssistantMessageRequest,
  AssistantResponse,
} from '../contracts/mobileApi.v1.js';
import { AppError } from '../errors/AppError.js';
import type { Repositories } from '../repositories/types.js';
import type { RequestContext } from '../types/domain.js';
import type { AgentService } from './agentService.js';
import type { StudentService } from './studentService.js';

export function newInteractionId(): string {
  return `int-${randomUUID()}`;
}

/**
 * Orquestra o assistente conversacional (voz ou texto usam exatamente o mesmo fluxo):
 *
 * texto → interpretador (não confiável) → validação (schema + allow-list + disciplina do estudante
 * + confiança mínima) → responder da intenção (consulta objetiva OU Agente para o Estudante)
 * → resposta estruturada para tela e voz → metadados persistidos (sem texto/áudio).
 *
 * A identidade do estudante vem SEMPRE da sessão; nada na mensagem altera autorização.
 */
export class AssistantService {
  constructor(
    private readonly repos: Repositories,
    private readonly students: StudentService,
    private readonly agents: AgentService,
    private readonly interpreter: IntentInterpreter,
    private readonly config: AppConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async handleMessage(
    student: { id: string; userId: string },
    request: AssistantMessageRequest,
    ctx: RequestContext,
    logger: Logger,
  ): Promise<AssistantResponse> {
    const startedAt = Date.now();
    const interactionId = newInteractionId();

    // Dados mínimos para interpretar: nomes das disciplinas (matrículas + catálogo público).
    const [enrollments, catalog, user] = await Promise.all([
      this.repos.students.listEnrollments(student.id),
      this.repos.students.listSubjectCatalog(),
      this.repos.users.findById(student.userId),
    ]);
    const enrolled: SubjectRef[] = enrollments
      .filter((item) => item.status === 'active')
      .map((item) => ({ id: item.subjectId, code: item.code, name: item.name, enrolled: true }));
    const enrolledIds = new Set(enrolled.map((subject) => subject.id));
    const subjects: SubjectRef[] = [
      ...enrolled,
      ...catalog.filter((item) => !enrolledIds.has(item.id)).map((item) => ({ ...item, enrolled: false })),
    ];

    const context = this.sanitizeContext(request.conversationContext ?? {}, enrolledIds);

    const intentStartedAt = Date.now();
    const raw = await this.interpreter.interpret({ text: request.text, subjects, context, ...(request.currentScreen ? { currentScreen: request.currentScreen } : {}) });
    const interpretation = validateInterpretation(raw, {
      enrolledSubjectIds: enrolledIds,
      minConfidence: this.config.assistant.intentMinConfidence,
    });
    const intentDurationMs = Date.now() - intentStartedAt;

    let output: ResponderOutput;
    try {
      output = await RESPONDERS[interpretation.intent](
        {
          studentId: student.id,
          userFullName: user?.fullName ?? '',
          interpretation,
          context,
          enrolled,
          today: todayInTimezone(this.config.assistant.timezone, this.clock()),
          requestContext: ctx,
          logger,
        },
        { students: this.students, agents: this.agents },
      );
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
      await this.persist({
        interactionId, studentId: student.id, request, ctx, intent: interpretation.intent, confidence: interpretation.confidence,
        status: `error:${code}`, runId: null, intentDurationMs, agentDurationMs: null, totalDurationMs: Date.now() - startedAt,
      }, logger);
      logger.warn(
        { interaction_id: interactionId, intent: interpretation.intent, status: 'error', code, input_type: request.inputType, total_duration_ms: Date.now() - startedAt },
        'assistant interaction failed',
      );
      throw error;
    }

    const nextContext: AssistantConversationContext = isControlIntent(interpretation.intent)
      ? context
      : { ...context, ...output.contextPatch, lastIntent: interpretation.intent };

    const response: AssistantResponse = {
      interactionId,
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      inputType: request.inputType,
      intent: interpretation.intent,
      intentConfidence: Math.round(interpretation.confidence * 100) / 100,
      entities: interpretation.entities,
      status: output.status,
      display: {
        title: output.title,
        message: output.message,
        items: output.items ?? [],
        recommendations: output.recommendations ?? [],
      },
      speech: { text: output.speech },
      nextActions: output.nextActions ?? [],
      clientCommand: output.clientCommand ?? null,
      navigation: output.navigation ?? null,
      requiresHumanValidation: output.requiresHumanValidation ?? false,
      abstained: output.abstained ?? false,
      abstentionReason: output.abstentionReason ?? null,
      runId: output.runId ?? null,
      context: nextContext,
      createdAt: new Date().toISOString(),
    };

    const totalDurationMs = Date.now() - startedAt;
    await this.persist({
      interactionId, studentId: student.id, request, ctx, intent: response.intent, confidence: interpretation.confidence,
      status: response.status, runId: response.runId, intentDurationMs, agentDurationMs: output.agentDurationMs ?? null, totalDurationMs,
    }, logger);

    // Observabilidade: apenas identificadores e métricas — nunca o texto da pergunta ou da resposta.
    logger.info(
      {
        interaction_id: interactionId,
        run_id: response.runId,
        intent: response.intent,
        intent_confidence: response.intentConfidence,
        interpreter: this.interpreter.name,
        status: response.status,
        input_type: request.inputType,
        speech_recognition_duration_ms: request.clientMetrics?.speechRecognitionMs ?? null,
        intent_duration_ms: intentDurationMs,
        agent_duration_ms: output.agentDurationMs ?? null,
        total_duration_ms: totalDurationMs,
      },
      'assistant interaction',
    );
    return response;
  }

  /** Contexto vem do cliente: descarta disciplina que não pertence ao estudante. */
  private sanitizeContext(context: AssistantConversationContext, enrolledIds: Set<string>): AssistantConversationContext {
    const sanitized: AssistantConversationContext = { ...context };
    if (sanitized.lastSubjectId && !enrolledIds.has(sanitized.lastSubjectId)) delete sanitized.lastSubjectId;
    return sanitized;
  }

  private async persist(
    input: {
      interactionId: string;
      studentId: string;
      request: AssistantMessageRequest;
      ctx: RequestContext;
      intent: string;
      confidence: number;
      status: string;
      runId: string | null;
      intentDurationMs: number;
      agentDurationMs: number | null;
      totalDurationMs: number;
    },
    logger: Logger,
  ): Promise<void> {
    try {
      await this.repos.assistantInteractions.save({
        interactionId: input.interactionId,
        studentId: input.studentId,
        inputType: input.request.inputType,
        intent: input.intent,
        intentConfidence: Math.round(input.confidence * 1000) / 1000,
        status: input.status,
        runId: input.runId,
        requestId: input.ctx.requestId,
        correlationId: input.ctx.correlationId,
        speechRecognitionMs: input.request.clientMetrics?.speechRecognitionMs ?? null,
        intentDurationMs: input.intentDurationMs,
        agentDurationMs: input.agentDurationMs,
        totalDurationMs: input.totalDurationMs,
        createdAt: new Date(),
      });
    } catch (error) {
      // Metadados de observabilidade não podem derrubar a resposta ao estudante.
      logger.error({ interaction_id: input.interactionId, status: 'persist_failed', error_type: error instanceof Error ? error.name : 'unknown' }, 'assistant interaction metadata not persisted');
    }
  }
}
