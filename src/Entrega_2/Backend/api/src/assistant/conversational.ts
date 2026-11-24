import type { JsonModelClient } from '../ai/gemini.js';
import type { AssistantHistoryTurn, AssistantInputType } from '../contracts/mobileApi.v1.js';
import type { GroundingArticle } from '../knowledge/service.js';

/**
 * Camada de conversa natural do assistente (LLM).
 *
 * O LLM NÃO decide autorização nem consulta dados: ele recebe a pergunta, os últimos turnos, a resposta
 * que as regras do ASA já montaram (rascunho) e os artigos oficiais mais próximos, e devolve o texto da
 * resposta em linguagem natural. Fatos institucionais só podem vir dos artigos ou do rascunho; sem base,
 * ele diz que não encontrou e o app mantém o encaminhamento para a equipe do ASA.
 *
 * Privacidade: só é chamada para respostas SEM dados acadêmicos pessoais (ver `isConversationalEligible`
 * no AssistantService) e nada aqui é registrado em log.
 */
export interface ConversationalDraft {
  title: string;
  message: string;
  status: string;
  /** passos/fatos já exibidos pela resposta das regras */
  items: Array<{ title: string; description: string | null }>;
}

export interface ConversationalInput {
  question: string;
  inputType: AssistantInputType;
  history: AssistantHistoryTurn[];
  draft: ConversationalDraft;
  articles: GroundingArticle[];
  /** data de hoje (AAAA-MM-DD, fuso da instituição) para a IA não tratar prazo vencido como aberto */
  today?: string;
}

export interface ConversationalReply {
  title: string;
  message: string;
  speech: string;
  /** o rascunho das regras responde à pergunta (o texto só foi reescrito) */
  useDraft: boolean;
  /** a resposta se apoia nos artigos/rascunho fornecidos (false = não encontrou base oficial) */
  grounded: boolean;
  /** slugs dos artigos usados (só os fornecidos são aceitos) */
  sourceSlugs: string[];
}

export const MAX_HISTORY_TURNS = 6;
const MAX_MESSAGE_CHARS = 1_800;
const MAX_SPEECH_CHARS = 450;

export const CONVERSATIONAL_SYSTEM_PROMPT = `Você é a assistente virtual do ASA — Atendimento e Sucesso do Aluno da FECAP — dentro do app ASA Conecta.
Converse em português do Brasil de forma natural, acolhedora e objetiva, como uma pessoa experiente da equipe do ASA conversando com um estudante.

COMO ENTENDER
- A pergunta pode vir de reconhecimento de voz: pode ter palavras trocadas, sem pontuação ou cortadas. Interprete a intenção mais provável pelo contexto (ex.: "trancar a matricula", "abono de falta", "segunda chamada").
- Use os turnos anteriores para entender continuações ("e o horário?", "e se eu perder o prazo?").
- Se a pergunta estiver realmente ambígua, faça UMA pergunta curta de esclarecimento.

DE ONDE VÊM OS FATOS (regra obrigatória)
- Prazos, valores, setores, locais, horários, telefones, e-mails, links, documentos e regras da FECAP/ASA só podem vir da BASE OFICIAL (artigos do ASA e notas do cérebro da FECAP) ou da RESPOSTA DAS REGRAS fornecidos nesta mensagem. Nunca invente, estime ou complete com conhecimento geral.
- Os artigos do ASA explicam serviços e procedimentos; as notas do cérebro da FECAP trazem a instituição, cursos, campus, canais e vida acadêmica. Combine as duas quando a pergunta pedir (ex.: o procedimento do ASA + o horário/canal da nota).
- Seja COMPLETA: traga todos os dados úteis que a base oferece para a dúvida (onde, como, prazo, canal, documento) e antecipe a próxima dúvida provável numa frase. Se a base tiver um link oficial relevante, cite-o na message.
- Se trechos da base parecerem conflitar, prefira o artigo do ASA e a informação com data mais recente. Notícias valem para a data em que foram publicadas: diga a data/semestre ("no aviso de junho de 2026...") e não apresente prazo já vencido como aberto.
- Se nada fornecido responde, diga com honestidade que não encontrou essa informação nos artigos oficiais do ASA e ofereça encaminhar a dúvida para a equipe do ASA (o app mostra a opção). Nesse caso grounded=false.
- Cumprimentos, agradecimentos, despedidas e "o que você faz" podem ser respondidos livremente (grounded=true, useDraft conforme o rascunho).

LIMITES
- Não peça nem repita senha, CPF, RA ou outros dados pessoais. Não prometa executar ações (trancar, pagar, emitir): oriente como fazer.
- Você não tem acesso a notas, faltas ou dados pessoais do estudante. Se ele pedir, explique onde consultar conforme os artigos.
- Não mencione Gemini, Google, modelos de IA, "rascunho", "regras", "cérebro", "notas" ou "artigos fornecidos"; fale como a assistente do ASA ("segundo as orientações do ASA...", "no site da FECAP...").

FORMATO (JSON)
- title: até 60 caracteres, resumindo o assunto.
- message: resposta para a tela, até ~180 palavras; use uma lista com "- " quando houver passos ou vários itens.
- speech: versão para ser FALADA em voz alta: 1 a 3 frases curtas, sem markdown, sem listas, sem URLs; escreva e-mails por extenso ("asa arroba fecap ponto br").
- useDraft: true se a RESPOSTA DAS REGRAS de fato responde ao que o estudante quis dizer (você só a reescreve com naturalidade, sem perder nenhum dado dela); false se ela não tem relação com a pergunta.
- grounded: veja acima.
- sourceSlugs: slugs (o texto entre colchetes) dos artigos e notas que você usou (vazio se nenhum).`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    message: { type: 'STRING' },
    speech: { type: 'STRING' },
    useDraft: { type: 'BOOLEAN' },
    grounded: { type: 'BOOLEAN' },
    sourceSlugs: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['title', 'message', 'speech', 'useDraft', 'grounded', 'sourceSlugs'],
  propertyOrdering: ['title', 'message', 'speech', 'useDraft', 'grounded', 'sourceSlugs'],
} as const;

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

