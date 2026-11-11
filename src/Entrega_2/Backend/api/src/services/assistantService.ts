import { randomUUID } from 'node:crypto';
import type { IntentInterpreter } from '../assistant/interpretation.js';
import { validateInterpretation } from '../assistant/interpretation.js';
import { INTENT_KIND, isControlIntent } from '../assistant/intents.js';
import { limitSpeech, todayInTimezone } from '../assistant/phrasing.js';
import { academicUnavailable, RESPONDERS, SERVICE_SUGGESTIONS, SUGGESTIONS, type ResponderOutput } from '../assistant/responders.js';
import type { SubjectRef } from '../assistant/subjects.js';
import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import type {
  AssistantConversationContext,
  AssistantMessageRequest,
  AssistantResponse,
  AssistantIntent,
  AssistantNextAction,
} from '../contracts/mobileApi.v1.js';
import { AppError, UnauthorizedError } from '../errors/AppError.js';
import type { AiProviderRegistry, AIResponse } from '../ai/providers.js';
import { fallbackTerms, queryTerms } from '../knowledge/text.js';
import { normalizeText } from '../assistant/text.js';
import type { Repositories } from '../repositories/types.js';
import type { RequestContext } from '../types/domain.js';
import type { QueueAssistantSource } from '../assistant/queueResponders.js';
import type { AgentService } from './agentService.js';
import type { StudentService } from './studentService.js';

export function newInteractionId(): string {
  return `int-${randomUUID()}`;
}

/** Intenções que nunca são respondidas por artigo, mesmo em forma de pergunta de procedimento. */
const NEVER_FROM_KNOWLEDGE = new Set<AssistantIntent>(['greeting', 'request_human_help', 'access_other_student', 'open_screen']);

/**
 * Sem fonte acadêmica integrada, a pergunta sobre dados próprios vira a orientação oficial de onde consultá-los
 * (artigo publicado). A consulta é fixa por intenção: não depende de o aluno usar as palavras do artigo.
 */
const ACADEMIC_GUIDANCE_QUERY: Partial<Record<AssistantIntent, string>> = {
  // o artigo oficial "Acesso ao Portal do Aluno" diz que notas, faltas e quadro de horários ficam no Portal
  get_student_summary: 'acesso ao portal do aluno',
  get_subjects: 'acesso ao portal do aluno',
  get_subject_details: 'acesso ao portal do aluno',
  get_assessments: 'acesso ao portal do aluno',
  get_latest_grade: 'acesso ao portal do aluno',
  get_next_assessment: 'acesso ao portal do aluno',
  get_attendance: 'acesso ao portal do aluno',
  get_subject_attendance: 'acesso ao portal do aluno',
  // "Acesso ao Moodle": conteúdo das aulas e atividades
  get_pending_items: 'acesso ao moodle',
};

/** Hermes público: só perguntas (nada que leve a áreas logadas). */
const PUBLIC_SUGGESTIONS: AssistantNextAction[] = SERVICE_SUGGESTIONS.filter((action) => action.type === 'ask' && !/falar com/i.test(action.text));

/** Campos de uma resposta de artigo reaproveitados pelo Hermes público (sem chamado nem navegação). */
function publicFromOutput(output: ResponderOutput) {
  return {
    status: output.status, title: output.title, message: output.message, speech: output.speech,
    items: output.items ?? [], ...(output.sources ? { sources: output.sources } : {}), nextActions: output.nextActions ?? [],
  };
}

/** "Onde vejo / como consulto…": pergunta sobre ONDE ver os próprios dados, não sobre um serviço. */
const CONSULT_VERB = /\b(vejo|ver|consulto|consultar|acompanho|acompanhar|confiro|conferir|olho|olhar|acho|encontro)\b/;

/**
 * Consulta usada na base antes da intenção, ou null quando a intenção deve responder sozinha.
 * - procedimento comum ("como peço abono de faltas?") → o próprio texto;
 * - "onde vejo minhas notas?" → com dados acadêmicos, a intenção mostra os dados; sem eles, o artigo oficial de onde consultar.
 */
export function knowledgeFirstQuery(interpretation: { intent: AssistantIntent; details: { procedural?: boolean } }, text: string, academicAvailable: boolean): string | null {
  if (!interpretation.details.procedural || NEVER_FROM_KNOWLEDGE.has(interpretation.intent) || isControlIntent(interpretation.intent)) return null;
  const guidance = ACADEMIC_GUIDANCE_QUERY[interpretation.intent];
  if (guidance && CONSULT_VERB.test(normalizeText(text))) return academicAvailable ? null : guidance;
  return text;
}

