import type { AppConfig } from '../config/env.js';
import type { AssistantSource, UserRole } from '../contracts/mobileApi.v1.js';
import type { Logger } from '../config/logger.js';
import type { KnowledgeService } from '../knowledge/service.js';
import type { AssistantProviderStatus } from '../platform/platformService.js';

/**
 * Camada de provedores de IA do assistente (ver documentos/.../adr/JEV_INTEGRATION_ADR.md).
 * Hoje só existe o provedor "existing": regras determinísticas + base de conhecimento com busca lexical,
 * sem LLM. O JEV está PLANEJADO: o adaptador existe só como contrato desligado, sem chamadas de rede,
 * e nunca produz resposta. Com AI_PROVIDER=jev sem configuração completa, o registro volta para o
 * provedor existente e informa o motivo — nenhuma resposta é rotulada como do JEV.
 */
export type ProviderId = 'existing' | 'jev';

export interface ProviderCapabilities {
  knowledgeAnswers: boolean;
  freeTextGeneration: boolean;
  citations: boolean;
  /** ferramentas de ESCRITA nunca são executadas por provedor: só propostas com confirmação humana */
  writeActions: false;
}

export interface ProviderHealth {
  status: 'operational' | 'not_configured' | 'disabled' | 'degraded' | 'error';
  detail: string;
  checkedAt: string;
}

export interface AIRequest {
  kind: 'knowledge_question';
  /** pergunta do aluno (texto já limitado pela API); nunca vai para logs */
  text: string;
  locale: 'pt-BR';
}

export interface AIRequestContext {
  requestId: string;
  correlationId: string;
  role: UserRole;
  timeoutMs: number;
}

export interface AIAnswer {
  title: string;
  message: string;
  steps: string[];
  speech: string;
}

export interface AIResponse {
  status: 'answered' | 'abstained';
  providerId: ProviderId;
  answer: AIAnswer | null;
  sources: AssistantSource[];
  /** 0–1: cobertura dos termos da pergunta pelo artigo (não é probabilidade calibrada) */
  confidence: number;
  abstentionReason: string | null;
}

export interface AIProviderAdapter {
  readonly id: ProviderId;
  readonly label: string;
  capabilities(): Promise<ProviderCapabilities>;
  health(): Promise<ProviderHealth>;
  generate(request: AIRequest, context: AIRequestContext): Promise<AIResponse>;
}

export class ProviderUnavailableError extends Error {
  constructor(readonly providerId: ProviderId, reason: string) {
    super(`provider ${providerId} unavailable: ${reason}`);
    this.name = 'ProviderUnavailableError';
  }
}

/** Limiares da resposta pela base de conhecimento (abstenção quando não atingidos). */
export const KNOWLEDGE_THRESHOLDS = { minCoverage: 0.5, minScore: 0.02 } as const;

/** Provedor atual: base de conhecimento do ASA com busca lexical e citação; abstém sem artigo confiável. */
export class RuleBasedKnowledgeAdapter implements AIProviderAdapter {
  readonly id = 'existing' as const;
  readonly label = 'Regras do ASA Conecta e base de conhecimento (sem LLM)';

  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly now: () => Date,
  ) {}

  async capabilities(): Promise<ProviderCapabilities> {
    return { knowledgeAnswers: this.knowledge.available, freeTextGeneration: false, citations: true, writeActions: false };
  }

  async health(): Promise<ProviderHealth> {
    return this.knowledge.available
      ? { status: 'operational', detail: 'Busca lexical na base de conhecimento (PostgreSQL).', checkedAt: this.now().toISOString() }
      : { status: 'degraded', detail: 'Base de conhecimento indisponível sem PostgreSQL; respostas só por regras.', checkedAt: this.now().toISOString() };
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const { answer: match, candidates } = await this.knowledge.bestAnswer(request.text, KNOWLEDGE_THRESHOLDS);
    if (!match) {
      // low_confidence: há artigos relacionados, mas nenhum cobre a pergunta; knowledge_not_found: assunto fora da base
      return { status: 'abstained', providerId: this.id, answer: null, sources: [], confidence: 0, abstentionReason: candidates > 0 ? 'low_confidence' : 'knowledge_not_found' };
    }
    const version = match.article.shown;
    return {
      status: 'answered',
      providerId: this.id,
      answer: { title: version.title, message: version.summary, steps: match.steps, speech: version.summary },
      sources: [
        {
          type: 'knowledge_article',
          articleId: match.article.id,
          slug: match.article.slug,
          title: version.title,
          version: version.version,
          publishedAt: match.article.publishedAt?.toISOString() ?? null,
          sourceLabel: version.sourceLabel,
          sourceUrl: version.sourceUrl,
        },
      ],
      confidence: Math.round(match.coverage * 100) / 100,
      abstentionReason: null,
    };
  }
}

