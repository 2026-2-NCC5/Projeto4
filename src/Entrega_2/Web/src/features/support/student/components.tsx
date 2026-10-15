import { ArrowLeft, Check, Copy, Info, SearchX, Star, XCircle } from 'lucide-react';
import { createElement, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextArea } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { AccessDenied, ErrorState } from '@/components/feedback/States';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import type { SupportTicket } from '@/types/api';
import { categoryIcon } from '../labels';
import { buildProgress, type ProgressStepState } from './progress';
import { isForbidden, isNotFound } from './utils';

/** Ícone da categoria (20px, decorativo): componente estável mesmo com o ícone escolhido em tempo de execução. */
export function CategoryGlyph({ categoryId, size = 20, className }: { categoryId: string; size?: number; className?: string }) {
  return createElement(categoryIcon(categoryId), { size, className, 'aria-hidden': true });
}

/** Protocolo em fonte monoespaçada com botão de copiar (aviso em região aria-live). */
export function ProtocolCopy({ protocol, className }: { protocol: string; className?: string }) {
  const toast = useToast();
  const copy = async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) throw new Error('área de transferência indisponível');
      await navigator.clipboard.writeText(protocol);
      toast.show(`Protocolo ${protocol} copiado.`, 'success');
    } catch {
      toast.show('Não foi possível copiar. Selecione o protocolo e copie manualmente.', 'error');
    }
  };
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)}>
      <span className="sr-only">Protocolo </span>
      <span className="select-all break-all font-mono text-small text-ink">{protocol}</span>
      <IconButton label={`Copiar protocolo ${protocol}`} icon={Copy} size="sm" onClick={() => void copy()} />
    </span>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 rounded-sm text-small text-slate hover:text-ink">
      <ArrowLeft size={16} aria-hidden />
      {children}
    </Link>
  );
}

/** Aviso fixo dos textos de orientação do catálogo (conteúdo de demonstração no servidor). */
export function DemoContentNote({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-caption text-mist', className)}>
      <Info size={14} className="mt-px shrink-0" aria-hidden />
      Conteúdo de orientação de demonstração — confirme no ASA.
    </p>
  );
}

/** Registro inexistente ou de outra pessoa (a API responde 404 nos dois casos). */
export function NotFoundState({ title, description, backTo, backLabel }: { title: string; description: ReactNode; backTo: string; backLabel: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-white px-6 py-12 text-center">
      <SearchX size={24} className="text-mist" aria-hidden />
      <h1 className="text-h3 font-semibold text-ink">{title}</h1>
      <p className="max-w-md text-small text-slate">{description}</p>
      <ButtonLink to={backTo} className="mt-2" icon={ArrowLeft}>
        {backLabel}
      </ButtonLink>
    </div>
  );
}

/** Falha de consulta: 403 vira "acesso não permitido", 404 o estado amigável e o resto ErrorState com nova tentativa. */
export function QueryFailure({ error, onRetry, title, notFound }: { error: unknown; onRetry: () => void; title?: string; notFound?: ReactNode }) {
  if (isForbidden(error)) return <AccessDenied />;
  if (notFound && isNotFound(error)) return <>{notFound}</>;
  return <ErrorState error={error} onRetry={onRetry} title={title} />;
}

/** "12/120 · mínimo de 5": contador ligado ao campo como dica (lido junto com o rótulo). */
export function lengthHint(length: number, min: number, max: number): string {
  const counter = `${length}/${max} caracteres`;
  return length < min ? `Mínimo de ${min} caracteres · ${counter}` : counter;
}

const STATE_TEXT: Record<ProgressStepState, string> = {
  done: 'concluída',
  current: 'etapa atual',
  upcoming: 'próxima etapa',
  skipped: 'não realizada',
};

function StepMarker({ state, index }: { state: ProgressStepState; index: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold',
        state === 'done' && 'bg-success-soft text-success-text',
        state === 'current' && 'border-2 border-info bg-info-soft text-info-text',
        state === 'upcoming' && 'border border-line bg-white text-mist',
        state === 'skipped' && 'border border-dashed border-line-strong bg-white text-mist',
      )}
    >
      {state === 'done' ? <Check size={16} /> : index + 1}
    </span>
  );
}

