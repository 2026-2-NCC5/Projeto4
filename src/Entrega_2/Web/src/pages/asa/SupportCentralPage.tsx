import { useQuery } from '@tanstack/react-query';
import { MessagesSquare } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/ui/Display';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { useMe, useSession } from '@/features/auth/session';
import { centralApi, centralKeys } from '@/features/support/central/api';
import { ContextPanel } from '@/features/support/central/ContextPanel';
import { ConversationPanel } from '@/features/support/central/ConversationPanel';
import { InboxPanel, INBOX_VIEWS, type InboxView } from '@/features/support/central/InboxPanel';
import { ChannelIndicator, RealtimeIndicator } from '@/features/support/central/labels';
import { ResizablePanels, usePanelLayout } from '@/features/support/central/ResizablePanels';
import { useSupportRealtime } from '@/features/support/central/useSupportRealtime';
import { ConflictNotice, LoadError } from '@/features/support/staff/components';
import { useMarkTicketRead, useStaffTicket, useSupportCatalog, useTicketActions, type TicketAction } from '@/features/support/staff/hooks';
import { isApiError } from '@/services/api/client';

const WIDE = '(min-width: 1024px)';

/** Tela larga = três painéis. Tablet e celular = navegação sequencial (lista → conversa → contexto). */
function useIsWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const query = window.matchMedia(WIDE);
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(WIDE).matches : true),
  );
}

/**
 * Central de Atendimento: caixa de entrada, conversa e contexto na mesma aba, sem abrir janelas.
 * A atualização chega por long polling; a escolha de layout fica salva por usuário neste navegador.
 */
