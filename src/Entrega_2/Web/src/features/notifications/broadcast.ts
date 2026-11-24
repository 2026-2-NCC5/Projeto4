import { useMutation } from '@tanstack/react-query';
import { api } from '@/services/api/client';
import type { NotificationBroadcastInput, NotificationBroadcastResult } from '@/types/api';

/** Limites do servidor (routes/broadcast.ts): cabem numa notificação do celular sem corte. */
export const BROADCAST_LIMITS = { title: { min: 3, max: 65 }, body: { min: 3, max: 240 } } as const;

/** Aviso para todos os alunos ativos: central de avisos (app e portal) + push. Exige `notifications:broadcast`. */
export function useSendBroadcast() {
  return useMutation({ mutationFn: (body: NotificationBroadcastInput) => api.post<NotificationBroadcastResult>('/api/notifications/broadcast', body) });
}
