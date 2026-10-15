import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Filter, ScrollText, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge, PageHeader } from '@/components/ui/Display';
import { Select, TextInput } from '@/components/ui/Form';
import { DataTable, Pagination, type Column } from '@/components/data/DataTable';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { adminApi, adminKeys, type AdminAuditQuery } from '@/features/admin/api';
import { AdminFailure, RequestCode, StateBadge } from '@/features/admin/components';
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_OUTCOME_OPTIONS,
  AUDIT_RESOURCE_OPTIONS,
  CHANNEL_LABELS,
  OUTCOME_META,
  RESOURCE_LABELS,
  ROLE_LABELS,
} from '@/features/admin/labels';
import { isDateKey } from '@/features/appointments/dates';
import { useSession } from '@/features/auth/session';
import { Freshness } from '@/features/support/staff/components';
import { formatCalendarDate, formatDateTime } from '@/lib/format';
import type { AuditEventView } from '@/types/api';

export const AUDIT_PAGE_SIZES = [25, 50, 100] as const;

/** Filtros guardados na URL com os mesmos nomes da API (dá para salvar e compartilhar a visão). */
export interface AuditFilters {
  action: string;
  outcome: string;
  resourceType: string;
  resourceId: string;
  actorUserId: string;
  from: string;
  to: string;
  pageSize: string;
}

const FILTER_KEYS: Array<keyof AuditFilters> = ['action', 'outcome', 'resourceType', 'resourceId', 'actorUserId', 'from', 'to', 'pageSize'];

export function filtersFromParams(params: URLSearchParams): AuditFilters {
  const text = (key: string, max: number) => (params.get(key) ?? '').trim().slice(0, max);
  const outcome = params.get('outcome') ?? '';
  const pageSize = params.get('pageSize') ?? '';
  return {
    action: text('action', 60),
    outcome: AUDIT_OUTCOME_OPTIONS.some((option) => option.value === outcome) ? outcome : '',
    resourceType: text('resourceType', 40),
    resourceId: text('resourceId', 120),
    actorUserId: text('actorUserId', 80),
    from: isDateKey(params.get('from')) ? (params.get('from') as string) : '',
    to: isDateKey(params.get('to')) ? (params.get('to') as string) : '',
    pageSize: (AUDIT_PAGE_SIZES as readonly number[]).includes(Number(pageSize)) ? pageSize : '',
  };
}

/** Inclui na lista o valor vindo da URL quando ele não está entre as opções (o filtro continua visível). */
function withCurrent(options: Array<{ value: string; label: string }>, current: string, label: (value: string) => string) {
  return current && !options.some((option) => option.value === current) ? [...options, { value: current, label: label(current) }] : options;
}

function MetadataList({ metadata }: { metadata: AuditEventView['metadata'] }) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return <span className="text-small text-mist">—</span>;
  const shown = entries.slice(0, 4);
  const format = (value: string | number | boolean | null) => (value === null ? '—' : typeof value === 'boolean' ? (value ? 'sim' : 'não') : String(value));
  return (
    <dl className="flex max-w-52 flex-col gap-0.5 font-mono text-caption text-slate">
      {shown.map(([key, value]) => (
        <div key={key} className="flex min-w-0 gap-1">
          <dt className="shrink-0">{key}:</dt>
          <dd className="truncate text-ink" title={format(value)}>
            {format(value)}
          </dd>
        </div>
      ))}
      {entries.length > shown.length ? <div className="text-mist">+{entries.length - shown.length}</div> : null}
    </dl>
  );
}

function ActorCell({ event }: { event: AuditEventView }) {
  const { actor } = event;
  const name = actor.name ?? (actor.userId ? 'Conta removida' : event.channel === 'system' ? 'Sistema' : 'Não identificada');
  return (
    <div className="min-w-0">
      {actor.userId ? (
        <Link
          to={`/admin/auditoria?actorUserId=${encodeURIComponent(actor.userId)}`}
          className="text-small font-medium text-action hover:underline"
          aria-label={`Ver só os registros de ${name}`}
        >
          {name}
        </Link>
      ) : (
        <p className="text-small text-ink">{name}</p>
      )}
      {actor.role ? <p className="text-caption text-mist">{ROLE_LABELS[actor.role] ?? actor.role}</p> : null}
    </div>
  );
}