export default function SupportCentralPage() {
  const { ticketId = null } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const me = useMe();
  const { can } = useSession();
  const allowed = can('tickets:read:any');
  const canManage = can('tickets:manage');
  const canNote = can('tickets:internal_note');
  const canOpenContext = can('students:read:support_context');
  const wide = useIsWide();
  const [layout, setLayout] = usePanelLayout(`asa:central:layout:${me.user.id}`);
  // os dois valem só para o chamado aberto: trocar de chamado volta ao padrão sem precisar de efeito
  const [contextFor, setContextFor] = useState<string | null>(null);
  const [conflictFor, setConflictFor] = useState<string | null>(null);
  const narrowPane = contextFor !== null && contextFor === ticketId ? 'context' : 'conversation';
  const conflict = conflictFor !== null && conflictFor === ticketId;
  const setConflict = (value: boolean) => setConflictFor(value ? ticketId : null);

  const realtime = useSupportRealtime(allowed);
  const channelStatus = useQuery({ queryKey: centralKeys.status, queryFn: centralApi.status, enabled: allowed, refetchInterval: 60_000 });
  const catalog = useSupportCatalog();
  const ticket = useStaffTicket(allowed ? ticketId : null);
  useMarkTicketRead(allowed && ticket.data ? ticketId : null, ticket.data);
  const actions = useTicketActions(ticketId ?? '', { onConflict: () => setConflict(true) });

  const viewParam = searchParams.get('fila') as InboxView | null;
  const view: InboxView = INBOX_VIEWS.some((item) => item.value === viewParam) ? (viewParam as InboxView) : 'new';

  if (!allowed) return <AccessDenied />;

  const query = searchParams.toString();
  const open = (id: string) => navigate(`/asa/atendimento/${encodeURIComponent(id)}${query ? `?${query}` : ''}`);
  const backToList = () => navigate(`/asa/atendimento${query ? `?${query}` : ''}`);

  /** Devolve se deu certo. Respostas que dependem de decisão humana passam o erro para quem chamou. */
  const runAction = async (action: TicketAction): Promise<boolean> => {
    try {
      await actions.mutateAsync(action);
      setConflict(false);
      return true;
    } catch (error) {
      if (isApiError(error) && error.reason === 'assigned_to_other') throw error;
      return false;
    }
  };
  const pendingKind = actions.isPending ? (actions.variables?.kind ?? null) : null;
  const mutate = (action: TicketAction, callbacks?: { onSuccess?: () => void; onSettled?: () => void }) =>
    actions.mutate(action, {
      onSuccess: () => {
        setConflict(false);
        callbacks?.onSuccess?.();
      },
      onSettled: () => callbacks?.onSettled?.(),
    });

  const inbox = (
    <InboxPanel
      selectedId={ticketId}
      view={view}
      onViewChange={(next) => setSearchParams((current) => {
        const params = new URLSearchParams(current);
        params.set('fila', next);
        return params;
      })}
      onSelect={open}
      statusBar={<RealtimeIndicator state={realtime} />}
    />
  );

  const noSelection = (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState icon={MessagesSquare} title="Selecione um atendimento" description="A conversa abre aqui e o contexto do aluno fica ao lado, sem sair desta tela." />
    </div>
  );

  const toggleContext = () => {
    if (wide) setLayout({ ...layout, rightCollapsed: !layout.rightCollapsed });
    else setContextFor(narrowPane === 'context' ? null : ticketId);
  };

  const center = !ticketId ? (
    noSelection
  ) : ticket.isPending ? (
    <div className="p-4"><LoadingRows rows={6} /></div>
  ) : ticket.data === undefined ? (
    <div className="p-4">
      <LoadError error={ticket.error} onRetry={() => void ticket.refetch()} notFoundTitle="Chamado não encontrado" notFoundDescription="Ele pode ter sido removido ou o endereço está incorreto." backTo="/asa/atendimento" backLabel="Voltar para a caixa de entrada" />
    </div>
  ) : (
    <>
      {conflict ? <div className="p-2"><ConflictNotice onDismiss={() => setConflict(false)} /></div> : null}
      <ConversationPanel
        key={ticket.data.id}
        ticket={ticket.data}
        limits={catalog.data?.limits}
        canReply={canManage}
        canNote={canNote}
        meId={me.user.id}
        sending={pendingKind === 'message' || pendingKind === 'note' ? pendingKind : null}
        runAction={runAction}
        onRefresh={() => void ticket.refetch()}
        onBack={wide ? undefined : backToList}
        onToggleContext={toggleContext}
        contextOpen={wide ? !layout.rightCollapsed : narrowPane === 'context'}
      />
    </>
  );

  const right = ticket.data && ticketId ? (
    <ContextPanel
      key={ticket.data.id}
      ticket={ticket.data}
      teams={catalog.data?.teams ?? []}
      resolutionMax={catalog.data?.limits.messageMaxLength}
      meId={me.user.id}
      canManage={canManage}
      canOpenContext={canOpenContext}
      busy={actions.isPending}
      pendingKind={pendingKind}
      mutate={mutate}
    />
  ) : (
    <div className="flex flex-1 items-center justify-center p-6"><p className="text-small text-mist">O contexto aparece aqui.</p></div>
  );

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[32rem] flex-col gap-3">
      <PageHeader title="Central de Atendimento" actions={<ChannelIndicator status={channelStatus.data} />} />
      {channelStatus.data?.demoMode ? (
        <p className="rounded-md border border-warning/40 bg-warning-soft px-3 py-1.5 text-small text-warning-text">Modo de demonstração: dados fictícios e nenhuma mensagem sai para o WhatsApp.</p>
      ) : null}
      {wide ? (
        <ResizablePanels className="min-h-0 flex-1" layout={layout} onLayoutChange={setLayout} left={inbox} center={center} right={right} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-white">
          {!ticketId ? inbox : narrowPane === 'context' ? <div className="flex min-h-0 flex-1 flex-col"><div className="border-b border-line p-2"><button type="button" className="text-small text-action" onClick={() => setContextFor(null)}>Voltar para a conversa</button></div>{right}</div> : center}
        </div>
      )}
    </div>
  );
}
