import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Lock, MessageCircle, MessageSquare, PanelRight, RotateCw, Send, Smartphone, Users } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { MessageThread } from '@/features/support/components/Conversation';
import { AttachmentList } from '@/features/support/components/Attachments';
import { isFinished, PriorityBadge, SlaIndicator, StatusBadge } from '@/features/support/labels';
import { staffTicketsApi } from '@/features/support/staff/api';
import type { TicketAction } from '@/features/support/staff/hooks';
import { PublicReplyComposer } from '@/features/support/staff/PublicReplyComposer';
import { isApiError, messageForError } from '@/services/api/client';
import type { SupportLimits, SupportMessageTransport, SupportPresenceView, SupportStaffMessageRequest, SupportStaffTicket, SupportStaffTicketMessage } from '@/types/api';
import { centralApi, centralKeys } from './api';
import { DeliveryStatus, REPLY_BLOCK_TEXT } from './labels';

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

function ComposerShell({ children, tone }: { children: ReactNode; tone: 'whatsapp' | 'internal' }) {
  return <div className={tone === 'internal' ? 'rounded-md border border-warning/40 bg-warning-soft p-2' : ''}>{children}</div>;
}

/** Resposta pelo WhatsApp: a chave de idempotência acompanha o rascunho, então reenviar depois de falha de rede não duplica. */
function WhatsAppComposer({ ticket, limits, sending, onSend, onComposing }: { ticket: SupportStaffTicket; limits: SupportLimits; sending: boolean; onSend: (body: SupportStaffMessageRequest) => Promise<boolean>; onComposing: (composing: boolean) => void }) {
  const [content, setContent] = useState('');
  const [draftKey, setDraftKey] = useState(newKey);
  const fieldId = useId();
  const saved = useQuery({ queryKey: centralKeys.savedReplies, queryFn: centralApi.savedReplies, staleTime: 5 * 60_000 });
  const block = ticket.conversation?.replyBlock ?? null;
  const submit = async () => {
    const text = content.trim();
    if (!text || block) return;
    if (await onSend({ content: text, transport: 'whatsapp', clientMessageId: draftKey })) {
      setContent('');
      setDraftKey(newKey());
      onComposing(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
    }
  };
  const replies = saved.data?.items ?? [];
  return (
    <ComposerShell tone="whatsapp">
      {block ? (
        <p role="alert" className="mb-2 flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-small text-warning-text">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> {REPLY_BLOCK_TEXT[block]}
        </p>
      ) : null}
      {replies.length > 0 ? (
        <label className="mb-2 block text-caption text-slate">
          Modelo aprovado
          <select
            className="ml-2 h-8 max-w-[60%] rounded-md border border-line bg-white px-2 text-small text-ink"
            value=""
            onChange={(event) => {
              const reply = replies.find((item) => item.id === event.target.value);
              if (reply) setContent(reply.body);
            }}
          >
            <option value="">Escolher…</option>
            {replies.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
      ) : null}
      <label htmlFor={fieldId} className="sr-only">Resposta pelo WhatsApp</label>
      <textarea
        id={fieldId}
        rows={3}
        value={content}
        maxLength={limits.messageMaxLength}
        disabled={Boolean(block)}
        onChange={(event) => {
          setContent(event.target.value);
          onComposing(event.target.value.length > 0);
        }}
        onKeyDown={onKeyDown}
        placeholder="Responder pelo WhatsApp institucional"
        className="w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-body text-ink placeholder:text-mist disabled:bg-snow"
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-mist">Revise antes de enviar. Arquivos, por enquanto, só pelo chat do app. Ctrl+Enter envia.</p>
        <Button variant="primary" size="sm" icon={Send} loading={sending} disabled={!content.trim() || Boolean(block)} onClick={() => void submit()}>Enviar pelo WhatsApp</Button>
      </div>
    </ComposerShell>
  );
}

function NoteComposer({ limits, sending, onSend }: { limits: SupportLimits; sending: boolean; onSend: (content: string) => Promise<boolean> }) {
  const [content, setContent] = useState('');
  const fieldId = useId();
  return (
    <ComposerShell tone="internal">
      <label htmlFor={fieldId} className="flex items-center gap-1.5 text-small font-semibold text-warning-text"><Lock size={14} aria-hidden /> Nota interna: nunca sai no WhatsApp nem aparece para o aluno</label>
      <textarea id={fieldId} rows={3} value={content} maxLength={limits.messageMaxLength} onChange={(event) => setContent(event.target.value)} className="mt-1 w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-body text-ink" />
      <div className="mt-1 flex justify-end">
        <Button size="sm" loading={sending} disabled={!content.trim()} onClick={() => void onSend(content.trim()).then((done) => { if (done) setContent(''); })}>Salvar nota</Button>
      </div>
    </ComposerShell>
  );
}

function usePresence(ticketId: string, composing: boolean): SupportPresenceView['viewers'] {
  const [viewers, setViewers] = useState<SupportPresenceView['viewers']>([]);
  const latest = useRef(composing);
  useEffect(() => {
    latest.current = composing;
  }, [composing]);
  useEffect(() => {
    let active = true;
    const beat = () => {
      centralApi
        .presence(ticketId, latest.current)
        .then((result) => {
          if (active) setViewers(result.viewers);
        })
        .catch(() => undefined);
    };
    beat();
    const timer = setInterval(beat, 20_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [ticketId]);
  return viewers;
}

/** Centro do workspace: a conversa e a escrita. Estados de entrega são os confirmados pelo provedor. */
export function ConversationPanel({
  ticket,
  limits,
  canReply,
  canNote,
  meId,
  sending,
  runAction,
  onRefresh,
  onBack,
  onToggleContext,
  contextOpen,
}: {
  ticket: SupportStaffTicket;
  limits: SupportLimits | undefined;
  canReply: boolean;
  canNote: boolean;
  meId: string;
  sending: 'message' | 'note' | null;
  runAction: (action: TicketAction) => Promise<boolean>;
  onRefresh: () => void;
  onBack?: (() => void) | undefined;
  onToggleContext: () => void;
  contextOpen: boolean;
}) {
  const toast = useToast();
  const hasWhatsApp = Boolean(ticket.conversation);
  const [transport, setTransport] = useState<SupportMessageTransport>(hasWhatsApp ? 'whatsapp' : 'in_app');
  const [mode, setMode] = useState<'reply' | 'note'>(canReply ? 'reply' : 'note');
  const [composing, setComposing] = useState(false);
  const [pendingOverride, setPendingOverride] = useState<SupportStaffMessageRequest | null>(null);
  const [retry, setRetry] = useState<SupportStaffTicketMessage | null>(null);
  const [retrying, setRetrying] = useState(false);
  const viewers = usePresence(ticket.id, composing);
  const bottom = useRef<HTMLDivElement>(null);
  const messageCount = ticket.messages.length;
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [messageCount]);
  const getLink = useMemo(() => (attachmentId: string) => staffTicketsApi.attachmentLink(ticket.id, attachmentId), [ticket.id]);
  const finished = isFinished(ticket.status);
  const assignedToOther = Boolean(ticket.assignedAgent && ticket.assignedAgent.id !== meId);
  const composingOther = viewers.find((viewer) => viewer.composing);
  // chat do app só faz sentido com estudante identificado: um contato sem vínculo não tem como ler
  const canUseInApp = Boolean(ticket.student);
  const activeTransport: SupportMessageTransport = hasWhatsApp && (transport === 'whatsapp' || !canUseInApp) ? 'whatsapp' : 'in_app';

  const send = async (body: SupportStaffMessageRequest): Promise<boolean> => {
    try {
      return await runAction({ kind: 'message', body });
    } catch (error) {
      // chamado de outra pessoa: decisão humana, não erro
      if (isApiError(error) && error.reason === 'assigned_to_other') setPendingOverride(body);
      return false;
    }
  };
  const retrySend = async (confirm: boolean) => {
    if (!retry) return;
    setRetrying(true);
    try {
      await centralApi.retry(ticket.id, retry.id, confirm);
      toast.show('Nova tentativa na fila de envio.');
      setRetry(null);
      onRefresh();
    } catch (error) {
      toast.show(messageForError(error, 'Não foi possível tentar de novo.'), 'error');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line px-4 py-3">
        <div className="flex items-start gap-2">
          {onBack ? <IconButton label="Voltar para a caixa de entrada" icon={ArrowLeft} size="sm" onClick={onBack} /> : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-h4 font-semibold text-ink">{ticket.student?.fullName ?? ticket.conversation?.contactLabel ?? 'Contato não identificado'}</h2>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-slate">
              <span className="font-mono">{ticket.protocol}</span>
              <StatusBadge status={ticket.status} audience="staff" />
              <PriorityBadge priority={ticket.priority} />
              <SlaIndicator sla={ticket.sla} audience="staff" showDue={false} ticketStatus={ticket.status} />
            </p>
            <p className="mt-0.5 text-caption text-slate">
              {ticket.assignedTeam} · {ticket.assignedAgent ? `com ${ticket.assignedAgent.fullName}` : 'sem atendente'}
              {ticket.student ? null : <> · <Badge tone="warning">Sem vínculo verificado</Badge></>}
            </p>
          </div>
          <IconButton label={contextOpen ? 'Recolher o painel de contexto' : 'Mostrar o painel de contexto'} icon={PanelRight} size="sm" onClick={onToggleContext} aria-expanded={contextOpen} />
        </div>
        {viewers.length > 0 ? (
          <p role="status" className="mt-1 flex items-center gap-1 text-caption text-warning-text">
            <Users size={14} aria-hidden />
            {composingOther ? `${composingOther.name} está escrevendo neste chamado.` : `Também neste chamado: ${viewers.map((viewer) => viewer.name).join(', ')}.`}
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-paper px-4 py-3">
        <MessageThread
          messages={ticket.messages}
          viewer="staff"
          renderAttachments={(message) => (message.attachments.length > 0 ? <div className="mt-2"><AttachmentList attachments={message.attachments} getLink={getLink} ownLabel="Aluno" /></div> : null)}
          renderStatus={(message) =>
            message.transport === 'whatsapp' ? (
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-caption text-mist"><MessageCircle size={12} aria-hidden /> WhatsApp</span>
                {message.senderType === 'agent' ? (
                  <span className="inline-flex items-center gap-2">
                    <DeliveryStatus state={message.deliveryState} errorCode={message.deliveryErrorCode} />
                    {message.canRetry && canReply ? <Button size="sm" variant="ghost" icon={RotateCw} onClick={() => setRetry(message)}>Tentar de novo</Button> : null}
                  </span>
                ) : null}
              </div>
            ) : undefined
          }
        />
        <div ref={bottom} />
      </div>

      <footer className="border-t border-line p-3">
        {finished ? (
          <p className="rounded-md bg-snow px-3 py-2 text-small text-slate">Chamado finalizado: somente consulta. Use "Ações" para reabrir.</p>
        ) : !limits ? (
          <p className="text-small text-mist">Carregando os limites de envio…</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Tipo de escrita">
              {canReply && hasWhatsApp ? <ModeButton active={mode === 'reply' && activeTransport === 'whatsapp'} icon={<MessageCircle size={14} aria-hidden />} label="WhatsApp" onClick={() => { setMode('reply'); setTransport('whatsapp'); }} /> : null}
              {canReply && canUseInApp ? <ModeButton active={mode === 'reply' && activeTransport === 'in_app'} icon={<Smartphone size={14} aria-hidden />} label="Chat do app" onClick={() => { setMode('reply'); setTransport('in_app'); }} /> : null}
              {canReply && !hasWhatsApp && !canUseInApp ? <ModeButton active={mode === 'reply'} icon={<MessageSquare size={14} aria-hidden />} label="Resposta" onClick={() => setMode('reply')} /> : null}
              {canNote ? <ModeButton active={mode === 'note'} icon={<Lock size={14} aria-hidden />} label="Nota interna" onClick={() => setMode('note')} /> : null}
            </div>
            {assignedToOther && mode === 'reply' ? <p className="text-caption text-warning-text">Este chamado está com {ticket.assignedAgent?.fullName}. Combine antes de responder para não enviar mensagens conflitantes.</p> : null}
            {mode === 'note' ? (
              <NoteComposer limits={limits} sending={sending === 'note'} onSend={(content) => runAction({ kind: 'note', content })} />
            ) : activeTransport === 'whatsapp' ? (
              <WhatsAppComposer key={ticket.id} ticket={ticket} limits={limits} sending={sending === 'message'} onSend={send} onComposing={setComposing} />
            ) : (
              <PublicReplyComposer key={ticket.id} limits={limits} attachedCount={ticket.attachments.length} sending={sending === 'message'} onSend={(body) => runAction({ kind: 'message', body })} />
            )}
          </div>
        )}
      </footer>

      <ConfirmDialog
        open={pendingOverride !== null}
        title="Responder a um chamado de outra pessoa?"
        description={`Este chamado está com ${ticket.assignedAgent?.fullName ?? 'outra pessoa'}. A resposta sai pelo mesmo número institucional e o envio fica registrado na auditoria.`}
        confirmLabel="Responder mesmo assim"
        onClose={() => setPendingOverride(null)}
        onConfirm={() => {
          const body = pendingOverride;
          setPendingOverride(null);
          if (body) void runAction({ kind: 'message', body: { ...body, overrideAssignee: true } });
        }}
      />
      <ConfirmDialog
        open={retry !== null}
        title={retry?.deliveryState === 'unknown' ? 'Reenviar sem saber se a mensagem chegou?' : 'Tentar enviar de novo?'}
        description={retry?.deliveryState === 'unknown' ? 'O provedor não confirmou esta mensagem. Ela pode já ter chegado, e a pessoa pode receber duas vezes.' : 'A mensagem volta para a fila de envio.'}
        confirmLabel={retry?.deliveryState === 'unknown' ? 'Reenviar mesmo assim' : 'Tentar de novo'}
        loading={retrying}
        onClose={() => setRetry(null)}
        onConfirm={() => void retrySend(retry?.deliveryState === 'unknown')}
      />
    </div>
  );
}

function ModeButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-small ${active ? 'border-action bg-action-soft font-semibold text-action' : 'border-line text-slate hover:border-line-strong hover:text-ink'}`}>
      {icon} {label}
    </button>
  );
}
