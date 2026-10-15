import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Maximize2, MessagesSquare } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { PageHeader, Surface } from '@/components/ui/Display';
import { AccessDenied, EmptyState, ErrorState, LoadingRows } from '@/components/feedback/States';
import { useSession } from '@/features/auth/session';
import { AttachmentList } from '@/features/support/components/Attachments';
import { MessageThread } from '@/features/support/components/Conversation';
import { ACTIVE_STATUSES, StatusBadge, isFinished } from '@/features/support/labels';
import { staffKeys, staffTicketsApi, type StaffTicketQuery } from '@/features/support/staff/api';
import { ConflictNotice, Freshness, LoadError, UnreadBadge } from '@/features/support/staff/components';
import { useMarkTicketRead, useStaffTicket, useSupportCatalog, useTicketActions } from '@/features/support/staff/hooks';
import { PublicReplyComposer } from '@/features/support/staff/PublicReplyComposer';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { SupportStaffMessageRequest, SupportTicketSummary } from '@/types/api';

/** Mesmo recorte do painel ("Com mensagens não lidas"): só chamados ativos com mensagem do aluno ainda não lida. */
export const UNREAD_QUERY: StaffTicketQuery = { status: ACTIVE_STATUSES.join(','), unread: '1', limit: 50 };
export const RECENT_QUERY: StaffTicketQuery = { sort: 'updated', limit: 20 };

/** Item da lista de conversas: variante local do ListItem com estado selecionado (aria-current). */
function ConversationItem({ ticket, selected, onSelect }: { ticket: SupportTicketSummary; selected: boolean; onSelect: () => void }) {
  const unread = ticket.unreadCount > 0;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={cn('block w-full px-4 py-3 text-left transition-colors duration-150', selected ? 'bg-action-soft' : 'hover:bg-paper')}
      >
        <span className="flex items-start justify-between gap-2">
          <span className={cn('min-w-0 truncate text-body text-ink', unread ? 'font-semibold' : 'font-medium')}>{ticket.subject}</span>
          {/* no item selecionado (fundo verde-claro) o cinza mais escuro mantém o contraste AA */}
          <time dateTime={ticket.updatedAt} title={formatDateTime(ticket.updatedAt)} className={cn('shrink-0 text-caption', selected ? 'text-slate' : 'text-mist')}>
            {formatRelative(ticket.updatedAt)}
          </time>
        </span>
        <span className="mt-0.5 block truncate text-small text-slate">
          {ticket.staff?.studentName ?? 'Aluno'} · <span className="font-mono">{ticket.protocol}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <StatusBadge status={ticket.status} audience="staff" />
          <UnreadBadge count={ticket.unreadCount} />
        </span>
      </button>
    </li>
  );
}

function ConversationList({
  title,
  id,
  items,
  count,
  selectedId,
  onSelect,
  empty,
  more,
}: {
  title: string;
  id: string;
  items: SupportTicketSummary[];
  /** quantidade exibida no título (só quando significa algo: total da lista) */
  count?: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  empty: string;
  more?: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-2 text-h4 font-semibold text-ink">
        {title} {count ? <span className="text-caption font-normal text-mist tabular-nums">({count})</span> : null}
      </h2>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-white px-4 py-4 text-small text-mist">{empty}</p>
      ) : (
        <ul aria-labelledby={id} className="divide-y divide-line-soft overflow-hidden rounded-lg border border-line bg-white">
          {items.map((ticket) => (
            <ConversationItem key={ticket.id} ticket={ticket} selected={ticket.id === selectedId} onSelect={() => onSelect(ticket.id)} />
          ))}
        </ul>
      )}
      {more ? <div className="mt-2">{more}</div> : null}
    </section>
  );
}

