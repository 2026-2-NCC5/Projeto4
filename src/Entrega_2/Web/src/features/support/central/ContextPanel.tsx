import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Eye, FileText, Lock, Tag, UserRound } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge, KeyValueList, Tabs } from '@/components/ui/Display';
import { TextArea, TextInput, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { ErrorState, LoadingRows } from '@/components/feedback/States';
import { EventTimeline } from '@/features/support/components/Conversation';
import { isFinished, StatusBadge } from '@/features/support/labels';
import { operationsApi, staffKeys, staffTicketsApi } from '@/features/support/staff/api';
import type { TicketAction } from '@/features/support/staff/hooks';
import { formatBytes, formatDateTime, formatRelative } from '@/lib/format';
import { messageForError } from '@/services/api/client';
import { TicketActions } from '@/pages/asa/ticket/TicketActions';
import { TicketSummary } from '@/pages/asa/ticket/TicketSummary';
import type { SupportAttachmentReviewStatus, SupportStaffAttachment, SupportStaffTicket } from '@/types/api';
import { centralApi } from './api';
import { DocumentPreview } from './DocumentPreview';

export type ContextTab = 'summary' | 'academic' | 'tickets' | 'documents' | 'notes' | 'history' | 'actions';

const REVIEW_LABELS: Record<SupportAttachmentReviewStatus, string> = { received: 'Recebido', analyzed: 'Analisado', rejected: 'Recusado', released: 'Liberado ao aluno' };

function useTicketRefresh(ticketId: string) {
  const queryClient = useQueryClient();
  return (data?: SupportStaffTicket) => {
    if (data) queryClient.setQueryData(staffKeys.ticket(ticketId), data);
    else void queryClient.invalidateQueries({ queryKey: staffKeys.ticket(ticketId) });
    void queryClient.invalidateQueries({ queryKey: staffKeys.tickets });
  };
}

/** Consultar o contexto do aluno fica na auditoria: só é pedido quando alguém abre esta aba. */
function StudentContextTab({ ticket }: { ticket: SupportStaffTicket; }) {
  const studentId = ticket.student?.id ?? null;
  const context = useQuery({ queryKey: staffKeys.student(studentId ?? ''), queryFn: () => operationsApi.student(studentId ?? ''), enabled: Boolean(studentId) });
  if (!studentId) {
    return <p className="text-small text-slate"><strong className="font-semibold text-ink">Indisponível.</strong> Este contato não tem vínculo verificado. Dados acadêmicos só aparecem depois que o estudante vincular o número pelo app; um número ou nome informado no WhatsApp não identifica ninguém.</p>;
  }
  if (context.isPending) return <LoadingRows rows={3} />;
  if (!context.data) return <ErrorState error={context.error} onRetry={() => void context.refetch()} />;
  const { student } = context.data;
  return (
    <div className="flex flex-col gap-3">
      <KeyValueList
        items={[
          { label: 'Nome', value: student.fullName },
          { label: 'RA', value: <span className="font-mono">{student.registrationNumber}</span> },
          { label: 'Curso', value: student.program ?? <span className="text-mist">Indisponível</span> },
          { label: 'E-mail institucional', value: student.email },
          { label: 'Chamados', value: `${student.ticketsTotal} (${student.ticketsOpen} em aberto)` },
          { label: 'Última interação', value: student.lastInteractionAt ? formatDateTime(student.lastInteractionAt) : <span className="text-mist">Sem registro</span> },
        ]}
      />
      <p className="text-caption text-mist">Notas, frequência e situação financeira não aparecem aqui: a equipe vê só o necessário para atender. Esta consulta fica registrada na auditoria.</p>
    </div>
  );
}

function OtherTicketsTab({ ticket }: { ticket: SupportStaffTicket }) {
  const studentId = ticket.student?.id ?? null;
  const context = useQuery({ queryKey: staffKeys.student(studentId ?? ''), queryFn: () => operationsApi.student(studentId ?? ''), enabled: Boolean(studentId) });
  if (!studentId) return <p className="text-small text-slate">Indisponível: contato sem vínculo verificado.</p>;
  if (context.isPending) return <LoadingRows rows={3} />;
  if (!context.data) return <ErrorState error={context.error} onRetry={() => void context.refetch()} />;
  const others = context.data.tickets.filter((item) => item.id !== ticket.id);
  if (others.length === 0) return <p className="text-small text-slate">Nenhum outro chamado deste estudante.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line-soft rounded-md border border-line">
      {others.map((item) => (
        <li key={item.id} className="px-3 py-2">
          <Link to={`/asa/atendimento/${encodeURIComponent(item.id)}`} className="text-small font-medium text-action hover:underline">{item.subject}</Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-caption text-slate"><span className="font-mono">{item.protocol}</span> <StatusBadge status={item.status} audience="staff" /> {formatRelative(item.updatedAt)}</p>
        </li>
      ))}
    </ul>
  );
}

