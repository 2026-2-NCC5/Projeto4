import { AlertTriangle, FileQuestion, Flag, MessageCircle, RefreshCw, ShieldCheck, X } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Display';
import { AccessDenied, EmptyState, ErrorState } from '@/components/feedback/States';
import { PRIORITY_META, SLA_META } from '@/features/support/labels';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { SupportTicketPriority, SupportTicketSla } from '@/types/api';
import { isForbidden, isNotFound } from './api';

/**
 * "Atualizado há …" + botão de atualizar (dados com atualização periódica). Se a última atualização falhou,
 * diz isso em vez de exibir os dados antigos como se fossem atuais.
 */
export function Freshness({
  updatedAt,
  fetching,
  onRefresh,
  failed = false,
  prefix = 'Atualizado',
}: {
  updatedAt: string | number | Date | null | undefined;
  fetching: boolean;
  onRefresh: () => void;
  failed?: boolean;
  prefix?: string;
}) {
  const hasDate = updatedAt !== null && updatedAt !== undefined && updatedAt !== 0;
  const date = hasDate ? new Date(updatedAt) : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {failed ? (
        <span role="alert" className="text-caption text-danger-text">
          Falha ao atualizar{date ? ` · dados de ${formatRelative(date)}` : ''}
        </span>
      ) : date ? (
        <span className="text-caption text-mist" title={formatDateTime(date)}>
          {prefix} {formatRelative(date)}
        </span>
      ) : null}
      <Button size="sm" icon={RefreshCw} onClick={onRefresh} loading={fetching}>
        Atualizar
      </Button>
    </div>
  );
}

/** Filtro liga/desliga (aria-pressed), no mesmo visual dos FilterChips. */
export function ToggleChip({ pressed, onChange, children, icon }: { pressed: boolean; onChange: (value: boolean) => void; children: ReactNode; icon?: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-small transition-colors duration-150',
        pressed ? 'border-action bg-action-soft text-action font-semibold' : 'border-line bg-white text-slate hover:border-line-strong hover:text-ink',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/** Controle segmentado (grupo de rádio com setas do teclado). */
export function SegmentedControl<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: Array<{ value: T; label: string; icon?: ReactNode }>; label: string }) {
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
    const group = event.currentTarget.parentElement;
    (group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next])?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-full rounded-md border border-line bg-snow p-0.5 sm:w-auto">
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
              'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-sm px-3 text-small transition-colors duration-150 sm:flex-none',
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

/** Aviso de que outra pessoa alterou o chamado (409 ticket_changed); os dados já foram recarregados. */
export function ConflictNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div role="alert" className="mb-4 flex items-start gap-3 rounded-md border border-warning/40 bg-warning-soft px-4 py-3 text-small text-warning-text">
      <AlertTriangle size={20} aria-hidden className="mt-px shrink-0" />
      <p className="flex-1">
        <span className="font-semibold">Este chamado foi atualizado por outra pessoa enquanto você agia.</span> Recarregamos os dados: confira a situação atual e, se ainda fizer sentido, repita a ação.
      </p>
      <button type="button" aria-label="Fechar aviso" className="rounded-sm p-0.5 hover:text-ink" onClick={onDismiss}>
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}

/** Erro de carregamento com os casos 403 (sem permissão) e 404 (não encontrado) tratados à parte. */
export function LoadError({ error, onRetry, notFoundTitle, notFoundDescription, backTo, backLabel }: { error: unknown; onRetry: () => void; notFoundTitle: string; notFoundDescription?: string; backTo: string; backLabel: string }) {
  if (isForbidden(error)) return <AccessDenied />;
  if (isNotFound(error)) {
    return (
      <EmptyState
        icon={FileQuestion}
        title={notFoundTitle}
        description={notFoundDescription}
        action={
          <ButtonLink to={backTo} size="sm">
            {backLabel}
          </ButtonLink>
        }
      />
    );
  }
  return <ErrorState error={error} onRetry={onRetry} />;
}

export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge tone="info" icon={MessageCircle}>
      {count === 1 ? '1 não lida' : `${count} não lidas`}
    </Badge>
  );
}

export const CHANNEL_LABELS: Record<'app' | 'web', string> = { app: 'Aplicativo', web: 'Portal web' };

/** Aviso de minimização: o que a equipe vê (e não vê) de cada aluno. */
export function MinimizationNote() {
  return (
    <p className="flex items-start gap-2 rounded-md border border-line bg-white px-4 py-3 text-small text-slate">
      <ShieldCheck size={20} aria-hidden className="mt-px shrink-0 text-slate" />
      <span>
        Minimização de dados: a equipe vê só o contato institucional e o histórico do aluno com o ASA. Notas, frequência e análises do agente acadêmico <strong className="font-semibold">não</strong> aparecem aqui.
      </span>
    </p>
  );
}

/**
 * Variantes compactas para a tabela da fila (mesmos tons e ícones de labels.tsx, rótulos curtos):
 * a coluna "Prioridade" já diz do que se trata, e o prazo absoluto vai numa segunda linha.
 */
export function PriorityCell({ priority }: { priority: SupportTicketPriority }) {
  const meta = PRIORITY_META[priority];
  return (
    <Badge tone={meta.tone} icon={Flag}>
      {meta.label}
    </Badge>
  );
}

/** Rótulos curtos na coluna "Prazo" (o cabeçalho já diz que é o prazo). */
const SLA_CELL_LABELS: Record<SupportTicketSla['status'], string> = {
  on_track: 'No prazo',
  attention: 'Atenção',
  near_deadline: 'Próximo',
  overdue: 'Excedido',
  paused: 'Pausado',
  completed: 'Concluído',
};

export function SlaCell({ sla }: { sla: SupportTicketSla }) {
  const meta = SLA_META[sla.status];
  const label = SLA_CELL_LABELS[sla.status];
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge tone={meta.tone} icon={meta.icon}>
        {label}
      </Badge>
      {sla.status === 'completed' ? null : sla.status === 'paused' ? (
        <span className="text-caption text-mist">aguardando o aluno</span>
      ) : (
        <time dateTime={sla.dueAt} title={`${meta.staffLabel} · prazo ${formatRelative(sla.dueAt)}`} className="text-caption text-mist">
          {sla.status === 'overdue' ? 'venceu' : 'vence'} {formatDateTime(sla.dueAt)}
        </time>
      )}
    </span>
  );
}
