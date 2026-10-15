import { useInfiniteQuery } from '@tanstack/react-query';
import { AlarmClock, AlertTriangle, ChevronDown, ChevronUp, MessageCircle, SlidersHorizontal, TimerOff, UserPlus, X } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Display';
import { Select } from '@/components/ui/Form';
import { DataTable, FilterChips, SearchInput, type Column } from '@/components/data/DataTable';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { useSession } from '@/features/auth/session';
import { PRIORITY_META, StatusBadge, isFinished } from '@/features/support/labels';
import { staffKeys, staffTicketsApi } from '@/features/support/staff/api';
import { Freshness, LoadError, PriorityCell, SlaCell, ToggleChip, UnreadBadge } from '@/features/support/staff/components';
import { useClaimTicket, useSupportCatalog } from '@/features/support/staff/hooks';
import {
  hasActiveFilters,
  parseQueueFilters,
  PRIORITY_OPTIONS,
  STATUS_GROUP_LABELS,
  statusParamFor,
  toStaffQuery,
  type StatusGroup,
} from '@/features/support/staff/queueFilters';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { messageForError } from '@/services/api/client';
import type { SupportTicketPriority, SupportTicketSummary } from '@/types/api';

export const QUEUE_PAGE_SIZE = 25;

const GROUP_ORDER: Array<Exclude<StatusGroup, 'custom'>> = ['active', 'triage', 'waiting_student', 'finished', 'all'];

const ticketHref = (row: SupportTicketSummary) => `/asa/chamados/${encodeURIComponent(row.id)}`;

/** Inclui na lista o valor vindo da URL quando ele não está entre as opções (o filtro continua visível). */
function withCurrent(options: Array<{ value: string; label: string }>, current: string, label: (value: string) => string) {
  return current && !options.some((option) => option.value === current) ? [...options, { value: current, label: label(current) }] : options;
}

function AssigneeCell({ row, canClaim, claiming, onClaim }: { row: SupportTicketSummary; canClaim: boolean; claiming: boolean; onClaim: () => void }) {
  const staff = row.staff;
  const unassigned = !staff?.assignedAgentId;
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <span className="text-small text-ink">{staff?.assignedTeam ?? '—'}</span>
      <span className={cn('text-caption', unassigned ? 'text-mist' : 'text-slate')}>{unassigned ? 'Sem atendente' : (staff?.assignedAgentName ?? 'Atendente')}</span>
      {unassigned && canClaim && staff && !isFinished(row.status) ? (
        <Button size="sm" icon={UserPlus} loading={claiming} onClick={onClaim} aria-label={`Assumir o chamado ${row.protocol}`}>
          Assumir
        </Button>
      ) : null}
    </div>
  );
}

