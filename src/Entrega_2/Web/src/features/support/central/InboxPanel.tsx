import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { MessageCircle, Search, UserRoundX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingRows } from '@/components/feedback/States';
import { ACTIVE_STATUSES, FINISHED_STATUSES, StatusBadge } from '@/features/support/labels';
import { staffKeys, staffTicketsApi, type StaffTicketQuery } from '@/features/support/staff/api';
import { UnreadBadge } from '@/features/support/staff/components';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import type { SupportInboxCounts, SupportTicketSummary } from '@/types/api';
import { centralApi, centralKeys } from './api';

export type InboxView = 'new' | 'mine' | 'waiting' | 'unidentified' | 'whatsapp' | 'all' | 'finished';

const ACTIVE = ACTIVE_STATUSES.join(',');

export const INBOX_VIEWS: Array<{ value: InboxView; label: string; query: StaffTicketQuery; count?: keyof SupportInboxCounts }> = [
  { value: 'new', label: 'Novas', query: { status: 'submitted,received,triage,reopened' }, count: 'newTickets' },
  { value: 'mine', label: 'Minhas', query: { status: ACTIVE, assigned: 'mine' }, count: 'mine' },
  { value: 'waiting', label: 'Aguardando aluno', query: { status: 'waiting_student' }, count: 'waitingStudent' },
  { value: 'unidentified', label: 'Não identificados', query: { status: ACTIVE, unidentified: '1' }, count: 'unidentified' },
  { value: 'whatsapp', label: 'WhatsApp', query: { status: ACTIVE, channel: 'whatsapp' }, count: 'whatsapp' },
  { value: 'all', label: 'Em aberto', query: { status: ACTIVE } },
  { value: 'finished', label: 'Encerrados', query: { status: FINISHED_STATUSES.join(',') } },
];

function InboxRow({ item, selected, onSelect }: { item: SupportTicketSummary; selected: boolean; onSelect: (id: string) => void }) {
  const staff = item.staff;
  const identified = Boolean(staff?.studentId);
  const title = identified ? staff?.studentName : (staff?.contactLabel ?? 'Contato não identificado');
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        aria-current={selected ? 'true' : undefined}
        className={cn('flex w-full flex-col gap-1 border-b border-line-soft px-3 py-2.5 text-left hover:bg-snow focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-action', selected && 'bg-action-soft hover:bg-action-soft')}
      >
        <span className="flex items-center gap-1.5">
          {staff?.channel === 'whatsapp' ? <MessageCircle size={14} className="shrink-0 text-slate" aria-label="WhatsApp" /> : null}
          {!identified ? <UserRoundX size={14} className="shrink-0 text-warning-text" aria-label="Sem vínculo verificado" /> : null}
          <span className="min-w-0 flex-1 truncate text-small font-semibold text-ink">{title}</span>
          <UnreadBadge count={item.unreadCount} />
        </span>
        <span className="truncate text-caption text-slate">{staff?.lastMessagePreview ?? item.subject}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusBadge status={item.status} audience="staff" />
          <span className="text-caption text-mist">{formatRelative(item.updatedAt)}</span>
        </span>
      </button>
    </li>
  );
}

/** Caixa de entrada unificada (WhatsApp, app e portal). A busca espera a pessoa parar de digitar. */
export function InboxPanel({ selectedId, view, onViewChange, onSelect, statusBar }: { selectedId: string | null; view: InboxView; onViewChange: (view: InboxView) => void; onSelect: (id: string) => void; statusBar?: React.ReactNode }) {
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);
  const counts = useQuery({ queryKey: centralKeys.counts, queryFn: centralApi.counts, refetchInterval: 60_000 });
  const definition = INBOX_VIEWS.find((item) => item.value === view) ?? INBOX_VIEWS[0]!;
  const query: StaffTicketQuery = { ...definition.query, ...(search ? { search } : {}), limit: 30 };
  const list = useInfiniteQuery({
    queryKey: staffKeys.list(query),
    queryFn: ({ pageParam }) => staffTicketsApi.list({ ...query, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line p-3">
        <label className="relative block">
          <span className="sr-only">Buscar por protocolo, assunto ou contato</span>
          <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mist" aria-hidden />
          <input type="search" value={text} onChange={(event) => setText(event.target.value)} placeholder="Buscar" className="h-9 w-full rounded-md border border-line bg-white pl-8 pr-2 text-small text-ink placeholder:text-mist" />
        </label>
        <div role="tablist" aria-label="Filas de atendimento" className="mt-2 flex flex-wrap gap-1">
          {INBOX_VIEWS.map((item) => {
            const count = item.count ? counts.data?.[item.count] : undefined;
            const selected = item.value === view;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onViewChange(item.value)}
                className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-caption', selected ? 'border-action bg-action-soft font-semibold text-action' : 'border-line text-slate hover:border-line-strong hover:text-ink')}
              >
                {item.label}
                {/* espaço real: leitores de tela leem "Novas 3", não "Novas3" */}
                {count !== undefined ? <> <span className="tabular-nums">{count}</span></> : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.isPending ? (
          <div className="p-3"><LoadingRows rows={5} /></div>
        ) : list.isError && items.length === 0 ? (
          <div className="p-3"><ErrorState error={list.error} onRetry={() => void list.refetch()} /></div>
        ) : items.length === 0 ? (
          <div className="p-3"><EmptyState title="Nada nesta fila" description={search ? 'Nenhum resultado para esta busca.' : 'Quando houver atendimentos, eles aparecem aqui.'} /></div>
        ) : (
          <ul aria-label={`Atendimentos: ${definition.label}`}>
            {items.map((item) => <InboxRow key={item.id} item={item} selected={item.id === selectedId} onSelect={onSelect} />)}
          </ul>
        )}
        {list.hasNextPage ? (
          <div className="p-3 text-center">
            <Button size="sm" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>Carregar mais</Button>
          </div>
        ) : null}
      </div>
      {statusBar ? <div className="border-t border-line px-3 py-1.5">{statusBar}</div> : null}
    </div>
  );
}