/** Conversa aberta à direita: mensagens e resposta pública (o atendimento completo fica na página do chamado). */
function ConversationPane({ id, onBack }: { id: string; onBack: () => void }) {
  const { can } = useSession();
  const [conflict, setConflict] = useState(false);
  const ticket = useStaffTicket(id);
  const catalog = useSupportCatalog();
  useMarkTicketRead(ticket.data ? id : null, ticket.data);
  const actions = useTicketActions(id, { onConflict: () => setConflict(true) });
  // no desktop o painel rola sozinho (fica fixo ao lado da lista): abre já na mensagem mais recente
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageCount = ticket.data?.messages.length ?? 0;
  useEffect(() => {
    const pane = scrollRef.current;
    if (pane && pane.scrollHeight > pane.clientHeight) pane.scrollTop = pane.scrollHeight;
  }, [messageCount]);

  const backButton = (
    <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={onBack} className="self-start lg:hidden">
      Voltar para a lista
    </Button>
  );

  if (ticket.isPending) return <LoadingRows rows={5} />;
  if (ticket.data === undefined) {
    return (
      <div className="flex flex-col gap-3">
        {backButton}
        <LoadError error={ticket.error} onRetry={() => void ticket.refetch()} notFoundTitle="Chamado não encontrado" backTo="/asa/conversas" backLabel="Voltar às conversas" />
      </div>
    );
  }
  const data = ticket.data;
  const getLink = (attachmentId: string) => staffTicketsApi.attachmentLink(data.id, attachmentId);
  const onSend = async (body: SupportStaffMessageRequest) => {
    try {
      await actions.mutateAsync({ kind: 'message', body });
      setConflict(false);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div ref={scrollRef} className="rounded-lg lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
    <Surface aria-labelledby="conversa-aberta" className="flex flex-col gap-4">
      {backButton}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="conversa-aberta" className="text-h3 font-semibold text-ink break-words">
            {data.subject}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-slate">
            <span className="font-mono">{data.protocol}</span>
            <span aria-hidden>·</span>
            <span>
              {data.student.fullName} (RA {data.student.registrationNumber})
            </span>
            <StatusBadge status={data.status} audience="staff" />
          </p>
        </div>
        <ButtonLink to={`/asa/chamados/${encodeURIComponent(data.id)}`} size="sm" icon={Maximize2} className="shrink-0">
          Abrir atendimento completo
        </ButtonLink>
      </div>
      {conflict ? <ConflictNotice onDismiss={() => setConflict(false)} /> : null}
      {data.pendingAction ? (
        <p className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-small text-warning-text">
          Aguardando o aluno: {data.pendingAction.title}
        </p>
      ) : null}
      <MessageThread
        messages={data.messages}
        viewer="staff"
        renderAttachments={(message) =>
          message.attachments.length > 0 ? (
            <div className="mt-2">
              <AttachmentList attachments={message.attachments} getLink={getLink} ownLabel="Aluno" />
            </div>
          ) : null
        }
      />
      <div className="border-t border-line pt-4">
        {!can('tickets:manage') ? (
          <p className="rounded-md bg-snow px-3 py-2 text-small text-slate">Seu perfil não pode responder chamados.</p>
        ) : catalog.data ? (
          <PublicReplyComposer
            key={data.id}
            limits={catalog.data.limits}
            attachedCount={data.attachments.length}
            sending={actions.isPending}
            allowRequestAction={false}
            disabledReason={isFinished(data.status) ? 'Chamado finalizado: não aceita novas mensagens.' : null}
            onSend={onSend}
          />
        ) : catalog.error ? (
          <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} title="Limites de envio indisponíveis" />
        ) : (
          <p className="text-small text-mist">Carregando os limites de envio…</p>
        )}
      </div>
    </Surface>
    </div>
  );
}

/** Conversas: chamados com mensagens não lidas do aluno e os atualizados recentemente, com resposta rápida. */
export default function ConversationsPage() {
  const { can } = useSession();
  const allowed = can('tickets:read:any');
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('chamado');
  const unread = useQuery({ queryKey: staffKeys.list(UNREAD_QUERY), queryFn: () => staffTicketsApi.list(UNREAD_QUERY), refetchInterval: 30_000, enabled: allowed });
  const recent = useQuery({ queryKey: staffKeys.list(RECENT_QUERY), queryFn: () => staffTicketsApi.list(RECENT_QUERY), refetchInterval: 30_000, enabled: allowed });

  if (!allowed) return <AccessDenied />;

  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('chamado', id);
    setParams(next);
  };
  const clear = () => {
    const next = new URLSearchParams(params);
    next.delete('chamado');
    setParams(next);
  };
  const unreadItems = unread.data?.items ?? [];
  const unreadIds = new Set(unreadItems.map((item) => item.id));
  const recentItems = (recent.data?.items ?? []).filter((item) => !unreadIds.has(item.id));
  const updatedAt = Math.max(unread.dataUpdatedAt, recent.dataUpdatedAt);

  return (
    <>
      <PageHeader
        title="Conversas"
        description="Mensagens de alunos ainda não lidas pela equipe em chamados ativos e os chamados atualizados recentemente."
        actions={
          <Freshness
            updatedAt={updatedAt}
            fetching={unread.isFetching || recent.isFetching}
            failed={unread.isRefetchError || recent.isRefetchError}
            onRefresh={() => {
              void unread.refetch();
              void recent.refetch();
            }}
          />
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className={cn('min-w-0 flex-col gap-6', selectedId ? 'hidden lg:flex' : 'flex')}>
          {unread.isPending ? (
            <LoadingRows rows={3} />
          ) : unread.data === undefined ? (
            <LoadError error={unread.error} onRetry={() => void unread.refetch()} notFoundTitle="Conversas indisponíveis" backTo="/asa" backLabel="Voltar ao painel" />
          ) : (
            <ConversationList
              id="nao-lidas"
              title="Não lidas"
              items={unreadItems}
              count={`${unreadItems.length}${unread.data.nextCursor ? '+' : ''}`}
              selectedId={selectedId}
              onSelect={select}
              empty="Nenhuma mensagem de aluno esperando leitura."
              more={
                unread.data.nextCursor ? (
                  <ButtonLink to="/asa/chamados?unread=1" variant="ghost" size="sm">
                    Ver todas na fila
                  </ButtonLink>
                ) : null
              }
            />
          )}
          {recent.isPending ? (
            <LoadingRows rows={3} />
          ) : recent.data === undefined ? (
            <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />
          ) : (
            <ConversationList id="recentes" title="Atualizados recentemente" items={recentItems} selectedId={selectedId} onSelect={select} empty="Nenhum outro chamado atualizado recentemente." />
          )}
        </div>
        <div className={cn('min-w-0 lg:sticky lg:top-20 lg:self-start', selectedId ? 'block' : 'hidden lg:block')}>
          {selectedId ? (
            <ConversationPane key={selectedId} id={selectedId} onBack={clear} />
          ) : (
            <EmptyState icon={MessagesSquare} title="Selecione uma conversa" description="Escolha um chamado na lista para ler as mensagens e responder ao aluno." />
          )}
        </div>
      </div>
    </>
  );
}
