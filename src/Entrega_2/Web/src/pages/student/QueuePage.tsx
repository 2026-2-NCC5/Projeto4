import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, LoaderCircle, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import { Badge, PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { messageForError } from '@/services/api/client';
import { queueApi } from '@/services/api/queue';
import type { QueueSubscriptionStatus, QueueSyncStatus } from '@/types/api';

const STATUS_LABELS: Record<QueueSubscriptionStatus, string> = {
  waiting: 'Aguardando atendimento', approaching: 'Sua vez está chegando', next: 'Entre as próximas',
  called: 'Senha chamada', completed: 'Acompanhamento finalizado', expired: 'Acompanhamento expirado', cancelled: 'Acompanhamento cancelado',
};
const SYNC_LABELS: Record<QueueSyncStatus, string> = {
  live: 'Atualizado', starting: 'Conectando à fonte', stale: 'Dados desatualizados', unavailable: 'Fonte indisponível', disabled: 'Integração desativada',
};
const queueKey = ['student', 'queue', 'status'] as const;

function formatTime(value: string | null | undefined): string {
  if (!value) return 'Não informado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Não informado' : new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(date);
}

export default function QueuePage() {
  const queryClient = useQueryClient();
  const [ticket, setTicket] = useState('');
  const [error, setError] = useState<string | null>(null);
  const status = useQuery({ queryKey: queueKey, queryFn: queueApi.status, refetchInterval: 15_000, refetchOnWindowFocus: true });
  const subscribe = useMutation({
    mutationFn: () => queueApi.subscribe({ ticket: ticket.trim() }),
    onSuccess: async (next) => { setError(null); setTicket(''); queryClient.setQueryData(queueKey, next); await queryClient.invalidateQueries({ queryKey: queueKey }); },
    onError: (reason) => setError(messageForError(reason, 'Não foi possível acompanhar essa senha.')),
  });
  const cancel = useMutation({
    mutationFn: queueApi.cancel,
    onSuccess: async () => { setError(null); await queryClient.invalidateQueries({ queryKey: queueKey }); },
    onError: (reason) => setError(messageForError(reason, 'Não foi possível encerrar o acompanhamento.')),
  });

  const data = status.data;
  const source = data?.queue.sync.source;
  const demoSource = source?.kind === 'demo';
  // Fail closed if an old or misconfigured API returns a simulated snapshot.
  const queue = demoSource ? undefined : data?.queue;
  const current = demoSource ? null : data?.subscription;
  const sourceNotAuthorized = source?.kind === 'public_panel' && !source.authorized;
  const disabled = demoSource || queue?.sync.status === 'disabled' || sourceNotAuthorized;
  const isActive = current && ['waiting', 'approaching', 'next', 'called'].includes(current.status);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8" style={{ colorScheme: 'light' }}>
      <PageHeader
        eyebrow="Atendimento presencial"
        title="Meu Atendimento ASA"
        description="Acompanhe a posição e as chamadas do painel presencial, quando a fonte estiver ativa."
        actions={<Button variant="secondary" icon={RefreshCw} onClick={() => void status.refetch()} disabled={status.isFetching}>Atualizar</Button>}
      />

      {status.isPending ? <Surface role="status" className="mb-5"><div className="flex items-center gap-2 text-small text-slate"><LoaderCircle size={18} className="animate-spin" aria-hidden />Consultando o status da fila…</div></Surface> : null}
      {status.isError ? <Surface role="alert" className="mb-5 border-danger/30 bg-danger-soft"><div className="flex items-start gap-3"><WifiOff size={20} className="mt-0.5 text-danger-text" aria-hidden /><div><h2 className="font-semibold text-danger-text">Não foi possível consultar a fila</h2><p className="mt-1 text-small text-danger-text">{messageForError(status.error, 'Tente novamente em instantes.')}</p></div></div></Surface> : null}

      {disabled ? (
        <Surface className="mb-5 border-warning/40 bg-warning-soft" role="status">
          <div className="flex items-start gap-3"><ShieldAlert size={20} className="mt-0.5 shrink-0 text-warning-text" aria-hidden /><div><h2 className="font-semibold text-warning-text">Acompanhamento ainda não ativado</h2><p className="mt-1 text-small text-warning-text">A consulta do painel depende de autorização institucional e ativação da integração neste ambiente. Nenhuma leitura ao painel é iniciada enquanto essa configuração estiver pendente.</p></div></div>
        </Surface>
      ) : null}

      {demoSource ? <Surface className="mb-5 border-warning/40 bg-warning-soft" role="status"><div className="flex items-start gap-3"><AlertTriangle size={20} className="mt-0.5 shrink-0 text-warning-text" aria-hidden /><p className="text-small text-warning-text"><strong>Dados não exibidos.</strong> A API informou uma fonte de demonstração; este ambiente aceita somente dados reais.</p></div></Surface> : null}

      {current ? (
        <Surface className="mb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-caption font-semibold uppercase tracking-wider text-slate">Senha acompanhada</p><p className="mt-1 font-mono text-5xl font-bold tracking-wider text-ink">{current.ticket}</p></div>
            <Badge tone={current.status === 'called' ? 'success' : current.status === 'approaching' || current.status === 'next' ? 'warning' : 'neutral'}>{STATUS_LABELS[current.status]}</Badge>
          </div>
          <div className="mt-5 grid gap-3 border-t border-line-soft pt-4 sm:grid-cols-3">
            <div><p className="text-caption text-mist">Posição</p><p className="mt-1 text-body font-semibold text-ink">{current.positionKnown && current.position !== null ? `${current.position}ª na lista` : 'Ainda não disponível'}</p></div>
            <div><p className="text-caption text-mist">Pessoas à frente</p><p className="mt-1 text-body font-semibold text-ink">{current.positionKnown && current.ahead !== null ? current.ahead : 'Ainda não disponível'}</p></div>
            <div><p className="text-caption text-mist">Mesa</p><p className="mt-1 text-body font-semibold text-ink">{current.calledDesk ?? 'Ainda não informada'}</p></div>
          </div>
          <p className="mt-4 text-caption text-mist">Atualização da fila: {formatTime(queue?.sync.lastSuccessfulSyncAt)} · Acompanhamento vinculado à sua conta ASA por senha informada; titularidade FECAP não verificada.</p>
          {current.timeline.length ? <div className="mt-5 border-t border-line-soft pt-4"><SectionHeader title="Histórico do acompanhamento" /><ol className="space-y-2">{current.timeline.map((event, index) => <li key={`${event.type}-${event.at}-${index}`} className="flex items-start gap-2 text-small text-slate"><CheckCircle2 size={16} className="mt-0.5 text-action" aria-hidden /><span>{event.type.replaceAll('_', ' ')} · {formatTime(event.at)}{event.ahead !== null ? ` · ${event.ahead} à frente` : ''}{event.desk ? ` · ${event.desk}` : ''}</span></li>)}</ol></div> : null}
          {isActive ? <Button className="mt-5" variant="danger" onClick={() => cancel.mutate()} loading={cancel.isPending}>Parar de acompanhar</Button> : null}
        </Surface>
      ) : null}

      {!isActive && !current?.status.match(/completed|expired|cancelled/) ? (
        <Surface className="mb-5">
          <SectionHeader title="Acompanhar uma senha" description="Digite a senha impressa no comprovante do totem ASA." />
          <div className="mb-4 rounded-md border border-warning/40 bg-warning-soft p-3 text-small text-warning-text">Informar o número só cria alertas para esta conta ASA. Não confirma que você é titular do atendimento; o painel público não comprova essa relação. Não informe CPF aqui.</div>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); setError(null); subscribe.mutate(); }}>
            <label className="flex-1 text-small font-medium text-ink">Número da senha<input aria-label="Número da senha" inputMode="text" autoComplete="off" maxLength={10} value={ticket} onChange={(event) => setTicket(event.target.value.toUpperCase())} placeholder="Ex.: 0027" className="mt-1 min-h-11 w-full rounded-md border border-line bg-white px-3 font-mono text-body text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-action" /></label>
            <Button className="self-end" type="submit" disabled={disabled || !ticket.trim()} loading={subscribe.isPending}>Acompanhar senha</Button>
          </form>
          {error ? <p role="alert" className="mt-3 text-small text-danger-text">{error}</p> : null}
        </Surface>
      ) : null}

      {queue ? (
        <Surface>
          <div className="flex flex-wrap items-center justify-between gap-3"><SectionHeader title="Painel do ASA" description="Dados públicos disponíveis na fonte institucional." /><Badge tone={queue.sync.status === 'live' ? 'success' : queue.sync.status === 'unavailable' ? 'danger' : 'neutral'}>{SYNC_LABELS[queue.sync.status]}</Badge></div>
          <p className="mb-4 text-caption text-mist">Última sincronização: {formatTime(queue.sync.lastSuccessfulSyncAt)}{queue.sync.snapshotAgeSeconds !== null ? ` · há ${queue.sync.snapshotAgeSeconds} s` : ''}</p>
          {queue.recentCalls.length ? <div className="grid gap-2 sm:grid-cols-2">{queue.recentCalls.map((call, index) => <div key={`${call.ticket}-${call.calledAt ?? index}`} className="flex items-center justify-between gap-3 rounded-md border border-line-soft bg-snow px-3 py-2"><span className="font-mono font-semibold text-ink">{call.ticket}</span><span className="text-small text-slate">{call.desk ?? 'Mesa não informada'} · {formatTime(call.calledAt)}</span></div>)}</div> : <p className="text-small text-slate">A fonte ainda não confirmou chamadas para exibir.</p>}
          {queue.upcoming.length ? <div className="mt-5"><SectionHeader title="Próximas senhas" /><ol className="grid gap-2 sm:grid-cols-2">{queue.upcoming.map((item) => <li key={`${item.ticket}-${item.position}`} className="flex justify-between rounded-md border border-line-soft px-3 py-2 text-small"><span className="text-slate">Posição {item.position}</span><span className="font-mono font-semibold text-ink">{item.ticket}</span></li>)}</ol></div> : null}
          {!queue.sync.source?.authorized && queue.sync.source?.kind === 'public_panel' ? <p className="mt-4 text-caption text-warning-text">Fonte sem autorização institucional registrada.</p> : null}
        </Surface>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-paper p-4"><p className="text-small text-slate">O painel presencial continua sendo a referência para confirmar uma chamada.</p><a href="https://presencial.fecap.br/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-small font-semibold text-action hover:underline">Abrir painel oficial <ExternalLink size={15} aria-hidden /></a></div>
      {!data && !status.isPending && !status.isError ? <p className="mt-4 flex items-center gap-2 text-caption text-mist"><Clock3 size={15} aria-hidden />A tela atualiza automaticamente a cada 15 segundos.</p> : null}
    </main>
  );
}
