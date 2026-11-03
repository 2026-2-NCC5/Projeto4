import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plug, QrCode, RefreshCw, ShieldAlert, Unplug } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Badge, KeyValueList, MetricCard, PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { Select, TextArea, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { AccessDenied, EmptyState, ErrorState, LoadingRows } from '@/components/feedback/States';
import { useSession } from '@/features/auth/session';
import { channelAdminApi, centralKeys } from '@/features/support/central/api';
import { CONNECTION_META } from '@/features/support/central/labels';
import { useSupportCatalog } from '@/features/support/staff/hooks';
import { formatDateTime, formatRelative } from '@/lib/format';
import { messageForError } from '@/services/api/client';
import type { SupportChannelConnectResult, SupportChannelView, SupportProviderName } from '@/types/api';

const PROVIDER_LABELS: Record<SupportProviderName, string> = {
  fake: 'Demonstração (nada sai para o WhatsApp)',
  'wa-akg': 'WA-AKG, gateway não oficial (piloto)',
  'meta-cloud-api': 'WhatsApp Business Cloud API (oficial)',
};

const when = (value: string | null, empty = 'Nunca') => (value ? formatDateTime(value) : <span className="text-mist">{empty}</span>);

function useChannelAction<T>(run: (input: T) => Promise<unknown>, success: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: centralKeys.channels });
      void queryClient.invalidateQueries({ queryKey: centralKeys.health });
      if (success) toast.show(success);
    },
    onError: (error) => toast.show(messageForError(error, 'Não foi possível concluir a ação.'), 'error'),
  });
}

function CreateChannel({ teams }: { teams: string[] }) {
  const [name, setName] = useState('');
  const [team, setTeam] = useState('');
  const [publicNumber, setPublicNumber] = useState('');
  const [authorization, setAuthorization] = useState('');
  const create = useChannelAction(() => channelAdminApi.create({ name: name.trim(), team, publicNumber: publicNumber.trim() || null, authorizationReference: authorization.trim() || null }), 'Canal criado. Ele começa desconectado.');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(undefined);
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <TextInput label="Nome do canal" required value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
      <Select label="Equipe que recebe as conversas" required placeholder="Escolha a equipe" value={team} onChange={(event) => setTeam(event.target.value)} options={teams.map((item) => ({ value: item, label: item }))} />
      <TextInput label="Número institucional" hint="Formato internacional. É para onde o estudante envia o código de vinculação." placeholder="+5511999999999" value={publicNumber} onChange={(event) => setPublicNumber(event.target.value)} />
      <TextInput label="Referência da autorização" hint="Documento que autoriza o uso deste número. Exigida para conectar um provedor real." value={authorization} maxLength={200} onChange={(event) => setAuthorization(event.target.value)} />
      <div className="sm:col-span-2">
        <Button type="submit" variant="primary" disabled={name.trim().length < 3 || !team} loading={create.isPending}>Criar canal</Button>
      </div>
    </form>
  );
}

function QrBox({ result }: { result: SupportChannelConnectResult }) {
  if (result.action === 'external-setup') return <p className="rounded-md bg-snow px-3 py-2 text-small text-slate">{result.message}</p>;
  if (result.action === 'none') return <p className="rounded-md bg-snow px-3 py-2 text-small text-slate">{result.message}</p>;
  return (
    <div className="rounded-md border border-line p-3">
      <p className="text-small font-semibold text-ink">{result.message}</p>
      {result.qr?.format === 'image_data_url' ? (
        <img src={result.qr.value} alt="QR code para conectar o número institucional" width={240} height={240} className="mt-2 rounded-md border border-line" />
      ) : result.qr?.format === 'text' ? (
        <p className="mt-2 rounded-md bg-warning-soft px-3 py-2 text-small text-warning-text">{result.qr.value}</p>
      ) : (
        <p className="mt-2 text-small text-slate">Aguardando o gateway gerar o QR…</p>
      )}
      <p className="mt-2 text-caption text-slate">Só para a administração. Escaneie apenas com o aparelho do número autorizado; nunca com um número pessoal.</p>
    </div>
  );
}

