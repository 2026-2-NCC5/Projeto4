import { Check, CheckCheck, Lock, Send } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { SupportStaffTicketEvent, SupportTicketEvent, SupportTicketMessage } from '@/types/api';
import { EVENT_ICONS } from '../labels';

/**
 * Mensagens do chamado. `viewer` decide o lado ("minhas" à direita) e a confirmação de leitura:
 * o aluno vê se a equipe leu; a equipe vê se o aluno leu.
 */
export function MessageThread({ messages, viewer, renderAttachments }: { messages: SupportTicketMessage[]; viewer: 'student' | 'staff'; renderAttachments?: (message: SupportTicketMessage) => ReactNode }) {
  if (messages.length === 0) return <p className="text-small text-mist">Nenhuma mensagem ainda.</p>;
  return (
    <ol className="flex flex-col gap-3" aria-label="Mensagens">
      {messages.map((message) => {
        const mine = viewer === 'student' ? message.senderType === 'student' : message.senderType === 'agent';
        const readLabel = message.readAt ? `Lida ${formatRelative(message.readAt)}` : 'Ainda não lida';
        return (
          <li key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
            <article className={cn('max-w-[min(36rem,90%)] rounded-lg border px-4 py-3', mine ? 'border-action/20 bg-action-soft' : 'border-line bg-white')} aria-label={`Mensagem de ${message.senderName}`}>
              {/* sobre o verde-claro das próprias mensagens o cinza "mist" não chega a 4,5:1; "slate" mantém o contraste AA */}
              <header className={cn('mb-1 flex flex-wrap items-baseline gap-x-2 text-caption', mine ? 'text-slate' : 'text-mist')}>
                <span className="font-semibold text-slate">{mine && viewer === 'student' ? 'Você' : message.senderName}</span>
                <time dateTime={message.createdAt} title={formatDateTime(message.createdAt)}>
                  {formatRelative(message.createdAt)}
                </time>
              </header>
              {message.content ? <p className="whitespace-pre-wrap break-words text-body text-ink">{message.content}</p> : null}
              {renderAttachments?.(message)}
              {mine ? (
                <p className="mt-1 flex items-center justify-end gap-1 text-caption text-slate">
                  {message.readAt ? <CheckCheck size={14} aria-hidden /> : <Check size={14} aria-hidden />}
                  <span>{readLabel}</span>
                </p>
              ) : null}
            </article>
          </li>
        );
      })}
    </ol>
  );
}

/** Campo de mensagem com contador e envio por Ctrl+Enter. */
export function Composer({
  onSend,
  maxLength,
  placeholder = 'Escreva sua mensagem',
  label = 'Mensagem',
  sending,
  disabledReason,
  allowEmpty = false,
  extra,
  submitLabel = 'Enviar',
  tone = 'public',
}: {
  onSend: (content: string) => Promise<boolean>;
  maxLength: number;
  placeholder?: string;
  label?: string;
  sending: boolean;
  disabledReason?: string | null;
  /** permite enviar só anexos */
  allowEmpty?: boolean;
  extra?: ReactNode;
  submitLabel?: string;
  /** nota interna fica destacada (nunca vai para o aluno) */
  tone?: 'public' | 'internal';
}) {
  const [content, setContent] = useState('');
  const fieldId = useId();
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = content.trim();
    if (!text && !allowEmpty) return;
    if (await onSend(text)) setContent('');
  };
  if (disabledReason) return <p className="rounded-md bg-snow px-3 py-2 text-small text-slate">{disabledReason}</p>;
  return (
    <form onSubmit={submit} className={cn('flex flex-col gap-2 rounded-lg border p-3', tone === 'internal' ? 'border-warning/40 bg-warning-soft' : 'border-line bg-white')}>
      {tone === 'internal' ? (
        <p className="flex items-center gap-1.5 text-caption font-semibold text-warning-text">
          <Lock size={14} aria-hidden /> Nota interna — visível só para a equipe
        </p>
      ) : null}
      <label className="sr-only" htmlFor={fieldId}>
        {label}
      </label>
      <textarea
        id={fieldId}
        value={content}
        maxLength={maxLength}
        rows={3}
        placeholder={placeholder}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void submit();
        }}
        className="w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-body placeholder:text-mist"
      />
      {extra}
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-caption', tone === 'internal' ? 'text-slate' : 'text-mist')}>
          {content.length}/{maxLength} · Ctrl+Enter envia
        </span>
        <Button type="submit" variant="primary" size="sm" icon={Send} loading={sending} disabled={!content.trim() && !allowEmpty}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Histórico (auditoria somente-inserção). Eventos internos aparecem destacados e só no portal da equipe. */
export function EventTimeline({ events }: { events: Array<SupportTicketEvent | SupportStaffTicketEvent> }) {
  return (
    <ol className="relative flex flex-col gap-4 border-l border-line pl-5" aria-label="Histórico do chamado">
      {[...events].reverse().map((event) => {
        const internal = 'visibility' in event && event.visibility === 'internal';
        const IconGlyph = internal ? Lock : EVENT_ICONS[event.type];
        return (
          <li key={event.id} className="relative">
            <span className={cn('absolute -left-[31px] top-0 flex h-6 w-6 items-center justify-center rounded-full border bg-white', internal ? 'border-warning text-warning-text' : 'border-line text-slate')}>
              <IconGlyph size={14} aria-hidden />
            </span>
            <div className={cn(internal && 'rounded-md bg-warning-soft px-3 py-2')}>
              <p className="text-small font-semibold text-ink">
                {event.title}
                {internal ? <span className="ml-2 text-caption font-normal text-warning-text">(interno)</span> : null}
              </p>
              {event.description ? <p className="mt-0.5 whitespace-pre-wrap text-small text-slate">{event.description}</p> : null}
              {event.details.length > 0 ? (
                <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-caption text-slate">
                  {event.details.map((detail) => (
                    <div key={`${detail.label}-${detail.value}`} className="flex gap-1">
                      <dt className={internal ? 'text-slate' : 'text-mist'}>{detail.label}:</dt>
                      <dd className={internal ? 'text-ink' : undefined}>{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <p className={cn('mt-0.5 text-caption', internal ? 'text-slate' : 'text-mist')}>
                {event.actorName ? `${event.actorName} · ` : ''}
                <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
