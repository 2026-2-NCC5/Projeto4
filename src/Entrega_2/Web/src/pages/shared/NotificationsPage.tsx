import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge, List, ListItem, PageHeader } from '@/components/ui/Display';
import { FilterChips } from '@/components/data/DataTable';
import { useToast } from '@/components/ui/Toast';
import { EmptyState, QueryView } from '@/components/feedback/States';
import { notificationHref } from '@/features/notifications/links';
import type { Area } from '@/layouts/nav';
import { formatDateTime, formatRelative } from '@/lib/format';
import { messageForError } from '@/services/api/client';
import { notificationsApi } from '@/services/api/endpoints';
import type { NotificationCategory } from '@/types/api';

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  support: 'Atendimento',
  appointment: 'Agendamento',
  agent: 'Agente',
  account: 'Conta',
  system: 'Plataforma',
  knowledge: 'Conhecimento',
};

type Filter = 'all' | 'unread';

/** Central de avisos (mesmos dados do app: ler aqui marca como lido lá também). */
export default function NotificationsPage({ area }: { area: Area }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const query = useQuery({ queryKey: ['notifications', 'page'], queryFn: () => notificationsApi.list(100), refetchInterval: 60_000 });
  const mark = useMutation({
    mutationFn: (ids?: string[]) => notificationsApi.markRead(ids),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (caught) => toast.show(messageForError(caught), 'error'),
  });
  const unread = query.data?.unreadCount ?? 0;

  return (
    <>
      <PageHeader
        title="Notificações"
        description="Avisos de chamados, agendamentos, análises e da plataforma. O inbox é o mesmo no portal e no aplicativo."
        actions={
          <>
            <Button icon={RefreshCw} onClick={() => void query.refetch()} loading={query.isFetching && !query.isPending}>
              Atualizar
            </Button>
            <Button variant="primary" icon={CheckCheck} disabled={unread === 0} loading={mark.isPending} onClick={() => mark.mutate(undefined)}>
              Marcar todas como lidas
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          label="Filtrar notificações"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todas', count: query.data?.items.length },
            { value: 'unread', label: 'Não lidas', count: unread },
          ]}
        />
        {query.dataUpdatedAt ? <span className="text-caption text-mist">Atualizado {formatRelative(new Date(query.dataUpdatedAt))}</span> : null}
      </div>
      <QueryView
        query={query}
        isEmpty={(data) => data.items.filter((item) => filter === 'all' || !item.readAt).length === 0}
        empty={<EmptyState title={filter === 'unread' ? 'Nada pendente' : 'Nenhuma notificação'} description="Quando houver novidades, elas aparecem aqui." />}
      >
        {(data) => (
          <List label="Notificações">
            {data.items
              .filter((item) => filter === 'all' || !item.readAt)
              .map((item) => (
                <ListItem
                  key={item.id}
                  to={notificationHref(area, item) ?? undefined}
                  title={item.title}
                  description={item.body}
                  meta={
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge>{CATEGORY_LABELS[item.category]}</Badge>
                      <span title={formatDateTime(item.createdAt)}>{formatRelative(item.createdAt)}</span>
                    </span>
                  }
                  unread={!item.readAt}
                  trailing={
                    !item.readAt ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(event) => {
                          event.preventDefault();
                          mark.mutate([item.id]);
                        }}
                      >
                        Marcar como lida
                      </Button>
                    ) : null
                  }
                />
              ))}
          </List>
        )}
      </QueryView>
    </>
  );
}