function ChannelCard({ channel, teams }: { channel: SupportChannelView; teams: string[] }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [connect, setConnect] = useState<SupportChannelConnectResult | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [authorization, setAuthorization] = useState(channel.authorizationReference ?? '');
  const meta = CONNECTION_META[channel.status];
  const connecting = useMutation({
    mutationFn: () => channelAdminApi.connect(channel.id),
    onSuccess: (data) => {
      setConnect(data);
      void queryClient.invalidateQueries({ queryKey: centralKeys.channels });
    },
    onError: (error) => toast.show(messageForError(error, 'Não foi possível iniciar a conexão.'), 'error'),
  });
  const disconnect = useChannelAction(() => channelAdminApi.disconnect(channel.id), 'Canal desconectado. Chamados e histórico continuam disponíveis.');
  const patch = useChannelAction((body: Parameters<typeof channelAdminApi.patch>[1]) => channelAdminApi.patch(channel.id, body), 'Canal atualizado.');
  const refresh = useChannelAction(() => channelAdminApi.status(channel.id), 'Estado conferido no provedor.');

  // enquanto o QR está na tela, pede de novo: o gateway renova o código e informa quando a conexão foi concluída
  const shown = channel.status === 'CONNECTED' ? null : connect;
  const waiting = shown?.action === 'qr';
  const { mutate: reconnect, isPending: reconnectPending } = connecting;
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(() => {
      if (!reconnectPending) reconnect();
    }, 5000);
    return () => clearInterval(timer);
  }, [waiting, reconnect, reconnectPending]);
  const needsAuthorization = channel.provider !== 'fake' && !channel.authorizationReference;
  return (
    <Surface aria-label={`Canal ${channel.name}`}>
      <SectionHeader
        title={channel.name}
        description={PROVIDER_LABELS[channel.provider]}
        action={<span className="flex flex-wrap items-center gap-1.5">{channel.isDemo ? <Badge tone="warning">Demonstração</Badge> : null}<Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge></span>}
      />
      <KeyValueList
        columns={2}
        items={[
          { label: 'Número conectado', value: channel.maskedNumber ?? <span className="text-mist">Nenhum</span> },
          { label: 'Equipe', value: channel.team },
          { label: 'Situação do canal', value: channel.state === 'enabled' ? 'Ativo' : channel.state === 'paused' ? 'Pausado' : 'Desativado' },
          { label: 'Última conexão', value: when(channel.lastConnectedAt) },
          { label: 'Última desconexão', value: when(channel.lastDisconnectedAt) },
          { label: 'Último webhook recebido', value: channel.lastWebhookAt ? formatRelative(channel.lastWebhookAt) : <span className="text-mist">Nunca</span> },
          { label: 'Conferido em', value: when(channel.healthCheckedAt, 'Ainda não') },
          { label: 'Último erro', value: channel.lastErrorCode ? <span className="font-mono text-small">{channel.lastErrorCode}</span> : <span className="text-mist">Nenhum</span> },
          { label: 'Rota de ingestão', value: <span className="break-all font-mono text-small">{channel.webhookPath}</span> },
          ...(channel.circuitOpenUntil ? [{ label: 'Envios suspensos até', value: formatDateTime(channel.circuitOpenUntil) }] : []),
        ]}
      />
      {needsAuthorization ? (
        <form
          className="mt-4 flex flex-col gap-2 rounded-md border border-warning/40 bg-warning-soft p-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            patch.mutate({ authorizationReference: authorization.trim() });
          }}
        >
          <TextInput label="Referência da autorização institucional" required value={authorization} maxLength={200} onChange={(event) => setAuthorization(event.target.value)} containerClassName="flex-1" />
          <Button type="submit" disabled={!authorization.trim()} loading={patch.isPending}>Registrar</Button>
        </form>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" icon={QrCode} loading={connecting.isPending && !waiting} disabled={needsAuthorization || channel.state !== 'enabled' || channel.status === 'CONNECTED'} onClick={() => connecting.mutate()}>Conectar conta institucional</Button>
        <Button icon={Unplug} disabled={channel.status === 'DISCONNECTED'} onClick={() => setConfirmDisconnect(true)}>Desconectar</Button>
        <Button icon={RefreshCw} loading={refresh.isPending} onClick={() => refresh.mutate(undefined)}>Conferir estado</Button>
        {channel.state === 'enabled' ? <Button onClick={() => patch.mutate({ state: 'paused' })}>Pausar envios</Button> : <Button onClick={() => patch.mutate({ state: 'enabled' })}>Reativar canal</Button>}
      </div>
      {shown ? <div className="mt-4"><QrBox result={shown} /></div> : null}
      {teams.length > 0 ? (
        <div className="mt-4 max-w-sm">
          <Select label="Mudar a equipe que recebe as conversas" value={channel.team} onChange={(event) => patch.mutate({ team: event.target.value })} options={teams.map((item) => ({ value: item, label: item }))} />
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmDisconnect}
        title="Desconectar o WhatsApp institucional?"
        description="Chamados e histórico continuam disponíveis. Respostas pelo WhatsApp ficam bloqueadas até a próxima conexão, e a equipe é avisada na Central."
        confirmLabel="Desconectar"
        tone="danger"
        loading={disconnect.isPending}
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={() => {
          disconnect.mutate(undefined);
          setConfirmDisconnect(false);
        }}
      />
    </Surface>
  );
}

