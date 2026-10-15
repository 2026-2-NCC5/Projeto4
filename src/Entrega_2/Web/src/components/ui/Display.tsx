import type { ComponentType, ElementType, HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

type Icon = ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'action' | 'assistant';

const TONES: Record<Tone, string> = {
  neutral: 'bg-snow text-slate',
  info: 'bg-info-soft text-info-text',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',
  action: 'bg-action-soft text-action',
  assistant: 'bg-assistant-soft text-assistant-text',
};

/** Selo de situação: sempre ícone + texto (nunca só cor). */
export function Badge({ tone = 'neutral', icon: IconGlyph, children, className }: { tone?: Tone; icon?: Icon; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-caption font-medium whitespace-nowrap', TONES[tone], className)}>
      {IconGlyph ? <IconGlyph size={16} aria-hidden /> : null}
      {children}
    </span>
  );
}

/** Superfície branca com borda de 1px e sem sombra (padrão visual do ASA Conecta). */
export function Surface({ as: Tag = 'section', padded = true, className, children, ...rest }: HTMLAttributes<HTMLElement> & { as?: ElementType; padded?: boolean }) {
  return (
    <Tag className={cn('rounded-lg border border-line bg-white', padded && 'p-4 sm:p-5', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-small text-mist">{eyebrow}</div> : null}
        <h1 className="text-h1 font-bold text-ink">{title}</h1>
        {description ? <p className="mt-1 text-body text-slate max-w-3xl">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
    </header>
  );
}

export function SectionHeader({ title, description, action, id }: { title: string; description?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h2 id={id} className="text-h3 font-semibold text-ink">
          {title}
        </h2>
        {description ? <p className="text-small text-mist mt-0.5">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex items-center justify-center rounded-full bg-action-soft text-action font-semibold shrink-0', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('asa-skeleton block rounded-md', className ?? 'h-4 w-full')} />;
}

/** Indicador numérico com fonte e data de atualização (nada de número sem origem). */
export function MetricCard({ label, value, hint, icon: IconGlyph, tone = 'neutral', to }: { label: string; value: ReactNode; hint?: ReactNode; icon?: Icon; tone?: Tone; to?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-small text-slate">{label}</span>
        {IconGlyph ? (
          <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-md', TONES[tone])}>
            <IconGlyph size={18} aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-metric font-semibold text-ink tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-caption text-mist">{hint}</div> : null}
    </>
  );
  return to ? (
    <Link to={to} className="block rounded-lg border border-line bg-white p-4 transition-colors hover:border-line-strong">
      {body}
    </Link>
  ) : (
    <div className="rounded-lg border border-line bg-white p-4">{body}</div>
  );
}

/** Lista de pares rótulo/valor (detalhes de um registro). */
export function KeyValueList({ items, columns = 1 }: { items: Array<{ label: string; value: ReactNode }>; columns?: 1 | 2 }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3', columns === 2 && 'sm:grid-cols-2')}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-caption text-mist">{item.label}</dt>
          <dd className="text-body text-ink break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Itens do mesmo tipo numa lista com divisórias (em vez de um card por item). */
export function List({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <ul aria-label={label} className={cn('divide-y divide-line-soft rounded-lg border border-line bg-white overflow-hidden', className)}>
      {children}
    </ul>
  );
}

export function ListItem({
  title,
  description,
  meta,
  leading,
  trailing,
  to,
  onClick,
  unread,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  to?: string;
  onClick?: () => void;
  unread?: boolean;
}) {
  // O link/botão cobre só o conteúdo principal; ações (trailing) ficam ao lado, nunca aninhadas no link.
  const content = (
    <div className="flex items-start gap-3 px-4 py-3">
      {leading ? <div className="shrink-0 mt-0.5 text-slate">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className={cn('text-body text-ink truncate', unread ? 'font-semibold' : 'font-medium')}>{title}</div>
        {description ? <div className="text-small text-slate mt-0.5 line-clamp-2">{description}</div> : null}
        {meta ? <div className="text-caption text-mist mt-1">{meta}</div> : null}
      </div>
      {unread ? <span className="mt-2 h-2 w-2 rounded-full bg-action shrink-0" role="img" aria-label="Não lido" /> : null}
    </div>
  );
  return (
    <li className="flex items-center">
      {to ? (
        <Link to={to} className="block min-w-0 flex-1 transition-colors hover:bg-paper focus-visible:bg-paper">
          {content}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className="block min-w-0 flex-1 text-left transition-colors hover:bg-paper">
          {content}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{content}</div>
      )}
      {trailing ? <div className="flex shrink-0 items-center gap-2 pr-4">{trailing}</div> : null}
    </li>
  );
}

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (value: T) => void; items: Array<{ value: T; label: string; count?: number }>; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line mb-4 -mx-1 px-1">
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => {
              const index = items.findIndex((candidate) => candidate.value === value);
              if (event.key === 'ArrowRight') onChange(items[(index + 1) % items.length]!.value);
              if (event.key === 'ArrowLeft') onChange(items[(index - 1 + items.length) % items.length]!.value);
            }}
            className={cn(
              'relative -mb-px whitespace-nowrap px-3 py-2.5 text-body border-b-2 transition-colors',
              selected ? 'border-action text-action font-semibold' : 'border-transparent text-slate hover:text-ink',
            )}
          >
            {item.label}
            {item.count !== undefined ? <span className="ml-1.5 rounded-sm bg-snow px-1.5 text-caption text-slate tabular-nums">{item.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
