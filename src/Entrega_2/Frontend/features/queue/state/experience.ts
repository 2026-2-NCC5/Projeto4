import type { QueueStatus, QueueSubscription } from '../../../types/api';

/** Estados de experiência da tela da fila (cada um tem representação textual, não só cor/animação). */
export type QueueExperienceState =
  | 'not_tracking'
  | 'waiting'
  | 'approaching'
  | 'next'
  | 'called'
  | 'completed'
  | 'queue_empty'
  | 'service_closed'
  | 'sync_error'
  | 'offline';

/** waiting → neutro; approaching/next → atenção; called → sucesso; erro só quando necessário. */
export type QueueTone = 'neutral' | 'attention' | 'success' | 'error';

export interface QueueExperience {
  state: QueueExperienceState;
  tone: QueueTone;
  title: string;
  message: string;
  hint: string | null;
  /** passo do indicador: 0 registrada · 1 aguardando · 2 chegando · 3 atendimento */
  step: 0 | 1 | 2 | 3;
  accessibilityLabel: string;
}

export interface ExperienceInput {
  status: QueueStatus | null;
  isOffline: boolean;
  /** a última tentativa de carregar falhou */
  hasError: boolean;
  /** formata horário local ("20:43") */
  formatTime: (iso: string) => string;
}

export function peopleAhead(count: number): string {
  return count === 1 ? '1 pessoa' : `${count} pessoas`;
}

export function isActiveSubscription(sub: QueueSubscription | null | undefined): sub is QueueSubscription {
  return !!sub && (sub.status === 'waiting' || sub.status === 'approaching' || sub.status === 'next' || sub.status === 'called');
}

function make(state: QueueExperienceState, tone: QueueTone, title: string, message: string, hint: string | null, step: QueueExperience['step']): QueueExperience {
  return { state, tone, title, message, hint, step, accessibilityLabel: [title, message, hint].filter(Boolean).join('. ') };
}

/** Mensagem de posição: só afirma o que veio do painel; sem posição, diz que a senha ainda não foi chamada. */
function aheadMessage(sub: QueueSubscription): string {
  if (!sub.positionKnown || sub.ahead === null) return 'Sua senha ainda não foi chamada.';
  if (sub.ahead === 0) return 'Ninguém antes de você.';
  return `${peopleAhead(sub.ahead)} antes de você.`;
}

function subscriptionExperience(sub: QueueSubscription, formatTime: (iso: string) => string): QueueExperience {
  switch (sub.status) {
    case 'called':
      if (sub.alreadyCalled) {
        const at = sub.calledAt ? ` às ${formatTime(sub.calledAt)}` : '';
        return make('called', 'success', 'Senha já chamada', `A senha ${sub.ticket} foi chamada${at}${sub.calledDesk ? ` na ${sub.calledDesk}` : ''}.`, 'Se ainda não foi atendido, procure a equipe do ASA.', 3);
      }
      return make(
        'called',
        'success',
        'É a sua vez!',
        sub.calledDesk ? `Senha ${sub.ticket} · ${sub.calledDesk}` : `Senha ${sub.ticket}`,
        sub.calledDesk ? 'Dirija-se à mesa indicada.' : 'Confira a mesa indicada no painel do ASA.',
        3,
      );
    case 'completed':
      return make('completed', 'neutral', 'Atendimento finalizado', `O painel do ASA marcou a senha ${sub.ticket} como concluída.`, null, 3);
    case 'next':
      return make('next', 'attention', 'Prepare-se', sub.ahead === 0 && sub.positionKnown ? 'Sua senha é a próxima.' : 'Sua senha está entre as próximas.', 'Mantenha o celular por perto.', 2);
    case 'approaching':
      return make('approaching', 'attention', 'Sua vez está chegando', aheadMessage(sub), 'Fique próximo à área de atendimento.', 2);
    default:
      return make('waiting', 'neutral', 'Você está na fila', aheadMessage(sub), null, 1);
  }
}

/** Estado da experiência a partir do último estado conhecido + conexão. */
export function deriveExperience({ status, isOffline, hasError, formatTime }: ExperienceInput): QueueExperience {
  const sub = status?.subscription ?? null;
  if (sub && (sub.status === 'completed' || isActiveSubscription(sub))) return subscriptionExperience(sub, formatTime);
  if (!status) {
    if (isOffline) return make('offline', 'neutral', 'Sem conexão', 'Conecte-se à internet para acompanhar a fila do ASA.', null, 0);
    if (hasError) return make('sync_error', 'error', 'Não conseguimos carregar a fila agora', 'Tente novamente em instantes.', null, 0);
  }
  if (status?.queue.status === 'closed') return make('service_closed', 'neutral', 'Atendimento encerrado', 'O atendimento presencial do ASA está encerrado no momento.', null, 0);
  if (status?.queue.status === 'empty') return make('queue_empty', 'neutral', 'Nenhuma senha na fila agora', 'Retirou uma senha no ASA? Informe abaixo e avisamos quando sua vez estiver chegando.', null, 0);
  return make('not_tracking', 'neutral', 'Acompanhe sua senha', 'Informe a senha que você retirou no ASA. Avisamos quando sua vez estiver chegando.', null, 0);
}
