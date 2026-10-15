import { ArrowRight, BookOpenText, ExternalLink, MessageCircle, MessageSquarePlus, SearchX, Sparkles, type LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import type { Tone } from '@/components/ui/Display';
import { HumanValidationNotice, Pill, RecommendationTypeBadge } from '@/features/academic/components';
import { formatDate } from '@/lib/format';
import type { AgentRecommendation, AssistantDisplayItem, AssistantHandoff, AssistantItemTone, AssistantNextAction, AssistantResponse, AssistantResponseStatus, AssistantSource } from '@/types/api';
import { RUN_ANALYSIS_PROMPT } from './conversation';
import { ticketDraftFromHandoff, ticketDraftFromQuestion } from './handoff';
import { assistantHref, TARGET_LABELS } from './navigation';

/** Etiqueta da resposta quando ela muda a leitura (mesmas palavras do app; "success" não leva etiqueta). */
const STATUS_META: Record<Exclude<AssistantResponseStatus, 'success'>, { label: string; tone: Tone }> = {
  empty: { label: 'Nada encontrado', tone: 'neutral' },
  not_found: { label: 'Não encontrado', tone: 'neutral' },
  needs_clarification: { label: 'Preciso de mais detalhes', tone: 'info' },
  abstained: { label: 'Sem resposta confiável', tone: 'neutral' },
  human_validation: { label: 'Validação humana', tone: 'info' },
  refused: { label: 'Fora do que posso fazer', tone: 'warning' },
};

const ITEM_TONES: Record<AssistantItemTone, { tone: Tone; label: string | null }> = {
  neutral: { tone: 'neutral', label: null },
  info: { tone: 'info', label: 'Informação' },
  success: { tone: 'success', label: 'Em dia' },
  attention: { tone: 'warning', label: 'Atenção' },
  danger: { tone: 'danger', label: 'Crítico' },
};

/**
 * Botões das respostas quebram a linha em vez de passar da largura da tela (rótulos vêm da API e podem ser
 * longos; o botão padrão não quebra).
 */
export const WRAP_BUTTON = 'h-auto! min-h-8 max-w-full py-1.5 whitespace-normal! text-left';
const WRAP_BUTTON_MD = 'h-auto! min-h-10 max-w-full py-2 whitespace-normal! text-left';

/** Título que a própria API usa na abstenção da base de conhecimento (evita repetir a frase). */
const NO_RELIABLE_ANSWER = 'Não encontrei uma resposta confiável';

/** Abstenção ou baixa confiança: a resposta não deve ser tratada como certa. */
export const isLowConfidence = (response: AssistantResponse): boolean => response.abstained || response.status === 'abstained' || response.abstentionReason === 'low_confidence';

function HandoffSummary({ handoff }: { handoff: AssistantHandoff }) {
  return (
    <dl className="grid grid-cols-1 gap-2 rounded-md bg-snow px-3 py-2.5 text-small">
      <div className="min-w-0">
        <dt className="text-slate">Assunto</dt>
        <dd className="wrap-break-word text-ink">{handoff.subject}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-slate">Descrição</dt>
        <dd className="line-clamp-4 wrap-break-word whitespace-pre-line text-ink">{handoff.description}</dd>
      </div>
      {handoff.reason ? (
        <div className="min-w-0">
          <dt className="text-slate">Motivo</dt>
          <dd className="text-ink">{handoff.reason}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Sem resposta confiável: diz isso com todas as letras e oferece o chamado (com o resumo proposto, se houver). */
function LowConfidenceNotice({ response, question }: { response: AssistantResponse; question: string }) {
  const handoff = response.handoff ?? null;
  const repeatsTitle = response.display.title.trim() === NO_RELIABLE_ANSWER;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
      {/* a abstenção da base de conhecimento já diz isso no título e na mensagem da API: sem repetir */}
      {!repeatsTitle ? (
        <div>
          <p className="flex items-center gap-2 text-h4 font-semibold text-ink">
            <SearchX size={20} aria-hidden className="shrink-0 text-slate" />
            Não encontrei uma resposta confiável
          </p>
          <p className="mt-0.5 text-small text-slate">Para não arriscar uma resposta errada, a equipe do ASA pode responder por um chamado. Você revisa tudo antes de enviar.</p>
        </div>
      ) : null}
      {handoff ? <HandoffSummary handoff={handoff} /> : null}
      <ButtonLink to="/aluno/chamados/novo" state={handoff ? ticketDraftFromHandoff(handoff) : ticketDraftFromQuestion(question)} variant="primary" icon={MessageSquarePlus} className={`self-start ${WRAP_BUTTON_MD}`}>
        {handoff ? 'Abrir chamado com este resumo' : 'Abrir chamado com esta pergunta'}
      </ButtonLink>
    </div>
  );
}

/** Encaminhamento sugerido pela API (ex.: "quero falar com alguém do ASA"); o chamado só existe se o aluno enviar. */
function HandoffCard({ handoff }: { handoff: AssistantHandoff }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
      <div>
        <p className="text-h4 font-semibold text-ink">Quer falar com a equipe do ASA?</p>
        <p className="mt-0.5 text-small text-slate">Preparei um rascunho de chamado. Nada é enviado sem a sua confirmação: você revisa e completa no formulário.</p>
      </div>
      <HandoffSummary handoff={handoff} />
      <ButtonLink to="/aluno/chamados/novo" state={ticketDraftFromHandoff(handoff)} variant="primary" icon={MessageSquarePlus} className={`self-start ${WRAP_BUTTON_MD}`}>
        Abrir chamado com este resumo
      </ButtonLink>
    </div>
  );
}

function ItemList({ items }: { items: AssistantDisplayItem[] }) {
  return (
    <ul className="divide-y divide-line-soft rounded-lg border border-line">
      {items.map((item) => {
        const tone = ITEM_TONES[item.tone] ?? ITEM_TONES.neutral;
        const badge = item.badge?.trim() || tone.label;
        return (
          <li key={item.id} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 wrap-break-word text-body font-medium text-ink">{item.title}</p>
              {badge ? <Pill tone={tone.tone}>{badge}</Pill> : null}
            </div>
            {item.description ? <p className="mt-0.5 wrap-break-word text-small text-slate">{item.description}</p> : null}
            {item.meta ? <p className="mt-0.5 text-caption text-mist">{item.meta}</p> : null}
            {item.subjectId ? (
              <Link to={assistantHref('subject', { subjectId: item.subjectId }) ?? '/aluno/academico'} className="mt-1 inline-flex items-center gap-1 rounded-sm text-small text-action underline underline-offset-2 hover:no-underline">
                Ver disciplina
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function RecommendationList({ recommendations }: { recommendations: AgentRecommendation[] }) {
  const headingId = useId();
  const sorted = [...recommendations].sort((a, b) => a.priority - b.priority);
  return (
    <section aria-labelledby={headingId}>
      <h4 id={headingId} className="mb-2 text-small text-slate">
        Recomendações do Agente para o Estudante
      </h4>
      <ul className="divide-y divide-line-soft rounded-lg border border-line">
        {sorted.map((recommendation) => (
          <li key={recommendation.id} className="px-4 py-3">
            <RecommendationTypeBadge type={recommendation.type} />
            <p className="mt-1.5 text-body font-medium text-ink">{recommendation.message}</p>
            {recommendation.evidence.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-small text-slate">
                {recommendation.evidence.map((item, index) => (
                  <li key={`${index}-${item}`} className="wrap-break-word">
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
            {recommendation.nextAction ? (
              <p className="mt-1 text-small text-slate">
                Próxima ação: <span className="text-ink">{recommendation.nextAction}</span>
              </p>
            ) : null}
            <Link to={assistantHref('recommendation', { recommendationId: recommendation.id }) ?? '/aluno/academico?aba=analise'} className="mt-1 inline-block rounded-sm text-small text-action underline underline-offset-2 hover:no-underline">
              Ver recomendação
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Artigos publicados que fundamentam a resposta: citação com versão e data, levando à Central de ajuda. */
export function SourceList({ sources }: { sources: AssistantSource[] }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-line px-4 py-3">
      <h4 id={headingId} className="text-small text-slate">
        {sources.length === 1 ? 'Fonte' : 'Fontes'}
      </h4>
      <ul className="mt-1 flex flex-col gap-2">
        {sources.map((source) => (
          <li key={`${source.articleId}-${source.version}`} className="flex items-start gap-2">
            <BookOpenText size={20} aria-hidden className="mt-0.5 shrink-0 text-slate" />
            <div className="min-w-0">
              <Link to={`/aluno/ajuda/${encodeURIComponent(source.slug)}`} className="rounded-sm text-body text-action underline underline-offset-2 hover:no-underline">
                {source.title}
              </Link>
              <p className="text-caption text-mist">
                Versão {source.version}
                {source.publishedAt ? ` · publicada em ${formatDate(source.publishedAt)}` : ''}
                {source.sourceLabel ? ` · ${source.sourceLabel}` : ''}
              </p>
              {source.sourceUrl && /^https:\/\/\S+$/i.test(source.sourceUrl) ? (
                <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 rounded-sm text-small text-action underline underline-offset-2 hover:no-underline">
                  Fonte original
                  <ExternalLink size={16} aria-hidden />
                  <span className="sr-only">(abre em nova aba)</span>
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const ACTION_ICONS: Record<AssistantNextAction['type'], LucideIcon> = { navigate: ArrowRight, ask: MessageCircle, run_analysis: Sparkles };

/** Próximas ações: navegação vira link do portal; perguntas e "analisar" enviam um novo texto. */
function NextActions({ actions, onAsk, busy }: { actions: AssistantNextAction[]; onAsk: (text: string) => void; busy: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action, index) => {
        const key = `${action.type}-${index}-${action.label}`;
        if (action.type === 'navigate') {
          const href = assistantHref(action.target, action.params);
          return href ? (
            <ButtonLink key={key} to={href} size="sm" icon={ACTION_ICONS.navigate} className={WRAP_BUTTON}>
              {action.label}
            </ButtonLink>
          ) : (
            <span key={key} className="inline-flex h-8 items-center text-small text-slate">
              {action.label} (disponível no aplicativo)
            </span>
          );
        }
        return (
          <Button key={key} size="sm" icon={ACTION_ICONS[action.type]} disabled={busy} className={WRAP_BUTTON} onClick={() => onAsk(action.type === 'ask' ? action.text : RUN_ANALYSIS_PROMPT)}>
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * Corpo de uma resposta: etiqueta, título, mensagem, aviso de baixa confiança ou encaminhamento, itens,
 * recomendações, fontes, navegação pedida, próximas ações e o provedor que respondeu.
 */
export function AssistantAnswer({ response, question, repeated, onAsk, busy }: { response: AssistantResponse; question: string; repeated?: AssistantResponse | null; onAsk: (text: string) => void; busy: boolean }) {
  const { display } = response;
  const status = response.status === 'success' ? null : STATUS_META[response.status];
  const lowConfidence = isLowConfidence(response);
  const humanValidation = !lowConfidence && (response.requiresHumanValidation || response.status === 'human_validation');
  const validationNext = display.recommendations.find((item) => item.requiresHumanValidation)?.nextAction ?? null;
  const navigation = response.navigation ? { href: assistantHref(response.navigation.target, response.navigation.params), label: TARGET_LABELS[response.navigation.target] } : null;
  const sources = response.sources ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {status ? (
        <Pill tone={status.tone} className="self-start">
          {status.label}
        </Pill>
      ) : null}
      {display.title ? <h3 className="wrap-break-word text-h4 font-semibold text-ink">{display.title}</h3> : null}
      {display.message ? <p className="wrap-break-word whitespace-pre-line text-body text-ink">{display.message}</p> : null}
      {repeated ? (
        <div className="border-l-2 border-line pl-3">
          <AssistantAnswer response={repeated} question={question} onAsk={onAsk} busy={busy} />
        </div>
      ) : null}
      {lowConfidence ? <LowConfidenceNotice response={response} question={question} /> : null}
      {humanValidation ? <HumanValidationNotice nextAction={validationNext} compact /> : null}
      {display.items.length > 0 ? <ItemList items={display.items} /> : null}
      {display.recommendations.length > 0 ? <RecommendationList recommendations={display.recommendations} /> : null}
      {sources.length > 0 ? <SourceList sources={sources} /> : null}
      {!lowConfidence && response.handoff ? <HandoffCard handoff={response.handoff} /> : null}
      {navigation ? (
        navigation.href ? (
          <ButtonLink to={navigation.href} variant="primary" size="sm" icon={ArrowRight} className={`self-start ${WRAP_BUTTON}`}>
            Ir para {navigation.label}
          </ButtonLink>
        ) : (
          <p className="text-small text-slate">{navigation.label}: disponível no aplicativo.</p>
        )
      ) : null}
      {response.nextActions.length > 0 ? <NextActions actions={response.nextActions} onAsk={onAsk} busy={busy} /> : null}
      {response.provider ? <p className="text-caption text-mist">Respondido por: {response.provider.label}</p> : null}
    </div>
  );
}
