import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Select, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { appointmentKeys, availabilityApi, fieldErrorsFrom, reasonOf } from '@/features/appointments/api';
import { InlineAlert } from '@/features/appointments/components/common';
import { isDateKey, plural, timeToMinutes, WEEKDAY_LABELS, WEEKDAY_ORDER } from '@/features/appointments/dates';
import { MODE_META } from '@/features/appointments/labels';
import { cn } from '@/lib/cn';
import { formatCalendarDate } from '@/lib/format';
import { isApiError, messageForError } from '@/services/api/client';
import type { AppointmentMode, AvailabilityRule, AvailabilityRuleInput, AvailabilityRuleUpdate } from '@/types/api';

export const SLOT_OPTIONS = [15, 20, 30, 45, 60] as const;
const LOCATION_MAX = 120;

interface FormState {
  weekday: string;
  startTime: string;
  endTime: string;
  slotMinutes: string;
  mode: AppointmentMode;
  location: string;
  validFrom: string;
  validUntil: string;
}

type Field = keyof FormState;
type Errors = Partial<Record<Field, string>>;

function initialState(rule: AvailabilityRule | null, today: string): FormState {
  if (rule) {
    return {
      weekday: String(rule.weekday),
      startTime: rule.startTime,
      endTime: rule.endTime,
      slotMinutes: String(rule.slotMinutes),
      mode: rule.mode,
      location: rule.location ?? '',
      validFrom: rule.validFrom,
      validUntil: rule.validUntil ?? '',
    };
  }
  return { weekday: '', startTime: '09:00', endTime: '12:00', slotMinutes: '30', mode: 'presencial', location: '', validFrom: today, validUntil: '' };
}

/** Horários que a faixa gera (mesma regra do servidor: início + n × duração enquanto couber até o fim). */
export function previewSlots(startTime: string, endTime: string, slotMinutes: number): string[] {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || !Number.isFinite(slotMinutes) || slotMinutes <= 0) return [];
  const result: string[] = [];
  for (let minute = start; minute + slotMinutes <= end; minute += slotMinutes) {
    result.push(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
  }
  return result;
}

function validate(form: FormState, editing: boolean): Errors {
  const errors: Errors = {};
  if (!editing && form.weekday === '') errors.weekday = 'Escolha o dia da semana.';
  const start = timeToMinutes(form.startTime);
  const end = timeToMinutes(form.endTime);
  const slot = Number(form.slotMinutes);
  if (start === null) errors.startTime = 'Informe o início no formato HH:MM.';
  if (end === null) errors.endTime = 'Informe o fim no formato HH:MM.';
  if (start !== null && end !== null) {
    if (end <= start) errors.endTime = 'O fim precisa ser depois do início.';
    else if (end - start < slot) errors.endTime = `A faixa precisa comportar pelo menos um atendimento de ${slot} min.`;
  }
  if (form.location.trim().length > LOCATION_MAX) errors.location = `Use até ${LOCATION_MAX} caracteres.`;
  if (!editing && !isDateKey(form.validFrom)) errors.validFrom = 'Informe a data de início da vigência.';
  if (form.validUntil) {
    if (!isDateKey(form.validUntil)) errors.validUntil = 'Data inválida.';
    else if (isDateKey(form.validFrom) && form.validUntil < form.validFrom) errors.validUntil = 'O fim da vigência precisa ser depois do início.';
  }
  return errors;
}

/**
 * Criar ou editar uma faixa de disponibilidade. Dia da semana e início da vigência não mudam depois de criados
 * (a API não aceita): para isso, pause a faixa e crie outra.
 */