/** Progresso em quatro etapas; cancelado e encerrado aparecem como são, sem fingir conclusão. */
export function TicketProgressView({ ticket }: { ticket: SupportTicket }) {
  const progress = buildProgress(ticket);
  return (
    <div className="flex flex-col gap-4">
      <ol aria-label="Etapas do atendimento" className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:gap-2">
        {progress.steps.map((step, index) => (
          <li key={step.key} aria-current={step.state === 'current' ? 'step' : undefined} className="flex min-w-0 items-start gap-3 sm:flex-col sm:gap-2">
            <span className="flex items-center gap-2 sm:w-full">
              <StepMarker state={step.state} index={index} />
              <span aria-hidden className={cn('hidden h-px flex-1 sm:block', index === progress.steps.length - 1 && 'invisible', step.state === 'done' ? 'bg-success' : 'bg-line')} />
            </span>
            <span className="min-w-0">
              <span className={cn('block text-small', step.state === 'current' ? 'font-semibold text-ink' : step.state === 'done' ? 'text-ink' : 'text-mist')}>
                {step.label}
                <span className="sr-only"> ({STATE_TEXT[step.state]})</span>
              </span>
              {step.completedAt ? (
                <span className="block text-caption text-mist">{formatDateTime(step.completedAt)}</span>
              ) : step.state === 'skipped' ? (
                <span className="block text-caption text-mist" aria-hidden>
                  Não realizada
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      {progress.cancelled ? (
        <p className="flex items-start gap-2 rounded-md bg-snow px-3 py-2 text-small text-slate">
          <XCircle size={18} className="mt-px shrink-0" aria-hidden />
          <span>Chamado cancelado{ticket.cancelledAt ? ` em ${formatDateTime(ticket.cancelledAt)}` : ''}. O histórico continua disponível.</span>
        </p>
      ) : null}
      {progress.currentDescription ? <p className="text-small text-slate">{progress.currentDescription}</p> : null}
      {progress.next ? (
        <p className="text-small text-slate">
          <span className="font-semibold text-ink">Próxima etapa: </span>
          {progress.next.label}. {progress.next.description}
        </p>
      ) : null}
    </div>
  );
}

export const RATING_LABELS = ['Muito insatisfeito', 'Insatisfeito', 'Regular', 'Satisfeito', 'Muito satisfeito'] as const;
export type RatingValue = 1 | 2 | 3 | 4 | 5;
const RATINGS: RatingValue[] = [1, 2, 3, 4, 5];

/** Cinco "estrelas" como grupo de rádio nativo: setas do teclado trocam a nota, Tab sai do grupo. */
export function RatingInput({ value, onChange, disabled }: { value: RatingValue | null; onChange: (value: RatingValue) => void; disabled?: boolean }) {
  const name = useId();
  return (
    <fieldset disabled={disabled}>
      <legend className="text-small font-semibold text-ink">Sua nota</legend>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {RATINGS.map((rating) => (
          <label
            key={rating}
            className="cursor-pointer rounded-md p-1 transition-colors duration-150 hover:bg-snow has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-1 has-[input:focus-visible]:outline-action"
          >
            <input type="radio" name={name} value={rating} checked={value === rating} onChange={() => onChange(rating)} className="sr-only" />
            <Star size={28} aria-hidden className={cn('transition-colors duration-150', value !== null && rating <= value ? 'fill-action text-action' : 'text-line-strong')} />
            <span className="sr-only">
              {rating} de 5 — {RATING_LABELS[rating - 1]}
            </span>
          </label>
        ))}
        <span className="ml-2 text-small text-slate" aria-hidden>
          {value ? RATING_LABELS[value - 1] : 'Escolha de 1 a 5'}
        </span>
      </div>
    </fieldset>
  );
}

export function RatingStars({ rating }: { rating: RatingValue }) {
  return (
    <span role="img" aria-label={`${rating} de 5 — ${RATING_LABELS[rating - 1]}`} className="inline-flex items-center gap-0.5">
      {RATINGS.map((item) => (
        <Star key={item} size={18} aria-hidden className={item <= rating ? 'fill-action text-action' : 'text-line-strong'} />
      ))}
    </span>
  );
}

/**
 * Diálogo de ação com justificativa (cancelar, reabrir). Variante local do ConfirmDialog: aceita justificativa
 * opcional (mínimo 0) com contador e limpa o texto a cada abertura.
 */
export function ReasonDialog({
  open,
  title,
  description,
  label,
  min,
  max,
  confirmLabel,
  tone = 'primary',
  loading,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  label: string;
  min: number;
  max: number;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  // nova abertura começa vazia (ajuste durante a renderização, sem efeito)
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason('');
  }
  const length = reason.trim().length;
  const hint = min > 0 ? lengthHint(length, min, max) : `Opcional · ${reason.length}/${max} caracteres`;
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!loading) onClose();
      }}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>
            Voltar
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} disabled={length < min} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="text-body text-slate">{description}</div>
        <TextArea label={label} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={max} rows={4} required={min > 0} hint={hint} />
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-small text-danger-text">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
