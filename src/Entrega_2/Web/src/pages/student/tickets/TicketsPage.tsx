import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { MessageSquarePlus, RefreshCw, SearchX } from 'lucide-react';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { List, ListItem, PageHeader } from '@/components/ui/Display';
import { FilterChips, FiltersBar, SearchInput } from '@/components/data/DataTable';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { SlaIndicator, StatusBadge } from '@/features/support/labels';
import { CategoryGlyph, QueryFailure } from '@/features/support/student/components';
import { useNow } from '@/features/support/student/hooks';
import { supportKeys, type TicketFilter } from '@/features/support/student/keys';
import { isForbidden, slaApplies, statusParam } from '@/features/support/student/utils';
import { formatDateTime, formatRelative } from '@/lib/format';
import { messageForError } from '@/services/api/client';
import { supportApi } from '@/services/api/endpoints';
import type { SupportTicketCounts, SupportTicketSummary } from '@/types/api';

const PAGE_SIZE = 20;

/** Filtro na URL em português (links compartilháveis e voltar do detalhe mantém a escolha). */
const FILTER_PARAM: Record<TicketFilter, string | null> = { all: null, active: 'em-andamento', waiting: 'aguardando-voce', finished: 'concluidos' };
const filterFromParam = (value: string | null): TicketFilter => (Object.entries(FILTER_PARAM).find(([, param]) => param !== null && param === value)?.[0] as TicketFilter | undefined) ?? 'all';

const FILTER_LABELS: Record<TicketFilter, string> = { all: 'Todos', active: 'Em andamento', waiting: 'Aguardando você', finished: 'Concluídos' };
const countFor = (counts: SupportTicketCounts | undefined, filter: TicketFilter): number | undefined => {
  if (!counts) return undefined;
  return filter === 'all' ? counts.all : filter === 'active' ? counts.active : filter === 'waiting' ? counts.waitingStudent : counts.finished;
};

function TicketRow({ ticket }: { ticket: SupportTicketSummary }) {
  const activity = ticket.lastActivity;
  return (
    <ListItem
      to={`/aluno/chamados/${encodeURIComponent(ticket.id)}`}
      leading={<CategoryGlyph categoryId={ticket.categoryId} />}
      unread={ticket.unreadCount > 0}
      title={ticket.subject}
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-mono text-ink">{ticket.protocol}</span>
          <span aria-hidden>·</span>
          <span>
            {ticket.categoryLabel}
            {ticket.subcategoryLabel ? ` · ${ticket.subcategoryLabel}` : ''}
          </span>
        </span>
      }
      meta={
        <span className="flex flex-col gap-1.5">
          <span>
            {activity ? `${activity.title} · ` : 'Aberto · '}
            <time dateTime={activity?.createdAt ?? ticket.createdAt} title={formatDateTime(activity?.createdAt ?? ticket.createdAt)}>
              {formatRelative(activity?.createdAt ?? ticket.createdAt)}
            </time>
            {ticket.unreadCount > 0 ? ` · ${ticket.unreadCount} ${ticket.unreadCount === 1 ? 'mensagem nova' : 'mensagens novas'}` : ''}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={ticket.status} />
            {slaApplies(ticket.status) ? <SlaIndicator sla={ticket.sla} showDue={false} /> : null}
          </span>
        </span>
      }
    />
  );
}

/** "Meus chamados": filtros com contagens do servidor, busca no servidor e paginação por cursor. */
export default function TicketsPage() {
  const [params, setParams] = useSearchParams();
  const filter = filterFromParam(params.get('filtro'));
  const search = params.get('busca') ?? '';
  const now = useNow();

  const setParam = useCallback(
    (key: 'filtro' | 'busca', value: string | null) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const onSearch = useCallback((value: string) => setParam('busca', value), [setParam]);

  const query = useInfiniteQuery({
    queryKey: supportKeys.list(filter, search),
    queryFn: ({ pageParam }) => supportApi.list({ status: statusParam(filter), search: search || undefined, limit: PAGE_SIZE, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  if (query.error && isForbidden(query.error)) return <AccessDenied />;

  const counts = query.data?.pages[0]?.counts;
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const switching = query.isPlaceholderData;

  let body;
  if (query.isPending) body = <LoadingRows rows={4} />;
  else if (query.error && !query.data) body = <QueryFailure error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar seus chamados" />;
  else if (items.length === 0) {
    body =
      counts?.all === 0 && !search ? (
        <EmptyState
          title="Você ainda não abriu chamados"
          description="Quando precisar do ASA — documentos, matrícula, financeiro e mais —, abra um chamado e acompanhe cada etapa aqui e no app."
          icon={MessageSquarePlus}
          action={<ButtonLink to="/aluno/chamados/novo">Abrir meu primeiro chamado</ButtonLink>}
        />
      ) : (
        <EmptyState
          icon={SearchX}
          title={search ? `Nenhum chamado encontrado para “${search}”` : `Nenhum chamado em “${FILTER_LABELS[filter]}”`}
          description={search ? 'Confira a grafia ou busque pelo protocolo, assunto ou categoria.' : 'Escolha outro filtro para ver os demais chamados.'}
          action={
            search ? (
              <Button onClick={() => setParam('busca', null)}>Limpar busca e voltar à lista</Button>
            ) : (
              <Button onClick={() => setParam('filtro', null)}>Ver todos</Button>
            )
          }
        />
      );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <div aria-busy={switching || undefined} className={switching ? 'opacity-60 transition-opacity duration-150' : 'transition-opacity duration-150'}>
          <List label="Chamados">
            {items.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </List>
        </div>
        {query.error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-snow px-3 py-2 text-small text-slate">
            <span className="min-w-0">
              {query.isFetchNextPageError ? 'Não foi possível carregar mais chamados.' : 'Não foi possível atualizar a lista.'} {messageForError(query.error)}
            </span>
            {query.isFetchNextPageError ? null : (
              <Button size="sm" icon={RefreshCw} onClick={() => void query.refetch()}>
                Tentar novamente
              </Button>
            )}
          </div>
        ) : null}
        {query.hasNextPage ? (
          <Button className="self-center" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            Carregar mais
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Meus chamados"
        description="Suas solicitações ao ASA, abertas pelo portal ou pelo aplicativo. O andamento é o mesmo nos dois canais."
        actions={
          <ButtonLink to="/aluno/chamados/novo" variant="primary" icon={MessageSquarePlus}>
            Abrir chamado
          </ButtonLink>
        }
      />
      <FiltersBar
        trailing={
          <span className="flex items-center gap-2 whitespace-nowrap">
            {query.dataUpdatedAt ? (
              <span className="text-caption text-mist">
                Atualizado {formatRelative(new Date(query.dataUpdatedAt), now)}
              </span>
            ) : null}
            <Button size="sm" icon={RefreshCw} loading={query.isRefetching && !query.isFetchingNextPage} onClick={() => void query.refetch()}>
              Atualizar
            </Button>
          </span>
        }
      >
        <FilterChips
          label="Filtrar chamados"
          value={filter}
          onChange={(value) => setParam('filtro', FILTER_PARAM[value])}
          options={(Object.keys(FILTER_LABELS) as TicketFilter[]).map((value) => ({ value, label: FILTER_LABELS[value], count: countFor(counts, value) }))}
        />
        <SearchInput value={search} onChange={onSearch} label="Buscar chamados" placeholder="Assunto, protocolo ou categoria" />
      </FiltersBar>
      {body}
    </>
  );
}
