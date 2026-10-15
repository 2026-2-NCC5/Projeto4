import { useQuery } from '@tanstack/react-query';
import { AlarmClock, ClipboardList, Database, Hand, Inbox, MessageCircle, RefreshCw, TimerOff, UserCheck, UserX } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge, List, ListItem, MetricCard, PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { AccessDenied, LoadingRows } from '@/components/feedback/States';
import { useSession } from '@/features/auth/session';
import { operationsApi, staffKeys } from '@/features/support/staff/api';
import { LoadError } from '@/features/support/staff/components';
import { PriorityBadge, SlaIndicator, StatusBadge } from '@/features/support/labels';
import { formatDateTime, formatDayLong, formatNumber, formatRelative } from '@/lib/format';
import type { AsaDashboard } from '@/types/api';

/** Atalhos do painel: cada número abre a fila já filtrada pelo mesmo critério. */
export const DASHBOARD_LINKS = {
  open: '/asa/chamados',
  awaitingTeam: '/asa/chamados?status=submitted,received,triage,reopened',
  unassigned: '/asa/chamados?assigned=unassigned',
  assignedToMe: '/asa/chamados?assigned=mine',
  unreadFromStudents: '/asa/chamados?unread=1',
  waitingStudent: '/asa/chamados?status=waiting_student',
  slaNearDeadline: '/asa/chamados?sla=near_deadline',
  slaOverdue: '/asa/chamados?sla=overdue',
} as const;

function Metrics({ tickets }: { tickets: AsaDashboard['tickets'] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Em aberto" value={formatNumber(tickets.open)} hint="Ainda não resolvidos, encerrados nem cancelados" icon={ClipboardList} to={DASHBOARD_LINKS.open} />
      <MetricCard label="Aguardando triagem" value={formatNumber(tickets.awaitingTeam)} hint="Enviados, recebidos, em triagem ou reabertos" icon={Inbox} to={DASHBOARD_LINKS.awaitingTeam} />
      <MetricCard label="Sem atendente" value={formatNumber(tickets.unassigned)} hint="Em aberto e ainda não assumidos" icon={UserX} to={DASHBOARD_LINKS.unassigned} />
      <MetricCard label="Comigo" value={formatNumber(tickets.assignedToMe)} hint="Em aberto e assumidos por você" icon={UserCheck} to={DASHBOARD_LINKS.assignedToMe} />
      <MetricCard label="Com mensagens não lidas" value={formatNumber(tickets.unreadFromStudents)} hint="Em aberto, com mensagem do aluno ainda não lida" icon={MessageCircle} to={DASHBOARD_LINKS.unreadFromStudents} />
      <MetricCard label="Aguardando aluno" value={formatNumber(tickets.waitingStudent)} hint="Prazo pausado até a resposta do aluno" icon={Hand} to={DASHBOARD_LINKS.waitingStudent} />
      <MetricCard
        label="Prazo próximo"
        value={formatNumber(tickets.slaNearDeadline)}
        hint="Ainda no prazo, mas nos últimos 25% dele ou a menos de 8 h do vencimento"
        icon={AlarmClock}
        tone={tickets.slaNearDeadline > 0 ? 'warning' : 'neutral'}
        to={DASHBOARD_LINKS.slaNearDeadline}
      />
      <MetricCard label="Prazo excedido" value={formatNumber(tickets.slaOverdue)} hint="Prazo vencido sem conclusão" icon={TimerOff} tone={tickets.slaOverdue > 0 ? 'danger' : 'neutral'} to={DASHBOARD_LINKS.slaOverdue} />
    </div>
  );
}

