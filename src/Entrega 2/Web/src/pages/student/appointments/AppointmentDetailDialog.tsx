import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CalendarSync, CalendarX, Download } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { KeyValueList } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { LoadingRows } from '@/components/feedback/States';
import { appointmentKeys, appointmentsApi, calendarHref, isTransientError, newClientRequestId, reasonOf } from '@/features/appointments/api';
import { EventTimeline, InlineAlert, InlineFailure, ProtocolCopy, ReasonDialog, RescheduledToLink, SegmentedControl } from '@/features/appointments/components/common';
import { SlotPicker, slotPlace } from '@/features/appointments/components/SlotPicker';
import { formatAppointmentDay, formatTimeRange } from '@/features/appointments/dates';
import { refreshStudentViews, useAppointmentCatalog, useNow } from '@/features/appointments/hooks';
import { AppointmentStatusBadge, channelLabel, displayStatus, isActive, MODE_META, modeAndPlace, STATUS_META } from '@/features/appointments/labels';
import { formatDateTime, formatTime } from '@/lib/format';
import { messageForError } from '@/services/api/client';
import type { Appointment, AppointmentMode, AppointmentSlot } from '@/types/api';

/** Conflitos em que o agendamento mudou no servidor: recarrega e explica. */
const STALE_REASONS = new Set(['change_window_closed', 'appointment_not_active', 'appointment_changed']);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-h4 font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

const detailHref = (id: string) => `/aluno/agendamentos?agendamento=${encodeURIComponent(id)}`;

function Details({ appointment, now, modeDescription }: { appointment: Appointment; now: Date; modeDescription: string }) {
  const status = displayStatus(appointment);
  const changeable = appointment.canCancel || appointment.canReschedule;
  const replacementId = appointment.rescheduledToId;
  // novo horário da remarcação (para o texto do link); o mesmo cache abre o substituto na hora
  const replacement = useQuery({
    queryKey: appointmentKeys.detail(replacementId ?? ''),
    queryFn: () => appointmentsApi.get(replacementId ?? ''),
    enabled: Boolean(replacementId),
    staleTime: 60_000,
  });
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-start gap-1.5">
        <AppointmentStatusBadge status={status} />
        <p className="text-small text-slate">{STATUS_META[status].description}</p>
        {replacementId ? <RescheduledToLink href={detailHref(replacementId)} replacement={replacement.data} now={now} /> : null}
      </div>
      <KeyValueList
        items={[
          { label: 'Protocolo', value: <ProtocolCopy protocol={appointment.protocol} /> },
          { label: 'Data', value: formatAppointmentDay(appointment.startsAt, now) },
          { label: 'Horário', value: `${formatTimeRange(appointment.startsAt, appointment.endsAt)} (horário de Brasília)` },
          {
            label: 'Modalidade e local',
            value: (
              <>
                {modeAndPlace(appointment.mode, appointment.location)}
                <span className="block text-small text-slate">{modeDescription}</span>
              </>
            ),
          },
          { label: 'Atendimento', value: appointment.attendantLabel },
          { label: 'Agendado em', value: `${formatDateTime(appointment.createdAt)} · ${channelLabel(appointment.channel)}` },
          ...(appointment.ticketId
            ? [{ label: 'Chamado relacionado', value: <Link to={`/aluno/chamados/${encodeURIComponent(appointment.ticketId)}`} className="text-action underline">Abrir o chamado</Link> }]
            : []),
          ...(appointment.rescheduledFromId
            ? [{ label: 'Remarcado de', value: <Link to={detailHref(appointment.rescheduledFromId)} className="text-action underline">Ver o horário anterior</Link> }]
            : []),
        ]}
      />
      {changeable && appointment.changeDeadline ? (
        <InlineAlert tone="info">Você pode cancelar ou remarcar pelo portal ou pelo app até {formatDateTime(appointment.changeDeadline)}.</InlineAlert>
      ) : isActive(appointment.status) && appointment.changeDeadline ? (
        <InlineAlert tone="warning">
          O prazo para cancelar ou remarcar pelo portal terminou em {formatDateTime(appointment.changeDeadline)}. Se precisar mudar, fale com o ASA.
        </InlineAlert>
      ) : null}
      {appointment.studentNotes ? (
        <Section title="Suas observações">
          <p className="whitespace-pre-wrap break-words text-body text-ink">{appointment.studentNotes}</p>
        </Section>
      ) : null}
      {appointment.status === 'cancelled' && status !== 'rescheduled' ? (
        <Section title="Cancelamento">
          <p className="text-body text-ink">
            {appointment.cancelledBy === 'staff' ? 'Cancelado pelo ASA' : 'Cancelado por você'}
            {appointment.cancelReason ? `: ${appointment.cancelReason}` : '.'}
          </p>
        </Section>
      ) : null}
      <Section title="Histórico">
        <EventTimeline events={appointment.events} audience="student" />
      </Section>
    </div>
  );
}

