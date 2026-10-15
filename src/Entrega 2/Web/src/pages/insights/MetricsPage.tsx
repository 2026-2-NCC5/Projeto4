import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Loader2, RefreshCw, ShieldCheck, Timer } from 'lucide-react';
import { useId, useState, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { Button, ButtonLink, buttonClasses } from '@/components/ui/Button';
import { PageHeader, Surface } from '@/components/ui/Display';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { useSession } from '@/features/auth/session';
import { CSV_MAX_ROWS, insightsApi, insightsKeys, saveCsvFile, ticketsCsvFilename, ticketsCsvHref } from '@/features/insights/api';
import { useInsightsArea } from '@/features/insights/area';
import { BreakdownChart, ChartFigure, DailyLineChart, DataTableView, LineLegend, type LineSeries } from '@/features/insights/charts';
import { InsightsFailure, PanelHeader, PeriodPicker, RefetchFailed, SourceNote, StatGrid, type StatItem } from '@/features/insights/components';
import { usePeriodFromUrl } from '@/features/insights/hooks';
import { labelTicketStatuses } from '@/features/insights/labels';
import type { PeriodQuery } from '@/features/insights/period';
import { cn } from '@/lib/cn';
import { formatCalendarDate, formatDuration, formatNumber, formatPercent } from '@/lib/format';
import { messageForError } from '@/services/api/client';
import type { TicketMetrics } from '@/types/api';

const rating = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const plural = (count: number, one: string, many: string) => `${formatNumber(count)} ${count === 1 ? one : many}`;

function kpiItems(kpis: TicketMetrics['kpis']): StatItem[] {
  return [
    { label: 'Abertos no período', value: formatNumber(kpis.created) },
    { label: 'Resolvidos no período', value: formatNumber(kpis.resolved) },
    { label: 'Em aberto agora', value: formatNumber(kpis.backlog), hint: 'Não depende do período' },
    {
      label: 'Cumprimento do SLA',
      value: formatPercent(kpis.slaCompliance),
      hint: kpis.slaCompliance === null ? 'Nenhum prazo concluído no período' : `Base: ${plural(kpis.slaCompletedCount, 'prazo concluído', 'prazos concluídos')} (cancelados não contam)`,
    },
    {
      label: 'Primeira resposta (mediana)',
      value: formatDuration(kpis.firstResponseMedianMinutes),
      hint: kpis.firstResponseMedianMinutes === null ? 'Sem respostas da equipe no período' : 'Da abertura até a primeira resposta pública da equipe',
    },
    {
      label: 'Tempo até resolver (mediana)',
      value: formatDuration(kpis.resolutionMedianMinutes),
      hint: kpis.resolutionMedianMinutes === null ? 'Nenhum chamado resolvido no período' : 'Da abertura até a situação "resolvido"',
    },
    {
      label: 'Avaliação média',
      value: kpis.ratingAverage === null ? '—' : `${rating(kpis.ratingAverage)} de 5`,
      hint: kpis.ratingCount === 0 ? 'Nenhuma avaliação no período' : plural(kpis.ratingCount, 'avaliação de aluno', 'avaliações de alunos'),
    },
  ];
}

function DailyChart({ series }: { series: TicketMetrics['series'] }) {
  const dates = series.map((point) => point.date);
  const lines: LineSeries[] = [
    { key: 'created', label: 'Abertos', values: series.map((point) => point.created) },
    { key: 'resolved', label: 'Resolvidos', values: series.map((point) => point.resolved) },
  ];
  const empty = series.every((point) => point.created === 0 && point.resolved === 0);
  const title = 'Abertos e resolvidos por dia';
  if (empty) {
    return (
      <section className="min-w-0">
        <h3 className="text-h4 font-semibold text-ink">{title}</h3>
        <p className="mt-2 text-small text-slate">Nenhum chamado aberto ou resolvido no período.</p>
      </section>
    );
  }
  return (
    <ChartFigure
      title={title}
      description="Chamados abertos e chamados resolvidos em cada dia do período."
      legend={<LineLegend series={lines} />}
      table={
        <DataTableView
          caption={title}
          headers={['Data', 'Abertos', 'Resolvidos']}
          numeric={[1, 2]}
          rows={series.map((point) => ({ key: point.date, cells: [formatCalendarDate(point.date), formatNumber(point.created), formatNumber(point.resolved)] }))}
        />
      }
    >
      <DailyLineChart dates={dates} series={lines} label={title} />
    </ChartFigure>
  );
}

function Appointments({ data }: { data: NonNullable<TicketMetrics['appointments']> }) {
  return (
    <Surface aria-labelledby="metricas-agendamentos">
      <PanelHeader id="metricas-agendamentos" title="Agendamentos no período" description="Atendimentos marcados para começar dentro do período." />
      <StatGrid
        items={[
          { label: 'Marcados', value: formatNumber(data.booked), hint: 'Inclui os cancelados' },
          { label: 'Realizados', value: formatNumber(data.completed) },
          { label: 'Cancelados', value: formatNumber(data.cancelled) },
          { label: 'Não compareceu', value: formatNumber(data.noShow) },
        ]}
      />
    </Surface>
  );
}

/**
 * Baixar o CSV: é um link comum para a rota do relatório (a sessão vai no cookie), mas o clique passa pelo
 * cliente da API para renovar a sessão se preciso e explicar erros (ex.: período com mais de 5.000 chamados).
 */
function CsvDownload({ period, describedBy }: { period: PeriodQuery; describedBy: string }) {
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; message?: string; file?: string }>({ status: 'idle' });
  const filename = ticketsCsvFilename(period);
  const loading = state.status === 'loading';
  const onClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (loading) return;
    setState({ status: 'loading' });
    try {
      const content = await insightsApi.ticketsCsv(period);
      saveCsvFile(content, filename);
      setState({ status: 'done', file: filename });
    } catch (error) {
      setState({ status: 'error', message: messageForError(error, 'Não foi possível gerar o relatório. Tente novamente.') });
    }
  };
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <a href={ticketsCsvHref(period)} download={filename} onClick={onClick} aria-busy={loading || undefined} aria-describedby={describedBy} className={buttonClasses('primary', 'md')}>
        {loading ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Download size={18} aria-hidden />}
        Exportar CSV
      </a>
      {state.status === 'error' ? (
        <p role="alert" className="max-w-sm text-small text-danger-text">
          {state.message}
        </p>
      ) : state.status === 'done' ? (
        <p role="status" className="max-w-sm text-small text-slate">
          Arquivo {state.file} gerado. A exportação foi registrada na auditoria.
        </p>
      ) : null}
    </div>
  );
}

