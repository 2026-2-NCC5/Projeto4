import type { Appointment, AppointmentMode, AppointmentSlot } from '../../../types/api';

/** Etapas do agendamento: assunto → modalidade → dia → horário → observações e resumo (confirmar). */
export type BookingStep = 'topic' | 'mode' | 'day' | 'time' | 'review';

export const BOOKING_STEPS: readonly BookingStep[] = ['topic', 'mode', 'day', 'time', 'review'];
/** Remarcar mantém o assunto: começa pela modalidade. */
export const RESCHEDULE_STEPS: readonly BookingStep[] = ['mode', 'day', 'time', 'review'];

export const BOOKING_STEP_LABELS: Record<BookingStep, string> = {
  topic: 'Assunto',
  mode: 'Modalidade',
  day: 'Dia',
  time: 'Horário',
  review: 'Confirmação',
};

export interface BookingState {
  step: BookingStep;
  topicId: string | null;
  mode: AppointmentMode | null;
  /** YYYY-MM-DD no fuso da instituição */
  date: string | null;
  slot: AppointmentSlot | null;
  notes: string;
  /** chave de idempotência da tentativa atual (reaproveitada em nova tentativa após falha de rede) */
  clientRequestId: string;
  submitting: boolean;
  /** erro do envio (exibido na confirmação) */
  error: string | null;
  /** aviso exibido na escolha do horário (ex.: o horário acabou de ser reservado) */
  notice: string | null;
  result: Appointment | null;
}

export type BookingAction =
  | { type: 'SELECT_TOPIC'; topicId: string }
  | { type: 'SELECT_MODE'; mode: AppointmentMode }
  | { type: 'SELECT_DAY'; date: string }
  | { type: 'SELECT_SLOT'; slot: AppointmentSlot }
  | { type: 'SET_NOTES'; notes: string }
  | { type: 'GO_TO'; step: BookingStep }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS'; appointment: Appointment }
  /** `clientRequestId` novo só quando o servidor recusou de forma definitiva (nada foi criado) */
  | { type: 'SUBMIT_FAILURE'; message: string; clientRequestId?: string }
  /** 409 slot_unavailable: volta à escolha do horário com os horários atualizados */
  | { type: 'SLOT_TAKEN'; message: string; clientRequestId: string }
  | { type: 'DISMISS_NOTICE' };

export function initialBookingState(clientRequestId: string, reschedule?: Pick<Appointment, 'topicId' | 'mode'> | null): BookingState {
  return {
    step: reschedule ? 'mode' : 'topic',
    topicId: reschedule?.topicId ?? null,
    mode: reschedule?.mode ?? null,
    date: null,
    slot: null,
    notes: '',
    clientRequestId,
    submitting: false,
    error: null,
    notice: null,
    result: null,
  };
}

export function bookingReducer(state: BookingState, action: BookingAction): BookingState {
  switch (action.type) {
    case 'SELECT_TOPIC':
      return { ...state, topicId: action.topicId, error: null };
    case 'SELECT_MODE':
      // outra modalidade tem outros horários: dia e horário escolhidos deixam de valer
      return state.mode === action.mode ? state : { ...state, mode: action.mode, date: null, slot: null, error: null, notice: null };
    case 'SELECT_DAY':
      return state.date === action.date ? state : { ...state, date: action.date, slot: null, error: null, notice: null };
    case 'SELECT_SLOT':
      return { ...state, slot: action.slot, error: null, notice: null };
    case 'SET_NOTES':
      return { ...state, notes: action.notes };
    case 'GO_TO':
      return { ...state, step: action.step, error: null };
    case 'SUBMIT_START':
      return state.submitting ? state : { ...state, submitting: true, error: null };
    case 'SUBMIT_SUCCESS':
      return { ...state, submitting: false, error: null, notice: null, result: action.appointment };
    case 'SUBMIT_FAILURE':
      return { ...state, submitting: false, error: action.message, clientRequestId: action.clientRequestId ?? state.clientRequestId };
    case 'SLOT_TAKEN':
      return { ...state, submitting: false, error: null, step: 'time', slot: null, notice: action.message, clientRequestId: action.clientRequestId };
    case 'DISMISS_NOTICE':
      return state.notice ? { ...state, notice: null } : state;
    default:
      return state;
  }
}

/** A etapa atual tem o que precisa para avançar. */
export function canAdvanceBooking(state: BookingState): boolean {
  switch (state.step) {
    case 'topic':
      return state.topicId !== null;
    case 'mode':
      return state.mode !== null;
    case 'day':
      return state.date !== null;
    case 'time':
      return state.slot !== null;
    default:
      return state.topicId !== null && state.mode !== null && state.slot !== null;
  }
}