const columns: Column<AuditEventView>[] = [
  {
    key: 'when',
    header: 'Quando e canal',
    render: (row) => (
      <div className="min-w-0">
        <time dateTime={row.occurredAt} className="block whitespace-nowrap text-small text-ink">
          {formatDateTime(row.occurredAt)}
        </time>
        <span className="whitespace-nowrap text-caption text-mist">{CHANNEL_LABELS[row.channel] ?? row.channel}</span>
      </div>
    ),
  },
  { key: 'actor', header: 'Pessoa', className: 'min-w-[10rem]', render: (row) => <ActorCell event={row} /> },
  {
    key: 'action',
    header: 'Ação',
    className: 'min-w-[12rem]',
    render: (row) => (
      <div className="min-w-0">
        <p className="text-small text-ink">{row.label}</p>
        <p className="font-mono text-caption text-mist">{row.action}</p>
      </div>
    ),
  },
  { key: 'outcome', header: 'Resultado', render: (row) => <StateBadge meta={OUTCOME_META[row.outcome]} /> },
  {
    key: 'resource',
    header: 'Recurso',
    render: (row) =>
      row.resource ? (
        <div className="min-w-0 max-w-48">
          <p className="text-small text-ink">{RESOURCE_LABELS[row.resource.type] ?? row.resource.type}</p>
          {row.resource.id ? (
            <p className="truncate font-mono text-caption text-mist" title={row.resource.id}>
              {row.resource.id}
            </p>
          ) : null}
        </div>
      ) : (
        <span className="text-small text-mist">—</span>
      ),
  },
  {
    key: 'details',
    header: 'Detalhes e código',
    render: (row) => (
      <div className="flex min-w-0 flex-col gap-1">
        <MetadataList metadata={row.metadata} />
        {row.requestId ? <RequestCode value={row.requestId} /> : null}
      </div>
    ),
  },
];

