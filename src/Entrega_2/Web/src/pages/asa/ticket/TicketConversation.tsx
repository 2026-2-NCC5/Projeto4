import { CheckCircle2, Hand, Lock, MessageSquare } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { SectionHeader, Surface } from '@/components/ui/Display';
import { AttachmentList } from '@/features/support/components/Attachments';
import { Composer, EventTimeline, MessageThread } from '@/features/support/components/Conversation';
import { staffTicketsApi } from '@/features/support/staff/api';
import { SegmentedControl } from '@/features/support/staff/components';
import { PublicReplyComposer } from '@/features/support/staff/PublicReplyComposer';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { SupportLimits, SupportStaffMessageRequest, SupportStaffTicket } from '@/types/api';

/** Pedido do aluno, ação pendente e solução registrada (topo da coluna central). */
export function TicketRequest({ ticket }: { ticket: SupportStaffTicket }) {
  const getLink = (attachmentId: string) => staffTicketsApi.attachmentLink(ticket.id, attachmentId);
  const opening = ticket.attachments.filter((attachment) => attachment.messageId === null && attachment.uploadedBy === 'student');
  return (
    <Surface aria-labelledby="solicitacao">
      <SectionHeader id="solicitacao" title="Solicitação do aluno" description={`Enviada em ${formatDateTime(ticket.createdAt)}`} />
      <p className="whitespace-pre-wrap break-words text-body text-ink">{ticket.description}</p>
      {opening.length > 0 ? (
        <div className="mt-3">
          <AttachmentList attachments={opening} getLink={getLink} ownLabel="Aluno" />
        </div>
      ) : null}
      {ticket.pendingAction ? (
        <div className="mt-4 rounded-md border border-warning/40 bg-warning-soft px-4 py-3">
          <p className="flex items-center gap-2 text-small font-semibold text-warning-text">
            <Hand size={16} aria-hidden /> Aguardando o aluno: {ticket.pendingAction.title}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-small text-ink">{ticket.pendingAction.description}</p>
          <p className="mt-1 text-caption text-slate">
            Pedido {formatRelative(ticket.pendingAction.requestedAt)} · {ticket.pendingAction.expectsAttachment ? 'espera um arquivo' : 'não exige arquivo'} · prazo pausado
          </p>
        </div>
      ) : null}
      {ticket.resolution ? (
        <div className="mt-4 rounded-md border border-success/30 bg-success-soft px-4 py-3">
          <p className="flex items-center gap-2 text-small font-semibold text-success-text">
            <CheckCircle2 size={16} aria-hidden /> Solução registrada {ticket.resolvedAt ? `em ${formatDateTime(ticket.resolvedAt)}` : ''}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-small text-ink">{ticket.resolution}</p>
        </div>
      ) : null}
    </Surface>
  );
}

type Mode = 'public' | 'internal';

/** Conversa com o aluno + escrita (resposta pública ou nota interna, com rascunhos separados). */
export function TicketConversation({
  ticket,
  limits,
  canReply,
  canNote,
  sendingKind,
  onReply,
  onNote,
}: {
  ticket: SupportStaffTicket;
  limits: SupportLimits | undefined;
  canReply: boolean;
  canNote: boolean;
  sendingKind: 'message' | 'note' | null;
  onReply: (body: SupportStaffMessageRequest) => Promise<boolean>;
  onNote: (content: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<Mode>(canReply ? 'public' : 'internal');
  const getLink = (attachmentId: string) => staffTicketsApi.attachmentLink(ticket.id, attachmentId);
  const finished = ticket.status === 'resolved' || ticket.status === 'closed' || ticket.status === 'cancelled';
  const finishedReason = `Chamado ${ticket.status === 'resolved' ? 'resolvido' : ticket.status === 'closed' ? 'encerrado' : 'cancelado'}: somente consulta.`;
  const modes: Array<{ value: Mode; label: string; icon: ReactNode }> = [
    ...(canReply ? [{ value: 'public' as const, label: 'Responder ao aluno', icon: <MessageSquare size={16} aria-hidden /> }] : []),
    ...(canNote ? [{ value: 'internal' as const, label: 'Nota interna', icon: <Lock size={16} aria-hidden /> }] : []),
  ];
  const activeMode: Mode | null = modes.some((item) => item.value === mode) ? mode : (modes[0]?.value ?? null);

  return (
    <Surface aria-labelledby="conversa">
      <SectionHeader id="conversa" title="Conversa" description="Mensagens com o aluno. Notas internas ficam só no histórico da equipe." />
      <MessageThread
        messages={ticket.messages}
        viewer="staff"
        renderAttachments={(message) =>
          message.attachments.length > 0 ? (
            <div className="mt-2">
              <AttachmentList attachments={message.attachments} getLink={getLink} ownLabel="Aluno" />
            </div>
          ) : null
        }
      />
      <div className="mt-5 border-t border-line pt-4">
        {finished ? (
          <p className="rounded-md bg-snow px-3 py-2 text-small text-slate">{finishedReason}</p>
        ) : activeMode === null ? (
          <p className="rounded-md bg-snow px-3 py-2 text-small text-slate">Seu perfil não pode responder neste chamado.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {modes.length > 1 ? <SegmentedControl label="Tipo de escrita" value={activeMode} onChange={setMode} options={modes} /> : null}
            {!canReply ? <p className="text-small text-slate">Seu perfil não responde ao aluno; aqui você registra notas internas para a equipe.</p> : null}
            {limits ? (
              <>
                {/* os dois campos ficam montados para preservar o rascunho de cada um ao alternar */}
                <div hidden={activeMode !== 'public'}>
                  {canReply ? <PublicReplyComposer limits={limits} attachedCount={ticket.attachments.length} sending={sendingKind === 'message'} onSend={onReply} /> : null}
                </div>
                <div hidden={activeMode !== 'internal'}>
                  {canNote ? (
                    <Composer
                      tone="internal"
                      label="Nota interna"
                      placeholder="Registre algo para a equipe (o aluno nunca vê)"
                      submitLabel="Salvar nota"
                      maxLength={limits.messageMaxLength}
                      sending={sendingKind === 'note'}
                      onSend={onNote}
                    />
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-small text-mist">Carregando os limites de envio…</p>
            )}
          </div>
        )}
      </div>
    </Surface>
  );
}

/** Coluna direita: histórico completo (com eventos internos) e arquivos. */
export function TicketSidebar({ ticket, limits }: { ticket: SupportStaffTicket; limits: SupportLimits | undefined }) {
  const getLink = (attachmentId: string) => staffTicketsApi.attachmentLink(ticket.id, attachmentId);
  return (
    <>
      <Surface aria-labelledby="historico">
        <SectionHeader id="historico" title="Histórico" description="Inclui eventos internos (destacados), que o aluno não vê." />
        <EventTimeline events={ticket.events} />
      </Surface>
      <Surface aria-labelledby="arquivos">
        <SectionHeader
          id="arquivos"
          title="Arquivos"
          description={limits ? `${ticket.attachments.length} de até ${limits.maxAttachmentsPerTicket} por chamado` : undefined}
        />
        <AttachmentList attachments={ticket.attachments} getLink={getLink} ownLabel="Aluno" emptyText="Nenhum arquivo neste chamado." />
      </Surface>
    </>
  );
}
