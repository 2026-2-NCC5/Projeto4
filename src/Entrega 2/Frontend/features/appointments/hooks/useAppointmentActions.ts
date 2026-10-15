import { useCallback, useState } from 'react';

import { haptics } from '../../../services/haptics';
import type { Appointment } from '../../../types/api';
import type { SupportResource } from '../../support/hooks/useSupportResource';
import { getAppointmentsApi } from '../api';
import { appointmentErrorMessage, appointmentErrorReason } from '../errors';

/** Recusas que indicam que a situação mudou no servidor: a tela recarrega o agendamento. */
const STALE_REASONS = new Set(['change_window_closed', 'appointment_not_active', 'appointment_changed']);

export interface AppointmentActions {
  cancelling: boolean;
  /** Devolve null em caso de sucesso ou a mensagem amigável do erro. */
  cancel: (reason?: string) => Promise<string | null>;
}

/** Cancelamento pelo aluno (as permissões `canCancel`/`canReschedule` são sempre do servidor). */
export function useAppointmentActions(resource: SupportResource<Appointment>): AppointmentActions {
  const [cancelling, setCancelling] = useState(false);
  const { data, mutate, reload } = resource;
  const id = data?.id ?? null;

  const cancel = useCallback(
    async (reason?: string): Promise<string | null> => {
      if (cancelling || !id) return null;
      setCancelling(true);
      try {
        const text = reason?.trim();
        const updated = await getAppointmentsApi().cancel(id, text ? { reason: text } : {});
        mutate(updated);
        haptics.success();
        return null;
      } catch (error) {
        haptics.error();
        if (STALE_REASONS.has(appointmentErrorReason(error) ?? '')) reload();
        return appointmentErrorMessage(error, 'Não conseguimos cancelar agora. Seu agendamento continua valendo; tente novamente.');
      } finally {
        setCancelling(false);
      }
    },
    [cancelling, id, mutate, reload],
  );

  return { cancelling, cancel };
}