function HealthSection() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const health = useQuery({ queryKey: centralKeys.health, queryFn: channelAdminApi.health, refetchInterval: 30_000 });
  const replay = useMutation({
    mutationFn: channelAdminApi.replayInbox,
    onSuccess: (data) => {
      toast.show(`${data.replayed} ${data.replayed === 1 ? 'mensagem voltou' : 'mensagens voltaram'} para o processamento.`);
      void queryClient.invalidateQueries({ queryKey: centralKeys.health });
    },
    onError: (error) => toast.show(messageForError(error, 'Não foi possível reprocessar.'), 'error'),
  });
  if (health.isPending) return <LoadingRows rows={2} />;
  if (!health.data) return <ErrorState error={health.error} onRetry={() => void health.refetch()} />;
  const { outbox, inbox, eventLagSeconds } = health.data;
  return (
    <section aria-labelledby="saude-canal">
      <SectionHeader id="saude-canal" title="Saúde da entrega" description={`Conferido em ${formatDateTime(health.data.checkedAt)}. Números reais da fila, sem conteúdo de mensagens.`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Na fila de envio" value={outbox.pending + outbox.processing} hint={eventLagSeconds !== null ? `Mais antiga há ${eventLagSeconds} s` : 'Fila vazia'} />
        <MetricCard label="Falhas de envio" value={outbox.failed} tone={outbox.failed > 0 ? 'danger' : 'neutral'} />
        <MetricCard label="Sem confirmação" value={outbox.unknown} hint="Decisão da equipe na conversa" tone={outbox.unknown > 0 ? 'warning' : 'neutral'} />
        <MetricCard label="Webhooks a reprocessar" value={inbox.pending + inbox.failed} hint={inbox.lastReceivedAt ? `Último: ${formatRelative(inbox.lastReceivedAt)}` : 'Nenhum recebido'} tone={inbox.failed > 0 ? 'warning' : 'neutral'} />
      </div>
      {inbox.failed > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-small text-slate">Mensagens recebidas que não foram processadas ficam guardadas por 30 dias.</p>
          <Button size="sm" loading={replay.isPending} onClick={() => replay.mutate()}>Reprocessar agora</Button>
        </div>
      ) : null}
    </section>
  );
}