export function AvailabilityFormDialog({ open, rule, today, onClose }: { open: boolean; rule: AvailabilityRule | null; today: string; onClose: () => void }) {
  const formId = useId();
  const queryClient = useQueryClient();
  const toast = useToast();
  const editing = rule !== null;
  const [form, setForm] = useState<FormState>(() => initialState(rule, today));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [shownFor, setShownFor] = useState<{ open: boolean; ruleId: string | null }>({ open, ruleId: rule?.id ?? null });
  // cada abertura começa do zero (ou dos dados da faixa em edição)
  if (shownFor.open !== open || shownFor.ruleId !== (rule?.id ?? null)) {
    setShownFor({ open, ruleId: rule?.id ?? null });
    if (open) {
      setForm(initialState(rule, today));
      setErrors({});
      setFormError(null);
    }
  }

  const save = useMutation({
    mutationFn: (state: FormState) => {
      const location = state.location.trim() || null;
      const validUntil = state.validUntil || null;
      if (rule) {
        const patch: AvailabilityRuleUpdate = { startTime: state.startTime, endTime: state.endTime, slotMinutes: Number(state.slotMinutes), mode: state.mode, location, validUntil };
        return availabilityApi.update(rule.id, patch);
      }
      const body: AvailabilityRuleInput = {
        weekday: Number(state.weekday),
        startTime: state.startTime,
        endTime: state.endTime,
        slotMinutes: Number(state.slotMinutes),
        mode: state.mode,
        location,
        validFrom: state.validFrom,
        validUntil,
      };
      return availabilityApi.create(body);
    },
    onMutate: () => setFormError(null),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: appointmentKeys.availability });
      toast.show(
        rule
          ? `Faixa de ${WEEKDAY_LABELS[saved.weekday]?.toLowerCase()} atualizada. Agendamentos já marcados continuam valendo.`
          : `Faixa criada: ${WEEKDAY_LABELS[saved.weekday]?.toLowerCase()}, ${saved.startTime}–${saved.endTime}. Os horários já aparecem para os alunos.`,
      );
      onClose();
    },
    onError: (error) => {
      if (reasonOf(error) === 'availability_overlap') {
        setFormError(`${messageForError(error)} Ajuste o horário, mude a vigência ou pause a outra faixa antes.`);
        return;
      }
      const fields = fieldErrorsFrom(error);
      const known = Object.keys(fields).filter((field): field is Field => field in form);
      if (known.length > 0) setErrors(Object.fromEntries(known.map((field) => [field, fields[field]])) as Errors);
      setFormError(isApiError(error) && error.kind === 'forbidden' ? messageForError(error) : messageForError(error, 'Não foi possível salvar a faixa. Tente novamente.'));
    },
  });

  const set = (field: Field, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = () => {
    const found = validate(form, editing);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(form);
  };

  const slotOptions = [...new Set([...SLOT_OPTIONS, Number(form.slotMinutes)])].filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const preview = previewSlots(form.startTime, form.endTime, Number(form.slotMinutes));

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!save.isPending) onClose();
      }}
      title={editing ? 'Editar faixa de disponibilidade' : 'Nova faixa de disponibilidade'}
      description={editing ? 'Dia da semana e início da vigência não mudam; para isso, pause esta faixa e crie outra.' : 'Os horários livres desta faixa aparecem para os alunos agendarem.'}
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={save.isPending}>
            {editing ? 'Salvar alterações' : 'Criar faixa'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {formError ? <InlineAlert>{formError}</InlineAlert> : null}
        {editing && rule ? (
          <p className="text-small text-slate">
            <span className="font-semibold text-ink">{WEEKDAY_LABELS[rule.weekday]}</span> · vigência desde {formatCalendarDate(rule.validFrom)}
          </p>
        ) : (
          <Select
            label="Dia da semana"
            required
            placeholder="Selecione"
            value={form.weekday}
            onChange={(event) => set('weekday', event.target.value)}
            options={WEEKDAY_ORDER.map((weekday) => ({ value: String(weekday), label: WEEKDAY_LABELS[weekday] }))}
            error={errors.weekday}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Início" type="time" required step={300} value={form.startTime} onChange={(event) => set('startTime', event.target.value)} error={errors.startTime} />
          <TextInput label="Fim" type="time" required step={300} value={form.endTime} onChange={(event) => set('endTime', event.target.value)} error={errors.endTime} />
        </div>
        <Select
          label="Duração de cada atendimento"
          value={form.slotMinutes}
          onChange={(event) => set('slotMinutes', event.target.value)}
          options={slotOptions.map((value) => ({ value: String(value), label: `${value} minutos` }))}
          error={errors.slotMinutes}
        />
        {preview.length > 0 ? (
          <p className="rounded-md bg-snow px-3 py-2 text-small text-slate" aria-live="polite">
            Gera {plural(preview.length, 'horário', 'horários')} por semana: {preview.length > 8 ? `${preview.slice(0, 8).join(', ')}…` : preview.join(', ')}.
          </p>
        ) : null}
        <fieldset>
          <legend className="text-small font-semibold text-ink">Modalidade</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {(Object.keys(MODE_META) as AppointmentMode[]).map((mode) => {
              const selected = form.mode === mode;
              return (
                <label
                  key={mode}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-body transition-colors duration-150 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-action',
                    selected ? 'border-action bg-action-soft text-action' : 'border-line bg-white text-ink hover:border-line-strong',
                  )}
                >
                  <input type="radio" name={`${formId}-mode`} value={mode} checked={selected} onChange={() => set('mode', mode)} className="h-4 w-4 accent-action" />
                  {MODE_META[mode].label}
                </label>
              );
            })}
          </div>
        </fieldset>
        <TextInput
          label="Local"
          value={form.location}
          maxLength={LOCATION_MAX}
          onChange={(event) => set('location', event.target.value)}
          placeholder={form.mode === 'online' ? 'Ex.: Videochamada (link enviado na confirmação)' : 'Ex.: Sala 12 — Prédio ASA'}
          hint="Opcional. Aparece para o aluno ao escolher o horário."
          error={errors.location}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {editing ? null : (
            <TextInput label="Vigência a partir de" type="date" required value={form.validFrom} onChange={(event) => set('validFrom', event.target.value)} error={errors.validFrom} />
          )}
          <TextInput
            label="Vigência até"
            type="date"
            value={form.validUntil}
            min={form.validFrom || undefined}
            onChange={(event) => set('validUntil', event.target.value)}
            hint="Opcional. Sem data, a faixa vale até ser pausada."
            error={errors.validUntil}
          />
        </div>
      </form>
    </Dialog>
  );
}
