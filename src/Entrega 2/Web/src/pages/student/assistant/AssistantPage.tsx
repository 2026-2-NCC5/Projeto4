import { BookOpenText, Info, Lock, MessageSquarePlus, PowerOff, RefreshCw, RotateCcw, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { PageHeader, Surface } from '@/components/ui/Display';
import { EmptyState } from '@/components/feedback/States';
import { useMe } from '@/features/auth/session';
import { usePlatformInfo } from '@/features/platform/platform';
import { AssistantAnswer, WRAP_BUTTON } from '@/features/assistant/components';
import {
  assistantErrorMessage,
  isAssistantDisabledError,
  isRetryable,
  MAX_QUESTION_LENGTH,
  useAssistantConversation,
  type AssistantTurn,
} from '@/features/assistant/conversation';
import { cn } from '@/lib/cn';
import { formatTime } from '@/lib/format';
import { isApiError } from '@/services/api/client';
import type { AssistantResponse } from '@/types/api';

/** Mesmas sugestões do app, mais uma dúvida respondida pela base de conhecimento (com fonte). */
const SUGGESTIONS = ['Tenho atividade pendente?', 'Qual é minha próxima prova?', 'Como está minha frequência?', 'Tem alguma matéria que merece atenção?', 'Como emitir a segunda via do boleto?'];

function AssistantMark() {
  return (
    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-assistant-soft text-assistant-text">
      <Sparkles size={20} />
    </span>
  );
}

/** Resposta anterior repetida por "repita" (o comando só existe no aparelho; aqui a resposta aparece de novo). */
function previousAnswer(turns: AssistantTurn[], index: number): AssistantResponse | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const response = turns[cursor]?.response;
    if (response && !response.clientCommand) return response;
  }
  return null;
}

