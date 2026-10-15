import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Hand, MessageSquarePlus, RefreshCw, RotateCcw } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { Button, ButtonLink } from '@/components/ui/Button';
import { KeyValueList, PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { TextArea } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { LoadingRows } from '@/components/feedback/States';
import { AttachmentList, FileUploader, hasPendingUploads, uploadedIds, type PendingUpload } from '@/features/support/components/Attachments';
import { Composer, EventTimeline, MessageThread } from '@/features/support/components/Conversation';
import { SlaIndicator, StatusBadge } from '@/features/support/labels';
import {
  BackLink,
  NotFoundState,
  ProtocolCopy,
  QueryFailure,
  RATING_LABELS,
  RatingInput,
  RatingStars,
  ReasonDialog,
  TicketProgressView,
  type RatingValue,
} from '@/features/support/student/components';
import { applyTicketUpdate, useMarkTicketRead, useNow, useSupportCatalog } from '@/features/support/student/hooks';
import { supportKeys } from '@/features/support/student/keys';
import { businessDays, channelLabel, isTransientError, newClientId, slaApplies } from '@/features/support/student/utils';
import { formatDateTime, formatRelative } from '@/lib/format';
import { isApiError, messageForError } from '@/services/api/client';
import { supportApi } from '@/services/api/endpoints';
import type { SupportLimits, SupportTicket } from '@/types/api';

/** Arquivos por envio (constante do servidor: MAX_ATTACHMENTS_PER_SUBMISSION). */
const MAX_FILES_PER_SUBMISSION = 5;
const DEFAULT_MESSAGE_MAX = 2000;
const COMPOSER_ID = 'responder';

function focusComposer(): void {
  const section = document.getElementById(COMPOSER_ID);
  section?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  section?.querySelector('textarea')?.focus();
}

function blockedReason(ticket: SupportTicket): string {
  switch (ticket.status) {
    case 'cancelled':
      return 'Este chamado foi cancelado e não recebe novas mensagens. Se ainda precisar do ASA, abra um novo chamado.';
    case 'resolved':
      return ticket.canReopen && ticket.reopenDeadline
        ? `Este chamado foi resolvido. Se o problema continua, use “Ainda preciso de ajuda” até ${formatDateTime(ticket.reopenDeadline)}.`
        : 'Este chamado foi resolvido e o prazo para reabrir terminou. Se precisar, abra um novo chamado.';
    case 'closed':
      return 'Este chamado foi encerrado e não recebe novas mensagens. Se precisar, abra um novo chamado.';
    default:
      return 'Este chamado não recebe novas mensagens no momento.';
  }
}

function PendingActionNotice({ ticket }: { ticket: SupportTicket }) {
  const action = ticket.pendingAction;
  if (!action) return null;
  return (
    <section aria-labelledby="pedido-asa" className="rounded-lg border border-warning/40 bg-warning-soft p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Hand size={20} className="mt-0.5 shrink-0 text-warning-text" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="pedido-asa" className="text-h4 font-semibold text-warning-text">
            O ASA precisa de você
          </h2>
          <p className="mt-1 text-body font-semibold text-ink">{action.title}</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-body text-ink">{action.description}</p>
          <p className="mt-2 text-caption text-slate">
            Pedido em {formatDateTime(action.requestedAt)}.{ticket.sla.status === 'paused' ? ' O prazo fica pausado até a sua resposta.' : ''}
          </p>
          <p className="mt-2 text-small text-ink">
            Responda pela conversa abaixo{action.expectsAttachment ? ' e anexe o arquivo pedido em “Anexar arquivo”' : ''}.
          </p>
          {ticket.canReply ? (
            <Button size="sm" className="mt-3" onClick={focusComposer}>
              Responder agora
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ReplyBox({ ticket, limits }: { ticket: SupportTicket; limits: SupportLimits | undefined }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  // mesma chave ao repetir a mesma mensagem após falha de rede (o servidor não duplica); nova chave a cada mensagem
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const reply = useMutation({
    mutationFn: (body: { clientMessageId: string; content: string; attachmentIds?: string[] }) => supportApi.reply(ticket.id, body),
    onSuccess: (updated) => {
      applyTicketUpdate(queryClient, updated);
      setUploads([]);
      attempt.current = null;
      toast.show('Mensagem enviada ao ASA.');
    },
  });

  if (!ticket.canReply) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="rounded-md bg-snow px-3 py-2 text-small text-slate">{blockedReason(ticket)}</p>
        {ticket.status !== 'resolved' || !ticket.canReopen ? (
          <ButtonLink to="/aluno/chamados/novo" size="sm" icon={MessageSquarePlus}>
            Abrir novo chamado
          </ButtonLink>
        ) : null}
      </div>
    );
  }

  const ids = uploadedIds(uploads);
  const room = limits ? Math.min(MAX_FILES_PER_SUBMISSION, limits.maxAttachmentsPerTicket - ticket.attachments.length) : 0;

  const send = async (content: string): Promise<boolean> => {
    if (hasPendingUploads(uploads)) {
      toast.show('Aguarde o envio dos arquivos terminar.', 'info');
      return false;
    }
    if (!content && ids.length === 0) return false;
    const key = `${content}\u0000${ids.join(',')}`;
    if (!attempt.current || attempt.current.key !== key) attempt.current = { key, id: newClientId('msg') };
    try {
      await reply.mutateAsync({ clientMessageId: attempt.current.id, content, ...(ids.length > 0 ? { attachmentIds: ids } : {}) });
      return true;
    } catch (error) {
      if (!isTransientError(error)) attempt.current = null;
      toast.show(isTransientError(error) ? `${messageForError(error)} Sua mensagem continua no campo; envie de novo sem risco de duplicar.` : messageForError(error, 'Não foi possível enviar a mensagem.'), 'error');
      if (isApiError(error) && error.kind === 'conflict') void queryClient.invalidateQueries({ queryKey: supportKeys.ticket(ticket.id) });
      return false;
    }
  };

  return (
    <div id={COMPOSER_ID}>
      <Composer
        onSend={send}
        maxLength={limits?.messageMaxLength ?? DEFAULT_MESSAGE_MAX}
        sending={reply.isPending}
        allowEmpty={ids.length > 0}
        label="Mensagem para o ASA"
        placeholder={ticket.pendingAction ? 'Responda ao pedido do ASA' : 'Escreva sua mensagem para o ASA'}
        extra={
          !limits ? (
            <p className="text-caption text-mist">Anexos indisponíveis até carregar os limites de envio.</p>
          ) : room > 0 ? (
            <FileUploader limits={limits} uploads={uploads} onChange={setUploads} upload={supportApi.upload} remove={supportApi.deleteUpload} maxFiles={room} disabled={reply.isPending} />
          ) : (
            <p className="text-caption text-mist">Este chamado já tem o máximo de {limits.maxAttachmentsPerTicket} arquivos.</p>
          )
        }
      />
    </div>
  );
}

function RatingSection({ ticket }: { ticket: SupportTicket }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState<RatingValue | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rate = useMutation({
    mutationFn: (rating: RatingValue) => supportApi.rate(ticket.id, rating, comment.trim() || undefined),
    onMutate: () => setError(null),
    onSuccess: (updated) => {
      applyTicketUpdate(queryClient, updated);
      toast.show('Obrigado! Sua avaliação foi registrada.');
    },
    onError: (caught) => {
      setError(messageForError(caught, 'Não foi possível enviar a avaliação.'));
      if (isApiError(caught) && caught.kind === 'conflict') void queryClient.invalidateQueries({ queryKey: supportKeys.ticket(ticket.id) });
    },
  });

  if (ticket.rating) {
    return (
      <Surface aria-labelledby="avaliacao">
        <SectionHeader id="avaliacao" title="Sua avaliação" />
        <div className="flex flex-wrap items-center gap-2">
          <RatingStars rating={ticket.rating.rating} />
          <span className="text-small text-slate">{RATING_LABELS[ticket.rating.rating - 1]}</span>
        </div>
        {ticket.rating.comment ? <p className="mt-2 whitespace-pre-wrap break-words text-body text-ink">{ticket.rating.comment}</p> : null}
        <p className="mt-2 text-caption text-mist">Enviada em {formatDateTime(ticket.rating.createdAt)}</p>
      </Surface>
    );
  }
  if (!ticket.canRate) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value) rate.mutate(value);
  };
  return (
    <Surface aria-labelledby="avaliar">
      <SectionHeader id="avaliar" title="Como foi o atendimento?" description="Sua avaliação ajuda o ASA a melhorar. Ela não muda a solução registrada." />
      <form onSubmit={submit} className="flex flex-col gap-4">
        <RatingInput value={value} onChange={setValue} disabled={rate.isPending} />
        <TextArea label="Comentário (opcional)" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={500} rows={3} hint={`${comment.length}/500 caracteres`} disabled={rate.isPending} />
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-small text-danger-text">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="self-start" loading={rate.isPending} disabled={!value}>
          Enviar avaliação
        </Button>
      </form>
    </Surface>
  );
}

function ActionsSection({ ticket, limits }: { ticket: SupportTicket; limits: SupportLimits | undefined }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState<'cancel' | 'reopen' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onError = (caught: unknown) => {
    setError(messageForError(caught, 'Não foi possível concluir a ação.'));
    if (isApiError(caught) && caught.kind === 'conflict') void queryClient.invalidateQueries({ queryKey: supportKeys.ticket(ticket.id) });
  };
  const cancel = useMutation({
    mutationFn: (reason: string) => supportApi.cancel(ticket.id, reason || undefined),
    onMutate: () => setError(null),
    onSuccess: (updated) => {
      applyTicketUpdate(queryClient, updated);
      setDialog(null);
      toast.show('Chamado cancelado. O histórico continua disponível.');
    },
    onError,
  });
  const reopen = useMutation({
    mutationFn: (reason: string) => supportApi.reopen(ticket.id, reason),
    onMutate: () => setError(null),
    onSuccess: (updated) => {
      applyTicketUpdate(queryClient, updated);
      setDialog(null);
      toast.show('Chamado reaberto. O ASA vai analisar de novo.');
    },
    onError,
  });

  if (!ticket.canCancel && !ticket.canReopen) return null;
  const close = () => {
    setDialog(null);
    setError(null);
  };
  return (
    <Surface aria-labelledby="acoes">
      <SectionHeader id="acoes" title="Ações" />
      <div className="flex flex-col gap-3">
        {ticket.canReopen ? (
          <div className="flex flex-col items-start gap-1.5">
            <Button icon={RotateCcw} onClick={() => setDialog('reopen')}>
              Ainda preciso de ajuda
            </Button>
            {ticket.reopenDeadline ? <p className="text-caption text-mist">Você pode reabrir até {formatDateTime(ticket.reopenDeadline)}.</p> : null}
          </div>
        ) : null}
        {ticket.canCancel ? (
          <div className="flex flex-col items-start gap-1.5">
            <Button variant="danger" icon={Ban} onClick={() => setDialog('cancel')}>
              Cancelar chamado
            </Button>
            <p className="text-caption text-mist">Use se você não precisa mais desta solicitação.</p>
          </div>
        ) : null}
      </div>
      <ReasonDialog
        open={dialog === 'cancel'}
        title="Cancelar este chamado?"
        description="O ASA para de trabalhar nesta solicitação e ela não recebe novas mensagens. O histórico continua disponível."
        label="Motivo do cancelamento"
        min={0}
        max={500}
        confirmLabel="Cancelar chamado"
        tone="danger"
        loading={cancel.isPending}
        error={dialog === 'cancel' ? error : null}
        onConfirm={(reason) => cancel.mutate(reason)}
        onClose={close}
      />
      <ReasonDialog
        open={dialog === 'reopen'}
        title="Ainda precisa de ajuda?"
        description="Conte o que ainda não foi resolvido. O chamado volta para a equipe e o prazo recomeça."
        label="O que ainda precisa ser resolvido"
        min={10}
        max={limits?.messageMaxLength ?? DEFAULT_MESSAGE_MAX}
        confirmLabel="Reabrir chamado"
        loading={reopen.isPending}
        error={dialog === 'reopen' ? error : null}
        onConfirm={(reason) => reopen.mutate(reason)}
        onClose={close}
      />
    </Surface>
  );
}

function slaText(ticket: SupportTicket): string {
  const { sla } = ticket;
  if (!slaApplies(ticket.status)) return 'Não se aplica — chamado cancelado';
  const target = `Até ${businessDays(sla.targetBusinessDays)}`;
  if (sla.status === 'completed') return `${target} · concluído em ${formatDateTime(sla.completedAt)}`;
  if (sla.status === 'paused') return `${target} · pausado enquanto o ASA aguarda você`;
  return `${target} · previsão ${formatDateTime(sla.dueAt)}`;
}

function TicketView({
  ticket,
  limits,
  onRefresh,
  refreshing,
  refreshError,
  updatedAt,
}: {
  ticket: SupportTicket;
  limits: SupportLimits | undefined;
  onRefresh: () => void;
  refreshing: boolean;
  refreshError: unknown;
  updatedAt: number;
}) {
  const now = useNow();
  const getLink = (attachmentId: string) => supportApi.attachmentLink(ticket.id, attachmentId);
  const initialFiles = ticket.attachments.filter((attachment) => attachment.messageId === null && attachment.uploadedBy === 'student');
  return (
    <>
      <PageHeader
        eyebrow={<BackLink to="/aluno/chamados">Meus chamados</BackLink>}
        title={ticket.subject}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <ProtocolCopy protocol={ticket.protocol} />
            <StatusBadge status={ticket.status} />
            {slaApplies(ticket.status) ? <SlaIndicator sla={ticket.sla} /> : null}
          </span>
        }
        actions={
          <span className="flex flex-wrap items-center gap-2">
            {updatedAt ? <span className="text-caption text-mist">Atualizado {formatRelative(new Date(updatedAt), now)}</span> : null}
            <Button size="sm" icon={RefreshCw} loading={refreshing} onClick={onRefresh}>
              Atualizar
            </Button>
          </span>
        }
      />
      <div className="flex flex-col gap-6">
        {refreshError ? (
          <p role="status" className="rounded-md bg-snow px-3 py-2 text-small text-slate">
            Não foi possível atualizar agora. {messageForError(refreshError)} Mostrando a última versão carregada.
          </p>
        ) : null}
        <PendingActionNotice ticket={ticket} />
        <Surface aria-labelledby="andamento">
          <SectionHeader id="andamento" title="Andamento" />
          <TicketProgressView ticket={ticket} />
        </Surface>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="flex min-w-0 flex-col gap-6">
            {ticket.resolution ? (
              <Surface aria-labelledby="solucao">
                <SectionHeader id="solucao" title="Solução registrada pelo ASA" description={ticket.resolvedAt ? `Em ${formatDateTime(ticket.resolvedAt)}` : undefined} />
                <p className="whitespace-pre-wrap break-words text-body text-ink">{ticket.resolution}</p>
              </Surface>
            ) : null}
            <RatingSection ticket={ticket} />
            <Surface aria-labelledby="conversa">
              <SectionHeader id="conversa" title="Conversa" description="Mensagens entre você e a equipe do ASA. As suas mostram quando a equipe leu." />
              <div className="flex flex-col gap-4">
                <article aria-label="Sua solicitação" className="rounded-lg border border-line bg-paper px-4 py-3">
                  <header className="mb-1 flex flex-wrap items-baseline gap-x-2 text-caption text-mist">
                    <span className="font-semibold text-slate">Sua solicitação</span>
                    <time dateTime={ticket.createdAt}>{formatDateTime(ticket.createdAt)}</time>
                  </header>
                  <p className="whitespace-pre-wrap break-words text-body text-ink">{ticket.description}</p>
                  {initialFiles.length > 0 ? (
                    <div className="mt-2">
                      <AttachmentList attachments={initialFiles} getLink={getLink} ownLabel="Você" />
                    </div>
                  ) : null}
                </article>
                <MessageThread
                  messages={ticket.messages}
                  viewer="student"
                  renderAttachments={(message) => {
                    const files = ticket.attachments.filter((attachment) => attachment.messageId === message.id);
                    return files.length > 0 ? (
                      <div className="mt-2">
                        <AttachmentList attachments={files} getLink={getLink} ownLabel="Você" />
                      </div>
                    ) : null;
                  }}
                />
                <ReplyBox ticket={ticket} limits={limits} />
              </div>
            </Surface>
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <Surface aria-labelledby="detalhes">
              <SectionHeader id="detalhes" title="Detalhes" />
              <KeyValueList
                items={[
                  { label: 'Protocolo', value: <span className="font-mono">{ticket.protocol}</span> },
                  { label: 'Categoria', value: ticket.categoryLabel },
                  { label: 'Tipo', value: ticket.subcategoryLabel ?? 'Não se aplica' },
                  { label: 'Equipe responsável', value: ticket.assignedTeam },
                  { label: 'Aberto em', value: formatDateTime(ticket.createdAt) },
                  { label: 'Canal de abertura', value: channelLabel(ticket.channel) },
                  { label: 'Prazo de resposta', value: slaText(ticket) },
                  ...(ticket.reopenedCount > 0 ? [{ label: 'Reaberturas', value: String(ticket.reopenedCount) }] : []),
                ]}
              />
            </Surface>
            <ActionsSection ticket={ticket} limits={limits} />
            <Surface aria-labelledby="arquivos">
              <SectionHeader id="arquivos" title="Arquivos" />
              <AttachmentList attachments={ticket.attachments} getLink={getLink} ownLabel="Você" emptyText="Nenhum arquivo neste chamado." />
            </Surface>
            <Surface aria-labelledby="historico">
              <SectionHeader id="historico" title="Histórico" />
              {ticket.events.length > 0 ? <EventTimeline events={ticket.events} /> : <p className="text-small text-mist">Sem eventos registrados.</p>}
            </Surface>
          </div>
        </div>
      </div>
    </>
  );
}

/** Detalhe do chamado: andamento, pedido do ASA, conversa, arquivos, histórico e ações permitidas pelo servidor. */
export default function TicketDetailPage() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: supportKeys.ticket(id), queryFn: () => supportApi.get(id), refetchInterval: 30_000 });
  const catalog = useSupportCatalog();
  useMarkTicketRead(id, query.data);

  if (query.isPending) {
    return (
      <>
        <div className="mb-4">
          <BackLink to="/aluno/chamados">Meus chamados</BackLink>
        </div>
        <LoadingRows rows={6} />
      </>
    );
  }
  if (!query.data) {
    return (
      <QueryFailure
        error={query.error}
        onRetry={() => void query.refetch()}
        title="Não foi possível carregar o chamado"
        notFound={<NotFoundState title="Chamado não encontrado" description="Ele não existe ou não pertence à sua conta. Confira o endereço ou volte à lista de chamados." backTo="/aluno/chamados" backLabel="Voltar aos chamados" />}
      />
    );
  }
  return <TicketView ticket={query.data} limits={catalog.data?.limits} onRefresh={() => void query.refetch()} refreshing={query.isRefetching} refreshError={query.isRefetchError ? query.error : null} updatedAt={query.dataUpdatedAt} />;
}
