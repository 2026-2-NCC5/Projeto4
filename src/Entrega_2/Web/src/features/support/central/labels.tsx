import { AlertTriangle, Check, CheckCheck, CircleAlert, Clock, HelpCircle, Loader2, type LucideIcon, Wifi, WifiOff } from 'lucide-react';
import { Badge, type Tone } from '@/components/ui/Display';
import { cn } from '@/lib/cn';
import type { SupportConnectionStatus, SupportMessageDeliveryState, SupportWhatsAppReplyBlock, SupportWhatsAppStatus } from '@/types/api';
import type { RealtimeState } from './useSupportRealtime';

export const CONNECTION_META: Record<SupportConnectionStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  CONNECTED: { label: 'Conectado', tone: 'success', icon: Wifi },
  CONNECTING: { label: 'Conectando', tone: 'info', icon: Loader2 },
  QR_REQUIRED: { label: 'Aguardando QR', tone: 'warning', icon: AlertTriangle },
  DEGRADED: { label: 'Instável', tone: 'warning', icon: AlertTriangle },
  DISCONNECTED: { label: 'Desconectado', tone: 'danger', icon: WifiOff },
  ERROR: { label: 'Com erro', tone: 'danger', icon: CircleAlert },
};

/** Só o que o provedor confirmou. "Enviada" não é "entregue", e `unknown` é dito com todas as letras. */
export const DELIVERY_META: Record<Exclude<SupportMessageDeliveryState, 'not_applicable'>, { label: string; icon: LucideIcon; tone: string }> = {
  queued: { label: 'Na fila de envio', icon: Clock, tone: 'text-slate' },
  sending: { label: 'Enviando', icon: Loader2, tone: 'text-slate' },
  sent: { label: 'Enviada', icon: Check, tone: 'text-slate' },
  delivered: { label: 'Entregue', icon: CheckCheck, tone: 'text-slate' },
  read: { label: 'Lida', icon: CheckCheck, tone: 'text-action' },
  failed: { label: 'Não enviada', icon: CircleAlert, tone: 'text-danger-text' },
  unknown: { label: 'Sem confirmação: pode ter sido enviada', icon: HelpCircle, tone: 'text-warning-text' },
};

export const DELIVERY_ERROR_TEXT: Record<string, string> = {
  channel_disconnected: 'o canal estava desconectado',
  gateway_unreachable: 'o gateway não respondeu',
  provider_rejected: 'o provedor recusou a mensagem',
  template_required: 'a janela de 24 horas terminou',
  consent_required: 'a pessoa pediu para não receber mensagens',
  gateway_auth_failed: 'credencial do gateway recusada',
  send_interrupted: 'o envio foi interrompido',
  channel_disabled: 'o canal foi desativado',
};

export const REPLY_BLOCK_TEXT: Record<SupportWhatsAppReplyBlock, string> = {
  outbound_disabled: 'O envio pelo WhatsApp está desligado neste ambiente.',
  channel_disconnected: 'O WhatsApp institucional está desconectado. Nada será enviado até a administração reconectar.',
  channel_paused: 'O canal WhatsApp está pausado pela administração.',
  provider_unavailable: 'O provedor do WhatsApp está indisponível no momento. Tente de novo em instantes.',
  template_required: 'A janela de 24 horas desta conversa terminou. Por regra do WhatsApp, só um modelo aprovado pode retomar a conversa.',
  consent_required: 'Esta pessoa pediu para não receber mensagens por este canal.',
};

export function DeliveryStatus({ state, errorCode }: { state: SupportMessageDeliveryState; errorCode: string | null }) {
  if (state === 'not_applicable') return null;
  const meta = DELIVERY_META[state];
  const Icon = meta.icon;
  const reason = errorCode && (state === 'failed' || state === 'queued') ? DELIVERY_ERROR_TEXT[errorCode] : null;
  return (
    <span className={cn('inline-flex items-center gap-1 text-caption', meta.tone)}>
      <Icon size={14} aria-hidden className={state === 'sending' ? 'animate-spin motion-reduce:animate-none' : undefined} />
      <span>{meta.label}{reason ? ` (${reason})` : ''}</span>
    </span>
  );
}

/** Situação real do canal. "Conectado" só aparece com confirmação do provedor; demonstração é marcada sempre. */
export function ChannelIndicator({ status }: { status: SupportWhatsAppStatus | undefined }) {
  if (!status) return null;
  if (!status.configured) return <Badge tone="neutral" icon={WifiOff}>WhatsApp não configurado</Badge>;
  const channel = status.channels[0];
  const meta = channel ? CONNECTION_META[channel.status] : CONNECTION_META.DISCONNECTED;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {status.demoMode ? <Badge tone="warning">Modo de demonstração</Badge> : null}
      <Badge tone={meta.tone} icon={meta.icon}>WhatsApp: {channel ? meta.label : 'sem canal'}</Badge>
    </span>
  );
}

const REALTIME_TEXT: Record<RealtimeState, { label: string; tone: string }> = {
  connecting: { label: 'Conectando…', tone: 'text-slate' },
  live: { label: 'Atualizando ao vivo', tone: 'text-slate' },
  reconnecting: { label: 'Sem atualização: tentando reconectar', tone: 'text-warning-text' },
  offline: { label: 'Sem internet: dados podem estar desatualizados', tone: 'text-danger-text' },
};

/** Liga o portal à API. Não confundir com o estado do WhatsApp, por isso os textos são diferentes. */
export function RealtimeIndicator({ state }: { state: RealtimeState }) {
  const meta = REALTIME_TEXT[state];
  return <span role="status" className={cn('text-caption', meta.tone)}>{meta.label}</span>;
}
