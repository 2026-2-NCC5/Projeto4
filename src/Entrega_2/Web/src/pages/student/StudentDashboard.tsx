import { useQuery } from '@tanstack/react-query';
import { CalendarClock, MessageSquarePlus, Sparkles } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { List, ListItem, MetricCard, PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback/States';
import { isAcademicUnavailable, retryTransient, usePendingItems, useStudentSummary } from '@/features/academic/api';
import { AcademicQueryFailure, AcademicUnavailable, Pill, RunStatusBadge } from '@/features/academic/components';
import { pluralize } from '@/features/academic/labels';
import { displayPendingStatus } from '@/features/academic/pending';
import { appointmentKeys, appointmentsApi, isDatabaseRequired, isFeatureDisabled } from '@/features/appointments/api';
import { formatAppointmentDay, formatTimeRange } from '@/features/appointments/dates';
import { AppointmentStatusBadge, displayStatus, modeAndPlace } from '@/features/appointments/labels';
import { useMe } from '@/features/auth/session';
import { notificationHref } from '@/features/notifications/links';
import { usePlatformInfo } from '@/features/platform/platform';
import { SlaIndicator, StatusBadge } from '@/features/support/labels';
import { QueryFailure } from '@/features/support/student/components';
import { firstName, formatDayLong, formatPercent, formatRelative, formatScore } from '@/lib/format';
import { notificationsApi, supportApi } from '@/services/api/endpoints';
import { PendingRow } from './academic/rows';

const UPCOMING_PENDING = 4;

function AcademicSummary() {
  const summary = useStudentSummary();
  if (summary.isPending) return <LoadingRows rows={2} />;
  if (summary.error) return <AcademicQueryFailure error={summary.error} onRetry={() => void summary.refetch()} title="Resumo acadêmico indisponível" />;
  const data = summary.data;
  return (
    <section aria-label="Resumo acadêmico" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <MetricCard label="Disciplinas ativas" value={data.subjectsCount} hint={data.attentionCount > 0 ? `${data.attentionCount} em atenção na última análise` : 'no período'} to="/aluno/academico" />
      <MetricCard label="Média geral" value={formatScore(data.averageScore)} hint="Avaliações com nota, de 0 a 10" to="/aluno/academico?aba=avaliacoes" />
      <MetricCard label="Frequência média" value={formatPercent(data.averageAttendanceRate)} hint="Presenças sobre aulas registradas" to="/aluno/academico?aba=frequencia" />
      <MetricCard label="Pendências em aberto" value={data.pendingCount} hint="Pendentes e atrasadas" to="/aluno/pendencias" />
    </section>
  );
}

/**
 * Próximo atendimento com o ASA (primeiro de GET /api/appointments?scope=upcoming, já em ordem de início).
 * Some quando os agendamentos estão desligados (plataforma ou 403 `feature_disabled`).
 */
function NextAppointment() {
  const platform = usePlatformInfo();
  const headingId = useId();
  const featureOff = platform.data?.features.appointments === false;
  const upcoming = useQuery({ queryKey: appointmentKeys.list('upcoming'), queryFn: () => appointmentsApi.list('upcoming'), enabled: !featureOff, retry: retryTransient });
  if (featureOff || isFeatureDisabled(upcoming.error)) return null;
  const next = upcoming.data?.items[0] ?? null;
  return (
    <Surface aria-labelledby={headingId}>
      <SectionHeader
        id={headingId}
        title="Próximo atendimento"
        action={
          <ButtonLink to="/aluno/agendamentos" variant="ghost" size="sm">
            Ver agendamentos
          </ButtonLink>
        }
      />
      {upcoming.isPending ? (
        <LoadingRows rows={1} />
      ) : upcoming.error ? (
        isDatabaseRequired(upcoming.error) ? (
          <p className="text-small text-slate">Os agendamentos não estão disponíveis neste ambiente.</p>
        ) : (
          <QueryFailure error={upcoming.error} onRetry={() => void upcoming.refetch()} title="Agendamentos indisponíveis" />
        )
      ) : next ? (
        <Link to={`/aluno/agendamentos?agendamento=${encodeURIComponent(next.id)}`} className="flex items-start gap-3 rounded-lg border border-line px-4 py-3 transition-colors hover:bg-paper focus-visible:bg-paper">
          <CalendarClock size={20} aria-hidden className="mt-0.5 shrink-0 text-slate" />
          <span className="min-w-0 flex-1">
            <span className="block text-body font-medium text-ink">{formatAppointmentDay(next.startsAt, new Date())}</span>
            <span className="block text-small text-ink">
              {formatTimeRange(next.startsAt, next.endsAt)} · {next.topicLabel}
            </span>
            <span className="block text-caption text-mist">
              {modeAndPlace(next.mode, next.location)} · <span className="font-mono">{next.protocol}</span>
            </span>
          </span>
          <span className="shrink-0">
            <AppointmentStatusBadge status={displayStatus(next)} />
          </span>
        </Link>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-small text-slate">Nenhum atendimento marcado. Agende um horário com o ASA quando precisar.</p>
          <ButtonLink to="/aluno/agendamentos/novo" size="sm" icon={CalendarClock}>
            Agendar atendimento
          </ButtonLink>
        </div>
      )}
    </Surface>
  );
}

function LastAnalysis() {
  const summary = useStudentSummary();
  const headingId = useId();
  const last = summary.data?.lastAnalysis;
  return (
    <Surface aria-labelledby={headingId}>
      <SectionHeader
        id={headingId}
        title="Agente para o Estudante"
        description="Análise explicável da sua situação acadêmica"
        action={
          <ButtonLink to="/aluno/academico?aba=analise" size="sm" icon={Sparkles}>
            Abrir análise
          </ButtonLink>
        }
      />
      {summary.isPending ? (
        <LoadingRows rows={1} />
      ) : summary.error ? (
        <AcademicQueryFailure compact error={summary.error} onRetry={() => void summary.refetch()} title="Análise indisponível" />
      ) : last ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <RunStatusBadge status={last.status} />
            {last.requiresHumanValidation ? <Pill tone="info">Pede validação humana</Pill> : null}
            <span className="text-caption text-mist">{formatRelative(last.createdAt)}</span>
          </div>
          <p className="text-body text-ink">{last.summary}</p>
          <p className="text-small text-slate">{pluralize(last.recommendationsCount, 'recomendação', 'recomendações')}. O agente recomenda e explica; decisões acadêmicas são sempre humanas.</p>
        </div>
      ) : (
        <p className="text-small text-slate">Você ainda não pediu uma análise. Ela usa suas disciplinas, notas, frequência e pendências.</p>
      )}
    </Surface>
  );
}

