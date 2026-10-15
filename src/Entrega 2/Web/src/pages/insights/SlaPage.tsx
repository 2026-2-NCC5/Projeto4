import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, ChevronDown, ClipboardList, Info, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge, List, ListItem, PageHeader, Surface } from '@/components/ui/Display';
import { AccessDenied, LoadingRows } from '@/components/feedback/States';
import { useSession } from '@/features/auth/session';
import { insightsApi, insightsKeys, type SlaQueueKind } from '@/features/insights/api';
import { DataTableView } from '@/features/insights/charts';
import { InsightsFailure, PanelHeader, SourceNote, StatGrid } from '@/features/insights/components';
import { institutionToday, presetRange } from '@/features/insights/period';
import { CategoryIcon, PriorityBadge, SLA_META, StatusBadge } from '@/features/support/labels';
import { operationsApi, staffKeys } from '@/features/support/staff/api';
import { useSupportCatalog } from '@/features/support/staff/hooks';
import { formatDateTime, formatDuration, formatNumber, formatPercent, formatRelative } from '@/lib/format';
import type { SupportTicketSummary } from '@/types/api';

const ticketHref = (ticket: SupportTicketSummary) => `/asa/chamados/${encodeURIComponent(ticket.id)}`;

const QUEUES: Record<SlaQueueKind, { title: string; description: string; empty: string; queueHref: string; queueLabel: string }> = {
  overdue: {
    title: 'Prazo excedido',
    description: 'Prazo vencido sem conclusão, do vencimento mais antigo para o mais recente.',
    empty: 'Nenhum chamado com prazo excedido agora.',
    queueHref: '/asa/chamados?sla=overdue&sort=due',
    queueLabel: 'Ver excedidos na fila',
  },
  near_deadline: {
    title: 'Prazo próximo',
    description: 'Últimos 25% do prazo ou menos de 8 horas, do vencimento mais próximo para o mais distante. Os excedidos ficam na lista acima.',
    empty: 'Nenhum chamado com prazo próximo agora.',
    // a fila da equipe filtra "em risco" (próximos e excedidos juntos)
    queueHref: '/asa/chamados?sla=at_risk&sort=due',
    queueLabel: 'Ver na fila (próximos e excedidos)',
  },
};

function DueText({ ticket }: { ticket: SupportTicketSummary }) {
  const overdue = ticket.sla.status === 'overdue';
  return (
    <time dateTime={ticket.sla.dueAt} title={formatDateTime(ticket.sla.dueAt)}>
      {overdue ? 'Venceu' : 'Vence'} {formatRelative(ticket.sla.dueAt)} · {formatDateTime(ticket.sla.dueAt)}
    </time>
  );
}

function TicketRow({ ticket }: { ticket: SupportTicketSummary }) {
  const staff = ticket.staff;
  const sla = SLA_META[ticket.sla.status];
  return (
    <ListItem
      to={ticketHref(ticket)}
      leading={<CategoryIcon categoryId={ticket.categoryId} />}
      title={ticket.subject}
      description={
        <>
          {staff ? `${staff.studentName} · RA ${staff.registrationNumber} · ` : ''}
          {ticket.categoryLabel}
          {staff ? ` · ${staff.assignedTeam} · ${staff.assignedAgentName ?? 'Sem atendente'}` : ''}
        </>
      }
      meta={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate">
          <span className="sm:hidden">
            <StatusBadge status={ticket.status} audience="staff" />
          </span>
          <span className="font-mono">{ticket.protocol}</span>
          <Badge tone={sla.tone} icon={sla.icon}>
            {sla.staffLabel}
          </Badge>
          <DueText ticket={ticket} />
          {ticket.priority !== 'normal' ? <PriorityBadge priority={ticket.priority} /> : null}
        </span>
      }
      trailing={
        <span className="hidden sm:inline-flex">
          <StatusBadge status={ticket.status} audience="staff" />
        </span>
      }
      unread={ticket.unreadCount > 0}
    />
  );
}

