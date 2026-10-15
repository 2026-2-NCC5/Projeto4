export { getAppointmentsApi, httpAppointmentsApi, newAppointmentRequestId, setAppointmentsApi, slotsPath, type AppointmentsApi, type AppointmentScope, type SlotsQuery } from './api';
export { APPOINTMENT_ROUTES, APPOINTMENTS } from './config';
export {
  appointmentErrorMessage,
  appointmentErrorReason,
  appointmentLoadErrorMessage,
  isAppointmentsRouteMissing,
  isAppointmentsUnavailable,
  isDefinitiveRejection,
  type AppointmentErrorReason,
} from './errors';
export * from './format';
export { ACTIVE_APPOINTMENT_STATUSES, APPOINTMENT_STATUS, appointmentStatusMeta, MODE_META, modeLabel, placeLabel, sameSlot, slotKey, uniqueSlots, type AppointmentStatusMeta } from './labels';
export { appointmentShareText } from './share';
export { BOOKING_STEP_LABELS, BOOKING_STEPS, bookingReducer, canAdvanceBooking, initialBookingState, RESCHEDULE_STEPS, type BookingAction, type BookingState, type BookingStep } from './state/bookingReducer';
export { useAppointmentActions, type AppointmentActions } from './hooks/useAppointmentActions';
export { useAppointmentBooking, type BookingController, type BookingDay } from './hooks/useAppointmentBooking';
export { appointmentCacheKeys, useAppointment, useAppointmentCatalog, useAppointmentList, useNextAppointment, type NextAppointment } from './hooks/useAppointments';
export { AppointmentRow } from './components/AppointmentRow';
export { AppointmentStatusBadge } from './components/AppointmentStatusBadge';
export { ChoiceRow, type ChoiceRowProps } from './components/ChoiceRow';
export { ConfirmDialog, type ConfirmDialogProps } from './components/ConfirmDialog';
export { DayStrip, type DayStripProps } from './components/DayStrip';
export { InlineNotice, type InlineNoticeProps, type NoticeTone } from './components/InlineNotice';
export { TimeGrid, type TimeGridProps } from './components/TimeGrid';
