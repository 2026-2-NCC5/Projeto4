import type { Ionicons } from '@expo/vector-icons';
import type React from 'react';

import type { InboxNotification, NotificationCategory } from '../../types/api';

import type { InboxTarget } from './push';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const CATEGORY_META: Record<NotificationCategory, { label: string; icon: IconName }> = {
  support: { label: 'Atendimento', icon: 'chatbubbles-outline' },
  appointment: { label: 'Agendamentos', icon: 'calendar-outline' },
  agent: { label: 'Análises', icon: 'sparkles-outline' },
  account: { label: 'Conta e segurança', icon: 'shield-checkmark-outline' },
  system: { label: 'Avisos do ASA', icon: 'megaphone-outline' },
  knowledge: { label: 'Base de conhecimento', icon: 'book-outline' },
};

export function categoryMeta(category: NotificationCategory): { label: string; icon: IconName } {
  return CATEGORY_META[category] ?? { label: 'Aviso', icon: 'notifications-outline' };
}

/** Destino do toque em um aviso da central (null: o aviso só é marcado como lido). */
export function inboxTarget(item: Pick<InboxNotification, 'resource'>): Exclude<InboxTarget, { kind: 'inbox' }> | null {
  const resource = item.resource;
  if (!resource?.id) return null;
  if (resource.type === 'ticket' || resource.type === 'appointment' || resource.type === 'recommendation') return { kind: resource.type, id: resource.id };
  // artigos da base de conhecimento ainda não têm tela no app
  return null;
}

/** O que o leitor de tela anuncia como dica do toque. */
export function targetHint(target: ReturnType<typeof inboxTarget>): string {
  switch (target?.kind) {
    case 'ticket':
      return 'Abre o chamado';
    case 'appointment':
      return 'Abre o agendamento';
    case 'recommendation':
      return 'Abre a recomendação';
    default:
      return 'Marca o aviso como lido';
  }
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export interface InboxGroup {
  key: 'today' | 'earlier';
  title: string;
  items: InboxNotification[];
}

/** "Hoje" e "Anteriores" (mais recentes primeiro); grupos vazios não aparecem. */
export function groupInbox(items: InboxNotification[], now: Date = new Date()): InboxGroup[] {
  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const today: InboxNotification[] = [];
  const earlier: InboxNotification[] = [];
  for (const item of sorted) {
    const created = new Date(item.createdAt);
    if (!Number.isNaN(created.getTime()) && sameLocalDay(created, now)) today.push(item);
    else earlier.push(item);
  }
  const groups: InboxGroup[] = [];
  if (today.length > 0) groups.push({ key: 'today', title: 'Hoje', items: today });
  if (earlier.length > 0) groups.push({ key: 'earlier', title: 'Anteriores', items: earlier });
  return groups;
}