function DocumentsTab({ ticket, canManage, onPreview }: { ticket: SupportStaffTicket; canManage: boolean; onPreview: (attachment: SupportStaffAttachment) => void }) {
  const refresh = useTicketRefresh(ticket.id);
  const toast = useToast();
  const review = useMutation({
    mutationFn: (input: { attachmentId: string; reviewStatus: SupportAttachmentReviewStatus }) => centralApi.reviewAttachment(ticket.id, input.attachmentId, { reviewStatus: input.reviewStatus }),
    onSuccess: (data) => {
      refresh(data);
      toast.show('Situação do arquivo atualizada.');
    },
    onError: (error) => toast.show(messageForError(error, 'Não foi possível atualizar o arquivo.'), 'error'),
  });
  if (ticket.attachments.length === 0) return <p className="text-small text-slate">Nenhum arquivo neste chamado.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line-soft rounded-md border border-line">
      {ticket.attachments.map((attachment) => (
        <li key={attachment.id} className="flex flex-col gap-2 px-3 py-2">
          <div className="flex items-start gap-2">
            <FileText size={20} className="mt-0.5 shrink-0 text-slate" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="break-all text-small font-medium text-ink">{attachment.name}</p>
              <p className="text-caption text-mist">{formatBytes(attachment.sizeBytes)} · {attachment.origin === 'whatsapp' ? 'WhatsApp' : 'Enviado no ASA'} · {formatDateTime(attachment.createdAt)}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1">
                <Badge tone={attachment.reviewStatus === 'rejected' ? 'danger' : attachment.reviewStatus === 'released' ? 'success' : 'neutral'}>{REVIEW_LABELS[attachment.reviewStatus]}</Badge>
                {attachment.studentVisible ? <Badge tone="info" icon={Eye}>Aluno vê</Badge> : <Badge tone="neutral" icon={Lock}>Só a equipe</Badge>}
              </p>
            </div>
            <Button size="sm" onClick={() => onPreview(attachment)}>Visualizar</Button>
          </div>
          {canManage ? (
            <Select
              label={`Análise de ${attachment.name}`}
              hideLabel
              value={attachment.reviewStatus}
              disabled={review.isPending}
              onChange={(event) => review.mutate({ attachmentId: attachment.id, reviewStatus: event.target.value as SupportAttachmentReviewStatus })}
              options={(Object.keys(REVIEW_LABELS) as SupportAttachmentReviewStatus[]).map((value) => ({ value, label: REVIEW_LABELS[value], disabled: value === 'released' && !ticket.student }))}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function TagsEditor({ ticket, canManage }: { ticket: SupportStaffTicket; canManage: boolean }) {
  const [text, setText] = useState('');
  const refresh = useTicketRefresh(ticket.id);
  const toast = useToast();
  const save = useMutation({
    mutationFn: (tags: string[]) => centralApi.setTags(ticket.id, tags),
    onSuccess: () => {
      setText('');
      refresh();
    },
    onError: (error) => toast.show(messageForError(error, 'Não foi possível salvar as etiquetas.'), 'error'),
  });
  const tags = ticket.tags ?? [];
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-small font-semibold text-ink"><Tag size={14} aria-hidden /> Etiquetas</p>
      <ul className="flex flex-wrap gap-1">
        {tags.length === 0 ? <li className="text-caption text-mist">Sem etiquetas.</li> : null}
        {tags.map((tag) => (
          <li key={tag}>
            <span className="inline-flex items-center gap-1 rounded-md bg-snow px-2 py-0.5 text-caption text-slate">
              {tag}
              {canManage ? <button type="button" aria-label={`Remover etiqueta ${tag}`} className="text-mist hover:text-ink" onClick={() => save.mutate(tags.filter((item) => item !== tag))}>×</button> : null}
            </span>
          </li>
        ))}
      </ul>
      {canManage ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = text.trim().toLowerCase();
            if (value) save.mutate([...new Set([...tags, value])]);
          }}
        >
          <TextInput label="Nova etiqueta" hideLabel placeholder="Nova etiqueta" value={text} maxLength={40} onChange={(event) => setText(event.target.value)} containerClassName="flex-1" />
          <Button size="sm" type="submit" disabled={!text.trim()} loading={save.isPending}>Adicionar</Button>
        </form>
      ) : null}
    </div>
  );
}

/** Transferir e reabrir têm motivo obrigatório: fica só no histórico da equipe. */
function ExtraActions({ ticket, teams }: { ticket: SupportStaffTicket; teams: string[] }) {
  const toast = useToast();
  const refresh = useTicketRefresh(ticket.id);
  const [team, setTeam] = useState('');
  const [reason, setReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const transfer = useMutation({
    mutationFn: () => centralApi.transfer(ticket.id, { team, reason: reason.trim(), ...(ticket.version ? { expectedVersion: ticket.version } : {}) }),
    onSuccess: (data) => {
      refresh(data);
      setTeam('');
      setReason('');
      toast.show(`Chamado transferido para ${data.assignedTeam}.`);
    },
    onError: (error) => {
      refresh();
      toast.show(messageForError(error, 'Não foi possível transferir.'), 'error');
    },
  });
  const reopen = useMutation({
    mutationFn: () => centralApi.reopen(ticket.id, { reason: reopenReason.trim() }),
    onSuccess: (data) => {
      refresh(data);
      setReopenReason('');
      toast.show('Chamado reaberto.');
    },
    onError: (error) => toast.show(messageForError(error, 'Não foi possível reabrir.'), 'error'),
  });
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    return (
      <form className="flex flex-col gap-2 rounded-md border border-line p-3" onSubmit={(event) => { event.preventDefault(); reopen.mutate(); }}>
        <TextArea label="Motivo da reabertura" rows={2} required value={reopenReason} maxLength={500} onChange={(event) => setReopenReason(event.target.value)} />
        <Button size="sm" type="submit" disabled={reopenReason.trim().length < 5} loading={reopen.isPending}>Reabrir chamado</Button>
      </form>
    );
  }
  if (isFinished(ticket.status)) return null;
  return (
    <form className="flex flex-col gap-2 rounded-md border border-line p-3" onSubmit={(event) => { event.preventDefault(); transfer.mutate(); }}>
      <Select label="Transferir para a equipe" placeholder="Escolha a equipe" value={team} onChange={(event) => setTeam(event.target.value)} options={teams.filter((item) => item !== ticket.assignedTeam).map((item) => ({ value: item, label: item }))} />
      <TextArea label="Motivo (só a equipe vê)" rows={2} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
      <Button size="sm" type="submit" disabled={!team || reason.trim().length < 5} loading={transfer.isPending}>Transferir</Button>
    </form>
  );
}

/** Painel direito do workspace. A prévia de documentos fica aqui, com o chat aberto ao lado. */
export function ContextPanel({
  ticket,
  teams,
  resolutionMax,
  meId,
  canManage,
  canOpenContext,
  busy,
  pendingKind,
  mutate,
}: {
  ticket: SupportStaffTicket;
  teams: string[];
  resolutionMax: number | undefined;
  meId: string;
  canManage: boolean;
  canOpenContext: boolean;
  busy: boolean;
  pendingKind: TicketAction['kind'] | null;
  mutate: (action: TicketAction, callbacks?: { onSuccess?: () => void; onSettled?: () => void }) => void;
}) {
  const [tab, setTab] = useState<ContextTab>('summary');
  const [preview, setPreview] = useState<SupportStaffAttachment | null>(null);
  const ticketId = ticket.id;
  const getLink = useCallback((attachmentId: string) => staffTicketsApi.attachmentLink(ticketId, attachmentId), [ticketId]);
  const notes = ticket.events.filter((item) => item.type === 'internal_note');
  if (preview) {
    return <DocumentPreview key={preview.id} attachment={preview} getLink={getLink} onClose={() => setPreview(null)} />;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-4">
      {/* shrink-0: dentro de um flex com rolagem, a barra de abas seria esmagada até sumir; sticky: fica à mão ao rolar */}
      <div className="sticky top-0 z-10 shrink-0 bg-white pt-2">
        <Tabs
          label="Contexto do atendimento"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'summary', label: 'Resumo' },
            { value: 'academic', label: 'Acadêmico' },
            { value: 'tickets', label: 'Chamados' },
            { value: 'documents', label: 'Documentos', count: ticket.attachments.length },
            { value: 'notes', label: 'Notas', count: notes.length },
            { value: 'history', label: 'Histórico' },
            ...(canManage ? [{ value: 'actions' as const, label: 'Ações' }] : []),
          ]}
        />
      </div>
      {tab === 'summary' ? (
        <div className="flex flex-col gap-4">
          {ticket.conversation ? (
            <div className="rounded-md border border-line p-3">
              <p className="flex items-center gap-1.5 text-small font-semibold text-ink"><UserRound size={14} aria-hidden /> Contato no WhatsApp</p>
              <p className="mt-1 text-small text-ink">{ticket.conversation.contactLabel}</p>
              {ticket.conversation.contactName ? <p className="text-caption text-slate">"{ticket.conversation.contactName}" (nome informado no WhatsApp, não verificado)</p> : null}
              <p className="mt-1">{ticket.conversation.identified ? <Badge tone="success">Vínculo verificado</Badge> : <Badge tone="warning">Sem vínculo verificado</Badge>}</p>
              {ticket.conversation.serviceWindow.kind !== 'not_applicable' ? <p className="mt-1 text-caption text-slate">Janela de atendimento: {ticket.conversation.serviceWindow.kind === 'open' ? `até ${formatDateTime(ticket.conversation.serviceWindow.expiresAt ?? '')}` : 'encerrada'}</p> : null}
            </div>
          ) : null}
          <TicketSummary ticket={ticket} />
          <TagsEditor ticket={ticket} canManage={canManage} />
          {canOpenContext && ticket.student ? <Link to={`/asa/alunos/${encodeURIComponent(ticket.student.id)}`} className="inline-flex items-center gap-1 text-small text-action hover:underline"><ExternalLink size={14} aria-hidden /> Abrir histórico completo do aluno</Link> : null}
        </div>
      ) : null}
      {tab === 'academic' ? (canOpenContext ? <StudentContextTab ticket={ticket} /> : <p className="text-small text-slate">Seu perfil não tem acesso ao contexto do aluno.</p>) : null}
      {tab === 'tickets' ? (canOpenContext ? <OtherTicketsTab ticket={ticket} /> : <p className="text-small text-slate">Seu perfil não tem acesso ao contexto do aluno.</p>) : null}
      {tab === 'documents' ? <DocumentsTab ticket={ticket} canManage={canManage} onPreview={setPreview} /> : null}
      {tab === 'notes' ? (
        notes.length === 0 ? <p className="text-small text-slate">Nenhuma nota interna. Escreva pelo campo da conversa.</p> : <EventTimeline events={notes} />
      ) : null}
      {tab === 'history' ? <EventTimeline events={ticket.events} /> : null}
      {tab === 'actions' && canManage ? (
        <div className="flex flex-col gap-4">
          <TicketActions key={`${ticket.id}:${ticket.status}`} ticket={ticket} teams={teams} resolutionMax={resolutionMax} meId={meId} busy={busy} pendingKind={pendingKind} mutate={mutate} />
          <ExtraActions ticket={ticket} teams={teams} />
        </div>
      ) : null}
    </div>
  );
}
