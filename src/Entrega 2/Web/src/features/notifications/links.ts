import type { InboxNotification } from '@/types/api';
import type { Area } from '@/layouts/nav';

/** Página de destino de um aviso em cada área (null quando o aviso não aponta para um registro). */
export function notificationHref(area: Area, item: Pick<InboxNotification, 'resource'>): string | null {
  const resource = item.resource;
  if (!resource) return null;
  const id = encodeURIComponent(resource.id);
  if (area === 'aluno') {
    if (resource.type === 'ticket') return `/aluno/chamados/${id}`;
    if (resource.type === 'appointment') return `/aluno/agendamentos?agendamento=${id}`;
    if (resource.type === 'recommendation') return `/aluno/academico?recomendacao=${id}`;
    if (resource.type === 'article') return `/aluno/ajuda/${id}`;
  }
  if (area === 'asa') {
    if (resource.type === 'ticket') return `/asa/chamados/${id}`;
    if (resource.type === 'appointment') return `/asa/agendamentos?agendamento=${id}`;
    if (resource.type === 'article') return `/asa/base-conhecimento/${id}`;
  }
  if (area === 'admin' && resource.type === 'article') return `/admin/base-conhecimento/${id}`;
  return null;
}
