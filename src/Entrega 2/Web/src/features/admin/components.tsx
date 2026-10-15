import { AlertTriangle, CheckCircle2, Copy, Database, DatabaseZap, FlaskConical, Info, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { AccessDenied, EmptyState, ErrorState } from '@/components/feedback/States';
import { usePlatformInfo } from '@/features/platform/platform';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatRelative, formatTime } from '@/lib/format';
import type { MetricSource } from '@/types/api';
import { isDatabaseRequired, isForbidden } from './api';
import type { StateMeta } from './labels';

/**
 * Falhas de carregamento da Administração: sem permissão (403), banco ausente (503 database_required) ou
 * erro comum com nova tentativa. Nunca troca a falha por dados simulados.
 */
export function AdminFailure({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  if (isForbidden(error)) return <AccessDenied />;
  if (isDatabaseRequired(error)) {
    return (
      <EmptyState
        icon={DatabaseZap}
        title="Indisponível neste ambiente"
        description="Esta parte da administração depende do banco de dados PostgreSQL, que não está ativo neste ambiente. Nada é simulado no lugar dos dados."
      />
    );
  }
  return <ErrorState error={error} onRetry={onRetry} title={title} />;
}

/** Selo de estado (sempre ícone + texto, nunca só cor). */
export function StateBadge({ meta, className }: { meta: StateMeta; className?: string }) {
  return (
    <Badge tone={meta.tone} icon={meta.icon} className={className}>
      {meta.label}
    </Badge>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="warning" icon={FlaskConical}>
      Demonstração
    </Badge>
  );
}

const NOTICE_TONES = {
  info: { box: 'border-info/30 bg-info-soft text-info-text', icon: Info },
  warning: { box: 'border-warning/40 bg-warning-soft text-warning-text', icon: AlertTriangle },
  danger: { box: 'border-danger/30 bg-danger-soft text-danger-text', icon: XCircle },
  success: { box: 'border-success/30 bg-success-soft text-success-text', icon: CheckCircle2 },
  neutral: { box: 'border-line bg-white text-slate', icon: Info },
} as const;

/** Aviso em linha. `alert` para erros que precisam ser anunciados; o resto é texto comum (sem região viva). */
export function Notice({ tone = 'neutral', title, children, alert = false, className }: { tone?: keyof typeof NOTICE_TONES; title?: ReactNode; children?: ReactNode; alert?: boolean; className?: string }) {
  const meta = NOTICE_TONES[tone];
  const IconGlyph = meta.icon;
  return (
    <div role={alert ? 'alert' : undefined} className={cn('flex items-start gap-3 rounded-md border px-4 py-3 text-small', meta.box, className)}>
      <IconGlyph size={20} aria-hidden className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title ? 'mt-0.5' : undefined)}>{children}</div> : null}
      </div>
    </div>
  );
}

/** Link de texto dentro de avisos e explicações (verde de ação, sublinhado). */
export function TextLink({ to, children, className, ariaLabel }: { to: string; children: ReactNode; className?: string; ariaLabel?: string }) {
  return (
    <Link to={to} aria-label={ariaLabel} className={cn('font-medium text-action underline underline-offset-2 hover:text-action-hover', className)}>
      {children}
    </Link>
  );
}

const FALLBACK_MODE_LABEL: Record<MetricSource['dataMode'], string> = {
  demo: 'Modo demonstração: dados fictícios',
  institutional: 'Modo institucional: dados autorizados',
};

/** Origem e momento dos números + rótulo do modo de dados (nada de número sem fonte). */
export function SourceLine({ source }: { source: MetricSource }) {
  const platform = usePlatformInfo();
  const label = platform.data && platform.data.dataMode === source.dataMode ? platform.data.dataModeLabel : FALLBACK_MODE_LABEL[source.dataMode];
  return (
    <div className="flex items-start gap-2 text-caption text-slate">
      <Database size={20} aria-hidden className="-mt-0.5 shrink-0" />
      <p className="min-w-0">
        Fonte: {source.description} · gerado {formatRelative(source.generatedAt)} (<time dateTime={source.generatedAt}>{formatDateTime(source.generatedAt)}</time>,{' '}
        {source.timezone}){' '}
        <Badge tone={source.dataMode === 'demo' ? 'warning' : 'success'} icon={source.dataMode === 'demo' ? FlaskConical : ShieldCheck} className="align-middle">
          {label}
        </Badge>
      </p>
    </div>
  );
}

/** "Verificado às HH:MM" (horário do servidor) + botão de verificar de novo. */
export function CheckedAt({ checkedAt, fetching, failed, onRefresh }: { checkedAt: string | null | undefined; fetching: boolean; failed?: boolean; onRefresh: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {failed ? (
        <span role="alert" className="text-caption text-danger-text">
          Falha ao verificar de novo{checkedAt ? ` · mostrando a verificação das ${formatTime(checkedAt)}` : ''}
        </span>
      ) : checkedAt ? (
        <span className="text-caption text-slate">
          Verificado às <time dateTime={checkedAt}>{formatTime(checkedAt)}</time> de {formatDate(checkedAt)}
        </span>
      ) : null}
      <Button size="sm" icon={RefreshCw} onClick={onRefresh} loading={fetching}>
        Verificar agora
      </Button>
    </div>
  );
}