function FiltersForm({ initial, onApply }: { initial: AuditFilters; onApply: (filters: AuditFilters) => void }) {
  const [draft, setDraft] = useState<AuditFilters>(initial);
  const set = (key: keyof AuditFilters, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const rangeError = draft.from && draft.to && draft.to < draft.from ? 'A data final deve ser igual ou posterior à inicial.' : null;
  return (
    <form
      aria-label="Filtros da auditoria"
      className="mb-4 flex flex-col gap-3 rounded-lg border border-line bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (rangeError) return;
        onApply({ ...draft, resourceId: draft.resourceId.trim(), actorUserId: draft.actorUserId.trim() });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select label="Ação" value={draft.action} placeholder="Todas" options={withCurrent(AUDIT_ACTION_OPTIONS, draft.action, (value) => `Código: ${value}`)} onChange={(event) => set('action', event.target.value)} />
        <Select label="Resultado" value={draft.outcome} placeholder="Todos" options={AUDIT_OUTCOME_OPTIONS} onChange={(event) => set('outcome', event.target.value)} />
        <Select
          label="Tipo de recurso"
          value={draft.resourceType}
          placeholder="Todos"
          options={withCurrent(AUDIT_RESOURCE_OPTIONS, draft.resourceType, (value) => `Código: ${value}`)}
          onChange={(event) => set('resourceType', event.target.value)}
        />
        <TextInput label="Código do recurso" value={draft.resourceId} maxLength={120} onChange={(event) => set('resourceId', event.target.value)} placeholder="Ex.: id da conta ou do chamado" />
        <TextInput label="Código da pessoa" value={draft.actorUserId} maxLength={80} onChange={(event) => set('actorUserId', event.target.value)} hint="Id da conta de quem fez a ação." />
        <TextInput
          label="De"
          type="date"
          value={draft.from}
          max={draft.to || undefined}
          onChange={(event) => set('from', event.target.value)}
          hint={draft.to && !draft.from ? 'Sem data inicial: considera os 30 dias até a data final.' : undefined}
        />
        <TextInput label="Até" type="date" value={draft.to} min={draft.from || undefined} error={rangeError} onChange={(event) => set('to', event.target.value)} />
        <Select
          label="Registros por página"
          value={draft.pageSize || String(AUDIT_PAGE_SIZES[0])}
          options={AUDIT_PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
          onChange={(event) => set('pageSize', event.target.value === String(AUDIT_PAGE_SIZES[0]) ? '' : event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" icon={Filter} disabled={Boolean(rangeError)}>
          Aplicar filtros
        </Button>
      </div>
    </form>
  );
}

/** Trilha de auditoria completa: filtros na URL, paginação no servidor, código de suporte por registro. */
export default function AuditPage() {
  const { can } = useSession();
  const allowed = can('audit:read:any');
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const rangeError = filters.from && filters.to && filters.to < filters.from ? 'A data final deve ser igual ou posterior à inicial.' : null;
  const apiQuery: AdminAuditQuery = {
    page,
    pageSize: Number(filters.pageSize || AUDIT_PAGE_SIZES[0]),
    ...Object.fromEntries(FILTER_KEYS.filter((key) => key !== 'pageSize' && filters[key]).map((key) => [key, filters[key]])),
  };
  const query = useQuery({ queryKey: adminKeys.audit(apiQuery), queryFn: () => adminApi.auditEvents(apiQuery), placeholderData: keepPreviousData, enabled: allowed && !rangeError });
  const actor = useQuery({
    queryKey: adminKeys.user(filters.actorUserId),
    queryFn: () => adminApi.user(filters.actorUserId),
    enabled: allowed && can('users:manage') && Boolean(filters.actorUserId),
    retry: false,
  });

  if (!allowed) return <AccessDenied />;

  const apply = (next: AuditFilters) => {
    const search = new URLSearchParams();
    for (const key of FILTER_KEYS) if (next[key]) search.set(key, next[key]);
    setParams(search);
  };
  const removeFilter = (key: keyof AuditFilters) => apply({ ...filters, [key]: '' });
  const active = FILTER_KEYS.filter((key) => key !== 'pageSize' && filters[key]);
  const chipLabel = (key: keyof AuditFilters): string => {
    const value = filters[key];
    switch (key) {
      case 'action':
        return `Ação: ${AUDIT_ACTION_OPTIONS.find((option) => option.value === value)?.label ?? value}`;
      case 'outcome':
        return `Resultado: ${OUTCOME_META[value as AuditEventView['outcome']]?.label ?? value}`;
      case 'resourceType':
        return `Recurso: ${RESOURCE_LABELS[value] ?? value}`;
      case 'resourceId':
        return `Código do recurso: ${value}`;
      case 'actorUserId':
        return `Pessoa: ${actor.data?.fullName ?? value}`;
      case 'from':
        return `De: ${formatCalendarDate(value)}`;
      case 'to':
        return `Até: ${formatCalendarDate(value)}`;
      default:
        return value;
    }
  };

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Tudo o que acontece na plataforma fica registrado: entradas, permissões negadas, mudanças de contas, configurações e ações em chamados. Use o código para localizar o registro com o suporte."
        actions={<Freshness updatedAt={query.dataUpdatedAt} fetching={query.isFetching} failed={query.isRefetchError} onRefresh={() => void query.refetch()} />}
      />
      <FiltersForm key={params.toString()} initial={filters} onApply={apply} />
      {active.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Filtros aplicados" role="group">
          {active.map((key) => (
            <span key={key} className="inline-flex items-center gap-1 rounded-md border border-line bg-white py-0.5 pl-3 pr-1 text-small text-ink">
              <span className="max-w-[18rem] truncate">{chipLabel(key)}</span>
              <button type="button" aria-label={`Remover filtro ${chipLabel(key)}`} className="rounded-sm p-1 text-slate hover:bg-snow hover:text-ink" onClick={() => removeFilter(key)}>
                <X size={16} aria-hidden />
              </button>
            </span>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setParams(new URLSearchParams())}>
            Limpar todos
          </Button>
        </div>
      ) : null}
      {rangeError ? (
        <EmptyState title="Período inválido" description={rangeError} />
      ) : query.isPending ? (
        <LoadingRows rows={6} />
      ) : query.data === undefined ? (
        <AdminFailure error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar a auditoria" />
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={ScrollText} title="Nenhum registro" description={active.length > 0 ? 'Nenhum registro com estes filtros.' : 'Ainda não há registros na trilha de auditoria.'} />
      ) : (
        <>
          <p className="mb-2 text-caption text-slate">
            <Badge tone="neutral">{query.data.total} registros</Badge> <span className="ml-1">do mais recente para o mais antigo</span>
          </p>
          <DataTable caption="Registros da trilha de auditoria" columns={columns} rows={query.data.items} rowKey={(row) => row.id} />
          <Pagination
            page={query.data.page}
            pageSize={query.data.pageSize}
            total={query.data.total}
            onPage={(target) =>
              setParams((current) => {
                const next = new URLSearchParams(current);
                if (target > 1) next.set('page', String(target));
                else next.delete('page');
                return next;
              })
            }
          />
        </>
      )}
    </>
  );
}