/** Conflitos de vínculo: mostra só o contato mascarado, nunca quem é o estudante. */
function ReviewsSection() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const reviews = useQuery({ queryKey: centralKeys.reviews, queryFn: channelAdminApi.reviews });
  const [decision, setDecision] = useState<{ id: string; decision: 'transfer_link' | 'reject' } | null>(null);
  const decide = useMutation({
    mutationFn: (reason: string) => channelAdminApi.decideReview(decision!.id, { decision: decision!.decision, reason }),
    onSuccess: () => {
      setDecision(null);
      toast.show('Decisão registrada na auditoria.');
      void queryClient.invalidateQueries({ queryKey: centralKeys.reviews });
    },
    onError: (error) => toast.show(messageForError(error, 'Não foi possível registrar a decisão.'), 'error'),
  });
  const items = reviews.data?.items ?? [];
  return (
    <Surface aria-labelledby="revisoes">
      <SectionHeader id="revisoes" title="Vínculos em revisão" description="O número já está ligado a outra conta. Confira a identidade fora do sistema antes de decidir." />
      {items.length === 0 ? (
        <p className="text-small text-slate">Nenhum conflito para analisar.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-soft rounded-md border border-line">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="text-small text-ink">{item.contactMasked} <span className="text-mist">· {formatRelative(item.createdAt)}</span></span>
              <span className="flex gap-2">
                <Button size="sm" onClick={() => setDecision({ id: item.id, decision: 'reject' })}>Recusar pedido</Button>
                <Button size="sm" onClick={() => setDecision({ id: item.id, decision: 'transfer_link' })}>Transferir vínculo</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={decision !== null}
        title={decision?.decision === 'reject' ? 'Recusar este pedido de vínculo?' : 'Transferir o vínculo?'}
        description={decision?.decision === 'reject' ? 'O vínculo atual continua como está.' : 'O vínculo atual é revogado. O estudante ainda precisa reconhecer o número e confirmar no próprio app.'}
        confirmLabel="Registrar decisão"
        requireReason={{ min: 10, max: 500 }}
        reasonLabel="Motivo e como a identidade foi conferida"
        loading={decide.isPending}
        onClose={() => setDecision(null)}
        onConfirm={(reason) => decide.mutate(reason)}
      />
    </Surface>
  );
}

/** Simulador: só aparece com o provedor de demonstração, e o servidor não expõe as rotas fora dele. */
function Simulator({ channelId }: { channelId: string }) {
  const [from, setFrom] = useState('+99900001234');
  const [name, setName] = useState('Estudante de demonstração');
  const [text, setText] = useState('Olá, preciso de um comprovante de matrícula.');
  const [kind, setKind] = useState<'text' | 'document' | 'image' | 'unsupported'>('text');
  const toast = useToast();
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: centralKeys.channels });
    void queryClient.invalidateQueries({ queryKey: centralKeys.health });
  };
  const fail = (error: unknown) => toast.show(messageForError(error, 'A simulação falhou.'), 'error');
  const inbound = useMutation({ mutationFn: () => channelAdminApi.simulateInbound({ channelId, from, name, ...(text ? { text } : {}), kind }), onSuccess: (data) => { toast.show(data.duplicates ? 'Evento repetido: descartado.' : 'Mensagem simulada recebida.'); refresh(); }, onError: fail });
  const connection = useMutation({ mutationFn: (status: 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED') => channelAdminApi.simulateConnection({ channelId, status }), onSuccess: refresh, onError: fail });
  const delivery = useMutation({ mutationFn: (state: 'delivered' | 'read' | 'failed') => channelAdminApi.simulateDelivery({ channelId, state }), onSuccess: () => toast.show('Confirmação simulada para a última resposta.'), onError: fail });
  const nextSend = useMutation({ mutationFn: (mode: 'fail' | 'reject' | 'timeout') => channelAdminApi.simulateNextSend({ channelId, mode }), onSuccess: (_data, mode) => toast.show(`O próximo envio vai simular: ${mode}.`), onError: fail });
  return (
    <Surface aria-labelledby="simulador">
      <SectionHeader id="simulador" title="Simulador de demonstração" description="Dados fictícios e números não roteáveis (+999). Nada sai para o WhatsApp. Não existe em produção." />
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          inbound.mutate();
        }}
      >
        <TextInput label="Número sintético" required value={from} onChange={(event) => setFrom(event.target.value)} />
        <TextInput label="Nome informado no WhatsApp" value={name} onChange={(event) => setName(event.target.value)} />
        <TextArea label="Mensagem" rows={2} value={text} onChange={(event) => setText(event.target.value)} containerClassName="sm:col-span-2" hint="Cole aqui o código ASA-... para simular a vinculação do estudante." />
        <Select label="Tipo" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} options={[{ value: 'text', label: 'Texto' }, { value: 'document', label: 'Documento (PDF fictício)' }, { value: 'image', label: 'Imagem fictícia' }, { value: 'unsupported', label: 'Tipo não suportado' }]} />
        <div className="flex items-end"><Button type="submit" variant="primary" loading={inbound.isPending}>Receber mensagem</Button></div>
      </form>
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2"><span className="text-small text-slate">Conexão:</span><Button size="sm" onClick={() => connection.mutate('CONNECTED')}>Concluir conexão</Button><Button size="sm" onClick={() => connection.mutate('DEGRADED')}>Instável</Button><Button size="sm" onClick={() => connection.mutate('DISCONNECTED')}>Derrubar</Button></div>
        <div className="flex flex-wrap items-center gap-2"><span className="text-small text-slate">Última resposta:</span><Button size="sm" onClick={() => delivery.mutate('delivered')}>Confirmar entrega</Button><Button size="sm" onClick={() => delivery.mutate('read')}>Confirmar leitura</Button><Button size="sm" onClick={() => delivery.mutate('failed')}>Falha do provedor</Button></div>
        <div className="flex flex-wrap items-center gap-2"><span className="text-small text-slate">Próximo envio:</span><Button size="sm" onClick={() => nextSend.mutate('fail')}>Erro temporário</Button><Button size="sm" onClick={() => nextSend.mutate('reject')}>Rejeição</Button><Button size="sm" onClick={() => nextSend.mutate('timeout')}>Timeout ambíguo</Button></div>
      </div>
    </Surface>
  );
}