function SupportSection() {
  const headingId = useId();
  const overview = useQuery({ queryKey: ['support', 'overview'], queryFn: supportApi.overview, refetchInterval: 60_000 });
  return (
    <Surface aria-labelledby={headingId}>
      <SectionHeader
        id={headingId}
        title="Atendimento ASA"
        action={
          <ButtonLink to="/aluno/chamados/novo" variant="primary" size="sm" icon={MessageSquarePlus}>
            Abrir chamado
          </ButtonLink>
        }
      />
      {overview.isPending ? (
        <LoadingRows rows={2} />
      ) : overview.error ? (
        <QueryFailure error={overview.error} onRetry={() => void overview.refetch()} title="Chamados indisponíveis" />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 text-small">
            <Pill tone="info">{overview.data.activeCount === 1 ? '1 chamado em andamento' : `${overview.data.activeCount} chamados em andamento`}</Pill>
            {overview.data.waitingStudentCount > 0 ? <Pill tone="warning">{overview.data.waitingStudentCount} aguardando você</Pill> : null}
            {overview.data.unreadMessagesCount > 0 ? <Pill tone="neutral">{pluralize(overview.data.unreadMessagesCount, 'mensagem nova', 'mensagens novas')}</Pill> : null}
          </div>
          {overview.data.highlight ? (
            <List label="Chamado em destaque">
              <ListItem
                to={`/aluno/chamados/${overview.data.highlight.id}`}
                title={overview.data.highlight.subject}
                description={overview.data.highlight.lastActivity?.title ?? overview.data.highlight.categoryLabel}
                meta={
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono">{overview.data.highlight.protocol}</span>
                    <SlaIndicator sla={overview.data.highlight.sla} showDue={false} />
                  </span>
                }
                trailing={<StatusBadge status={overview.data.highlight.status} />}
                unread={overview.data.highlight.unreadCount > 0}
              />
            </List>
          ) : (
            <p className="text-small text-slate">Nenhum chamado em andamento. Quando abrir um, você acompanha aqui e no app.</p>
          )}
          <ButtonLink to="/aluno/chamados" variant="ghost" size="sm" className="self-start">
            Ver todos os chamados
          </ButtonLink>
        </div>
      )}
    </Surface>
  );
}