/** Artigo oficial com os canais e o horário do ASA (gerado de database/content/asa_cesta_de_servicos.json). */
const OFFICIAL_CHANNELS_SLUG = 'canais-de-atendimento-do-asa';

/**
 * Pergunta de procedimento sem artigo exato que vira sugestões + chamado (em vez da intenção):
 * pedido administrativo ("como tranco a matrícula?") ou dúvida sobre provas/faltas que não é "onde vejo"
 * ("perdi a prova, o que fazer?"). Mostrar notas ou o Portal do Aluno não responderia.
 */
function procedureWithoutArticle(interpretation: { intent: AssistantIntent }, text: string, result: AIResponse | null): result is AIResponse {
  if (!result || relatedActions(result).length === 0) return false;
  if (interpretation.intent === 'administrative_request') return true;
  return Boolean(ACADEMIC_GUIDANCE_QUERY[interpretation.intent]) && !CONSULT_VERB.test(normalizeText(text));
}

/** Destinos que dependem de dados acadêmicos ou do Agente (vazios no modo institucional sem integração). */
const ACADEMIC_TARGETS = new Set<string>(['academic.subjects', 'academic.assessments', 'academic.attendance', 'academic.pending', 'subject', 'run', 'recommendation', 'history', 'assistant.analysis']);

function withoutAcademicScreens(actions: AssistantNextAction[]): AssistantNextAction[] {
  const kept = actions.filter((action) => action.type === 'ask' || (action.type === 'navigate' && !ACADEMIC_TARGETS.has(action.target)));
  return kept.length > 0 || actions.length === 0 ? kept : SERVICE_SUGGESTIONS;
}

const TALK_TO_ASA: AssistantNextAction = { type: 'ask', label: 'Quero falar com o ASA', text: 'Quero falar com alguém do ASA' };

/** Nenhum artigo responde com segurança: diz isso, sugere os assuntos mais próximos e propõe um chamado revisável. */
function knowledgeAbstention(text: string, result: AIResponse, academicAvailable: boolean): ResponderOutput {
  const related = relatedActions(result, 3);
  return {
    status: 'abstained',
    title: 'Não encontrei uma resposta confiável',
    message:
      related.length > 0
        ? 'Não encontrei um artigo do ASA que responda exatamente a essa pergunta. Veja se um destes assuntos ajuda ou, se preferir, preparo um chamado para a equipe — você revisa antes de enviar.'
        : 'Não encontrei esse assunto nos artigos publicados do ASA. Para não arriscar uma resposta errada, posso preparar um chamado para a equipe — você revisa antes de enviar.',
    speech: 'Não encontrei uma resposta confiável. Posso sugerir assuntos parecidos ou preparar um chamado para a equipe do ASA.',
    abstained: true,
    abstentionReason: 'low_confidence',
    handoff: { categoryId: 'asa_service', subject: text.slice(0, 110), description: text, reason: 'Pergunta sem resposta nos artigos publicados' },
    nextActions: related.length > 0 ? [...related, TALK_TO_ASA] : academicAvailable ? SUGGESTIONS : SERVICE_SUGGESTIONS,
  };
}

/** Artigos relacionados viram perguntas prontas (o título do artigo é a melhor consulta para ele). */
function relatedActions(result: AIResponse | null, limit = 2): AssistantNextAction[] {
  return (result?.related ?? []).slice(0, limit).map((item) => ({ type: 'ask' as const, label: item.title, text: item.title }));
}

