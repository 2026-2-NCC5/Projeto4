import { CalendarOff, CalendarRange, CalendarSync, Clock, Copy, DatabaseZap, Globe, ListChecks, Lock, RefreshCw, CalendarX } from 'lucide-react';
import { createElement, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Display';
import { TextArea } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { EmptyState, ErrorState } from '@/components/feedback/States';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { isApiError, messageForError } from '@/services/api/client';
import type { Appointment, AppointmentEvent, AppointmentPolicy, StaffAppointmentEvent } from '@/types/api';
import { isDatabaseRequired, isFeatureDisabled, isForbidden } from '../api';
import { formatAppointmentDay, formatTimeRange, plural } from '../dates';
import { actorLabel, EVENT_ICONS } from '../labels';

/** Protocolo em fonte monoespaçada com botão de copiar (aviso em região aria-live). */
export function ProtocolCopy({ protocol }: { protocol: string }) {
  const toast = useToast();
  const copy = async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) throw new Error('área de transferência indisponível');
      await navigator.clipboard.writeText(protocol);
      toast.show(`Protocolo ${protocol} copiado.`);
    } catch {
      toast.show('Não foi possível copiar. Selecione o protocolo e copie manualmente.', 'error');
    }
  };
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="select-all break-all font-mono text-small text-ink">{protocol}</span>
      <IconButton label={`Copiar protocolo ${protocol}`} icon={Copy} size="sm" onClick={() => void copy()} />
    </span>
  );
}

const ALERT_TONES = {
  danger: 'bg-danger-soft text-danger-text',
  warning: 'bg-warning-soft text-warning-text',
  info: 'bg-snow text-slate',
} as const;

/**
 * Agendamento antigo de uma remarcação → substituto (`rescheduledToId`). Mostra o novo horário quando ele já foi
 * carregado; sem ele, o link continua levando ao substituto.
 */
export function RescheduledToLink({ href, replacement, now }: { href: string; replacement: Pick<Appointment, 'startsAt' | 'endsAt'> | undefined; now: Date }) {
  return (
    <Link to={href} className="inline-flex items-start gap-1.5 rounded-sm text-small text-action underline">
      <CalendarSync size={16} aria-hidden className="mt-px shrink-0" />
      {replacement
        ? `Remarcado para ${formatAppointmentDay(replacement.startsAt, now).toLowerCase()}, ${formatTimeRange(replacement.startsAt, replacement.endsAt)}`
        : 'Remarcado para o novo horário'}
    </Link>
  );
}

/** Aviso em linha. Erros e alertas são anunciados (role="alert"); informações, de forma educada (role="status"). */
export function InlineAlert({ tone = 'danger', children, className }: { tone?: keyof typeof ALERT_TONES; children: ReactNode; className?: string }) {
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={cn('rounded-md px-3 py-2 text-small', ALERT_TONES[tone], className)}>
      {children}
    </div>
  );
}

/**
 * Falhas que valem para a tela toda: recurso desligado (403 feature_disabled), banco ausente (503
 * database_required), sem permissão (403) ou erro comum com nova tentativa.
 */
export function AppointmentsFailure({ error, onRetry, area, title }: { error: unknown; onRetry?: () => void; area: 'aluno' | 'asa'; title?: string }) {
  if (isFeatureDisabled(error)) {
    return (
      <EmptyState
        icon={CalendarOff}
        title="Agendamentos desativados"
        description={
          area === 'aluno'
            ? 'O agendamento de atendimentos está desligado neste ambiente pela administração da plataforma. Para falar com o ASA, abra um chamado.'
            : 'Os agendamentos estão desligados neste ambiente pela administração da plataforma. A agenda volta a funcionar quando o recurso for religado.'
        }
        action={area === 'aluno' ? <ButtonLink to="/aluno/chamados/novo">Abrir chamado</ButtonLink> : undefined}
      />
    );
  }
  if (isDatabaseRequired(error)) {
    return (
      <EmptyState
        icon={DatabaseZap}
        title="Agendamentos indisponíveis neste ambiente"
        description="Os agendamentos dependem do banco de dados PostgreSQL, que não está ativo neste ambiente. Os demais recursos do portal continuam funcionando."
      />
    );
  }
  if (isForbidden(error)) {
    return (
      <EmptyState
        icon={Lock}
        title="Acesso não permitido"
        description={isApiError(error) && error.message ? error.message : 'Seu perfil não tem permissão para esta área.'}
      />
    );
  }
  return <ErrorState error={error} onRetry={onRetry} title={title} />;
}

