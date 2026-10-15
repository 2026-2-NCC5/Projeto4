import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarCheck, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { createElement, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, ButtonLink, buttonClasses } from '@/components/ui/Button';
import { KeyValueList, PageHeader, Surface } from '@/components/ui/Display';
import { TextArea } from '@/components/ui/Form';
import { LoadingRows } from '@/components/feedback/States';
import {
  appointmentKeys,
  appointmentsApi,
  calendarHref,
  fieldErrorsFrom,
  isBlockingError,
  isTransientError,
  newClientRequestId,
  reasonOf,
} from '@/features/appointments/api';
import { AppointmentsFailure, InlineAlert, PolicyHints, ProtocolCopy } from '@/features/appointments/components/common';
import { SlotPicker, slotPlace } from '@/features/appointments/components/SlotPicker';
import { formatAppointmentDay, formatTimeRange } from '@/features/appointments/dates';
import { refreshStudentViews, useAppointmentCatalog, useMyAppointments, useNow } from '@/features/appointments/hooks';
import { AppointmentStatusBadge, MODE_META, modeAndPlace } from '@/features/appointments/labels';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { messageForError } from '@/services/api/client';
import type { Appointment, AppointmentCatalog, AppointmentMode, AppointmentSlot } from '@/types/api';

const NOTES_MAX = 500;

const STEPS = [
  { title: 'Assunto', heading: 'Assunto e modalidade' },
  { title: 'Data e horário', heading: 'Escolha a data e o horário' },
  { title: 'Confirmação', heading: 'Revise e confirme' },
] as const;
type Step = 0 | 1 | 2;

type Errors = Partial<Record<'topicId' | 'mode' | 'slot' | 'notes', string>>;

