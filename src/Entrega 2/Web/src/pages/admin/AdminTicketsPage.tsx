import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, EyeOff, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge, PageHeader } from '@/components/ui/Display';
import { Select } from '@/components/ui/Form';
import { DataTable, Pagination, type Column } from '@/components/data/DataTable';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { adminApi, adminKeys, type AdminTicketsQuery } from '@/features/admin/api';
import { AdminFailure, Notice } from '@/features/admin/components';
import { useSession } from '@/features/auth/session';
import { ACTIVE_STATUSES, FINISHED_STATUSES, SLA_META, STATUS_META, StatusBadge } from '@/features/support/labels';
import { CHANNEL_LABELS, Freshness, PriorityCell } from '@/features/support/staff/components';
import { useSupportCatalog } from '@/features/support/staff/hooks';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { AdminTicketMetadata, SupportTicketStatus } from '@/types/api';

export const ADMIN_TICKETS_PAGE_SIZE = 25;

const STATUS_VALUES = Object.keys(STATUS_META) as SupportTicketStatus[];

/** Opções de situação: grupos (em aberto, finalizados) e cada situação; um valor desconhecido da URL continua visível. */
function statusOptions(current: string) {
  const options = [
    { value: ACTIVE_STATUSES.join(','), label: 'Em aberto' },
    { value: FINISHED_STATUSES.join(','), label: 'Finalizados' },
    ...STATUS_VALUES.map((status) => ({ value: status, label: STATUS_META[status].short })),
  ];
  return current && !options.some((option) => option.value === current) ? [...options, { value: current, label: 'Filtro do endereço' }] : options;
}

/** Prazo só com o que a API de metadados traz (situação e vencimento). */
function SlaCell({ sla }: { sla: AdminTicketMetadata['sla'] }) {
  const meta = SLA_META[sla.status];
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge tone={meta.tone} icon={meta.icon}>
        {meta.staffLabel}
      </Badge>
      {sla.status === 'completed' || sla.status === 'paused' ? null : (
        <time dateTime={sla.dueAt} className="whitespace-nowrap text-caption text-mist">
          {sla.status === 'overdue' ? 'venceu' : 'vence'} {formatDateTime(sla.dueAt)}
        </time>
      )}
    </span>
  );
}

const columns: Column<AdminTicketMetadata>[] = [
  { key: 'protocol', header: 'Protocolo', render: (row) => <span className="whitespace-nowrap font-mono text-small text-ink">{row.protocol}</span> },
  { key: 'category', header: 'Categoria', render: (row) => <span className="text-small text-ink">{row.categoryLabel}</span> },
  { key: 'status', header: 'Situação', render: (row) => <StatusBadge status={row.status} audience="staff" /> },
  { key: 'priority', header: 'Prioridade', render: (row) => <PriorityCell priority={row.priority} /> },
  { key: 'sla', header: 'Prazo', render: (row) => <SlaCell sla={row.sla} /> },
  { key: 'team', header: 'Equipe', hideOnMobile: true, render: (row) => <span className="text-small text-slate">{row.team}</span> },
  { key: 'channel', header: 'Canal', hideOnMobile: true, render: (row) => <span className="whitespace-nowrap text-small text-slate">{CHANNEL_LABELS[row.channel] ?? row.channel}</span> },
  {
    key: 'created',
    header: 'Aberto em',
    render: (row) => (
      <time dateTime={row.createdAt} className="whitespace-nowrap text-small text-slate">
        {formatDateTime(row.createdAt)}
      </time>
    ),
  },
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

/** Chamados para a administração: só metadados (protocolo, categoria, situação, prazos), nunca o conteúdo. */
export default function AdminTicketsPage() {
  const { can } = useSession();
  const allowed = can('tickets:read:metadata');
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const category = params.get('category') ?? '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const apiQuery: AdminTicketsQuery = { page, pageSize: ADMIN_TICKETS_PAGE_SIZE, ...(status ? { status } : {}), ...(category ? { category } : {}) };
  const query = useQuery({ queryKey: adminKeys.tickets(apiQuery), queryFn: () => adminApi.tickets(apiQuery), placeholderData: keepPreviousData, enabled: allowed });
  const catalog = useSupportCatalog();

  if (!allowed) return <AccessDenied />;

  const update = (changes: Record<string, string | null>, resetPage = true) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (resetPage) next.delete('page');
        return next;
      },
      { replace: resetPage },
    );

  const categories = (catalog.data?.categories ?? []).map((item) => ({ value: item.id, label: item.label }));
  const categoryOptions = category && !categories.some((option) => option.value === category) ? [...categories, { value: category, label: category }] : categories;
  const filtered = Boolean(status || category);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/admin" className="inline-flex items-center gap-1 rounded-sm text-small text-slate hover:text-ink">
            <ArrowLeft size={20} aria-hidden />
            Visão geral
          </Link>
        }
        title="Chamados (metadados)"
        description="Protocolo, categoria, situação, prioridade e prazos para acompanhar a operação."
      />
      <Notice tone="info" title="Conteúdo dos chamados é só da equipe ASA" className="mb-4">
        Assunto, mensagens, anexos e a identificação dos alunos não aparecem para a administração. Para tratar um chamado, a equipe ASA usa a fila da Operação ASA.
      </Notice>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[34rem]">
          <Select label="Situação" value={status} placeholder="Todas" options={statusOptions(status)} onChange={(event) => update({ status: event.target.value || null })} />
          <Select
            label="Categoria"
            value={category}
            placeholder="Todas"
            options={categoryOptions}
            disabled={catalog.isPending}
            onChange={(event) => update({ category: event.target.value || null })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filtered ? (
            <Button variant="ghost" size="sm" icon={X} onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              Limpar filtros
            </Button>
          ) : null}
          <Freshness updatedAt={query.dataUpdatedAt} fetching={query.isFetching} failed={query.isRefetchError} onRefresh={() => void query.refetch()} />
        </div>
      </div>
      {catalog.error ? (
        <p className="mb-3 text-caption text-danger-text">Não foi possível carregar as categorias. O filtro mostra os códigos e os demais filtros funcionam.</p>
      ) : null}
      {query.isPending ? (
        <LoadingRows rows={6} />
      ) : query.data === undefined ? (
        <AdminFailure error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={EyeOff} title="Nenhum chamado" description={filtered ? 'Nenhum chamado com estes filtros.' : 'Ainda não há chamados registrados.'} />
      ) : (
        <>
          <DataTable caption="Metadados dos chamados" columns={columns} rows={query.data.items} rowKey={(row) => row.id} />
          <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPage={(target) => update({ page: target > 1 ? String(target) : null }, false)} />
        </>
      )}
    </>
  );
}