function SlaQueue({ kind, count }: { kind: SlaQueueKind; count: number | null }) {
  const meta = QUEUES[kind];
  const query = useInfiniteQuery({
    queryKey: insightsKeys.slaQueue(kind),
    queryFn: ({ pageParam }) => insightsApi.slaQueue(kind, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 60_000,
  });
  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const headingId = `fila-${kind}`;
  return (
    <Surface aria-labelledby={headingId}>
      <PanelHeader id={headingId} title={count !== null ? `${meta.title} (${formatNumber(count)})` : meta.title} description={meta.description} />
      {query.isPending ? (
        <LoadingRows rows={3} />
      ) : query.error && rows.length === 0 ? (
        <InsightsFailure error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <p className="text-small text-slate">{meta.empty}</p>
      ) : (
        <>
          {query.isRefetchError ? (
            <p role="alert" className="mb-3 text-small text-danger-text">
              Não foi possível atualizar esta lista agora. Ela mostra os dados da última atualização.
            </p>
          ) : null}
          <List label={`Chamados com ${meta.title.toLowerCase()}`}>
            {rows.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </List>
          {query.hasNextPage ? (
            <div className="mt-3 flex justify-center">
              <Button size="sm" icon={ChevronDown} loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                Carregar mais
              </Button>
            </div>
          ) : null}
        </>
      )}
      <div className="-mx-3 mt-3">
        <ButtonLink to={meta.queueHref} variant="ghost" size="sm" icon={ClipboardList}>
          {meta.queueLabel}
        </ButtonLink>
      </div>
    </Surface>
  );
}

/** Situação agora (contagens exatas do painel) e cumprimento nos últimos 30 dias (métricas). */
function Health({ canMetrics }: { canMetrics: boolean }) {
  const dashboard = useQuery({ queryKey: staffKeys.dashboard, queryFn: operationsApi.dashboard, refetchInterval: 60_000 });
  const range = presetRange(30, institutionToday());
  const metrics = useQuery({ queryKey: insightsKeys.metrics(range), queryFn: () => insightsApi.metrics(range), enabled: canMetrics });

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Surface aria-labelledby="sla-agora">
        <PanelHeader id="sla-agora" title="Agora" description="Chamados em aberto, pela situação do prazo neste momento." />
        {dashboard.isPending ? (
          <LoadingRows rows={2} />
        ) : dashboard.data === undefined ? (
          <InsightsFailure error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        ) : (
          <>
            <StatGrid
              columns={3}
              items={[
                { label: 'Prazo excedido', value: formatNumber(dashboard.data.tickets.slaOverdue), hint: 'Vencidos sem conclusão' },
                { label: 'Prazo próximo', value: formatNumber(dashboard.data.tickets.slaNearDeadline), hint: 'Últimos 25% do prazo ou menos de 8 h' },
                { label: 'Prazo pausado', value: formatNumber(dashboard.data.tickets.waitingStudent), hint: 'Aguardando o aluno' },
              ]}
            />
            <SourceNote source={dashboard.data.source} className="mt-5" />
          </>
        )}
      </Surface>
      {canMetrics ? (
        <Surface aria-labelledby="sla-cumprimento">
          <PanelHeader
            id="sla-cumprimento"
            title="Últimos 30 dias"
            description="Prazos concluídos no período e tempos medianos."
            action={
              <ButtonLink to="/asa/metricas" variant="ghost" size="sm" icon={BarChart3}>
                Outros períodos
              </ButtonLink>
            }
          />
          {metrics.isPending ? (
            <LoadingRows rows={2} />
          ) : metrics.data === undefined ? (
            <InsightsFailure error={metrics.error} onRetry={() => void metrics.refetch()} />
          ) : (
            <>
              <StatGrid
                columns={3}
                items={[
                  {
                    label: 'Cumprimento do SLA',
                    value: formatPercent(metrics.data.kpis.slaCompliance),
                    hint:
                      metrics.data.kpis.slaCompliance === null
                        ? 'Nenhum prazo concluído no período'
                        : `${formatNumber(metrics.data.kpis.slaCompletedCount)} ${metrics.data.kpis.slaCompletedCount === 1 ? 'prazo concluído' : 'prazos concluídos'} (cancelados não contam)`,
                  },
                  {
                    label: 'Primeira resposta no prazo',
                    value: formatPercent(metrics.data.kpis.firstResponseOnTime ?? null),
                    hint:
                      (metrics.data.kpis.firstResponseMeasured ?? 0) === 0
                        ? 'Nenhum chamado com meta de primeira resposta medido no período'
                        : `${formatNumber(metrics.data.kpis.firstResponseMeasured ?? 0)} ${(metrics.data.kpis.firstResponseMeasured ?? 0) === 1 ? 'chamado medido' : 'chamados medidos'} · mediana ${formatDuration(metrics.data.kpis.firstResponseMedianMinutes)}`,
                  },
                  { label: 'Tempo até resolver (mediana)', value: formatDuration(metrics.data.kpis.resolutionMedianMinutes) },
                ]}
              />
              <SourceNote source={metrics.data.source} className="mt-5" />
            </>
          )}
        </Surface>
      ) : null}
    </div>
  );
}

function Targets() {
  const catalog = useSupportCatalog();
  return (
    <Surface aria-labelledby="sla-metas">
      <PanelHeader id="sla-metas" title="Metas por categoria" description="Prazo de resolução vigente em cada categoria, definido pela administração." />
      {catalog.isPending ? (
        <LoadingRows rows={3} />
      ) : catalog.data === undefined ? (
        <InsightsFailure error={catalog.error} onRetry={() => void catalog.refetch()} />
      ) : (
        <DataTableView
          caption="Metas de prazo por categoria"
          headers={['Categoria', 'Primeira resposta', 'Prazo de resolução', 'Equipe responsável']}
          numeric={[1, 2]}
          maxHeightClass="max-h-none"
          minWidthClass="min-w-[30rem]"
          rows={catalog.data.categories.map((category) => ({
            key: category.id,
            cells: [
              <span key="label" className="flex items-center gap-2">
                <CategoryIcon categoryId={category.id} className="shrink-0 text-slate" />
                {category.label}
              </span>,
              category.firstResponseHours ? `${formatNumber(category.firstResponseHours)} h` : '—',
              category.slaBusinessDays === 1 ? '1 dia útil' : `${formatNumber(category.slaBusinessDays)} dias úteis`,
              category.defaultTeam,
            ],
          }))}
        />
      )}
      <div className="mt-4 flex items-start gap-2 text-small text-slate">
        <Info size={20} aria-hidden className="mt-px shrink-0" />
        <ul className="flex flex-col gap-1">
          <li>A primeira resposta conta horas corridas desde a abertura e termina na primeira ação pública da equipe (mensagem, assumir, encaminhar ou resolver).</li>
          <li>O prazo de resolução conta dias úteis (segunda a sexta, sem feriados) a partir da abertura, no fuso da instituição.</li>
          <li>Fica pausado enquanto o chamado aguarda o aluno; ao retomar, o vencimento é adiado pelo tempo em pausa.</li>
          <li>Situações: no prazo → atenção (mais da metade consumida) → prazo próximo (últimos 25% ou menos de 8 h) → prazo excedido.</li>
          <li>A meta vale para chamados abertos depois de cada mudança; reabrir um chamado começa um prazo novo.</li>
        </ul>
      </div>
    </Surface>
  );
}

/** Saúde dos prazos (SLA) para a equipe ASA: situação agora, cumprimento recente, filas e metas por categoria. */
export default function SlaPage() {
  const { can } = useSession();
  const allowed = can('tickets:read:any');
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const dashboard = useQuery({ queryKey: staffKeys.dashboard, queryFn: operationsApi.dashboard, refetchInterval: 60_000, enabled: allowed });

  if (!allowed) return <AccessDenied />;

  // atualiza tudo o que a página mostra (painel, filas de prazo e cumprimento)
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: staffKeys.dashboard }),
        queryClient.invalidateQueries({ queryKey: [...staffKeys.tickets, 'sla-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['insights', 'metrics'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };
  const counts = dashboard.data?.tickets;
  return (
    <>
      <PageHeader
        title="SLA"
        description="Prazos de atendimento: o que está vencido ou perto de vencer agora, o cumprimento recente e as metas de cada categoria."
        actions={
          <Button icon={RefreshCw} onClick={() => void refresh()} loading={refreshing}>
            Atualizar
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        <Health canMetrics={can('metrics:read')} />
        <SlaQueue kind="overdue" count={counts ? counts.slaOverdue : null} />
        <SlaQueue kind="near_deadline" count={counts ? counts.slaNearDeadline : null} />
        <Targets />
      </div>
    </>
  );
}