/** Turnos válidos, do mais antigo ao mais novo, começando por uma fala do estudante (exigência da API). */
export function normalizeHistory(history: AssistantHistoryTurn[] | undefined): AssistantHistoryTurn[] {
  const recent = (history ?? []).filter((turn) => turn.text.trim()).slice(-MAX_HISTORY_TURNS);
  const firstUser = recent.findIndex((turn) => turn.role === 'user');
  return firstUser < 0 ? [] : recent.slice(firstUser).map((turn) => ({ role: turn.role, text: clip(turn.text, 600) }));
}

export function buildConversationalPrompt(input: ConversationalInput): string {
  const draftItems = input.draft.items.map((item) => `- ${item.title}${item.description ? `: ${item.description}` : ''}`).join('\n');
  const describe = (article: GroundingArticle): string => {
    const origin = article.origin === 'brain' ? 'Nota do cérebro da FECAP' : 'Artigo do ASA';
    const link = article.sourceUrl ? `\nLink oficial: ${article.sourceUrl}` : '';
    return `### [${article.slug}] ${article.title} (${origin})\nResumo: ${article.summary}${link}\n${article.body}`;
  };
  const articles = input.articles.length ? input.articles.map(describe).join('\n\n') : '(nada relacionado foi encontrado na base oficial)';
  return [
    ...(input.today ? [`DATA DE HOJE: ${input.today}`, ''] : []),
    `PERGUNTA DO ESTUDANTE (${input.inputType === 'voice' ? 'transcrição de voz, pode conter erros' : 'digitada'}):`,
    input.question,
    '',
    `RESPOSTA DAS REGRAS (status: ${input.draft.status}):`,
    `Título: ${input.draft.title}`,
    input.draft.message,
    draftItems,
    '',
    'BASE OFICIAL (artigos do ASA e notas do cérebro da FECAP):',
    articles,
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

/** Valida a saída do modelo; null = descartar e manter a resposta das regras. */
export function sanitizeReply(raw: unknown, articles: GroundingArticle[]): ConversationalReply | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const message = typeof value.message === 'string' ? clip(value.message, MAX_MESSAGE_CHARS) : '';
  const speech = typeof value.speech === 'string' ? clip(value.speech.replace(/https?:\/\/\S+/g, '').replace(/[*_#`]/g, ''), MAX_SPEECH_CHARS) : '';
  if (!message || !speech) return null;
  const allowed = new Set(articles.map((article) => article.slug));
  const sourceSlugs = Array.isArray(value.sourceSlugs) ? [...new Set(value.sourceSlugs.filter((slug): slug is string => typeof slug === 'string' && allowed.has(slug)))] : [];
  return {
    title: typeof value.title === 'string' && value.title.trim() ? clip(value.title, 60) : '',
    message,
    speech,
    useDraft: value.useDraft === true,
    grounded: value.grounded === true,
    sourceSlugs,
  };
}

export class ConversationalComposer {
  constructor(private readonly client: JsonModelClient) {}

  get model(): string {
    return this.client.model;
  }

  async compose(input: ConversationalInput): Promise<ConversationalReply | null> {
    const contents = [
      ...normalizeHistory(input.history).map((turn) => ({ role: turn.role === 'user' ? ('user' as const) : ('model' as const), text: turn.text })),
      { role: 'user' as const, text: buildConversationalPrompt(input) },
    ];
    // falas seguidas do mesmo papel viram uma só (a API espera alternância usuário/modelo)
    const merged = contents.reduce<typeof contents>((acc, message) => {
      const last = acc[acc.length - 1];
      if (last && last.role === message.role) last.text = `${last.text}\n\n${message.text}`;
      else acc.push({ ...message });
      return acc;
    }, []);
    const raw = await this.client.generateJson<unknown>({
      system: CONVERSATIONAL_SYSTEM_PROMPT,
      contents: merged,
      schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.4,
      maxOutputTokens: 1_536,
    });
    return sanitizeReply(raw, input.articles);
  }
}
