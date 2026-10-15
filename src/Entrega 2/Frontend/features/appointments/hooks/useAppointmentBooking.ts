import { useCallback, useMemo, useReducer, useRef, useState } from 'react';

import { useResource } from '../../../hooks/useResource';
import { haptics } from '../../../services/haptics';
import type { Appointment, AppointmentCatalog, AppointmentSlot, AppointmentSlotList } from '../../../types/api';
import type { ResourceState } from '../../../types/ui';
import { writeCache } from '../../support/cache';
import { useSupportUserId, type SupportResource } from '../../support/hooks/useSupportResource';
import { getAppointmentsApi, newAppointmentRequestId } from '../api';
import { APPOINTMENTS } from '../config';
import { appointmentErrorMessage, appointmentErrorReason, isDefinitiveRejection } from '../errors';
import { slotRange } from '../format';
import { uniqueSlots } from '../labels';
import {
  BOOKING_STEPS,
  bookingReducer,
  canAdvanceBooking,
  initialBookingState,
  RESCHEDULE_STEPS,
  type BookingAction,
  type BookingState,
  type BookingStep,
} from '../state/bookingReducer';

import { appointmentCacheKeys, useAppointmentCatalog } from './useAppointments';

export interface BookingDay {
  /** YYYY-MM-DD no fuso da instituição */
  date: string;
  /** horários livres do dia (um por horário de início) */
  slots: AppointmentSlot[];
}

export interface BookingController {
  state: BookingState;
  dispatch: (action: BookingAction) => void;
  steps: readonly BookingStep[];
  stepIndex: number;
  catalog: SupportResource<AppointmentCatalog>;
  slots: ResourceState<AppointmentSlotList>;
  timezone: string;
  /** hoje + 13 dias, com os horários livres da modalidade escolhida (vazio enquanto carrega) */
  days: BookingDay[];
  /** horários do dia escolhido */
  daySlots: AppointmentSlot[];
  /** agendamento sendo remarcado (null ao agendar) */
  reschedule: Appointment | null;
  canContinue: boolean;
  next: () => void;
  /** Etapa anterior; false quando já está na primeira (a tela então sai do fluxo). */
  back: () => boolean;
  submit: () => Promise<Appointment | null>;
}

/** Recusas em que basta escolher outro horário (os horários são recarregados quando podem ter mudado). */
const CHOOSE_ANOTHER: Record<string, { reload: boolean }> = {
  slot_unavailable: { reload: true },
  too_soon: { reload: true },
  too_far: { reload: true },
  student_conflict: { reload: false },
};

/**
 * Fluxo de agendamento (ou remarcação) em etapas, com envio idempotente: a chave `clientRequestId` nasce com a
 * tentativa e é reaproveitada quando a rede falha (o servidor devolve o mesmo agendamento em vez de duplicar).
 */
export function useAppointmentBooking(options: { reschedule?: Appointment | null; now?: Date } = {}): BookingController {
  const reschedule = options.reschedule ?? null;
  const userId = useSupportUserId();
  const catalog = useAppointmentCatalog();
  const [state, dispatch] = useReducer(bookingReducer, undefined, () => initialBookingState(newAppointmentRequestId(), reschedule));
  const [now] = useState(() => options.now ?? new Date());
  const submitting = useRef(false);
  const timezone = catalog.data?.policy.timezone || APPOINTMENTS.TIMEZONE;
  const range = useMemo(() => slotRange(now, timezone), [now, timezone]);
  const mode = state.mode;

  const slots = useResource<AppointmentSlotList>(() => getAppointmentsApi().getSlots({ from: range.from, to: range.to, mode }), {
    enabled: mode !== null,
    key: `${range.from}|${range.to}|${mode ?? ''}`,
    isEmpty: (list) => list.days.every((day) => day.slots.length === 0),
  });

  // Enquanto uma nova consulta carrega (outra modalidade, horários atualizados), nada antigo é oferecido.
  const fresh = slots.status === 'success' || slots.status === 'empty' ? slots.data : null;
  const days = useMemo<BookingDay[]>(() => (fresh?.days ?? []).map((day) => ({ date: day.date, slots: uniqueSlots(day.slots.filter((slot) => !mode || slot.mode === mode)) })), [fresh, mode]);
  const daySlots = useMemo(() => days.find((day) => day.date === state.date)?.slots ?? [], [days, state.date]);

  const steps = reschedule ? RESCHEDULE_STEPS : BOOKING_STEPS;
  const stepIndex = Math.max(0, steps.indexOf(state.step));
  const canContinue = canAdvanceBooking(state);

  const next = useCallback(() => {
    if (!canAdvanceBooking(state)) return;
    const following = steps[stepIndex + 1];
    if (following) dispatch({ type: 'GO_TO', step: following });
  }, [state, stepIndex, steps]);

  const back = useCallback(() => {
    const previous = steps[stepIndex - 1];
    if (!previous || state.result || state.submitting) return false;
    dispatch({ type: 'GO_TO', step: previous });
    return true;
  }, [state.result, state.submitting, stepIndex, steps]);

  const reloadSlots = slots.reload;
  const submit = useCallback(async (): Promise<Appointment | null> => {
    const { slot, topicId } = state;
    if (submitting.current || state.result || !slot || !state.mode || !topicId) return null;
    submitting.current = true;
    dispatch({ type: 'SUBMIT_START' });
    const api = getAppointmentsApi();
    const notes = state.notes.trim();
    try {
      // v1.8: o local do horário escolhido vai junto — a API reserva exatamente aquele local (ou responde 409)
      const location = slot.location ?? null;
      const appointment = reschedule
        ? await api.reschedule(reschedule.id, { clientRequestId: state.clientRequestId, startsAt: slot.startsAt, mode: state.mode, location })
        : await api.create({ clientRequestId: state.clientRequestId, topicId, startsAt: slot.startsAt, mode: state.mode, location, ...(notes ? { notes } : {}) });
      // o detalhe abre na hora, sem esqueleto
      writeCache(userId, appointmentCacheKeys.detail(appointment.id), appointment);
      haptics.success();
      dispatch({ type: 'SUBMIT_SUCCESS', appointment });
      return appointment;
    } catch (error) {
      haptics.error();
      const another = CHOOSE_ANOTHER[appointmentErrorReason(error) ?? ''];
      if (another) {
        // nada foi criado: a próxima tentativa é um novo pedido, com os horários atualizados quando preciso
        dispatch({ type: 'SLOT_TAKEN', message: appointmentErrorMessage(error), clientRequestId: newAppointmentRequestId() });
        if (another.reload) reloadSlots();
      } else {
        const fallback = reschedule ? 'Não conseguimos remarcar agora. Seu horário atual continua valendo; tente novamente.' : 'Não conseguimos agendar agora. Seus dados continuam aqui; tente novamente.';
        dispatch({ type: 'SUBMIT_FAILURE', message: appointmentErrorMessage(error, fallback), ...(isDefinitiveRejection(error) ? { clientRequestId: newAppointmentRequestId() } : {}) });
      }
      return null;
    } finally {
      submitting.current = false;
    }
  }, [reloadSlots, reschedule, state, userId]);

  return { state, dispatch, steps, stepIndex, catalog, slots, timezone, days, daySlots, reschedule, canContinue, next, back, submit };
}