/** Configurações do canal institucional. Quem administra conecta o número, mas não lê as conversas (ADR-008). */
export default function WhatsAppChannelPage() {
  const { can } = useSession();
  const allowed = can('support_channels:manage');
  const channels = useQuery({ queryKey: centralKeys.channels, queryFn: channelAdminApi.list, enabled: allowed, refetchInterval: 15_000 });
  const catalog = useSupportCatalog();
  if (!allowed) return <AccessDenied />;
  const teams = catalog.data?.teams ?? [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Canal WhatsApp" description="Conexão do número institucional da Central de Atendimento. A administração configura o canal, sem acesso ao conteúdo das conversas." />
      {channels.isPending ? (
        <LoadingRows rows={4} />
      ) : !channels.data ? (
        <ErrorState error={channels.error} onRetry={() => void channels.refetch()} />
      ) : (
        <>
          {!channels.data.configured ? (
            <EmptyState icon={Plug} title="Nenhum provedor ativo neste ambiente" description={<>{channels.data.disabledReason ?? 'Configure um provedor para usar o WhatsApp.'} O atendimento pelo app e pelo portal continua funcionando normalmente.</>} />
          ) : (
            <>
              {channels.data.demoMode ? (
                <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-small text-warning-text"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> Modo de demonstração: nenhuma mensagem sai para o WhatsApp e nenhum número real é conectado.</p>
              ) : null}
              {channels.data.provider === 'wa-akg' ? (
                <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-small text-danger-text"><ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> Piloto com cliente não oficial do WhatsApp: viola os termos do serviço, e o número pode ser suspenso. Use só um número dedicado, com autorização formal, e nunca como operação definitiva.</p>
              ) : null}
              {channels.data.items.length === 0 ? (
                <Surface aria-labelledby="novo-canal">
                  <SectionHeader id="novo-canal" title="Criar canal" description={channels.data.provider ? PROVIDER_LABELS[channels.data.provider] : undefined} />
                  <CreateChannel teams={teams} />
                </Surface>
              ) : (
                channels.data.items.map((channel) => <ChannelCard key={channel.id} channel={channel} teams={teams} />)
              )}
              <HealthSection />
              <ReviewsSection />
              {channels.data.demoMode && channels.data.items[0] ? <Simulator channelId={channels.data.items[0].id} /> : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