/** Versão compacta para diálogos e seções (sem ocupar a tela). */
export function InlineFailure({ error, onRetry, notFoundText }: { error: unknown; onRetry?: () => void; notFoundText?: string }) {
  const notFound = isApiError(error) && error.kind === 'not_found';
  const message = notFound && notFoundText ? notFoundText : isFeatureDisabled(error) ? 'Os agendamentos estão desativados neste ambiente.' : messageForError(error);
  return (
    <InlineAlert>
      <p>{message}</p>
      {onRetry && !notFound && !isForbidden(error) ? (
        <Button size="sm" icon={RefreshCw} className="mt-2" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </InlineAlert>
  );
}

/**
 * Diálogo com justificativa: opcional (min 0, cancelamento pelo aluno) ou obrigatória (cancelamento pela equipe).
 * O texto começa vazio a cada abertura.
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
  const hint = min > 0 ? `Mínimo de ${min} caracteres · ${reason.length}/${max}` : `Opcional · ${reason.length}/${max} caracteres`;
  const close = () => {
    if (!loading) onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={close} disabled={loading}>
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
        {error ? <InlineAlert>{error}</InlineAlert> : null}
      </div>
    </Dialog>
  );
}

type TimelineEvent = AppointmentEvent & Partial<Pick<StaffAppointmentEvent, 'visibility' | 'actorName'>>;

/** Linha do tempo do agendamento (do mais antigo ao mais recente). Eventos internos só chegam para a equipe. */
export function EventTimeline({ events, audience }: { events: TimelineEvent[]; audience: 'student' | 'staff' }) {
  if (events.length === 0) return <p className="text-small text-mist">Nenhum evento registrado.</p>;
  return (
    <ol className="flex flex-col" aria-label="Histórico do agendamento">
      {events.map((event, index) => (
        <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
          {index < events.length - 1 ? <span aria-hidden className="absolute bottom-0 left-[9.5px] top-6 w-px bg-line" /> : null}
          {createElement(EVENT_ICONS[event.type], { size: 20, 'aria-hidden': true, className: 'relative shrink-0 bg-white text-slate' })}
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-body text-ink">
              {event.title}
              {event.visibility === 'internal' ? <Badge icon={Lock}>Interno</Badge> : null}
            </p>
            {event.description ? <p className="mt-0.5 whitespace-pre-wrap break-words text-small text-slate">{event.description}</p> : null}
            <p className="mt-0.5 text-caption text-mist">
              {actorLabel(event.actorType, audience, event.actorName)} · <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Regras do agendamento vindas da política do servidor (nada fixo no portal). */
export function PolicyHints({ policy, activeCount }: { policy: AppointmentPolicy; activeCount?: number | null }) {
  const items = [
    {
      icon: Clock,
      text: policy.minLeadHours > 0 ? `Agende com pelo menos ${plural(policy.minLeadHours, 'hora', 'horas')} de antecedência.` : 'Sem antecedência mínima para agendar.',
    },
    { icon: CalendarRange, text: `A agenda fica aberta para os próximos ${plural(policy.maxDaysAhead, 'dia', 'dias')}.` },
    {
      icon: CalendarX,
      text:
        policy.cancellationMinHours > 0
          ? `Cancele ou remarque até ${plural(policy.cancellationMinHours, 'hora', 'horas')} antes do horário, pelo portal ou pelo app.`
          : 'Cancele ou remarque até o início do horário, pelo portal ou pelo app.',
    },
    {
      icon: ListChecks,
      text: `Até ${plural(policy.maxActivePerStudent, 'agendamento ativo', 'agendamentos ativos')} por vez${
        activeCount !== undefined && activeCount !== null ? ` — você tem ${activeCount} agora.` : '.'
      }`,
    },
    { icon: Globe, text: `Horários no fuso de Brasília (${policy.timezone}).` },
  ];
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.text} className="flex items-start gap-2.5 text-small text-slate">
          {createElement(item.icon, { size: 20, 'aria-hidden': true, className: 'shrink-0 text-mist' })}
          <span className="pt-0.5">{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** "Atualizado há …" + botão de atualizar (dados com atualização periódica). */
export function Freshness({ updatedAt, now, fetching, onRefresh }: { updatedAt: number; now: Date; fetching: boolean; onRefresh: () => void }) {
  const date = updatedAt > 0 ? new Date(Math.min(updatedAt, now.getTime())) : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {date ? (
        <span className="text-caption text-mist" title={formatDateTime(date)}>
          Atualizado {formatRelative(date, now)}
        </span>
      ) : null}
      <Button size="sm" icon={RefreshCw} onClick={onRefresh} loading={fetching}>
        Atualizar
      </Button>
    </div>
  );
}

/** Filtro liga/desliga (aria-pressed), no visual dos FilterChips. */
export function ToggleChip({ pressed, onChange, children, label }: { pressed: boolean; onChange: (value: boolean) => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={() => onChange(!pressed)}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-small transition-colors duration-150',
        pressed ? 'border-action bg-action-soft font-semibold text-action' : 'border-line bg-white text-slate hover:border-line-strong hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

/** Controle segmentado (grupo de rádio com setas do teclado). */
export function SegmentedControl<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (value: T) => void; options: Array<{ value: T; label: string; icon?: ReactNode }>; label: string; className?: string }) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = options.findIndex((option) => option.value === value);
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % options.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length;
    if (next === null) return;
    event.preventDefault();
    const target = options[next];
    if (!target) return;
    onChange(target.value);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-md border border-line bg-snow p-0.5', className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={onKeyDown}
            className={cn(
              'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-sm px-3 text-small transition-colors duration-150',
              selected ? 'border border-line bg-white font-semibold text-ink' : 'border border-transparent text-slate hover:text-ink',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
