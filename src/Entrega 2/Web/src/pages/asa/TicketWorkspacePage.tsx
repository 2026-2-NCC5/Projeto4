import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { AccessDenied, LoadingRows } from '@/components/feedback/States';
import { useMe, useSession } from '@/features/auth/session';
import { ConflictNotice, Freshness, LoadError, UnreadBadge } from '@/features/support/staff/components';
import { useMarkTicketRead, useStaffTicket, useSupportCatalog, useTicketActions, type TicketAction } from '@/features/support/staff/hooks';
import type { SupportStaffMessageRequest } from '@/types/api';
import { TicketActions } from './ticket/TicketActions';
import { TicketConversation, TicketRequest, TicketSidebar } from './ticket/TicketConversation';
import { StudentCard, TicketSummary } from './ticket/TicketSummary';

/** Atalhos para as seções no celular (as três colunas ficam empilhadas): rola até a seção e leva o foco junto. */
function SectionJumps({ sections }: { sections: Array<{ id: string; label: string }> }) {
  return (
    <nav aria-label="Seções do atendimento" className="mb-4 flex flex-wrap gap-2 lg:hidden">
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          className="inline-flex h-8 items-center rounded-full border border-line bg-white px-3 text-small text-slate hover:border-line-strong hover:text-ink"
          onClick={() => {
            const target = document.getElementById(section.id);
            if (!target) return;
            target.scrollIntoView({ block: 'start' });
            target.focus({ preventScroll: true });
          }}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}

/**
 * Atendimento de um chamado: resumo e ações (esquerda), conversa (centro), histórico e arquivos (direita).
 * Abrir confirma a leitura das mensagens do aluno; os dados se atualizam a cada 30 s.
 */
export default function TicketWorkspacePage() {
  const { id = '' } = useParams();
  const me = useMe();
  const { can } = useSession();
  const allowed = can('tickets:read:any');
  const canManage = can('tickets:manage');
  const canNote = can('tickets:internal_note');
  const [conflict, setConflict] = useState(false);
  const ticket = useStaffTicket(allowed ? id : null);
  const catalog = useSupportCatalog();
  useMarkTicketRead(allowed && ticket.data ? id : null, ticket.data);
  const actions = useTicketActions(id, { onConflict: () => setConflict(true) });

  if (!allowed) return <AccessDenied />;

  const back = (
    <Link to="/asa/chamados" className="inline-flex items-center gap-1 text-small text-slate hover:text-ink">
      <ChevronLeft size={16} aria-hidden /> Fila de chamados
    </Link>
  );

  if (ticket.isPending) {
    return (
      <>
        <div className="mb-4">{back}</div>
        <LoadingRows rows={6} />
      </>
    );
  }
  if (ticket.data === undefined) {
    return (
      <>
        <div className="mb-4">{back}</div>
        <LoadError
          error={ticket.error}
          onRetry={() => void ticket.refetch()}
          notFoundTitle="Chamado não encontrado"
          notFoundDescription="Confira o endereço ou volte para a fila."
          backTo="/asa/chamados"
          backLabel="Voltar para a fila"
        />
      </>
    );
  }

  const data = ticket.data;
  const pendingKind = actions.isPending ? (actions.variables?.kind ?? null) : null;
  const send = async (run: () => Promise<unknown>) => {
    try {
      await run();
      setConflict(false);
      return true;
    } catch {
      return false;
    }
  };
  const onReply = (body: SupportStaffMessageRequest) => send(() => actions.mutateAsync({ kind: 'message', body }));
  const onNote = (content: string) => send(() => actions.mutateAsync({ kind: 'note', content }));

  const mutate = (action: TicketAction, callbacks?: { onSuccess?: () => void; onSettled?: () => void }) =>
    actions.mutate(action, {
      onSuccess: () => {
        setConflict(false);
        callbacks?.onSuccess?.();
      },
      onSettled: () => callbacks?.onSettled?.(),
    });

  return (
    <>
      <PageHeader
        eyebrow={back}
        title={data.subject}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono">{data.protocol}</span>
            <span aria-hidden>·</span>
            <span>
              {data.student.fullName} (RA {data.student.registrationNumber})
            </span>
            <UnreadBadge count={data.unreadFromStudent ?? 0} />
          </span>
        }
        actions={<Freshness updatedAt={ticket.dataUpdatedAt} fetching={ticket.isFetching} failed={ticket.isRefetchError} onRefresh={() => void ticket.refetch()} />}
      />
      {conflict ? <ConflictNotice onDismiss={() => setConflict(false)} /> : null}
      <SectionJumps
        sections={[
          { id: 'secao-conversa', label: 'Conversa' },
          ...(canManage ? [{ id: 'secao-acoes', label: 'Ações' }] : []),
          { id: 'secao-historico', label: 'Histórico e arquivos' },
        ]}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,20rem)]">
        <div className="flex min-w-0 flex-col gap-6">
          <TicketSummary ticket={data} />
          <StudentCard ticket={data} canOpenContext={can('students:read:support_context')} />
          {canManage ? (
            <div id="secao-acoes" tabIndex={-1} className="scroll-mt-20 focus:outline-none">
              {/* os formulários recomeçam quando a situação muda (por esta pessoa ou por outra) */}
              <TicketActions
                key={`${data.id}:${data.status}`}
                ticket={data}
                teams={catalog.data?.teams ?? []}
                resolutionMax={catalog.data?.limits.messageMaxLength}
                meId={me.user.id}
                busy={actions.isPending}
                pendingKind={pendingKind}
                mutate={mutate}
              />
            </div>
          ) : (
            <Surface aria-labelledby="acoes">
              <SectionHeader id="acoes" title="Ações" />
              <p className="text-small text-slate">Seu perfil pode consultar este chamado, mas não assumir, encaminhar, mudar situação ou prioridade, resolver nem responder ao aluno.</p>
            </Surface>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <TicketRequest ticket={data} />
          <div id="secao-conversa" tabIndex={-1} className="scroll-mt-20 focus:outline-none">
            <TicketConversation
              key={data.id}
              ticket={data}
              limits={catalog.data?.limits}
              canReply={canManage}
              canNote={canNote}
              sendingKind={pendingKind === 'message' || pendingKind === 'note' ? pendingKind : null}
              onReply={onReply}
              onNote={onNote}
            />
          </div>
        </div>
        <div id="secao-historico" tabIndex={-1} className="flex min-w-0 scroll-mt-20 flex-col gap-6 focus:outline-none">
          <TicketSidebar ticket={data} limits={catalog.data?.limits} />
        </div>
      </div>
    </>
  );
}