/**
 * Detalhes de um agendamento do aluno em gaveta lateral (`?agendamento=<id>`, inclusive vindo dos avisos):
 * cancelar (motivo opcional) e remarcar só quando o servidor permite (canCancel / canReschedule).
 */
export function AppointmentDetailDialog({ id, onClose, onOpen }: { id: string | null; onClose: () => void; onOpen: (id: string) => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const now = useNow();
  const catalog = useAppointmentCatalog();
  const detail = useQuery({ queryKey: appointmentKeys.detail(id ?? ''), queryFn: () => appointmentsApi.get(id ?? ''), enabled: Boolean(id) });
  const [shownId, setShownId] = useState(id);
  const [view, setView] = useState<'details' | 'reschedule'>('details');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [rescheduleMode, setRescheduleMode] = useState<AppointmentMode>('presencial');
  const [newSlot, setNewSlot] = useState<AppointmentSlot | null>(null);
  const [rescheduleKey, setRescheduleKey] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  // outro agendamento aberto: volta para os detalhes (ajuste durante a renderização, sem efeito)
  if (id !== shownId) {
    setShownId(id);
    setView('details');
    setCancelOpen(false);
    setCancelError(null);
    setNewSlot(null);
    setNotice(null);
  }

  const appointment = detail.data && detail.data.id === id ? detail.data : undefined;

  const reloadAfterConflict = () => {
    if (id) void queryClient.invalidateQueries({ queryKey: appointmentKeys.detail(id) });
    void queryClient.invalidateQueries({ queryKey: appointmentKeys.lists });
  };

  const cancel = useMutation({
    mutationFn: (input: { id: string; reason: string }) => appointmentsApi.cancel(input.id, input.reason || undefined),
    onMutate: () => setCancelError(null),
    onSuccess: (data) => {
      refreshStudentViews(queryClient, data);
      setCancelOpen(false);
      toast.show(`Agendamento ${data.protocol} cancelado. O horário foi liberado.`);
    },
    onError: (error) => {
      if (STALE_REASONS.has(reasonOf(error) ?? '')) reloadAfterConflict();
      setCancelError(messageForError(error, 'Não foi possível cancelar. Tente novamente.'));
    },
  });

  const reschedule = useMutation({
    mutationFn: (input: { id: string; slot: AppointmentSlot; clientRequestId: string }) =>
      appointmentsApi.reschedule(input.id, { clientRequestId: input.clientRequestId, startsAt: input.slot.startsAt, mode: input.slot.mode, location: input.slot.location }),
    onMutate: () => setNotice(null),
    onSuccess: (created, input) => {
      void queryClient.invalidateQueries({ queryKey: appointmentKeys.detail(input.id) });
      refreshStudentViews(queryClient, created);
      toast.show(`Atendimento remarcado para ${formatAppointmentDay(created.startsAt, now).toLowerCase()} às ${formatTime(created.startsAt)}. Novo protocolo: ${created.protocol}.`);
      onOpen(created.id);
    },
    onError: (error) => {
      const reason = reasonOf(error) ?? '';
      if (reason === 'slot_unavailable' || reason === 'too_soon' || reason === 'too_far') {
        void queryClient.invalidateQueries({ queryKey: appointmentKeys.slotsAll });
        setNewSlot(null);
        setNotice(
          reason === 'slot_unavailable'
            ? 'Esse horário acabou de ser reservado por outra pessoa. Atualizamos os horários livres: escolha outro.'
            : `${messageForError(error)} Atualizamos os horários livres: escolha outro.`,
        );
        return;
      }
      if (STALE_REASONS.has(reason)) {
        reloadAfterConflict();
        setView('details');
        toast.show(`${messageForError(error)} Os dados do agendamento foram atualizados.`, 'error');
        return;
      }
      setNotice(
        isTransientError(error)
          ? `${messageForError(error)} Tente de novo: a remarcação não será duplicada.`
          : messageForError(error, 'Não foi possível remarcar. Tente novamente.'),
      );
    },
  });

  const startReschedule = (current: Appointment) => {
    setRescheduleMode(current.mode);
    setNewSlot(null);
    setNotice(null);
    // uma chave por remarcação: repetir após falha de rede devolve o mesmo novo agendamento
    setRescheduleKey(newClientRequestId());
    setView('reschedule');
  };

  const modeDescription = (mode: AppointmentMode) => catalog.data?.modes.find((item) => item.id === mode)?.description ?? MODE_META[mode].description;

  let body: ReactNode;
  let footer: ReactNode = null;
  if (!id) body = null;
  else if (detail.isPending && !appointment) body = <LoadingRows rows={4} />;
  else if (!appointment) {
    body = <InlineFailure error={detail.error} onRetry={() => void detail.refetch()} notFoundText="Agendamento não encontrado. Ele pode ter sido removido ou pertencer a outra conta." />;
  } else if (view === 'reschedule') {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-small text-slate">
          Horário atual: {formatAppointmentDay(appointment.startsAt, now)}, {formatTimeRange(appointment.startsAt, appointment.endsAt)} · {modeAndPlace(appointment.mode, appointment.location)}. Ao
          confirmar, o horário atual é liberado e o novo fica reservado de uma só vez.
        </p>
        {notice ? <InlineAlert tone="warning">{notice}</InlineAlert> : null}
        {catalog.data ? (
          <>
            {catalog.data.modes.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <span id="remarcar-modalidade" className="text-small font-semibold text-ink">
                  Modalidade
                </span>
                <SegmentedControl
                  label="Modalidade"
                  className="self-start"
                  value={rescheduleMode}
                  onChange={(mode) => {
                    setRescheduleMode(mode);
                    setNewSlot(null);
                  }}
                  options={catalog.data.modes.map((mode) => ({ value: mode.id, label: mode.label }))}
                />
              </div>
            ) : null}
            <SlotPicker
              key={rescheduleMode}
              mode={rescheduleMode}
              policy={catalog.data.policy}
              selected={newSlot}
              onSelect={(slot) => {
                setNewSlot(slot);
                setNotice(null);
              }}
              current={{ startsAt: appointment.startsAt, mode: appointment.mode, location: appointment.location }}
            />
            {newSlot ? (
              <p className="rounded-md bg-snow px-3 py-2 text-small text-ink" aria-live="polite">
                Novo horário: {formatAppointmentDay(newSlot.startsAt, now)}, {formatTimeRange(newSlot.startsAt, newSlot.endsAt)} · {slotPlace(newSlot)}
              </p>
            ) : null}
          </>
        ) : catalog.isPending ? (
          <LoadingRows rows={3} />
        ) : (
          <InlineFailure error={catalog.error} onRetry={() => void catalog.refetch()} />
        )}
      </div>
    );
    footer = (
      <>
        <Button onClick={() => setView('details')} disabled={reschedule.isPending}>
          Voltar
        </Button>
        <Button
          variant="primary"
          icon={CalendarCheck}
          loading={reschedule.isPending}
          disabled={!newSlot}
          onClick={() => newSlot && reschedule.mutate({ id: appointment.id, slot: newSlot, clientRequestId: rescheduleKey })}
        >
          Confirmar remarcação
        </Button>
      </>
    );
  } else {
    body = <Details appointment={appointment} now={now} modeDescription={modeDescription(appointment.mode)} />;
    const actions: ReactNode[] = [];
    if (isActive(appointment.status)) {
      actions.push(
        <a key="ics" href={calendarHref(appointment.id)} download={`${appointment.protocol}.ics`} className={buttonClasses('secondary', 'md')}>
          <Download size={18} aria-hidden />
          Adicionar à agenda (.ics)
        </a>,
      );
    }
    if (appointment.canReschedule) {
      actions.push(
        <Button key="reschedule" icon={CalendarSync} onClick={() => startReschedule(appointment)}>
          Remarcar
        </Button>,
      );
    }
    if (appointment.canCancel) {
      actions.push(
        <Button key="cancel" variant="danger" icon={CalendarX} onClick={() => setCancelOpen(true)}>
          Cancelar agendamento
        </Button>,
      );
    }
    footer = actions.length > 0 ? <>{actions}</> : null;
  }

  return (
    <>
      <Dialog
        open={Boolean(id)}
        onClose={() => {
          if (!reschedule.isPending) onClose();
        }}
        side="right"
        title={view === 'reschedule' ? 'Remarcar atendimento' : (appointment?.topicLabel ?? 'Agendamento')}
        description={appointment ? `${formatAppointmentDay(appointment.startsAt, now)} · ${formatTimeRange(appointment.startsAt, appointment.endsAt)}` : undefined}
        footer={footer}
      >
        {body}
      </Dialog>
      {/* irmão do Dialog (não filho): Esc/clique fora do diálogo de confirmação não fecham a gaveta */}
      <ReasonDialog
        open={cancelOpen && Boolean(appointment)}
        title="Cancelar este agendamento?"
        description={
          appointment ? (
            <>
              O horário de {formatAppointmentDay(appointment.startsAt, now).toLowerCase()}, {formatTimeRange(appointment.startsAt, appointment.endsAt)}, será liberado para outros alunos.
              {appointment.changeDeadline ? ` Cancelamentos pelo portal valem até ${formatDateTime(appointment.changeDeadline)}.` : ''}
            </>
          ) : null
        }
        label="Motivo (opcional)"
        min={0}
        max={500}
        confirmLabel="Cancelar agendamento"
        tone="danger"
        loading={cancel.isPending}
        error={cancelError}
        onConfirm={(reason) => appointment && cancel.mutate({ id: appointment.id, reason })}
        onClose={() => {
          setCancelOpen(false);
          setCancelError(null);
        }}
      />
    </>
  );
}
