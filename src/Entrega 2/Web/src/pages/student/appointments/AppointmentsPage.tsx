import { CalendarClock, CalendarPlus, History } from 'lucide-react';
import { createElement, useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { List, ListItem, PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback/States';
import { isBlockingError } from '@/features/appointments/api';
import { AppointmentsFailure, PolicyHints } from '@/features/appointments/components/common';
import { capitalize, formatTimeRange } from '@/features/appointments/dates';
import { useAppointmentCatalog, useMyAppointments, useNow } from '@/features/appointments/hooks';
import { AppointmentStatusBadge, displayStatus, MODE_META, modeAndPlace } from '@/features/appointments/labels';
import { dayKey, formatDayShort } from '@/lib/format';
import type { Appointment } from '@/types/api';
import { AppointmentDetailDialog } from './AppointmentDetailDialog';

const HISTORY_PAGE = 10;

const detailHref = (id: string) => `/aluno/agendamentos?agendamento=${encodeURIComponent(id)}`;

/** "Qui., 15 de out." (com o ano quando não é o ano corrente). */
function shortDay(startsAt: string, now: Date): string {
  const label = capitalize(formatDayShort(startsAt));
  const year = dayKey(startsAt).slice(0, 4);
  return year === dayKey(now).slice(0, 4) ? label : `${label} de ${year}`;
}

function AppointmentRow({ appointment, now }: { appointment: Appointment; now: Date }) {
  return (
    <ListItem
      to={detailHref(appointment.id)}
      leading={createElement(MODE_META[appointment.mode].icon, { size: 20, 'aria-hidden': true })}
      title={`${shortDay(appointment.startsAt, now)} · ${formatTimeRange(appointment.startsAt, appointment.endsAt)}`}
      description={`${appointment.topicLabel} · ${modeAndPlace(appointment.mode, appointment.location)}`}
      meta={
        <span className="flex flex-wrap items-center gap-2">
          <AppointmentStatusBadge status={displayStatus(appointment)} />
          <span className="font-mono">{appointment.protocol}</span>
        </span>
      }
    />
  );
}

/** "Agendamentos" do aluno: próximos, histórico e detalhes em gaveta (`?agendamento=<id>`, usado pelos avisos). */
export default function AppointmentsPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('agendamento');
  const now = useNow();
  const upcoming = useMyAppointments('upcoming', { refetchInterval: 60_000 });
  const past = useMyAppointments('past');
  const catalog = useAppointmentCatalog();
  const [showAllPast, setShowAllPast] = useState(false);

  const setSelected = useCallback(
    (id: string | null) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (id) next.set('agendamento', id);
          else next.delete('agendamento');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const header = (
    <PageHeader
      title="Agendamentos"
      description="Atendimentos com o ASA, presenciais ou online. Os mesmos agendamentos aparecem no aplicativo."
      actions={
        <ButtonLink to="/aluno/agendamentos/novo" variant="primary" icon={CalendarPlus}>
          Agendar atendimento
        </ButtonLink>
      }
    />
  );

  const blocking = [upcoming.error, past.error].find((error) => error && isBlockingError(error));
  if (blocking) {
    return (
      <>
        <PageHeader title="Agendamentos" />
        <AppointmentsFailure error={blocking} area="aluno" />
      </>
    );
  }

  const pastItems = past.data?.items ?? [];
  const visiblePast = showAllPast ? pastItems : pastItems.slice(0, HISTORY_PAGE);

  return (
    <>
      {header}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="agendamentos-proximos">
            <SectionHeader id="agendamentos-proximos" title="Próximos" description="Agendados e confirmados, do mais próximo ao mais distante." />
            {upcoming.isPending ? (
              <LoadingRows rows={2} />
            ) : upcoming.error ? (
              <ErrorState error={upcoming.error} onRetry={() => void upcoming.refetch()} title="Não foi possível carregar seus agendamentos" />
            ) : upcoming.data.items.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nenhum atendimento marcado"
                description="Agende um horário com a equipe do ASA para tratar de matrícula, documentos, financeiro e outros assuntos — presencialmente ou online."
              />
            ) : (
              <List label="Próximos agendamentos">
                {upcoming.data.items.map((appointment) => (
                  <AppointmentRow key={appointment.id} appointment={appointment} now={now} />
                ))}
              </List>
            )}
          </section>

          <section aria-labelledby="agendamentos-historico">
            <SectionHeader id="agendamentos-historico" title="Histórico" description="Atendimentos realizados, cancelados, remarcados e horários que já passaram." />
            {past.isPending ? (
              <LoadingRows rows={2} />
            ) : past.error ? (
              <ErrorState error={past.error} onRetry={() => void past.refetch()} title="Não foi possível carregar o histórico" />
            ) : pastItems.length === 0 ? (
              <EmptyState icon={History} title="Sem histórico ainda" description="Atendimentos realizados ou cancelados aparecem aqui." />
            ) : (
              <div className="flex flex-col gap-3">
                <List label="Histórico de agendamentos">
                  {visiblePast.map((appointment) => (
                    <AppointmentRow key={appointment.id} appointment={appointment} now={now} />
                  ))}
                </List>
                {pastItems.length > HISTORY_PAGE ? (
                  <Button size="sm" variant="ghost" className="self-start" onClick={() => setShowAllPast((value) => !value)}>
                    {showAllPast ? 'Mostrar menos' : `Mostrar todos (${pastItems.length})`}
                  </Button>
                ) : null}
              </div>
            )}
          </section>
        </div>

        <aside aria-labelledby="agendamentos-regras" className="min-w-0">
          <Surface>
            <h2 id="agendamentos-regras" className="mb-3 text-h4 font-semibold text-ink">
              Como funciona
            </h2>
            {catalog.data ? (
              <PolicyHints policy={catalog.data.policy} activeCount={upcoming.data ? upcoming.data.items.length : null} />
            ) : catalog.isPending ? (
              <LoadingRows rows={3} />
            ) : (
              <p className="text-small text-slate">As regras de agendamento não puderam ser carregadas agora.</p>
            )}
          </Surface>
        </aside>
      </div>
      <AppointmentDetailDialog id={selectedId} onClose={() => setSelected(null)} onOpen={(id) => setSelected(id)} />
    </>
  );
}