/** Fila de chamados da equipe: filtros na URL, atualização a cada 30 s e "Assumir" direto na linha. */
export default function TicketQueuePage() {
  const { can } = useSession();
  const allowed = can('tickets:read:any');
  const canManage = can('tickets:manage');
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseQueueFilters(params), [params]);
  const apiQuery = useMemo(() => toStaffQuery(filters), [filters]);
  const catalog = useSupportCatalog();
  const claim = useClaimTicket();
  // em telas pequenas os seletores ficam recolhidos (a fila aparece antes); no desktop, sempre visíveis
  const [showFilters, setShowFilters] = useState(false);
  const filtersId = useId();

  const query = useInfiniteQuery({
    queryKey: staffKeys.list(apiQuery),
    queryFn: ({ pageParam }) => staffTicketsApi.list({ ...apiQuery, limit: QUEUE_PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 30_000,
    enabled: allowed,
  });

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const onSearch = useCallback((value: string) => update({ search: value || null }), [update]);

  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  if (!allowed) return <AccessDenied />;

  const teamOptions = withCurrent(
    (catalog.data?.teams ?? []).map((team) => ({ value: team, label: team })),
    filters.team,
    (value) => value,
  );
  const categoryOptions = withCurrent(
    (catalog.data?.categories ?? []).map((category) => ({ value: category.id, label: category.label })),
    filters.category,
    (value) => value,
  );
  const priorityOptions = withCurrent(PRIORITY_OPTIONS, filters.priority, (value) =>
    value
      .split(',')
      .map((item) => PRIORITY_META[item as SupportTicketPriority]?.label ?? item)
      .join(' ou '),
  );
  const groupOptions = [...GROUP_ORDER, ...(filters.group === 'custom' ? (['custom'] as const) : [])].map((group) => ({ value: group, label: STATUS_GROUP_LABELS[group] }));

  const columns: Column<SupportTicketSummary>[] = [
    {
      key: 'ticket',
      header: 'Chamado',
      className: 'min-w-[11rem]',
      render: (row) => (
        <div className="min-w-0 max-w-[22rem]">
          <Link to={ticketHref(row)} className={cn('line-clamp-2 text-ink hover:text-action hover:underline', row.unreadCount > 0 ? 'font-semibold' : 'font-medium')}>
            {row.subject}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-caption text-mist">
            <span className="font-mono">{row.protocol}</span>
            <UnreadBadge count={row.unreadCount} />
          </div>
        </div>
      ),
    },
    {
      key: 'student',
      header: 'Aluno',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-small text-ink">{row.staff?.studentName ?? '—'}</p>
          <p className="whitespace-nowrap font-mono text-caption text-mist">{row.staff ? `RA ${row.staff.registrationNumber}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Categoria',
      hideOnMobile: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="text-small text-ink">{row.categoryLabel}</p>
          {row.subcategoryLabel ? <p className="text-caption text-mist">{row.subcategoryLabel}</p> : null}
        </div>
      ),
    },
    { key: 'status', header: 'Situação', render: (row) => <StatusBadge status={row.status} audience="staff" /> },
    { key: 'priority', header: 'Prioridade', render: (row) => <PriorityCell priority={row.priority} /> },
    {
      key: 'assignee',
      header: 'Responsável',
      render: (row) => (
        <AssigneeCell
          row={row}
          canClaim={canManage}
          claiming={claim.isPending && claim.variables?.id === row.id}
          onClaim={() => row.staff && claim.mutate({ id: row.id, protocol: row.protocol, team: row.staff.assignedTeam })}
        />
      ),
    },
    { key: 'sla', header: 'Prazo', render: (row) => <SlaCell sla={row.sla} /> },
    {
      key: 'updated',
      header: 'Atualizado',
      render: (row) => (
        <time dateTime={row.updatedAt} title={formatDateTime(row.updatedAt)} className="whitespace-nowrap text-small text-slate">
          {formatRelative(row.updatedAt)}
        </time>
      ),
    },
  ];

  const filtered = hasActiveFilters(filters);
  const selectFilterCount = [filters.team, filters.category, filters.priority, filters.assigned, filters.sort === 'due' ? 'due' : ''].filter(Boolean).length;

  return (
    <>
      <PageHeader title="Fila de chamados" description="Chamados dos alunos com o ASA. Os filtros ficam no endereço da página: dá para salvar ou compartilhar a visão." />

      <div className="mb-4 flex flex-col gap-4">
        <FilterChips
          label="Situação dos chamados"
          value={filters.group}
          options={groupOptions}
          onChange={(group) => {
            if (group === 'custom') return;
            update({ status: statusParamFor(group) });
          }}
        />
        <Button
          size="sm"
          icon={SlidersHorizontal}
          iconRight={showFilters ? ChevronUp : ChevronDown}
          className="self-start lg:hidden"
          aria-expanded={showFilters}
          aria-controls={filtersId}
          onClick={() => setShowFilters((value) => !value)}
        >
          {selectFilterCount > 0 ? `Filtros (${selectFilterCount})` : 'Filtros'}
        </Button>
        <div id={filtersId} className={cn('grid-cols-1 gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-3 xl:grid-cols-5', showFilters ? 'grid' : 'hidden')}>
          <Select label="Equipe" value={filters.team} placeholder="Todas" options={teamOptions} disabled={catalog.isPending} onChange={(event) => update({ team: event.target.value || null })} />
          <Select label="Categoria" value={filters.category} placeholder="Todas" options={categoryOptions} disabled={catalog.isPending} onChange={(event) => update({ category: event.target.value || null })} />
          <Select label="Prioridade" value={filters.priority} placeholder="Todas" options={priorityOptions} onChange={(event) => update({ priority: event.target.value || null })} />
          <Select
            label="Atendente"
            value={filters.assigned}
            placeholder="Todos"
            options={[
              { value: 'mine', label: 'Meus chamados' },
              { value: 'unassigned', label: 'Sem atendente' },
            ]}
            onChange={(event) => update({ assigned: event.target.value || null })}
          />
          <Select
            label="Ordenar por"
            value={filters.sort}
            options={[
              { value: 'updated', label: 'Última atualização' },
              { value: 'due', label: 'Prazo mais próximo' },
            ]}
            onChange={(event) => update({ sort: event.target.value === 'due' ? 'due' : null })}
          />
        </div>
        {catalog.error ? <p className="text-caption text-danger-text">Não foi possível carregar equipes e categorias. Os demais filtros funcionam.</p> : null}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <SearchInput value={filters.search} onChange={onSearch} label="Buscar por assunto, protocolo ou aluno" placeholder="Assunto, protocolo ou aluno" />
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros rápidos">
              {/* filtros de prazo são exclusivos entre si: ligar um desliga os outros */}
              <ToggleChip pressed={filters.sla === 'at_risk'} onChange={(on) => update({ sla: on ? 'at_risk' : null })} icon={<AlertTriangle size={16} aria-hidden />}>
                Em risco de SLA
              </ToggleChip>
              <ToggleChip pressed={filters.sla === 'near_deadline'} onChange={(on) => update({ sla: on ? 'near_deadline' : null })} icon={<AlarmClock size={16} aria-hidden />}>
                Prazo próximo
              </ToggleChip>
              <ToggleChip pressed={filters.sla === 'overdue'} onChange={(on) => update({ sla: on ? 'overdue' : null })} icon={<TimerOff size={16} aria-hidden />}>
                Prazo excedido
              </ToggleChip>
              <ToggleChip pressed={filters.unread} onChange={(on) => update({ unread: on ? '1' : null })} icon={<MessageCircle size={16} aria-hidden />}>
                Não lidas
              </ToggleChip>
            </div>
            {filtered ? (
              <Button variant="ghost" size="sm" icon={X} className="self-start sm:self-auto" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Limpar filtros
              </Button>
            ) : null}
          </div>
          <Freshness updatedAt={query.dataUpdatedAt} fetching={query.isFetching && !query.isFetchingNextPage} failed={query.isRefetchError} onRefresh={() => void query.refetch()} />
        </div>
      </div>

      {query.isPending ? (
        <LoadingRows rows={6} />
      ) : query.data === undefined ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} notFoundTitle="Fila indisponível" backTo="/asa" backLabel="Voltar ao painel" />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filtered ? 'Nenhum chamado com estes filtros' : 'Nenhum chamado ativo'}
          description={filtered ? 'Ajuste ou limpe os filtros para ver outros chamados.' : 'Quando um aluno abrir um chamado, ele aparece aqui.'}
          action={
            filtered ? (
              <Button size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Limpar filtros
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mb-2 text-caption text-mist" aria-live="polite">
            {rows.length === 1 ? '1 chamado carregado' : `${rows.length} chamados carregados`}
            {query.hasNextPage ? ' · há mais chamados com estes filtros' : ''}
          </p>
          <DataTable caption="Fila de chamados" columns={columns} rows={rows} rowKey={(row) => row.id} rowHref={ticketHref} />
          {query.hasNextPage ? (
            <div className="mt-3 flex flex-col items-center gap-2">
              {query.isFetchNextPageError ? (
                <p role="alert" className="text-small text-danger-text">
                  {messageForError(query.error, 'Não foi possível carregar mais chamados.')}
                </p>
              ) : null}
              <Button onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
                Carregar mais
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
