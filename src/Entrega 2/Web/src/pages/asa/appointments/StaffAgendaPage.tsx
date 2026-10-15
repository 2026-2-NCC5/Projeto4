import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CalendarSearch, ChevronLeft, ChevronRight, List as ListIcon } from 'lucide-react';
import { createElement, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge, List, ListItem, PageHeader } from '@/components/ui/Display';
import { AccessDenied, EmptyState, ErrorState, LoadingRows } from '@/components/feedback/States';
import { useSession } from '@/features/auth/session';
import { appointmentKeys, isBlockingError, staffAppointmentsApi, type StaffAppointmentQuery } from '@/features/appointments/api';
import { AppointmentsFailure, Freshness, SegmentedControl, ToggleChip } from '@/features/appointments/components/common';
import { addDays, capitalize, dateRange, dayOfMonth, formatKeyLong, formatRange, formatTimeRange, isDateKey, plural, startOfWeek, WEEKDAY_SHORT, weekdayOf } from '@/features/appointments/dates';
import { useNow } from '@/features/appointments/hooks';
import { AppointmentStatusBadge, displayStatus, modeAndPlace, STATUS_META, STATUS_ORDER, STATUS_PLURAL } from '@/features/appointments/labels';
import { cn } from '@/lib/cn';
import { dayKey, formatTime } from '@/lib/format';
import type { AppointmentStatus, StaffAppointment } from '@/types/api';
import { StaffAppointmentDialog } from './StaffAppointmentDialog';

type View = 'lista' | 'semana';

function parseStatuses(value: string | null): AppointmentStatus[] {
  if (!value) return [];
  return value.split(',').filter((item): item is AppointmentStatus => (STATUS_ORDER as string[]).includes(item));
}