/**
 * JEV: integração FUTURA. Não há especificação técnica (endpoint, autenticação, contrato, privacidade)
 * no material do projeto, então este adaptador não faz chamadas e não inventa capacidades.
 */
export class JevAdapter implements AIProviderAdapter {
  readonly id = 'jev' as const;
  readonly label = 'JEV (integração futura — não configurada)';

  constructor(
    private readonly enabled: boolean,
    private readonly now: () => Date,
  ) {}

  /** Só seria "configurado" com um contrato técnico aprovado — inexistente hoje. */
  get configured(): boolean {
    return false;
  }

  async capabilities(): Promise<ProviderCapabilities> {
    return { knowledgeAnswers: false, freeTextGeneration: false, citations: false, writeActions: false };
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: this.enabled ? 'not_configured' : 'disabled',
      detail: this.enabled
        ? 'JEV_ENABLED=true, mas não há contrato técnico/credenciais definidos. O assistente usa o provedor existente.'
        : 'Integração planejada e desligada (JEV_ENABLED=false).',
      checkedAt: this.now().toISOString(),
    };
  }

  async generate(): Promise<AIResponse> {
    throw new ProviderUnavailableError('jev', this.enabled ? 'not_configured' : 'disabled');
  }
}

export interface ProviderSelection {
  requested: ProviderId;
  active: ProviderId;
  /** por que o pedido não foi atendido (null = provedor pedido está ativo) */
  fallbackReason: 'jev_disabled' | 'jev_not_configured' | null;
}

/** Escolhe o provedor ativo com fallback seguro e expõe o estado para o painel e /api/platform/info. */
export class AiProviderRegistry {
  readonly existing: RuleBasedKnowledgeAdapter;
  readonly jev: JevAdapter;
  readonly selection: ProviderSelection;

  constructor(
    config: AppConfig,
    knowledge: KnowledgeService,
    private readonly logger: Logger,
    now: () => Date,
  ) {
    this.existing = new RuleBasedKnowledgeAdapter(knowledge, now);
    this.jev = new JevAdapter(config.ai.jevEnabled, now);
    const requested = config.ai.provider;
    const fallbackReason = requested === 'jev' ? (!config.ai.jevEnabled ? 'jev_disabled' : !this.jev.configured ? 'jev_not_configured' : null) : null;
    this.selection = { requested, active: fallbackReason ? 'existing' : requested, fallbackReason };
    if (fallbackReason) this.logger.warn({ requested, active: 'existing', reason: fallbackReason }, 'ai provider fallback');
  }

  get active(): AIProviderAdapter {
    return this.selection.active === 'jev' ? this.jev : this.existing;
  }

  /** Estado público (sem segredos) para /api/platform/info. */
  status(): AssistantProviderStatus {
    return {
      provider: this.selection.active,
      providerLabel: this.active.label,
      jev: { status: this.selection.requested === 'jev' || this.jev.configured ? 'not_configured' : 'planned', enabled: false },
    };
  }

  /** Gera com o provedor ativo; se um provedor externo falhar, usa o existente (a resposta diz qual respondeu). */
  async generate(request: AIRequest, context: AIRequestContext): Promise<AIResponse> {
    const adapter = this.active;
    try {
      return await adapter.generate(request, context);
    } catch (error) {
      if (adapter.id === 'existing') throw error;
      this.logger.warn({ provider: adapter.id, correlation_id: context.correlationId, error_type: error instanceof Error ? error.name : typeof error }, 'ai provider failed, using existing');
      return this.existing.generate(request);
    }
  }
}