function ExportNote({ id, audit }: { id: string; audit: { href: string; label: string } | null }) {
  return (
    <Surface aria-labelledby="sobre-csv">
      <PanelHeader id="sobre-csv" title="Sobre o relatório CSV" />
      <div id={id} className="flex flex-col gap-2 text-small text-slate">
        <p className="flex items-start gap-2">
          <ShieldCheck size={20} aria-hidden className="mt-px shrink-0 text-slate" />
          <span>
            <span className="text-ink">Sem dados pessoais:</span> o arquivo não traz nome, RA nem e-mail de alunos. Cada linha é um chamado aberto no período: protocolo,
            data de abertura, categoria, tipo, situação, prioridade, equipe, canal, prazo e situação do SLA, primeira resposta, resolução e avaliação.
          </span>
        </p>
        <p>
          <span className="text-ink">Exportação auditada:</span> cada download fica registrado na auditoria com quem exportou, quando, o período e o número de linhas.
          {audit ? (
            <>
              {' '}
              <Link to={audit.href} className="text-action underline underline-offset-2 hover:no-underline">
                {audit.label}
              </Link>
            </>
          ) : null}
        </p>
        <p>Até {formatNumber(CSV_MAX_ROWS)} chamados por arquivo; acima disso, escolha um período menor. Colunas separadas por ponto e vírgula, em UTF-8 (abre no Excel).</p>
      </div>
    </Surface>
  );
}

