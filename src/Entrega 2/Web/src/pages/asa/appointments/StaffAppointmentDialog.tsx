import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CalendarX, CheckCircle2, Save, UserX } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { KeyValueList } from '@/components/ui/Display';
import { TextArea } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { LoadingRows } from '@/components/feedback/States';
import { appointmentKeys, isConflict, staffAppointmentsApi } from '@/features/appointments/api';
import { EventTimeline, InlineAlert, InlineFailure, ProtocolCopy, ReasonDialog, RescheduledToLink } from '@/features/appointments/components/common';
import { formatAppointmentDay, formatTimeRange } from '@/features/appointments/dates';
import { refreshStaffViews, useNow } from '@/features/appointments/hooks';
import { AppointmentStatusBadge, channelLabel, displayStatus, modeAndPlace, STATUS_META } from '@/features/appointments/labels';
import { staffActionState } from '@/features/appointments/rules';
import { formatDateTime } from '@/lib/format';
import { messageForError } from '@/services/api/client';
import type { StaffAppointment, StaffAppointmentUpdateRequest } from '@/types/api';

const NOTES_MAX = 1000;

type ActionKind = 'confirm' | 'complete' | 'no_show' | 'cancel' | 'notes';

const SUCCESS: Record<ActionKind, string> = {
  confirm: 'Atendimento confirmado. O aluno foi avisado.',
  complete: 'Atendimento registrado como realizado.',
  no_show: 'Ausência registrada.',
  cancel: 'Agendamento cancelado. O aluno recebeu o aviso com o motivo.',
  notes: 'Anotação interna salva.',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-h4 font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

/** Anotação interna: o rascunho só é substituído pelo valor do servidor enquanto não foi editado. */
function StaffNotesEditor({ appointment, saving, disabled, onSave }: { appointment: StaffAppointment; saving: boolean; disabled: boolean; onSave: (notes: string | null) => void }) {
  const server = appointment.staffNotes ?? '';
  const [draft, setDraft] = useState(server);
  const [base, setBase] = useState(server);
  if (server !== base) {
    setBase(server);
    if (draft === base) setDraft(server);
  }
  const dirty = draft.trim() !== server.trim();
  return (
    <div className="flex flex-col gap-2">
      <TextArea
        label="Anotação interna"
        hideLabel
        rows={4}
        value={draft}
        maxLength={NOTES_MAX}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Combinados, documentos pedidos, encaminhamentos…"
        hint={`Só a equipe vê; nunca aparece para o aluno · ${draft.length}/${NOTES_MAX}`}
      />
      <Button size="sm" icon={Save} className="self-start" disabled={!dirty || disabled} loading={saving} onClick={() => onSave(draft.trim() || null)}>
        Salvar anotação
      </Button>
    </div>
  );
}

/**
 * Detalhe de um agendamento para a equipe (`?agendamento=<id>`): aluno, observações, anotação interna, linha do
 * tempo com eventos internos e as ações válidas para a situação e o horário.
 */
export function StaffAppointmentDialog({
  id,
  onClose,
  canManage,
  canSeeStudent,
  hrefFor,
}: {
  id: string | null;
  onClose: () => void;
  canManage: boolean;
  canSeeStudent: boolean;
  /** endereço que abre outro agendamento mantendo semana, visão e filtros */
  hrefFor: (id: string) => string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const now = useNow(30_000);
  const detail = useQuery({ queryKey: appointmentKeys.staffDetail(id ?? ''), queryFn: () => staffAppointmentsApi.get(id ?? ''), enabled: Boolean(id), refetchInterval: 60_000 });
  const replacementId = detail.data && detail.data.id === id ? detail.data.rescheduledToId : null;
  // novo horário da remarcação (texto do link para o substituto)
  const replacement = useQuery({
    queryKey: appointmentKeys.staffDetail(replacementId ?? ''),
    queryFn: () => staffAppointmentsApi.get(replacementId ?? ''),
    enabled: Boolean(replacementId),
    staleTime: 60_000,
  });
  const [shownId, setShownId] = useState(id);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  if (id !== shownId) {
    setShownId(id);
    setCancelOpen(false);
    setCancelError(null);
    setConflict(null);
  }

  const appointment = detail.data && detail.data.id === id ? detail.data : undefined;

  const mutation = useMutation({
    mutationFn: (input: { id: string; kind: ActionKind; body: StaffAppointmentUpdateRequest }) => staffAppointmentsApi.update(input.id, input.body),
    onMutate: () => {
      setConflict(null);
      setCancelError(null);
    },
    onSuccess: (data, input) => {
      refreshStaffViews(queryClient, data);
      if (input.kind === 'cancel') setCancelOpen(false);
      toast.show(SUCCESS[input.kind]);
    },
    onError: (error, input) => {
      if (isConflict(error)) {
        // outra pessoa (ou o relógio) mudou o agendamento: recarrega e explica
        void queryClient.invalidateQueries({ queryKey: appointmentKeys.staffDetail(input.id) });
        void queryClient.invalidateQueries({ queryKey: appointmentKeys.staffLists });
        const text = `${messageForError(error)} Os dados foram recarregados: confira a situação atual antes de agir de novo.`;
        if (input.kind === 'cancel') setCancelError(text);
        else setConflict(text);
        toast.show(text, 'error');
        return;
      }
      const text = messageForError(error, 'Não foi possível concluir a ação. Tente novamente.');
      if (input.kind === 'cancel') setCancelError(text);
      else toast.show(text, 'error');
    },
  });

  const run = (kind: ActionKind, body: StaffAppointmentUpdateRequest) => {
    if (appointment) mutation.mutate({ id: appointment.id, kind, body });
  };
  const pendingKind = mutation.isPending ? mutation.variables?.kind : undefined;

  let body: ReactNode = null;
  let footer: ReactNode = null;
  if (id && !appointment) {
    body = detail.isPending ? (
      <LoadingRows rows={4} />
    ) : (
      <InlineFailure error={detail.error} onRetry={() => void detail.refetch()} notFoundText="Agendamento não encontrado. Ele pode ter sido removido." />
    );
  } else if (appointment) {
    const status = displayStatus(appointment);
    const actions = staffActionState(appointment, now);
    const primary = actions.confirm ? 'confirm' : actions.complete ? 'complete' : null;
    body = (
      <div className="flex flex-col gap-5">
        {conflict ? <InlineAlert tone="warning">{conflict}</InlineAlert> : null}
        <div className="flex flex-col items-start gap-1.5">
          <AppointmentStatusBadge status={status} />
          <p className="text-small text-slate">{STATUS_META[status].description}</p>
          {replacementId ? <RescheduledToLink href={hrefFor(replacementId)} replacement={replacement.data} now={now} /> : null}
        </div>
        <KeyValueList
          items={[
            {
              label: 'Aluno',
              value: (
                <>
                  {appointment.student.fullName}
                  <span className="block font-mono text-small text-slate">RA {appointment.student.registrationNumber}</span>
                  {canSeeStudent ? (
                    <Link to={`/asa/alunos/${encodeURIComponent(appointment.student.id)}`} className="text-small text-action underline">
                      Ver contexto do aluno
                    </Link>
                  ) : null}
                </>
              ),
            },
            { label: 'Assunto', value: appointment.topicLabel },
            { label: 'Data', value: formatAppointmentDay(appointment.startsAt, now) },
            { label: 'Horário', value: `${formatTimeRange(appointment.startsAt, appointment.endsAt)} (horário de Brasília)` },
            { label: 'Modalidade e local', value: modeAndPlace(appointment.mode, appointment.location) },
            { label: 'Atendente', value: appointment.attendant.fullName },
            { label: 'Protocolo', value: <ProtocolCopy protocol={appointment.protocol} /> },
            { label: 'Agendado em', value: `${formatDateTime(appointment.createdAt)} · ${channelLabel(appointment.channel)}` },
            ...(appointment.ticketId
              ? [{ label: 'Chamado relacionado', value: <Link to={`/asa/chamados/${encodeURIComponent(appointment.ticketId)}`} className="text-action underline">Abrir o chamado</Link> }]
              : []),
            ...(appointment.rescheduledFromId
              ? [{ label: 'Remarcado de', value: <Link to={hrefFor(appointment.rescheduledFromId)} className="text-action underline">Ver o horário anterior</Link> }]
              : []),
          ]}
        />
        <Section title="Observações do aluno">
          {appointment.studentNotes ? (
            <p className="whitespace-pre-wrap break-words text-body text-ink">{appointment.studentNotes}</p>
          ) : (
            <p className="text-small text-mist">O aluno não deixou observações.</p>
          )}
        </Section>
        {appointment.status === 'cancelled' && status !== 'rescheduled' ? (
          <Section title="Cancelamento">
            <p className="text-body text-ink">
              {appointment.cancelledBy === 'staff' ? 'Cancelado pela equipe' : 'Cancelado pelo aluno'}
              {appointment.cancelReason ? `: ${appointment.cancelReason}` : '.'}
            </p>
          </Section>
        ) : null}
        <Section title="Anotação interna">
          <StaffNotesEditor
            key={appointment.id}
            appointment={appointment}
            disabled={!canManage}
            saving={pendingKind === 'notes'}
            onSave={(notes) => run('notes', { staffNotes: notes })}
          />
        </Section>
        {canManage && actions.hints.length > 0 ? (
          <InlineAlert tone="info">
            {actions.hints.map((hint) => (
              <p key={hint}>{hint}</p>
            ))}
          </InlineAlert>
        ) : null}
        {!canManage ? <InlineAlert tone="info">Seu perfil pode consultar a agenda, mas não alterar agendamentos.</InlineAlert> : null}
        <Section title="Histórico">
          <EventTimeline events={appointment.events} audience="staff" />
        </Section>
      </div>
    );
    footer = canManage ? (
      <>
        <Button variant="danger" icon={CalendarX} disabled={!actions.cancel || mutation.isPending} onClick={() => setCancelOpen(true)}>
          Cancelar
        </Button>
        <Button icon={UserX} disabled={!actions.noShow || mutation.isPending} loading={pendingKind === 'no_show'} onClick={() => run('no_show', { status: 'no_show' })}>
          Registrar ausência
        </Button>
        <Button
          variant={primary === 'complete' ? 'primary' : 'secondary'}
          icon={CheckCircle2}
          disabled={!actions.complete || mutation.isPending}
          loading={pendingKind === 'complete'}
          onClick={() => run('complete', { status: 'completed' })}
        >
          Concluir
        </Button>
        <Button
          variant={primary === 'confirm' ? 'primary' : 'secondary'}
          icon={CalendarCheck}
          disabled={!actions.confirm || mutation.isPending}
          loading={pendingKind === 'confirm'}
          onClick={() => run('confirm', { status: 'confirmed' })}
        >
          Confirmar
        </Button>
      </>
    ) : null;
  }

  return (
    <>
      <Dialog
        open={Boolean(id)}
        onClose={onClose}
        side="right"
        title={appointment ? appointment.student.fullName : 'Agendamento'}
        description={appointment ? `${appointment.topicLabel} · ${formatAppointmentDay(appointment.startsAt, now)} · ${formatTimeRange(appointment.startsAt, appointment.endsAt)}` : undefined}
        footer={footer}
      >
        {body}
      </Dialog>
      {/* irmão do Dialog (não filho): Esc no diálogo de confirmação não fecha a gaveta */}
      <ReasonDialog
        open={cancelOpen && Boolean(appointment)}
        title="Cancelar este agendamento?"
        description="O aluno recebe um aviso com o motivo abaixo e o horário volta a ficar livre na agenda."
        label="Motivo do cancelamento (vai para o aluno)"
        min={5}
        max={500}
        confirmLabel="Cancelar agendamento"
        tone="danger"
        loading={pendingKind === 'cancel'}
        error={cancelError}
        onConfirm={(reason) => run('cancel', { status: 'cancelled', reason })}
        onClose={() => {
          setCancelOpen(false);
          setCancelError(null);
        }}
      />
    </>
  );
}