/** "Maria S." para caber na coluna da semana. */
function compactName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]?.charAt(0) ?? ''}.`;
}

function DayList({ days, groups, today, hrefFor }: { days: string[]; groups: Map<string, StaffAppointment[]>; today: string; hrefFor: (id: string) => string }) {
  return (
    <div className="flex flex-col gap-5">
      {days
        .filter((day) => (groups.get(day)?.length ?? 0) > 0)
        .map((day) => {
          const items = groups.get(day) ?? [];
          return (
            <section key={day} aria-labelledby={`agenda-dia-${day}`} className="min-w-0">
              <h2 id={`agenda-dia-${day}`} className="mb-2 flex flex-wrap items-center gap-2 text-h4 font-semibold text-ink">
                {capitalize(formatKeyLong(day))}
                {day === today ? <Badge>Hoje</Badge> : null}
                <span className="text-small font-normal text-mist">{plural(items.length, 'agendamento', 'agendamentos')}</span>
              </h2>
              <List label={`Agendamentos de ${formatKeyLong(day)}`}>
                {items.map((item) => (
                  <ListItem
                    key={item.id}
                    to={hrefFor(item.id)}
                    title={`${formatTimeRange(item.startsAt, item.endsAt)} · ${item.student.fullName}`}
                    description={`RA ${item.student.registrationNumber} · ${item.topicLabel} · ${modeAndPlace(item.mode, item.location)}`}
                    meta={
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <AppointmentStatusBadge status={displayStatus(item)} />
                        <span>Atendente: {item.attendant.fullName}</span>
                        <span className="font-mono">{item.protocol}</span>
                      </span>
                    }
                  />
                ))}
              </List>
            </section>
          );
        })}
    </div>
  );
}

function WeekGrid({ days, groups, today, hrefFor }: { days: string[]; groups: Map<string, StaffAppointment[]>; today: string; hrefFor: (id: string) => string }) {
  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line">
      {days.map((day) => {
        const items = groups.get(day) ?? [];
        const isToday = day === today;
        return (
          <section key={day} aria-labelledby={`agenda-semana-${day}`} className="flex min-h-48 min-w-0 flex-col bg-white">
            <h2 id={`agenda-semana-${day}`} className={cn('flex items-baseline justify-between gap-1 border-b border-line-soft px-2 py-2 text-small', isToday && 'bg-snow')}>
              <span aria-hidden className="text-slate">
                {WEEKDAY_SHORT[weekdayOf(day)]} <span className="font-semibold tabular-nums text-ink">{dayOfMonth(day)}</span>
              </span>
              {isToday ? (
                <span aria-hidden className="text-caption text-mist">
                  hoje
                </span>
              ) : null}
              <span className="sr-only">
                {capitalize(formatKeyLong(day))}
                {isToday ? ' (hoje)' : ''}: {plural(items.length, 'agendamento', 'agendamentos')}
              </span>
            </h2>
            {items.length === 0 ? (
              <p aria-hidden className="px-2 py-3 text-caption text-fog">
                —
              </p>
            ) : (
              <ul className="flex flex-col gap-1 p-1.5">
                {items.map((item) => {
                  const status = displayStatus(item);
                  return (
                    <li key={item.id}>
                      <Link
                        to={hrefFor(item.id)}
                        className="block rounded-md border border-line px-2 py-1.5 transition-colors duration-150 hover:border-line-strong hover:bg-paper"
                      >
                        <span className="block text-caption font-semibold tabular-nums text-ink">{formatTime(item.startsAt)}</span>
                        <span className="block truncate text-small text-ink" title={item.student.fullName}>
                          {compactName(item.student.fullName)}
                        </span>
                        <span className="flex min-w-0 items-center gap-1 text-caption text-slate">
                          {createElement(STATUS_META[status].icon, { size: 14, 'aria-hidden': true, className: 'shrink-0' })}
                          <span className="truncate">{STATUS_META[status].label}</span>
                        </span>
                        <span className="sr-only">
                          {item.student.fullName}, {item.topicLabel}, {modeAndPlace(item.mode, item.location)}, atendente {item.attendant.fullName}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * "Agenda do ASA": semana (segunda a domingo) em lista por dia ou grade de 7 colunas, filtros por situação e
 * "Só os meus", contagens do servidor e detalhes em gaveta (`?agendamento=<id>`). Atualiza a cada 60 s.
 */
export default function StaffAgendaPage() {
  const { can } = useSession();
  const allowed = can('appointments:read:any');
  const canManage = can('appointments:manage');
  const [params, setParams] = useSearchParams();
  const now = useNow(30_000);
  const today = dayKey(now);
  const currentWeek = startOfWeek(today);
  const weekParam = params.get('semana');
  const week = isDateKey(weekParam) ? startOfWeek(weekParam) : currentWeek;
  const weekEnd = addDays(week, 6);
  const view: View = params.get('visao') === 'semana' ? 'semana' : 'lista';
  const mine = params.get('meus') === '1';
  const statuses = parseStatuses(params.get('status'));
  const selectedId = params.get('agendamento');

  const apiQuery: StaffAppointmentQuery = { from: week, to: weekEnd, ...(mine ? { attendant: 'mine' as const } : {}) };
  // o filtro de situação é aplicado aqui: trocar de filtro não refaz a consulta; as contagens vêm do servidor
  const query = useQuery({ queryKey: appointmentKeys.staffList(apiQuery), queryFn: () => staffAppointmentsApi.list(apiQuery), refetchInterval: 60_000, enabled: allowed });

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

  const hrefFor = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('agendamento', id);
    return `/asa/agendamentos?${next.toString()}`;
  };

  if (!allowed) return <AccessDenied />;
  if (query.error && isBlockingError(query.error)) {
    return (
      <>
        <PageHeader title="Agenda do ASA" />
        <AppointmentsFailure error={query.error} area="asa" />
      </>
    );
  }

  const days = dateRange(week, weekEnd);
  const items = (query.data?.items ?? []).filter((item) => statuses.length === 0 || statuses.includes(item.status));
  const groups = new Map<string, StaffAppointment[]>();
  for (const item of items) {
    const key = dayKey(item.startsAt);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const counts = query.data?.counts;
  const total = counts ? STATUS_ORDER.reduce((sum, status) => sum + counts[status], 0) : null;
  const filtered = statuses.length > 0;

  const toggleStatus = (status: AppointmentStatus, pressed: boolean) => {
    const next = pressed ? [...statuses, status] : statuses.filter((item) => item !== status);
    update({ status: next.length > 0 ? STATUS_ORDER.filter((item) => next.includes(item)).join(',') : null });
  };

  let content;
  if (query.isPending) content = <LoadingRows rows={4} />;
  else if (query.error) content = <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar a agenda" />;
  else if (items.length === 0) {
    content = (
      <EmptyState
        icon={CalendarSearch}
        title={total === 0 ? (mine ? 'Nenhum agendamento seu nesta semana' : 'Nenhum agendamento nesta semana') : 'Nenhum agendamento com os filtros escolhidos'}
        description={total === 0 ? 'Use as setas para ver outras semanas. Os horários livres vêm da disponibilidade cadastrada pela equipe.' : 'Mostre outras situações para ver os demais agendamentos da semana.'}
        action={filtered ? <Button onClick={() => update({ status: null })}>Mostrar todas as situações</Button> : undefined}
      />
    );
  } else if (view === 'semana') {
    content = (
      <>
        <div className="hidden md:block">
          <WeekGrid days={days} groups={groups} today={today} hrefFor={hrefFor} />
        </div>
        {/* em telas estreitas a grade vira a lista por dia */}
        <div className="md:hidden">
          <DayList days={days} groups={groups} today={today} hrefFor={hrefFor} />
        </div>
      </>
    );
  } else {
    content = <DayList days={days} groups={groups} today={today} hrefFor={hrefFor} />;
  }

  return (
    <>
      {/* "Minha disponibilidade" fica no menu lateral (item próprio) */}
      <PageHeader
        title="Agenda do ASA"
        description="Agendamentos dos alunos com a equipe. Confirme, conclua, registre ausência ou cancele pelos detalhes de cada atendimento."
      />

      <div className="mb-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => update({ semana: null })} disabled={week === currentWeek}>
              Hoje
            </Button>
            <IconButton label="Semana anterior" icon={ChevronLeft} onClick={() => update({ semana: addDays(week, -7) })} />
            <IconButton label="Próxima semana" icon={ChevronRight} onClick={() => update({ semana: addDays(week, 7) })} />
            <p className="text-h4 font-semibold text-ink" aria-live="polite">
              <span className="sr-only">Semana de </span>
              {formatRange(week, weekEnd)}
            </p>
          </div>
          <div className="hidden md:block">
            <SegmentedControl
              label="Visualização"
              value={view}
              onChange={(value) => update({ visao: value === 'semana' ? 'semana' : null })}
              options={[
                { value: 'lista', label: 'Lista', icon: <ListIcon size={16} aria-hidden /> },
                { value: 'semana', label: 'Semana', icon: <CalendarDays size={16} aria-hidden /> },
              ]}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div role="group" aria-label="Filtrar por situação" className="flex flex-wrap items-center gap-2">
            {STATUS_ORDER.map((status) => (
              <ToggleChip key={status} pressed={statuses.includes(status)} onChange={(pressed) => toggleStatus(status, pressed)}>
                {createElement(STATUS_META[status].icon, { size: 16, 'aria-hidden': true })}
                {STATUS_PLURAL[status]}
                <span className="tabular-nums text-caption">{counts ? counts[status] : '…'}</span>
              </ToggleChip>
            ))}
            <span aria-hidden className="mx-1 hidden h-5 w-px bg-line sm:block" />
            <ToggleChip pressed={mine} onChange={(pressed) => update({ meus: pressed ? '1' : null })}>
              Só os meus
            </ToggleChip>
            {filtered ? (
              <Button size="sm" variant="ghost" onClick={() => update({ status: null })}>
                Limpar situações
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-small text-slate" aria-live="polite">
              {total === null
                ? 'Carregando contagens…'
                : `${plural(total, 'agendamento', 'agendamentos')} na semana${mine ? ' com você' : ''}${filtered ? ` · ${plural(items.length, 'exibido', 'exibidos')} com o filtro` : ''}.`}
            </p>
            <Freshness updatedAt={query.dataUpdatedAt} now={now} fetching={query.isFetching && !query.isPending} onRefresh={() => void query.refetch()} />
          </div>
        </div>
      </div>

      <div aria-busy={query.isFetching || undefined}>{content}</div>

      <StaffAppointmentDialog
        id={selectedId}
        canManage={canManage}
        canSeeStudent={can('students:read:support_context')}
        hrefFor={hrefFor}
        onClose={() => update({ agendamento: null })}
      />
    </>
  );
}