/** Métricas e relatórios (Operação ASA e Administração): números do período, gráficos com tabela e exportação CSV. */
export default function MetricsPage() {
  const { can } = useSession();
  const { area, to } = useInsightsArea();
  const allowed = can('metrics:read');
  const canExport = can('reports:export');
  const { period, query: range, today, update } = usePeriodFromUrl();
  const exportNoteId = useId();
  const query = useQuery({
    queryKey: insightsKeys.metrics(range ?? { from: '', to: '' }),
    queryFn: () => insightsApi.metrics(range!),
    enabled: allowed && range !== null,
    placeholderData: keepPreviousData,
  });

  if (!allowed) return <AccessDenied />;

  const stale = query.isPlaceholderData;
  const data = query.data;
  // trilha de auditoria da própria área: a equipe vê a própria; a administração, a completa
  const audit =
    area === 'admin' ? (can('audit:read:any') ? { href: to('auditoria'), label: 'Abrir a auditoria' } : null) : can('audit:read:own') ? { href: to('auditoria'), label: 'Abrir minha auditoria' } : null;
  const slaLink = area === 'asa' ? { to: to('sla'), label: 'Ver prazos agora' } : can('sla:manage') ? { to: to('sla'), label: 'Metas de SLA' } : null;

  return (
    <>
      <PageHeader
        title="Métricas e relatórios"
        description="Chamados e agendamentos no período escolhido. O relatório CSV não traz dados pessoais e cada exportação fica registrada na auditoria."
        actions={canExport && range ? <CsvDownload period={range} describedBy={exportNoteId} /> : null}
      />
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <PeriodPicker period={period} today={today} onChange={update} />
        {range ? (
          <Button size="sm" icon={RefreshCw} onClick={() => void query.refetch()} loading={query.isFetching && !query.isPending} className="self-start lg:self-end">
            Atualizar
          </Button>
        ) : null}
      </div>
      {period.error ? (
        <EmptyState title="Período inválido" description="Ajuste as datas acima para ver os números." />
      ) : query.isPending ? (
        <LoadingRows rows={6} />
      ) : data === undefined ? (
        <InsightsFailure error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className={cn('flex flex-col gap-6 transition-opacity duration-150', stale && 'opacity-60')} aria-busy={stale || undefined}>
          {query.isRefetchError ? <RefetchFailed generatedAt={data.source.generatedAt} /> : null}
          <Surface aria-labelledby="metricas-resumo">
            <PanelHeader
              id="metricas-resumo"
              title="Resumo do período"
              action={
                slaLink ? (
                  <ButtonLink to={slaLink.to} variant="ghost" size="sm" icon={Timer}>
                    {slaLink.label}
                  </ButtonLink>
                ) : null
              }
            />
            <StatGrid items={kpiItems(data.kpis)} />
            <SourceNote source={data.source} className="mt-5" />
          </Surface>
          <Surface>
            <DailyChart series={data.series} />
          </Surface>
          <Surface aria-labelledby="metricas-distribuicao">
            <PanelHeader id="metricas-distribuicao" title="Distribuição" description="Categorias dos chamados abertos no período e situação da fila agora." />
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
              <BreakdownChart title="Abertos no período, por categoria" items={data.byCategory} firstHeader="Categoria" emptyText="Nenhum chamado aberto no período." />
              <BreakdownChart
                title="Em aberto agora, por situação"
                description="Não depende do período."
                items={labelTicketStatuses(data.byStatus)}
                firstHeader="Situação"
                emptyText="Nenhum chamado em aberto agora."
              />
              <BreakdownChart title="Em aberto agora, por equipe" description="Não depende do período." items={data.byTeam} firstHeader="Equipe" emptyText="Nenhum chamado em aberto agora." />
            </div>
          </Surface>
          {data.appointments ? <Appointments data={data.appointments} /> : null}
        </div>
      )}
      {canExport ? (
        <div className="mt-6">
          <ExportNote id={exportNoteId} audit={audit} />
        </div>
      ) : null}
    </>
  );
}