function AtRisk({ items }: { items: AsaDashboard['atRisk'] }) {
  return (
    <Surface aria-labelledby="em-risco">
      <SectionHeader
        id="em-risco"
        title="Em risco de prazo"
        description="Prazo próximo ou excedido, do vencimento mais próximo para o mais distante."
        action={
          <ButtonLink to="/asa/chamados?sla=at_risk&sort=due" variant="ghost" size="sm">
            Ver na fila
          </ButtonLink>
        }
      />
      {items.length === 0 ? (
        <p className="text-small text-slate">Nenhum chamado em risco de prazo agora.</p>
      ) : (
        <List label="Chamados em risco de prazo">
          {items.map((ticket) => (
            <ListItem
              key={ticket.id}
              to={`/asa/chamados/${encodeURIComponent(ticket.id)}`}
              title={ticket.subject}
              description={
                <>
                  {ticket.staff ? `${ticket.staff.studentName} · RA ${ticket.staff.registrationNumber}` : 'Aluno'} · {ticket.categoryLabel}
                  {ticket.staff ? ` · ${ticket.staff.assignedAgentName ?? 'Sem atendente'}` : ''}
                </>
              }
              meta={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{ticket.protocol}</span>
                  <SlaIndicator sla={ticket.sla} audience="staff" />
                  {ticket.priority !== 'normal' ? <PriorityBadge priority={ticket.priority} /> : null}
                </span>
              }
              trailing={<StatusBadge status={ticket.status} audience="staff" />}
              unread={ticket.unreadCount > 0}
            />
          ))}
        </List>
      )}
    </Surface>
  );
}

function AppointmentsToday({ data }: { data: NonNullable<AsaDashboard['appointmentsToday']> }) {
  return (
    <Surface aria-labelledby="agenda-hoje">
      <SectionHeader id="agenda-hoje" title="Agendamentos de hoje" />
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total', value: data.total },
          { label: 'Confirmados', value: data.confirmed },
          { label: 'Realizados', value: data.completed },
          { label: 'Não compareceu', value: data.noShow },
        ].map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-caption text-mist">{item.label}</dt>
            <dd className="text-h3 font-semibold text-ink tabular-nums">{formatNumber(item.value)}</dd>
          </div>
        ))}
      </dl>
    </Surface>
  );
}

/** Origem e momento dos números (nada de número sem fonte). */
function SourceLine({ source }: { source: AsaDashboard['source'] }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-mist">
      <Database size={14} aria-hidden className="shrink-0" />
      <span>Fonte: {source.description}</span>
      <span aria-hidden>·</span>
      <span>
        atualizado {formatRelative(source.generatedAt)} (<time dateTime={source.generatedAt}>{formatDateTime(source.generatedAt)}</time>, {source.timezone})
      </span>
      {source.dataMode === 'demo' ? <Badge tone="warning">Dados de demonstração</Badge> : null}
    </p>
  );
}

/** Painel da Operação ASA: números do momento, cada um levando à fila filtrada. Atualiza a cada 60 s. */
export default function AsaDashboardPage() {
  const { can } = useSession();
  const allowed = can('tickets:read:any');
  const query = useQuery({ queryKey: staffKeys.dashboard, queryFn: operationsApi.dashboard, refetchInterval: 60_000, enabled: allowed });

  if (!allowed) return <AccessDenied />;

  return (
    <>
      <PageHeader
        eyebrow={formatDayLong(new Date())}
        title="Painel"
        description="Situação do Atendimento ASA agora. Cada número abre a fila com o mesmo filtro."
        actions={
          <>
            <Button icon={RefreshCw} onClick={() => void query.refetch()} loading={query.isFetching && !query.isPending}>
              Atualizar
            </Button>
            <ButtonLink to="/asa/chamados" variant="primary" icon={ClipboardList}>
              Abrir fila
            </ButtonLink>
          </>
        }
      />
      {query.isPending ? (
        <LoadingRows rows={4} />
      ) : query.data === undefined ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} notFoundTitle="Painel indisponível" backTo="/asa/chamados" backLabel="Abrir a fila" />
      ) : (
        <div className="flex flex-col gap-6">
          <section aria-labelledby="numeros" className="flex flex-col gap-3">
            <h2 id="numeros" className="sr-only">
              Números da operação
            </h2>
            <Metrics tickets={query.data.tickets} />
            <SourceLine source={query.data.source} />
            {query.isRefetchError ? (
              <p role="alert" className="text-caption text-danger-text">
                Não foi possível atualizar agora. Os números acima são de {formatDateTime(query.data.source.generatedAt)}.
              </p>
            ) : null}
          </section>
          <AtRisk items={query.data.atRisk} />
          {query.data.appointmentsToday ? <AppointmentsToday data={query.data.appointmentsToday} /> : null}
        </div>
      )}
    </>
  );
}