function PendingSection() {
  const headingId = useId();
  const pending = usePendingItems();
  const now = new Date();
  const open = (pending.data ?? []).filter((item) => item.status !== 'completed');
  // atrasadas primeiro, depois a ordem da API (prazo mais próximo)
  const shown = [...open].sort((a, b) => Number(displayPendingStatus(b, now) === 'overdue') - Number(displayPendingStatus(a, now) === 'overdue')).slice(0, UPCOMING_PENDING);
  return (
    <Surface aria-labelledby={headingId}>
      <SectionHeader
        id={headingId}
        title="Pendências"
        action={
          <ButtonLink to="/aluno/pendencias" variant="ghost" size="sm">
            Ver todas
          </ButtonLink>
        }
      />
      {pending.isPending ? (
        <LoadingRows rows={2} />
      ) : pending.error ? (
        <AcademicQueryFailure compact error={pending.error} onRetry={() => void pending.refetch()} title="Pendências indisponíveis" />
      ) : shown.length === 0 ? (
        <p className="text-small text-slate">Nenhuma pendência em aberto.</p>
      ) : (
        <ul aria-label="Pendências em aberto" className="divide-y divide-line-soft overflow-hidden rounded-lg border border-line bg-white">
          {shown.map((item) => (
            <PendingRow key={item.id} item={item} now={now} href="/aluno/pendencias" />
          ))}
        </ul>
      )}
    </Surface>
  );
}

function RecentNotifications() {
  const headingId = useId();
  // mesma consulta do sino do topo (cache compartilhado)
  const query = useQuery({ queryKey: ['notifications', 'list'], queryFn: () => notificationsApi.list(8) });
  const items = (query.data?.items ?? []).slice(0, 3);
  const unread = query.data?.unreadCount ?? 0;
  return (
    <Surface aria-labelledby={headingId}>
      <SectionHeader
        id={headingId}
        title="Avisos recentes"
        description={query.data ? (unread > 0 ? pluralize(unread, 'aviso não lido', 'avisos não lidos') : 'Nenhum aviso não lido') : undefined}
        action={
          <ButtonLink to="/aluno/notificacoes" variant="ghost" size="sm">
            Ver todos
          </ButtonLink>
        }
      />
      {query.isPending ? (
        <LoadingRows rows={2} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Avisos indisponíveis" />
      ) : items.length === 0 ? (
        <EmptyState title="Sem avisos" description="Atualizações de chamados, agendamentos e análises aparecem aqui e no app." />
      ) : (
        <List label="Avisos recentes">
          {items.map((item) => (
            <ListItem key={item.id} to={notificationHref('aluno', item) ?? undefined} title={item.title} description={item.body} meta={formatRelative(item.createdAt)} unread={!item.readAt} />
          ))}
        </List>
      )}
    </Surface>
  );
}

export default function StudentDashboard() {
  const me = useMe();
  const platform = usePlatformInfo();
  const summary = useStudentSummary();
  const platformUnavailable = platform.data?.academicSource.status === 'unavailable';
  const academicUnavailable = platformUnavailable || isAcademicUnavailable(summary.error);
  return (
    <>
      <PageHeader
        eyebrow={formatDayLong(new Date())}
        title={`Olá, ${firstName(me.user.fullName)}`}
        description={me.student ? `RA ${me.student.registrationNumber}${me.student.program ? ` · ${me.student.program}` : ''}` : undefined}
      />
      <div className="flex flex-col gap-6">
        {platformUnavailable ? <AcademicUnavailable message={platform.data?.academicSource.message} /> : <AcademicSummary />}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <NextAppointment />
          <SupportSection />
          {!academicUnavailable ? <PendingSection /> : null}
          {!academicUnavailable ? <LastAnalysis /> : null}
          <RecentNotifications />
        </div>
      </div>
    </>
  );
}