/** Quem e quando alterou (ou que o valor ainda é o padrão). */
export function LastChange({ updatedAt, updatedBy, defaultText = 'Valor padrão: nunca alterado.' }: { updatedAt: string | null; updatedBy: string | null; defaultText?: string }) {
  if (!updatedAt) return <span className="text-caption text-mist">{defaultText}</span>;
  return (
    <span className="text-caption text-mist">
      Alterado{updatedBy ? ` por ${updatedBy}` : ''} em <time dateTime={updatedAt}>{formatDateTime(updatedAt)}</time>.
    </span>
  );
}

/** Grade de indicadores dentro de uma única superfície (um número por item, sem um card para cada). */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('grid grid-cols-2 gap-x-6 gap-y-5', className)}>{children}</dl>;
}

export function Stat({ label, value, hint, link }: { label: string; value: ReactNode; hint?: ReactNode; link?: { to: string; label: string; ariaLabel?: string } }) {
  return (
    <div className="min-w-0">
      <dt className="text-small text-slate">{label}</dt>
      <dd className="mt-1 text-h2 font-semibold tabular-nums text-ink">{value}</dd>
      {hint ? <dd className="mt-0.5 text-caption text-mist">{hint}</dd> : null}
      {link ? (
        <dd className="mt-1">
          <TextLink to={link.to} ariaLabel={link.ariaLabel} className="text-small">
            {link.label}
          </TextLink>
        </dd>
      ) : null}
    </div>
  );
}

/** Código da requisição (o suporte localiza o registro por ele) com botão de copiar. */
export function RequestCode({ value }: { value: string }) {
  const toast = useToast();
  const copy = () => {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clipboard) {
      toast.show('Não foi possível copiar. Selecione o código e copie manualmente.', 'error');
      return;
    }
    clipboard.writeText(value).then(
      () => toast.show('Código copiado.'),
      () => toast.show('Não foi possível copiar. Selecione o código e copie manualmente.', 'error'),
    );
  };
  return (
    <span className="flex items-center gap-1">
      <span className="block max-w-44 truncate font-mono text-caption text-slate" title={value}>
        {value}
      </span>
      <IconButton size="sm" icon={Copy} label={`Copiar código ${value}`} onClick={copy} />
    </span>
  );
}

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: ReactNode;
}

/** Grupo de rádio com rótulo e descrição por opção (setas do teclado nativas do navegador). */
export function ChoiceGroup<T extends string>({
  legend,
  value,
  onChange,
  options,
  error,
  hint,
  layout = 'stack',
}: {
  legend: string;
  value: T | '';
  onChange: (value: T) => void;
  options: Array<ChoiceOption<T>>;
  error?: string | null;
  hint?: ReactNode;
  layout?: 'stack' | 'inline';
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <fieldset aria-describedby={describedBy} className="min-w-0">
      <legend className="text-small font-semibold text-ink">{legend}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="mt-0.5 text-caption text-mist">
          {hint}
        </p>
      ) : null}
      <div className={cn('mt-1.5 flex gap-2', layout === 'inline' ? 'flex-wrap' : 'flex-col')}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition-colors duration-150',
                'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-action',
                selected ? 'border-line-strong bg-snow' : 'border-line bg-white hover:border-line-strong',
              )}
            >
              <input type="radio" name={id} value={option.value} checked={selected} onChange={() => onChange(option.value)} className="mt-0.5 h-4 w-4 shrink-0 accent-action" />
              <span className="min-w-0">
                <span className="block text-body text-ink">{option.label}</span>
                {option.description ? <span className="block text-small text-slate">{option.description}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-caption text-danger-text">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Grupo de caixas de seleção (vários valores). */
export function CheckGroup<T extends string>({
  legend,
  values,
  onChange,
  options,
  error,
  hint,
}: {
  legend: string;
  values: T[];
  onChange: (values: T[]) => void;
  options: Array<{ value: T; label: string }>;
  error?: string | null;
  hint?: ReactNode;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  const toggle = (value: T, checked: boolean) => onChange(checked ? [...values, value] : values.filter((item) => item !== value));
  return (
    <fieldset aria-describedby={describedBy} className="min-w-0">
      <legend className="text-small font-semibold text-ink">{legend}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="mt-0.5 text-caption text-mist">
          {hint}
        </p>
      ) : null}
      <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-start gap-2 text-body text-ink">
            <input type="checkbox" checked={values.includes(option.value)} onChange={(event) => toggle(option.value, event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-action" />
            <span className="min-w-0">{option.label}</span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-caption text-danger-text">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Nomes de variáveis de ambiente (nunca valores). */
export function EnvNames({ names }: { names: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <code key={name} className="rounded-xs border border-line bg-snow px-1.5 py-0.5 font-mono text-caption text-ink">
          {name}
        </code>
      ))}
    </span>
  );
}