/** Resposta montada a partir de um artigo publicado: orientação, passos, onde/quando e a fonte. */
export function knowledgeOutput(result: AIResponse, options: { intro?: string; nextActions?: AssistantNextAction[] } = {}): ResponderOutput {
  const answer = result.answer!;
  const steps = answer.steps.map((step, index) => ({
    id: `kb-step-${index + 1}`,
    title: answer.steps.length === 1 ? 'Como fazer' : `Passo ${index + 1}`,
    description: step,
    meta: null,
    badge: null,
    tone: 'neutral' as const,
    subjectId: null,
  }));
  const facts = answer.facts.map((fact, index) => ({
    id: `kb-fact-${index + 1}`,
    title: fact.label,
    description: fact.value,
    meta: null,
    badge: null,
    tone: 'info' as const,
    subjectId: null,
  }));
  const message = options.intro ? `${options.intro} ${answer.message}` : answer.message;
  return {
    status: 'success',
    title: answer.title,
    message,
    speech: limitSpeech(options.intro ? `${options.intro} ${answer.speech}` : answer.speech),
    items: [...steps, ...facts],
    sources: result.sources,
    nextActions: options.nextActions ?? [...relatedActions(result), TALK_TO_ASA],
  };
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
    /** fonte acadêmica integrada? (modo institucional sem integração = false) */
    private readonly academicAvailable: () => boolean = () => true,
  ) {}

  /** Consulta os artigos publicados; falha da base não derruba a conversa (vira "sem resposta"). */
  private async searchKnowledge(text: string, ctx: RequestContext, role: 'student' | 'public', logger?: Logger): Promise<AIResponse | null> {
    if (!this.ai || (queryTerms(text).length === 0 && fallbackTerms(text).length === 0)) return null;
    try {
      return await this.ai.generate({ kind: 'knowledge_question', text, locale: 'pt-BR' }, { requestId: ctx.requestId, correlationId: ctx.correlationId, role, timeoutMs: 3000 });
    } catch (error) {
      logger?.warn({ correlation_id: ctx.correlationId, error_type: error instanceof Error ? error.name : typeof error }, 'assistant knowledge search failed');
      return null;
    }
  }

  /**
   * Pergunta fora das intenções conhecidas: tenta a base de conhecimento (artigo publicado, com citação).
   * Sem resposta confiável e com uma pergunta de verdade (2+ termos), abstém-se, sugere os artigos mais
   * próximos e propõe encaminhamento ao ASA.
   */
  private async knowledgeFallback(text: string, ctx: RequestContext, logger: Logger, academicAvailable: boolean): Promise<{ intent: AssistantIntent; output: ResponderOutput } | null> {
    const result = await this.searchKnowledge(text, ctx, 'student', logger);
    if (!result) return null;
    if (result.status === 'answered' && result.answer) return { intent: 'knowledge_question', output: knowledgeOutput(result) };
    // fora do assunto da base (nenhum artigo relacionado): mantém a resposta oficial de "não entendi"
    const hasRelated = relatedActions(result).length > 0;
    if (queryTerms(text).length < 2 && !hasRelated) return null;
    if (result.abstentionReason !== 'low_confidence' && !hasRelated) return null;
    return { intent: 'unknown', output: knowledgeAbstention(text, result, academicAvailable) };
  }

  /** Telefone, WhatsApp, e-mail e horário publicados (artigo oficial de canais); null sem esse artigo na base. */
  private async officialChannels(ctx: RequestContext, role: 'student' | 'public', logger?: Logger): Promise<Pick<ResponderOutput, 'items' | 'sources'> | null> {
    const result = await this.searchKnowledge('canais e horario de atendimento do asa', ctx, role, logger);
    if (result?.status !== 'answered' || !result.answer || result.sources[0]?.slug !== OFFICIAL_CHANNELS_SLUG) return null;
    return { items: knowledgeOutput(result).items?.filter((item) => item.id.startsWith('kb-fact-')) ?? [], sources: result.sources };
  }

  /** Consulta acadêmica sem fonte integrada: orientação oficial de onde consultar (artigo) ou explicação + chamado. */
  private async academicGuidance(intent: AssistantIntent, text: string, ctx: RequestContext, logger: Logger): Promise<ResponderOutput> {
    const query = ACADEMIC_GUIDANCE_QUERY[intent];
    const result = query ? await this.searchKnowledge(query, ctx, 'student', logger) : null;
    const base = academicUnavailable({ questionText: text });
    if (result?.status === 'answered' && result.answer) {
      return {
        ...knowledgeOutput(result, { intro: 'Ainda não consigo ver seus dados acadêmicos aqui no ASA Conecta, mas veja como consultar pelo canal oficial:', nextActions: [...SERVICE_SUGGESTIONS.slice(0, 2), TALK_TO_ASA] }),
        abstentionReason: 'academic_source_unavailable',
      };
    }
    return base;
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

    const academicAvailable = this.academicAvailable();
    let output: ResponderOutput | null = null;
    try {
      // 1. "Como faço…/onde vejo…": o artigo publicado do ASA tem prioridade sobre a intenção (que segue como plano B).
      const firstQuery = knowledgeFirstQuery(interpretation, request.text, academicAvailable);
      if (firstQuery) {
        const result = await this.searchKnowledge(firstQuery, ctx, 'student', logger);
        if (result?.status === 'answered' && result.answer) {
          interpretation.intent = 'knowledge_question';
          output = knowledgeOutput(result);
        } else if (procedureWithoutArticle(interpretation, request.text, result)) {
          // "como tranco a matrícula?" / "perdi a prova, o que fazer?": pedido de orientação → artigos mais próximos + chamado
          interpretation.intent = 'unknown';
          output = knowledgeAbstention(request.text, result, academicAvailable);
        }
      }
      // 2. Dados acadêmicos sem fonte integrada: orienta em vez de falhar com 503.
      const kind = INTENT_KIND[interpretation.intent];
      if (!output && !academicAvailable && (kind === 'query' || kind === 'analysis') && interpretation.intent !== 'knowledge_question' && !interpretation.intent.startsWith('get_queue_')) {
        output = await this.academicGuidance(interpretation.intent, request.text, ctx, logger);
      }
      output ??= await RESPONDERS[interpretation.intent](
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
          academicAvailable,
        },
        { students: this.students, agents: this.agents, queue: this.queue },
      ).catch(async (error: unknown) => {
        // rede de segurança: qualquer consulta que esbarre na fonte acadêmica indisponível vira orientação
        if (error instanceof AppError && error.reason === 'academic_source_unavailable') return this.academicGuidance(interpretation.intent, request.text, ctx, logger);
        throw error;
      });
      if (interpretation.intent === 'request_human_help') {
        const channels = await this.officialChannels(ctx, 'student', logger);
        if (channels) output = { ...output, items: [...(output.items ?? []), ...(channels.items ?? [])], sources: channels.sources ?? [] };
      }
      if (interpretation.intent === 'unknown' && !interpretation.details.vagueReference) {
        const fallback = await this.knowledgeFallback(request.text, ctx, logger, academicAvailable);
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

    // sem fonte acadêmica, botões para telas de notas/frequência/disciplinas levariam a telas vazias
    if (!academicAvailable) output = { ...output, nextActions: withoutAcademicScreens(output.nextActions ?? []) };

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

    const academicAvailable = this.academicAvailable();
    if (interpretation.intent === 'greeting') {
      return this.publicResponse(request, ctx, {
        intent: 'greeting', confidence: interpretation.confidence, status: 'success', title: 'Olá! Eu sou o Hermes.',
        message: academicAvailable
          ? 'Posso orientar você sobre serviços, documentos, plataformas e atendimento da FECAP. Para consultar disciplinas, notas, frequência ou outros dados da sua vida acadêmica, entre no ASA Conecta.'
          : 'Posso orientar você sobre os serviços do ASA — documentos, matrícula, financeiro, bolsas, estágio, provas e plataformas da FECAP — com base nos artigos publicados. O que você precisa?',
        speech: academicAvailable
          ? 'Olá! Eu sou o Hermes. Posso ajudar com serviços e orientações gerais da FECAP. Para consultar seus dados acadêmicos, entre no ASA Conecta.'
          : 'Olá! Eu sou o Hermes. Posso orientar você sobre os serviços do ASA. O que você precisa?',
        nextActions: PUBLIC_SUGGESTIONS,
      });
    }

    if (interpretation.intent === 'help') {
      return this.publicResponse(request, ctx, {
        intent: 'help', confidence: interpretation.confidence, status: 'success', title: 'Como posso ajudar?',
        message: 'Posso responder dúvidas gerais com base nos artigos publicados do ASA, como orientações sobre serviços, documentos, plataformas e atendimento, e indicar o setor, o local e o horário de atendimento. Para abrir e acompanhar solicitações pessoais, entre no ASA Conecta.',
        speech: 'Posso orientar sobre serviços, documentos, plataformas e atendimento. Por exemplo: como emito o atestado de matrícula?',
        nextActions: PUBLIC_SUGGESTIONS,
      });
    }

    if (interpretation.intent === 'request_human_help') {
      const channels = await this.officialChannels(ctx, 'public');
      return this.publicResponse(request, ctx, {
        intent: 'request_human_help', confidence: interpretation.confidence, status: 'success', title: 'Fale com o ASA',
        message: channels
          ? 'Você pode falar com o ASA pelos canais oficiais abaixo. Para abrir e acompanhar solicitações acadêmicas pessoais pelo portal, entre no ASA Conecta.'
          : 'O canal institucional do ASA é sucessoalvarista@fecap.br. Para abrir e acompanhar solicitações acadêmicas pessoais pelo portal, entre no ASA Conecta.',
        speech: 'Você pode falar com o ASA pelo e-mail sucessoalvarista arroba fecap ponto br. Para solicitações acadêmicas pessoais, entre no ASA Conecta.',
        ...(channels ? { items: channels.items ?? [], sources: channels.sources ?? [] } : {}),
      });
    }

    // Pergunta geral ou de procedimento ("como faço…"): os artigos publicados respondem antes de qualquer exigência de sessão.
    const general = interpretation.intent === 'unknown' || interpretation.intent === 'knowledge_question';
    // sem sessão não há dados próprios: "onde vejo minhas notas?" recebe o artigo oficial de onde consultar
    const firstQuery = general ? request.text : knowledgeFirstQuery(interpretation, request.text, false);
    const result = firstQuery ? await this.searchKnowledge(firstQuery, ctx, 'public') : null;
    if (result?.status === 'answered' && result.answer) {
      return this.publicResponse(request, ctx, { intent: 'knowledge_question', confidence: result.confidence, ...publicFromOutput(knowledgeOutput(result, { nextActions: relatedActions(result) })) });
    }

    if (!general && procedureWithoutArticle(interpretation, request.text, result)) {
      return this.publicResponse(request, ctx, {
        intent: 'unknown', confidence: interpretation.confidence, status: 'abstained',
        title: 'Não encontrei uma orientação pública confiável',
        message: 'Não encontrei um artigo do ASA que responda exatamente a essa pergunta. Veja se um destes assuntos ajuda; você também pode falar com o ASA pelo e-mail sucessoalvarista@fecap.br.',
        speech: 'Não encontrei uma orientação pública confiável. Veja os assuntos sugeridos ou fale com o ASA.',
        abstained: true, abstentionReason: 'low_confidence', nextActions: relatedActions(result, 3),
      });
    }

    // Dados próprios: sem fonte acadêmica integrada, entrar não resolveria — orienta onde consultar pelo canal oficial.
    const kind = INTENT_KIND[interpretation.intent];
    if (!general && !academicAvailable && (kind === 'query' || kind === 'analysis') && !interpretation.intent.startsWith('get_queue_')) {
      const query = ACADEMIC_GUIDANCE_QUERY[interpretation.intent];
      const guidance = query ? await this.searchKnowledge(query, ctx, 'public') : null;
      if (guidance?.status === 'answered' && guidance.answer) {
        return this.publicResponse(request, ctx, {
          intent: 'knowledge_question', confidence: guidance.confidence,
          ...publicFromOutput(knowledgeOutput(guidance, { intro: 'O ASA Conecta ainda não mostra dados acadêmicos pessoais, mas veja como consultar pelo canal oficial:', nextActions: PUBLIC_SUGGESTIONS })),
        });
      }
    }

    // Qualquer outra intenção de leitura ou ação pessoal exige sessão.
    if (!general) {
      throw new UnauthorizedError('Entre no ASA Conecta para consultar informações da sua vida acadêmica.', 'student_login_required');
    }

    const related = relatedActions(result, 3);
    return this.publicResponse(request, ctx, {
      intent: 'unknown', confidence: interpretation.confidence, status: 'abstained',
      title: 'Não encontrei uma orientação pública confiável',
      message:
        related.length > 0
          ? 'Não encontrei um artigo do ASA que responda exatamente a essa pergunta. Veja se um destes assuntos ajuda; você também pode falar com o ASA pelo e-mail sucessoalvarista@fecap.br.'
          : 'Não encontrei um artigo publicado do ASA que responda com segurança. Você pode reformular a pergunta ou falar com o ASA pelo e-mail sucessoalvarista@fecap.br. Para solicitações pessoais, entre no ASA Conecta.',
      speech: 'Não encontrei uma orientação pública confiável. Você pode reformular a pergunta ou falar com o ASA.',
      abstained: true, abstentionReason: result?.abstentionReason ?? 'knowledge_unavailable',
      nextActions: related.length > 0 ? related : PUBLIC_SUGGESTIONS,
    });
  }

  private publicResponse(
    request: AssistantMessageRequest,
    ctx: RequestContext,
    input: {
      intent: AssistantIntent; confidence: number; status: AssistantResponse['status']; title: string; message: string; speech: string;
      items?: AssistantResponse['display']['items']; sources?: AssistantResponse['sources']; abstained?: boolean; abstentionReason?: string | null;
      nextActions?: AssistantNextAction[];
    },
  ): AssistantResponse {
    return {
      interactionId: newInteractionId(), requestId: ctx.requestId, correlationId: ctx.correlationId,
      inputType: request.inputType, intent: input.intent, intentConfidence: input.confidence, entities: {}, status: input.status,
      display: { title: input.title, message: input.message, items: input.items ?? [], recommendations: [] },
      speech: { text: limitSpeech(input.speech) }, nextActions: (input.nextActions ?? []).filter((action) => action.type === 'ask'), clientCommand: null, navigation: null,
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
