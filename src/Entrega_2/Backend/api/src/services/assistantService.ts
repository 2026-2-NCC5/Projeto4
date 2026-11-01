import { randomUUID } from 'node:crypto';
import type { IntentInterpreter } from '../assistant/interpretation.js';
import { validateInterpretation } from '../assistant/interpretation.js';
import { isControlIntent } from '../assistant/intents.js';
import { limitSpeech, todayInTimezone } from '../assistant/phrasing.js';
import { RESPONDERS, SUGGESTIONS, type ResponderOutput } from '../assistant/responders.js';
import type { SubjectRef } from '../assistant/subjects.js';
import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import type {
  AssistantConversationContext,
  AssistantMessageRequest,
  AssistantResponse,
  AssistantIntent,
} from '../contracts/mobileApi.v1.js';
import { AppError, UnauthorizedError } from '../errors/AppError.js';
import type { AiProviderRegistry } from '../ai/providers.js';
import { queryTerms } from '../knowledge/text.js';
import type { Repositories } from '../repositories/types.js';
import type { RequestContext } from '../types/domain.js';
import type { QueueAssistantSource } from '../assistant/queueResponders.js';
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
    /** fila presencial do ASA (perguntas "quantas pessoas faltam para mim?") */
    private readonly queue: QueueAssistantSource | null = null,
    /** provedores de IA (base de conhecimento com citação; JEV planejado e desligado) */
    private readonly ai: AiProviderRegistry | null = null,
  ) {}

  /**
   * Pergunta fora das intenções conhecidas: tenta a base de conhecimento (artigo publicado, com citação).
   * Sem resposta confiável e com uma pergunta de verdade (2+ termos), abstém-se e propõe encaminhamento ao ASA.
   */
  private async knowledgeFallback(text: string, ctx: RequestContext): Promise<{ intent: AssistantIntent; output: ResponderOutput } | null> {
    if (!this.ai) return null;
    const terms = queryTerms(text);
    if (terms.length === 0) return null;
    const result = await this.ai.generate({ kind: 'knowledge_question', text, locale: 'pt-BR' }, { requestId: ctx.requestId, correlationId: ctx.correlationId, role: 'student', timeoutMs: 3000 });
    if (result.status === 'answered' && result.answer) {
      const answer = result.answer;
      return {
        intent: 'knowledge_question',
        output: {
          status: 'success',
          title: answer.title,
          message: answer.message,
          speech: limitSpeech(answer.speech),
          items: answer.steps.map((step, index) => ({ id: `kb-step-${index + 1}`, title: `Passo ${index + 1}`, description: step, meta: null, badge: null, tone: 'neutral' as const, subjectId: null })),
          sources: result.sources,
          nextActions: [{ type: 'ask', label: 'Quero falar com o ASA', text: 'Quero falar com alguém do ASA' }],
        },
      };
    }
    // fora do assunto da base (nenhum artigo relacionado): mantém a resposta oficial de "não entendi"
    if (terms.length < 2 || result.abstentionReason !== 'low_confidence') return null;
    return {
      intent: 'unknown',
      output: {
        status: 'abstained',
        title: 'Não encontrei uma resposta confiável',
        message:
          'Não encontrei esse assunto nos artigos publicados do ASA. Para não arriscar uma resposta errada, posso preparar um chamado para a equipe — você revisa antes de enviar.',
        speech: 'Não encontrei uma resposta confiável. Posso preparar um chamado para a equipe do ASA.',
        abstained: true,
        abstentionReason: 'low_confidence',
        handoff: { categoryId: 'asa_service', subject: text.slice(0, 110), description: text, reason: 'Pergunta sem resposta nos artigos publicados' },
        nextActions: SUGGESTIONS,
      },
    };
  }

  async handleMessage(
    student: { id: string; userId: string },
    request: AssistantMessageRequest,
    ctx: RequestContext,
    logger: Logger,
  ): Promise<AssistantResponse> {
    const startedAt = Date.now();
    const interactionId = newInteractionId();

    // Dados mínimos para interpretar: nomes das disciplinas (matrículas + catálogo público).
    const [enrollments, catalog, user, queueTracking] = await Promise.all([
      this.repos.students.listEnrollments(student.id),
      this.repos.students.listSubjectCatalog(),
      this.repos.users.findById(student.userId),
      this.queue?.enabled ? this.queue.isTracking(student.userId).catch(() => false) : Promise.resolve(false),
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
    const raw = await this.interpreter.interpret({ text: request.text, subjects, context, queueTracking, ...(request.currentScreen ? { currentScreen: request.currentScreen } : {}) });
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
          userId: student.userId,
          timeZone: this.config.assistant.timezone,
          userFullName: user?.fullName ?? '',
          interpretation,
          context,
          enrolled,
          today: todayInTimezone(this.config.assistant.timezone, this.clock()),
          requestContext: ctx,
          logger,
          questionText: request.text,
        },
        { students: this.students, agents: this.agents, queue: this.queue },
      );
      if (interpretation.intent === 'unknown' && !interpretation.details.vagueReference) {
        const fallback = await this.knowledgeFallback(request.text, ctx);
        if (fallback) {
          interpretation.intent = fallback.intent;
          output = fallback.output;
        }
      }
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
      ...(output.sources && output.sources.length > 0 ? { sources: output.sources } : {}),
      ...(output.handoff ? { handoff: output.handoff } : {}),
      provider: { id: this.ai?.selection.active ?? 'existing', label: this.ai?.active.label ?? 'Regras do ASA Conecta (sem LLM)' },
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

  /**
   * Hermes público: só saudação, orientação geral e artigos publicados. O interpretador precisa
   * autorizar a pergunta como pública; intenções acadêmicas e operacionais sempre pedem sessão.
   * Este fluxo não consulta cadastros de alunos, turmas, professores nem persiste a pergunta.
   */
  async handlePublicMessage(request: AssistantMessageRequest, ctx: RequestContext): Promise<AssistantResponse> {
    const raw = await this.interpreter.interpret({ text: request.text, subjects: [], context: {} });
    const interpretation = validateInterpretation(raw, { enrolledSubjectIds: new Set(), minConfidence: this.config.assistant.intentMinConfidence });

    if (interpretation.intent === 'access_other_student') {
      return this.publicResponse(request, ctx, {
        intent: 'access_other_student', confidence: interpretation.confidence, status: 'refused',
        title: 'Não posso consultar dados de outras pessoas',
        message: 'O Hermes não divulga informações acadêmicas de outros estudantes. Para consultar somente os seus próprios dados, entre no ASA Conecta.',
        speech: 'Não posso consultar dados acadêmicos de outras pessoas. Entre no ASA Conecta para ver os seus próprios dados.',
      });
    }

    if (interpretation.intent === 'greeting') {
      return this.publicResponse(request, ctx, {
        intent: 'greeting', confidence: interpretation.confidence, status: 'success', title: 'Olá! Eu sou o Hermes.',
        message: 'Posso orientar você sobre serviços, documentos, plataformas e atendimento da FECAP. Para consultar disciplinas, notas, frequência ou outros dados da sua vida acadêmica, entre no ASA Conecta.',
        speech: 'Olá! Eu sou o Hermes. Posso ajudar com serviços e orientações gerais da FECAP. Para consultar seus dados acadêmicos, entre no ASA Conecta.',
      });
    }

    if (interpretation.intent === 'help') {
      return this.publicResponse(request, ctx, {
        intent: 'help', confidence: interpretation.confidence, status: 'success', title: 'Como posso ajudar?',
        message: 'Posso responder dúvidas gerais com base nos artigos publicados do ASA, como orientações sobre serviços, documentos, plataformas e atendimento. Para consultar informações acadêmicas pessoais, você precisa entrar no ASA Conecta.',
        speech: 'Posso orientar sobre serviços, documentos, plataformas e atendimento. Para consultar notas, frequência ou disciplinas, entre no ASA Conecta.',
      });
    }

    if (interpretation.intent === 'request_human_help') {
      return this.publicResponse(request, ctx, {
        intent: 'request_human_help', confidence: interpretation.confidence, status: 'success', title: 'Fale com o ASA',
        message: 'O canal institucional do ASA é sucessoalvarista@fecap.br. Para abrir e acompanhar solicitações acadêmicas pessoais pelo portal, entre no ASA Conecta.',
        speech: 'Você pode falar com o ASA pelo e-mail sucessoalvarista arroba fecap ponto br. Para solicitações acadêmicas pessoais, entre no ASA Conecta.',
      });
    }

    // unknown pode ser uma pergunta geral elegível à base. Qualquer intenção de leitura ou ação pessoal exige sessão.
    if (interpretation.intent !== 'unknown' && interpretation.intent !== 'knowledge_question') {
      throw new UnauthorizedError('Entre no ASA Conecta para consultar informações da sua vida acadêmica.', 'student_login_required');
    }

    const result = this.ai
      ? await this.ai.generate({ kind: 'knowledge_question', text: request.text, locale: 'pt-BR' }, { requestId: ctx.requestId, correlationId: ctx.correlationId, role: 'public', timeoutMs: 3000 })
      : null;
    if (result?.status === 'answered' && result.answer) {
      return this.publicResponse(request, ctx, {
        intent: 'knowledge_question', confidence: result.confidence, status: 'success', title: result.answer.title,
        message: result.answer.message,
        speech: result.answer.speech,
        items: result.answer.steps.map((step, index) => ({ id: `kb-step-${index + 1}`, title: `Passo ${index + 1}`, description: step, meta: null, badge: null, tone: 'neutral', subjectId: null })),
        sources: result.sources,
      });
    }
    return this.publicResponse(request, ctx, {
      intent: 'unknown', confidence: interpretation.confidence, status: 'abstained',
      title: 'Não encontrei uma orientação pública confiável',
      message: 'Não encontrei um artigo publicado do ASA que responda com segurança. Você pode reformular a pergunta ou consultar os canais institucionais. Para informações acadêmicas pessoais, entre no ASA Conecta.',
      speech: 'Não encontrei uma orientação pública confiável. Você pode reformular a pergunta ou consultar os canais do ASA.',
      abstained: true, abstentionReason: result?.abstentionReason ?? 'knowledge_unavailable',
    });
  }

  private publicResponse(
    request: AssistantMessageRequest,
    ctx: RequestContext,
    input: {
      intent: AssistantIntent; confidence: number; status: AssistantResponse['status']; title: string; message: string; speech: string;
      items?: AssistantResponse['display']['items']; sources?: AssistantResponse['sources']; abstained?: boolean; abstentionReason?: string | null;
    },
  ): AssistantResponse {
    return {
      interactionId: newInteractionId(), requestId: ctx.requestId, correlationId: ctx.correlationId,
      inputType: request.inputType, intent: input.intent, intentConfidence: input.confidence, entities: {}, status: input.status,
      display: { title: input.title, message: input.message, items: input.items ?? [], recommendations: [] },
      speech: { text: limitSpeech(input.speech) }, nextActions: [], clientCommand: null, navigation: null,
      requiresHumanValidation: false, abstained: input.abstained ?? false, abstentionReason: input.abstentionReason ?? null,
      runId: null, context: {}, createdAt: this.clock().toISOString(),
      ...(input.sources?.length ? { sources: input.sources } : {}),
      provider: { id: this.ai?.selection.active ?? 'existing', label: this.ai?.active.label ?? 'Artigos publicados do ASA' },
    };
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