function Turn({ turn, repeated, onAsk, onRetry, busy, last }: { turn: AssistantTurn; repeated: AssistantResponse | null; onAsk: (text: string) => void; onRetry: (id: string) => void; busy: boolean; last: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // a pergunta nova (e depois a resposta) fica visível; sem animação para quem prefere menos movimento
  useEffect(() => {
    if (!last || !ref.current || typeof ref.current.scrollIntoView !== 'function') return;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [last, turn.status]);
  return (
    <div ref={ref} className="flex scroll-mt-24 scroll-mb-40 flex-col gap-3">
      <div className="ml-auto max-w-[85%] rounded-lg bg-snow px-4 py-2.5">
        <p className="sr-only">Você perguntou:</p>
        <p className="wrap-break-word whitespace-pre-line text-body text-ink">{turn.question}</p>
        <p className="mt-0.5 text-right text-caption text-slate">{formatTime(turn.askedAt)}</p>
      </div>
      <div className="flex items-start gap-3">
        <AssistantMark />
        <div className="min-w-0 flex-1">
          {turn.status === 'pending' ? (
            <p role="status" className="pt-1.5 text-small text-slate">
              O assistente está respondendo…
            </p>
          ) : turn.status === 'failed' ? (
            <div role="alert" className="rounded-md bg-danger-soft px-3 py-2.5 text-small text-danger-text">
              <p>{assistantErrorMessage(turn.error)}</p>
              {isApiError(turn.error) && turn.error.requestId ? <p className="mt-0.5 text-caption">Código para o suporte: {turn.error.requestId}</p> : null}
              {isRetryable(turn.error) ? (
                <Button size="sm" icon={RefreshCw} className="mt-2" disabled={busy} onClick={() => onRetry(turn.id)}>
                  Tentar novamente
                </Button>
              ) : null}
            </div>
          ) : turn.response ? (
            <article aria-label="Resposta do Assistente ASA">
              <span className="sr-only">O assistente respondeu:</span>
              <AssistantAnswer response={turn.response} question={turn.question} repeated={turn.response.clientCommand === 'repeat_last' ? repeated : null} onAsk={onAsk} busy={busy} />
            </article>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Suggestions({ onAsk, busy }: { onAsk: (text: string) => void; busy: boolean }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <AssistantMark />
        <div className="min-w-0">
          <h2 id={headingId} className="text-h4 font-semibold text-ink">
            Como posso ajudar?
          </h2>
          <p className="text-small text-slate">Posso consultar suas disciplinas, atividades, avaliações, frequência e recomendações, e responder dúvidas com os artigos publicados do ASA.</p>
        </div>
      </div>
      <ul aria-label="Sugestões de perguntas" className="flex flex-wrap gap-2 sm:pl-11">
        {SUGGESTIONS.map((text) => (
          <li key={text}>
            <Button size="sm" disabled={busy} className={WRAP_BUTTON} onClick={() => onAsk(text)}>
              {text}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Campo da pergunta. Com conversa na tela, fica preso ao pé da janela (a pergunta seguinte está sempre à mão). */
function Composer({ onSend, busy, pinned }: { onSend: (text: string) => void; busy: boolean; pinned: boolean }) {
  const [draft, setDraft] = useState('');
  const fieldId = useId();
  const hintId = useId();
  const text = draft.trim();
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!text || busy) return;
    onSend(text);
    setDraft('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envia; Shift+Enter quebra a linha (e nada acontece durante a composição de acentos)
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };
  return (
    <form onSubmit={submit} className={cn('rounded-b-lg border-t border-line bg-white px-4 py-3 sm:px-5', pinned && 'sticky bottom-0 z-10')}>
      <label htmlFor={fieldId} className="text-small text-ink">
        Sua pergunta
      </label>
      <div className="mt-1.5 flex items-end gap-2">
        <textarea
          id={fieldId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={MAX_QUESTION_LENGTH}
          aria-describedby={hintId}
          placeholder="Pergunte ao ASA..."
          className="min-h-11 w-full min-w-0 flex-1 resize-y rounded-md border border-line bg-white px-3 py-2 text-body text-ink placeholder:text-mist hover:border-line-strong focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-action"
        />
        <Button type="submit" variant="primary" icon={Send} loading={busy} disabled={!text} aria-label="Enviar pergunta" className="shrink-0">
          <span className="hidden sm:inline">Enviar</span>
        </Button>
      </div>
      <p id={hintId} className="mt-1 text-caption text-mist">
        Enter envia · Shift+Enter quebra a linha · {draft.length}/{MAX_QUESTION_LENGTH} caracteres
      </p>
    </form>
  );
}

/**
 * Assistente ASA no portal, só por texto: a mesma API do app (POST /api/assistant/message), respostas com
 * dados reais, citações da base de conhecimento, encaminhamento ao ASA com confirmação e o provedor que respondeu.
 */
export default function AssistantPage() {
  const me = useMe();
  const platform = usePlatformInfo();
  const { conversation, ask, retry, reset, pending } = useAssistantConversation();
  const turns = conversation.turns;
  const canUse = me.permissions.includes('assistant:use');
  const disabled = platform.data?.features.assistant === false || turns.some((turn) => turn.status === 'failed' && isAssistantDisabledError(turn.error));
  const providerLabel = platform.data?.assistant.providerLabel ?? null;

  const header = (
    <PageHeader
      title="Assistente ASA"
      description="Pergunte em texto sobre suas disciplinas, avaliações, frequência, pendências e serviços do ASA."
      actions={
        canUse && !disabled ? (
          <Button icon={RotateCcw} onClick={reset} disabled={turns.length === 0 || pending}>
            Nova conversa
          </Button>
        ) : undefined
      }
    />
  );

  if (!canUse) {
    return (
      <>
        {header}
        <EmptyState icon={Lock} title="Acesso não permitido" description="Seu perfil não tem acesso ao Assistente ASA. Se precisar de ajuda, abra um chamado para o ASA." />
      </>
    );
  }

  if (disabled) {
    return (
      <>
        {header}
        <EmptyState
          icon={PowerOff}
          title="Assistente desativado"
          description="O assistente está desligado neste ambiente. Você ainda pode procurar a resposta na Central de ajuda ou abrir um chamado para o ASA."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink to="/aluno/ajuda" icon={BookOpenText}>
                Central de ajuda
              </ButtonLink>
              <ButtonLink to="/aluno/chamados/novo" icon={MessageSquarePlus}>
                Abrir chamado
              </ButtonLink>
            </div>
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="mb-4 flex flex-col gap-1.5 text-small text-slate">
        <p role="note" className="flex items-start gap-2">
          <ShieldCheck size={20} aria-hidden className="shrink-0" />
          <span>O assistente responde só com os seus dados. Esta conversa fica apenas na memória desta aba e some ao recarregar a página ou sair da conta; o texto das perguntas não é guardado.</span>
        </p>
        {providerLabel ? (
          <p className="flex items-start gap-2">
            <Info size={20} aria-hidden className="shrink-0" />
            <span>Como responde: {providerLabel}.</span>
          </p>
        ) : null}
      </div>
      <Surface padded={false} className="max-w-4xl">
        <div role="log" aria-label="Conversa com o Assistente ASA" className={cn('flex flex-col gap-6 px-4 py-5 sm:px-5', turns.length === 0 && 'min-h-48')}>
          {turns.length === 0 ? (
            <Suggestions onAsk={(text) => void ask(text)} busy={pending} />
          ) : (
            turns.map((turn, index) => (
              <Turn key={turn.id} turn={turn} repeated={previousAnswer(turns, index)} onAsk={(text) => void ask(text)} onRetry={retry} busy={pending} last={index === turns.length - 1} />
            ))
          )}
        </div>
        <Composer onSend={(text) => void ask(text)} busy={pending} pinned={turns.length > 0} />
      </Surface>
    </>
  );
}