function StepIndicator({ step }: { step: Step }) {
  return (
    <nav aria-label="Etapas do agendamento" className="mb-4">
      <p className="mb-2 text-small text-slate sm:hidden">
        Etapa {step + 1} de {STEPS.length}: <span className="font-semibold text-ink">{STEPS[step].title}</span>
      </p>
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((item, index) => {
          const state = index < step ? 'done' : index === step ? 'current' : 'upcoming';
          return (
            <li key={item.title} aria-current={state === 'current' ? 'step' : undefined} className="min-w-0">
              <span aria-hidden className={cn('block h-1 w-full rounded-full transition-colors duration-200', state === 'upcoming' ? 'bg-line' : 'bg-action')} />
              <span className={cn('mt-2 block truncate text-small', state === 'current' ? 'font-semibold text-ink' : 'text-slate', 'sr-only sm:not-sr-only')}>
                {index + 1}. {item.title}
                <span className="sr-only">{state === 'done' ? ' (concluída)' : state === 'current' ? ' (etapa atual)' : ''}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function TopicAndMode({ catalog, topicId, mode, errors, onTopic, onMode }: { catalog: AppointmentCatalog; topicId: string; mode: AppointmentMode | ''; errors: Errors; onTopic: (id: string) => void; onMode: (mode: AppointmentMode) => void }) {
  const baseId = useId();
  return (
    <div className="flex flex-col gap-6">
      <fieldset aria-describedby={errors.topicId ? `${baseId}-topic-error` : undefined}>
        <legend className="text-small font-semibold text-ink">
          Assunto do atendimento<span className="text-danger-text" aria-hidden> *</span>
        </legend>
        <div className="mt-2 divide-y divide-line-soft overflow-hidden rounded-lg border border-line">
          {catalog.topics.map((topic) => {
            const selected = topic.id === topicId;
            return (
              <label
                key={topic.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors duration-150 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-action',
                  selected ? 'bg-action-soft' : 'bg-white hover:bg-paper',
                )}
              >
                <input
                  type="radio"
                  name={`${baseId}-topic`}
                  value={topic.id}
                  checked={selected}
                  onChange={() => onTopic(topic.id)}
                  aria-describedby={`${baseId}-topic-${topic.id}`}
                  className="mt-1 h-4 w-4 shrink-0 accent-action"
                />
                <span className="min-w-0">
                  <span className={cn('block text-body text-ink', selected ? 'font-semibold' : 'font-medium')}>{topic.label}</span>
                  <span id={`${baseId}-topic-${topic.id}`} className="block text-small text-slate">
                    {topic.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {errors.topicId ? (
          <p id={`${baseId}-topic-error`} role="alert" className="mt-1.5 text-caption text-danger-text">
            {errors.topicId}
          </p>
        ) : null}
      </fieldset>

      <fieldset aria-describedby={errors.mode ? `${baseId}-mode-error` : undefined}>
        <legend className="text-small font-semibold text-ink">
          Modalidade<span className="text-danger-text" aria-hidden> *</span>
        </legend>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {catalog.modes.map((option) => {
            const selected = option.id === mode;
            return (
              <label
                key={option.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors duration-150 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-action',
                  selected ? 'border-action bg-action-soft' : 'border-line bg-white hover:border-line-strong',
                )}
              >
                <input
                  type="radio"
                  name={`${baseId}-mode`}
                  value={option.id}
                  checked={selected}
                  onChange={() => onMode(option.id)}
                  aria-describedby={`${baseId}-mode-${option.id}`}
                  className="mt-1 h-4 w-4 shrink-0 accent-action"
                />
                {createElement(MODE_META[option.id].icon, { size: 20, 'aria-hidden': true, className: cn('mt-0.5 shrink-0', selected ? 'text-action' : 'text-slate') })}
                <span className="min-w-0">
                  <span className={cn('block text-body text-ink', selected ? 'font-semibold' : 'font-medium')}>{option.label}</span>
                  <span id={`${baseId}-mode-${option.id}`} className="block text-small text-slate">
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {errors.mode ? (
          <p id={`${baseId}-mode-error`} role="alert" className="mt-1.5 text-caption text-danger-text">
            {errors.mode}
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}

function SuccessView({ appointment }: { appointment: Appointment }) {
  const now = useNow();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <>
      <PageHeader title="Atendimento agendado" description="Você recebe um aviso aqui e no aplicativo quando o ASA confirmar ou se algo mudar." />
      <Surface className="max-w-3xl">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle2 size={20} className="shrink-0 text-success" aria-hidden />
          <h2 ref={headingRef} tabIndex={-1} className="text-h3 font-semibold text-ink focus:outline-none">
            Horário reservado
          </h2>
        </div>
        <KeyValueList
          columns={2}
          items={[
            { label: 'Protocolo', value: <ProtocolCopy protocol={appointment.protocol} /> },
            { label: 'Situação', value: <AppointmentStatusBadge status={appointment.status} /> },
            { label: 'Data', value: formatAppointmentDay(appointment.startsAt, now) },
            { label: 'Horário', value: `${formatTimeRange(appointment.startsAt, appointment.endsAt)} (horário de Brasília)` },
            { label: 'Assunto', value: appointment.topicLabel },
            { label: 'Modalidade e local', value: modeAndPlace(appointment.mode, appointment.location) },
          ]}
        />
        {appointment.changeDeadline ? (
          <p className="mt-4 text-small text-slate">Precisa mudar? Você pode cancelar ou remarcar até {formatDateTime(appointment.changeDeadline)}.</p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <ButtonLink to="/aluno/agendamentos" variant="primary">
            Ver meus agendamentos
          </ButtonLink>
          <a href={calendarHref(appointment.id)} download={`${appointment.protocol}.ics`} className={buttonClasses('secondary', 'md')}>
            <Download size={18} aria-hidden />
            Adicionar à agenda (.ics)
          </a>
        </div>
      </Surface>
    </>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-mist">{label}</dt>
      <dd className="break-words text-body text-ink">{children}</dd>
    </div>
  );
}

function BookingFlow({ catalog }: { catalog: AppointmentCatalog }) {
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const now = useNow();
  const upcoming = useMyAppointments('upcoming');
  const [topicId, setTopicId] = useState(() => {
    const preselected = params.get('assunto');
    return catalog.topics.some((topic) => topic.id === preselected) ? (preselected ?? '') : '';
  });
  const [ticketId] = useState(() => params.get('chamado'));
  const [mode, setMode] = useState<AppointmentMode | ''>(() => (catalog.modes.length === 1 ? (catalog.modes[0]?.id ?? '') : ''));
  const [slot, setSlot] = useState<AppointmentSlot | null>(null);
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState<Step>(0);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<{ tone: 'danger' | 'warning'; text: ReactNode } | null>(null);
  // uma chave por fluxo de agendamento: repetir o envio (falha de rede) devolve o mesmo agendamento em vez de duplicar
  const [clientRequestId] = useState(newClientRequestId);
  const [created, setCreated] = useState<Appointment | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef<Step>(step);

  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  const topic = catalog.topics.find((item) => item.id === topicId);
  const activeCount = upcoming.data ? upcoming.data.items.length : null;
  const atLimit = activeCount !== null && activeCount >= catalog.policy.maxActivePerStudent;

  /** Horário recusado pelo servidor: atualiza os horários livres e volta para a grade com o motivo. */
  const backToGrid = (text: string) => {
    void queryClient.invalidateQueries({ queryKey: appointmentKeys.slotsAll });
    setSlot(null);
    setStep(1);
    setNotice({ tone: 'warning', text });
  };

  const submit = useMutation({
    mutationFn: (input: { slot: AppointmentSlot; notes: string }) =>
      appointmentsApi.book({
        clientRequestId,
        topicId,
        // horário e local exatamente como vieram da API de horários livres (o servidor reserva aquele local)
        startsAt: input.slot.startsAt,
        mode: input.slot.mode,
        location: input.slot.location,
        ...(input.notes ? { notes: input.notes } : {}),
        ...(ticketId ? { ticketId } : {}),
      }),
    onMutate: () => setNotice(null),
    onSuccess: (appointment) => {
      refreshStudentViews(queryClient, appointment);
      setCreated(appointment);
    },
    onError: (error) => {
      const reason = reasonOf(error);
      if (reason === 'slot_unavailable') {
        backToGrid('Esse horário acabou de ser reservado por outra pessoa. Atualizamos os horários livres: escolha outro.');
        return;
      }
      if (reason === 'too_soon' || reason === 'too_far') {
        backToGrid(`${messageForError(error)} Atualizamos os horários livres: escolha outro.`);
        return;
      }
      if (reason === 'student_conflict') {
        backToGrid(`${messageForError(error)} Escolha outro horário.`);
        return;
      }
      if (reason === 'active_limit') {
        setNotice({
          tone: 'danger',
          text: (
            <>
              {messageForError(error)}{' '}
              <Link to="/aluno/agendamentos" className="font-semibold underline">
                Ver meus agendamentos
              </Link>
            </>
          ),
        });
        return;
      }
      const fields = fieldErrorsFrom(error);
      if (fields.topicId) {
        setErrors({ topicId: fields.topicId });
        setStep(0);
        setNotice({ tone: 'danger', text: 'Revise o assunto e envie de novo.' });
        return;
      }
      if (fields.notes) {
        setErrors({ notes: fields.notes });
        setNotice({ tone: 'danger', text: 'Revise as observações e envie de novo.' });
        return;
      }
      if (fields.ticketId) {
        setNotice({ tone: 'danger', text: `${messageForError(error)} Abra o agendamento sem o chamado relacionado ou confira o link usado.` });
        return;
      }
      setNotice({
        tone: 'danger',
        text: isTransientError(error)
          ? `${messageForError(error)} Seus dados continuam aqui: tente de novo — o agendamento não será duplicado.`
          : messageForError(error, 'Não foi possível agendar. Tente novamente.'),
      });
    },
  });

  if (created) return <SuccessView appointment={created} />;

  const validateStep = (target: Step): Errors => {
    const found: Errors = {};
    if (target === 0) {
      if (!topic) found.topicId = 'Escolha o assunto do atendimento.';
      if (!mode) found.mode = 'Escolha a modalidade.';
    }
    if (target === 1 && !slot) found.slot = 'Escolha um dia e um horário livre.';
    return found;
  };

  const next = () => {
    const found = validateStep(step);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setNotice(null);
    setStep((step + 1) as Step);
  };

  const back = () => {
    setErrors({});
    setNotice(null);
    setStep((step - 1) as Step);
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/aluno/agendamentos" className="inline-flex items-center gap-1 rounded-sm text-small text-slate hover:text-ink">
            <ArrowLeft size={16} aria-hidden />
            Agendamentos
          </Link>
        }
        title="Agendar atendimento"
        description="Escolha o assunto, a modalidade e um horário livre da equipe do ASA. O mesmo agendamento aparece no aplicativo."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <StepIndicator step={step} />
          {atLimit ? (
            <InlineAlert tone="warning" className="mb-4">
              Você já tem {activeCount} de {catalog.policy.maxActivePerStudent} agendamentos ativos. Cancele um deles ou aguarde o atendimento para marcar outro.{' '}
              <Link to="/aluno/agendamentos" className="font-semibold underline">
                Ver meus agendamentos
              </Link>
            </InlineAlert>
          ) : null}
          <Surface aria-labelledby="etapa-agendamento">
            <h2 id="etapa-agendamento" ref={headingRef} tabIndex={-1} className="mb-4 text-h3 font-semibold text-ink focus:outline-none">
              {STEPS[step].heading}
            </h2>
            {notice ? (
              <InlineAlert tone={notice.tone} className="mb-4">
                {notice.text}
              </InlineAlert>
            ) : null}

            {step === 0 ? (
              <TopicAndMode
                catalog={catalog}
                topicId={topicId}
                mode={mode}
                errors={errors}
                onTopic={(id) => {
                  setTopicId(id);
                  setErrors((current) => ({ ...current, topicId: undefined }));
                }}
                onMode={(value) => {
                  if (value !== mode) setSlot(null);
                  setMode(value);
                  setErrors((current) => ({ ...current, mode: undefined }));
                }}
              />
            ) : null}

            {step === 1 && mode ? (
              <div className="flex flex-col gap-3">
                <p className="text-small text-slate">
                  {topic?.label} · {MODE_META[mode].label}. Horários no fuso de Brasília.
                </p>
                <SlotPicker
                  mode={mode}
                  policy={catalog.policy}
                  selected={slot}
                  onSelect={(value) => {
                    setSlot(value);
                    setErrors({});
                  }}
                />
                {errors.slot ? (
                  <p role="alert" className="text-caption text-danger-text">
                    {errors.slot}
                  </p>
                ) : null}
                {slot ? (
                  <p className="flex items-start gap-2 rounded-md bg-snow px-3 py-2 text-small text-ink" aria-live="polite">
                    <CalendarCheck size={18} className="mt-px shrink-0 text-slate" aria-hidden />
                    <span>
                      Horário escolhido: {formatAppointmentDay(slot.startsAt, now)}, {formatTimeRange(slot.startsAt, slot.endsAt)} · {slotPlace(slot)}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}

            {step === 2 && slot && mode ? (
              <div className="flex flex-col gap-5">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg border border-line px-4 py-3 sm:grid-cols-2">
                  <SummaryRow label="Assunto">{topic?.label ?? '—'}</SummaryRow>
                  <SummaryRow label="Modalidade e local">{modeAndPlace(slot.mode, slot.location)}</SummaryRow>
                  <SummaryRow label="Data">{formatAppointmentDay(slot.startsAt, now)}</SummaryRow>
                  <SummaryRow label="Horário">{formatTimeRange(slot.startsAt, slot.endsAt)} (horário de Brasília)</SummaryRow>
                  {ticketId ? <SummaryRow label="Chamado relacionado">O agendamento fica ligado ao chamado de onde você veio.</SummaryRow> : null}
                </dl>
                <TextArea
                  label="Observações para o ASA"
                  rows={4}
                  value={notes}
                  maxLength={NOTES_MAX}
                  onChange={(event) => {
                    setNotes(event.target.value);
                    if (errors.notes) setErrors({});
                  }}
                  placeholder="Opcional: conte o que você precisa para a equipe se preparar (documentos, disciplina, dúvida principal)."
                  hint={`Opcional · ${notes.length}/${NOTES_MAX} caracteres`}
                  error={errors.notes}
                />
                <p className="text-small text-slate">
                  Ao confirmar, o horário fica reservado para você. Cancelamento e remarcação pelo portal ou app até{' '}
                  {catalog.policy.cancellationMinHours > 0 ? `${catalog.policy.cancellationMinHours} h antes do horário` : 'o início do horário'}.
                </p>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-4">
              {step === 0 ? (
                <ButtonLink to="/aluno/agendamentos">Cancelar</ButtonLink>
              ) : (
                <Button icon={ChevronLeft} onClick={back} disabled={submit.isPending}>
                  Voltar
                </Button>
              )}
              {step < 2 ? (
                <Button variant="primary" iconRight={ChevronRight} onClick={next}>
                  Continuar
                </Button>
              ) : (
                <Button variant="primary" icon={CalendarPlus} loading={submit.isPending} onClick={() => slot && submit.mutate({ slot, notes: notes.trim() })}>
                  Confirmar agendamento
                </Button>
              )}
            </div>
          </Surface>
        </div>
        <aside aria-labelledby="regras-agendamento" className="min-w-0">
          <Surface>
            <h2 id="regras-agendamento" className="mb-3 text-h4 font-semibold text-ink">
              Como funciona
            </h2>
            <PolicyHints policy={catalog.policy} activeCount={activeCount} />
          </Surface>
        </aside>
      </div>
    </>
  );
}

/** Agendamento em três etapas: assunto e modalidade, data e horário, confirmação. `?assunto=<id>` pré-seleciona. */
export default function BookAppointmentPage() {
  const catalog = useAppointmentCatalog();
  // a lista de ativos também revela cedo um recurso desligado ou sem banco (o catálogo não depende deles)
  const upcoming = useMyAppointments('upcoming');
  const blocking = [catalog.error, upcoming.error].find((error) => error && isBlockingError(error));

  if (blocking || catalog.error) {
    return (
      <>
        <PageHeader title="Agendar atendimento" />
        <AppointmentsFailure error={blocking ?? catalog.error} area="aluno" onRetry={() => void catalog.refetch()} title="Não foi possível carregar o agendamento" />
      </>
    );
  }
  if (catalog.isPending) {
    return (
      <>
        <PageHeader title="Agendar atendimento" />
        <LoadingRows rows={5} />
      </>
    );
  }
  return <BookingFlow catalog={catalog.data} />;
}
