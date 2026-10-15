import { CalendarRange, Database, DatabaseZap, FileQuestion, FlaskConical, PowerOff, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Display';
import { TextInput } from '@/components/ui/Form';
import { AccessDenied, EmptyState, ErrorState } from '@/components/feedback/States';
import { usePlatformInfo } from '@/features/platform/platform';
import { SegmentedControl } from '@/features/support/staff/components';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { isApiError } from '@/services/api/client';
import type { DataMode, MetricSource } from '@/types/api';
import { isDatabaseRequired, isFeatureDisabled, isForbiddenError, isNotFoundError } from './api';
import { describePeriod, PERIOD_OPTIONS, periodParams, type PeriodChoice, type ResolvedPeriod } from './period';

/**
 * Estados de falha das telas de indicadores e da base de conhecimento: recurso desligado (403
 * feature_disabled), banco ausente (503 database_required), sem permissão (403), não encontrado (404) ou
 * erro comum com nova tentativa. Nada é simulado: sem dados reais, a tela diz o motivo.
 */
export function InsightsFailure({ error, onRetry, notFound }: { error: unknown; onRetry?: () => void; notFound?: { title: string; description?: ReactNode; backTo: string; backLabel: string } }) {
  if (isFeatureDisabled(error)) {
    return (
      <EmptyState
        icon={PowerOff}
        title="Recurso desativado neste ambiente"
        description="A administração da plataforma desligou este recurso. Os dados voltam a aparecer quando ele for religado."
      />
    );
  }
  if (isDatabaseRequired(error)) {
    return (
      <EmptyState
        icon={DatabaseZap}
        title="Indisponível neste ambiente"
        description="Este recurso depende do banco de dados PostgreSQL, que não está ativo neste ambiente. Não exibimos números simulados no lugar dos reais."
      />
    );
  }
  if (isForbiddenError(error)) {
    return <AccessDenied description={isApiError(error) && error.message ? error.message : undefined} />;
  }
  if (notFound && isNotFoundError(error)) {
    return (
      <EmptyState
        icon={FileQuestion}
        title={notFound.title}
        description={notFound.description}
        action={
          <ButtonLink to={notFound.backTo} size="sm">
            {notFound.backLabel}
          </ButtonLink>
        }
      />
    );
  }
  return <ErrorState error={error} onRetry={onRetry} />;
}

export const DATA_MODE_LABELS: Record<DataMode, string> = {
  demo: 'DEMONSTRAÇÃO — Dados fictícios',
  institutional: 'INSTITUCIONAL — Dados autorizados',
};

/** Rótulo do modo de dados (o mesmo da faixa do portal quando a plataforma informa). */
export function DataModeBadge({ mode }: { mode: DataMode }) {
  const platform = usePlatformInfo();
  const label = platform.data && platform.data.dataMode === mode ? platform.data.dataModeLabel : DATA_MODE_LABELS[mode];
  return (
    <Badge tone={mode === 'demo' ? 'warning' : 'neutral'} icon={mode === 'demo' ? FlaskConical : ShieldCheck} className="whitespace-normal">
      {label}
    </Badge>
  );
}

/** Origem e momento dos números: descrição da consulta, quando foi gerada, fuso e modo de dados. */
export function SourceNote({ source, className }: { source: MetricSource; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 border-t border-line-soft pt-3 text-caption text-slate', className)}>
      <p className="flex items-start gap-2">
        <Database size={20} aria-hidden className="shrink-0" />
        <span>
          <span className="text-ink">Fonte:</span> {source.description}
        </span>
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          Gerado {formatRelative(source.generatedAt)} (<time dateTime={source.generatedAt}>{formatDateTime(source.generatedAt)}</time>)
        </span>
        <span aria-hidden>·</span>
        <span>Fuso {source.timezone}</span>
        <DataModeBadge mode={source.dataMode} />
      </p>
    </div>
  );
}

/**
 * Seletor de período (uma linha acima de tudo o que ele filtra): atalhos de 7, 30 e 90 dias ou datas do
 * calendário (até 366 dias). O valor fica na URL.
 */
export function PeriodPicker({ period, today, onChange, className }: { period: ResolvedPeriod; today: string; onChange: (changes: Record<string, string | null>) => void; className?: string }) {
  const setChoice = (choice: PeriodChoice) => onChange(periodParams(choice, { from: period.from, to: period.to }));
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-1.5">
        <span className="text-small font-semibold text-ink">Período</span>
        {/* rótulos curtos e sem quebra: os quatro cabem numa linha mesmo em telas de 320 px */}
        <div className="[&_[role=radio]]:whitespace-nowrap">
          <SegmentedControl label="Período" value={period.choice} options={PERIOD_OPTIONS} onChange={setChoice} />
        </div>
      </div>
      {period.choice === 'custom' ? (
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:max-w-md">
          <TextInput
            label="De"
            type="date"
            value={period.from}
            max={period.to && period.to <= today ? period.to : today}
            onChange={(event) => onChange({ periodo: 'personalizado', de: event.target.value || null, ate: period.to || null })}
          />
          <TextInput
            label="Até"
            type="date"
            value={period.to}
            min={period.from || undefined}
            max={today}
            onChange={(event) => onChange({ periodo: 'personalizado', de: period.from || null, ate: event.target.value || null })}
          />
        </div>
      ) : null}
      {period.error ? (
        <p role="alert" className="text-small text-danger-text">
          {period.error}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-small text-slate">
          <CalendarRange size={20} aria-hidden className="shrink-0" />
          <span>
            {describePeriod({ from: period.from, to: period.to })} · datas no fuso da instituição
          </span>
        </p>
      )}
    </div>
  );
}

export interface StatItem {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}

/**
 * Cabeçalho de seção das telas de indicadores: no celular a ação vai para baixo do título (sem espremer a
 * descrição numa coluna estreita); a partir de 640 px fica à direita.
 */
export function PanelHeader({ id, title, description, action }: { id: string; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h2 id={id} className="text-h3 font-semibold text-ink">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-small text-slate">{description}</p> : null}
      </div>
      {action ? <div className="-mx-3 shrink-0 self-start sm:mx-0">{action}</div> : null}
    </div>
  );
}

const STAT_COLUMNS = { 3: 'grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4' } as const;

/** Números de destaque numa única superfície (em vez de um card por número). */
export function StatGrid({ items, columns = 4, className }: { items: StatItem[]; columns?: keyof typeof STAT_COLUMNS; className?: string }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-5', STAT_COLUMNS[columns], className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-small text-slate">{item.label}</dt>
          <dd className="mt-1 break-words text-metric font-semibold text-ink">{item.value}</dd>
          {item.hint ? <dd className="mt-0.5 text-caption text-mist">{item.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** Falha numa atualização em segundo plano: os números anteriores continuam, com a data deles. */
export function RefetchFailed({ generatedAt }: { generatedAt: string }) {
  return (
    <p role="alert" className="text-small text-danger-text">
      Não foi possível atualizar agora. Os números abaixo são de {formatDateTime(generatedAt)}.
    </p>
  );
}
