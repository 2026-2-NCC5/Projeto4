import {
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarSync,
  CalendarX,
  CheckCircle2,
  StickyNote,
  UserX,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { Badge, type Tone } from '@/components/ui/Display';
import type { Appointment, AppointmentEvent, AppointmentMode, AppointmentStatus } from '@/types/api';

/**
 * Textos e tons dos Agendamentos. "Remarcado" não é uma situação da API: é o agendamento antigo de uma
 * remarcação (cancelado com o evento `rescheduled`), mostrado assim para o aluno não achar que perdeu o horário.
 */
export type DisplayStatus = AppointmentStatus | 'rescheduled';

export interface StatusMeta {
  label: string;
  description: string;
  tone: Tone;
  icon: LucideIcon;
}

export const STATUS_META: Record<DisplayStatus, StatusMeta> = {
  scheduled: { label: 'Agendado', description: 'Horário reservado. O ASA ainda vai confirmar o atendimento.', tone: 'info', icon: CalendarClock },
  confirmed: { label: 'Confirmado', description: 'O ASA confirmou o atendimento.', tone: 'success', icon: CalendarCheck },
  completed: { label: 'Realizado', description: 'O atendimento aconteceu.', tone: 'neutral', icon: CheckCircle2 },
  cancelled: { label: 'Cancelado', description: 'Este agendamento foi cancelado.', tone: 'neutral', icon: CalendarX },
  no_show: { label: 'Ausência registrada', description: 'O ASA registrou ausência neste atendimento.', tone: 'warning', icon: UserX },
  rescheduled: { label: 'Remarcado', description: 'Este horário foi trocado por um novo agendamento.', tone: 'neutral', icon: CalendarSync },
};

/** Ordem dos filtros/contagens na agenda da equipe. */
export const STATUS_ORDER: AppointmentStatus[] = ['scheduled', 'confirmed', 'completed', 'no_show', 'cancelled'];

/** Rótulos no plural para contagens ("3 agendados"). */
export const STATUS_PLURAL: Record<AppointmentStatus, string> = {
  scheduled: 'Agendados',
  confirmed: 'Confirmados',
  completed: 'Realizados',
  no_show: 'Ausências',
  cancelled: 'Cancelados',
};

export const ACTIVE_STATUSES: readonly AppointmentStatus[] = ['scheduled', 'confirmed'];
export const isActive = (status: AppointmentStatus): boolean => ACTIVE_STATUSES.includes(status);

/** Motivo gravado pelo servidor no agendamento antigo de uma remarcação (dados anteriores à v1.8). */
const RESCHEDULED_REASON = 'Remarcado pelo aluno';

/** Situação exibida: o agendamento antigo de uma remarcação (cancelado com substituto) aparece como "Remarcado". */
export function displayStatus(
  appointment: Pick<Appointment, 'status' | 'cancelReason' | 'rescheduledToId'> & { events: ReadonlyArray<Pick<AppointmentEvent, 'type'>> },
): DisplayStatus {
  if (appointment.status !== 'cancelled') return appointment.status;
  const rescheduled =
    Boolean(appointment.rescheduledToId) || appointment.events.some((event) => event.type === 'rescheduled') || appointment.cancelReason === RESCHEDULED_REASON;
  return rescheduled ? 'rescheduled' : 'cancelled';
}

export function AppointmentStatusBadge({ status }: { status: DisplayStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      {meta.label}
    </Badge>
  );
}

export const MODE_META: Record<AppointmentMode, { label: string; description: string; icon: LucideIcon }> = {
  presencial: { label: 'Presencial', description: 'Atendimento no ASA, no horário marcado. Chegue alguns minutos antes.', icon: Building2 },
  online: { label: 'Online', description: 'Videochamada. O link é combinado pela equipe do ASA na confirmação.', icon: Video },
};

/** "Presencial · Sala 3" · "Online". */
export function modeAndPlace(mode: AppointmentMode, location: string | null): string {
  const label = MODE_META[mode].label;
  return location ? `${label} · ${location}` : label;
}

export const EVENT_ICONS: Record<AppointmentEvent['type'], LucideIcon> = {
  scheduled: CalendarPlus,
  confirmed: CalendarCheck,
  rescheduled: CalendarSync,
  cancelled: CalendarX,
  completed: CheckCircle2,
  no_show: UserX,
  note: StickyNote,
};

/** Quem fez a ação, do ponto de vista de quem lê. */
export function actorLabel(actorType: AppointmentEvent['actorType'], audience: 'student' | 'staff', actorName?: string | null): string {
  if (actorType === 'system') return 'Sistema';
  if (actorType === 'student') return audience === 'student' ? 'Você' : 'Aluno';
  return audience === 'staff' && actorName ? actorName : 'Equipe ASA';
}

export const channelLabel = (channel: 'app' | 'web'): string => (channel === 'web' ? 'Portal web' : 'Aplicativo');
