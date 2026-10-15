import type { AssistantDisplayItem, AssistantNextAction, QueueCallView, QueueStatus, QueueSubscription } from '../contracts/mobileApi.v1.js';
import { formatClock } from '../queue/time.js';
import { countWord, plural } from './phrasing.js';
import type { ResponderInput, ResponderOutput } from './responders.js';

/** Fonte de dados da fila para o assistente (implementada por QueueService). */
export interface QueueAssistantSource {
  readonly enabled: boolean;
  status(userId: string): Promise<QueueStatus>;
  isTracking(userId: string): Promise<boolean>;
}

type QueueResponder = (input: ResponderInput, queue: QueueAssistantSource | null) => Promise<ResponderOutput>;

const VIEW_QUEUE: AssistantNextAction = { type: 'navigate', label: 'Ver fila presencial', target: 'queue' };
const UNAVAILABLE_MESSAGE = 'O acompanhamento da fila presencial do ASA não está disponível no momento.';

function attendimentos(count: number, spoken: boolean): string {
  return `${spoken ? countWord(count, false) : count} ${plural(count, 'atendimento', 'atendimentos')}`;
}

function deskSuffix(desk: string | null): string {
  return desk ? ` na ${desk}` : '';
}

/** Aviso honesto quando a fonte não respondeu: os dados são da última leitura válida. */
function staleNotice(status: QueueStatus, timeZone: string): string {
  const { sync } = status.queue;
  if (sync.status !== 'unavailable' && sync.status !== 'stale') return '';
  if (!sync.lastSuccessfulSyncAt) return 'Não consegui consultar o painel do ASA agora. ';
  return `Não consegui atualizar a fila agora; a última informação é das ${formatClock(new Date(sync.lastSuccessfulSyncAt), timeZone)}. `;
}

function callItem(call: QueueCallView, index: number): AssistantDisplayItem {
  return {
    id: `queue-call-${index}-${call.ticket}`,
    title: `Senha ${call.ticket}`,
    description: call.desk,
    meta: null,
    badge: call.serviceStatus === 'in_service' ? 'Em atendimento' : call.serviceStatus === 'completed' ? 'Concluído' : null,
    tone: call.serviceStatus === 'in_service' ? 'success' : 'neutral',
    subjectId: null,
  };
}

async function load(input: ResponderInput, queue: QueueAssistantSource | null): Promise<QueueStatus | null> {
  if (!queue?.enabled) return null;
  return queue.status(input.userId);
}

const unavailable = (): ResponderOutput => ({ status: 'empty', title: 'Fila presencial', message: UNAVAILABLE_MESSAGE, speech: UNAVAILABLE_MESSAGE });

const notTracking = (status: QueueStatus): ResponderOutput => {
  const latest = status.queue.latestCall;
  const latestText = latest ? ` A última senha chamada foi a ${latest.ticket}${deskSuffix(latest.desk)}.` : '';
  return {
    status: 'needs_clarification',
    title: 'Fila presencial',
    message: `Você ainda não está acompanhando nenhuma senha. Informe sua senha na tela da fila presencial e eu aviso quando sua vez estiver chegando.${latestText}`,
    speech: `Você ainda não está acompanhando nenhuma senha. Informe sua senha na tela da fila e eu aviso quando sua vez estiver chegando.`,
    nextActions: [{ ...VIEW_QUEUE, label: 'Acompanhar minha senha' }],
  };
};

/** Frase sobre a senha do estudante. Só afirma posição/mesa presentes nos dados reais. */
function describeSubscription(sub: QueueSubscription, timeZone: string, spoken: boolean): string {
  switch (sub.status) {
    case 'called': {
      if (sub.alreadyCalled && sub.calledAt) return `Sua senha ${sub.ticket} já tinha sido chamada às ${formatClock(new Date(sub.calledAt), timeZone)}${deskSuffix(sub.calledDesk)}.`;
      return sub.calledDesk ? `Chegou a sua vez! Sua senha ${sub.ticket} foi chamada na ${sub.calledDesk}.` : `Chegou a sua vez! Sua senha ${sub.ticket} foi chamada. Verifique a mesa indicada no painel do ASA.`;
    }
    case 'completed':
      return `O atendimento da senha ${sub.ticket} já foi finalizado no painel do ASA.`;
    case 'expired':
    case 'cancelled':
      return `O acompanhamento da senha ${sub.ticket} foi encerrado.`;
    default:
      if (!sub.positionKnown || sub.ahead === null) {
        return `Sua senha ${sub.ticket} ainda não foi chamada, mas ela não aparece agora na lista de próximas senhas do painel, então não consigo dizer quantas pessoas estão à sua frente.`;
      }
      if (sub.ahead === 0) return `Sua senha ${sub.ticket} é a próxima a ser chamada.`;
      return `${sub.ahead === 1 ? 'Existe' : 'Existem'} ${attendimentos(sub.ahead, spoken)} antes da sua senha.`;
  }
}

/** "ASA, quantas pessoas faltam para mim?" */
export const queueStatus: QueueResponder = async (input, queue) => {
  const status = await load(input, queue);
  if (!status) return unavailable();
  const sub = status.subscription;
  if (!sub) return notTracking(status);
  const notice = staleNotice(status, input.timeZone);
  const items: AssistantDisplayItem[] = status.queue.currentCalls.slice(0, 3).map(callItem);
  return {
    status: 'success',
    title: `Senha ${sub.ticket}`,
    message: `${notice}${describeSubscription(sub, input.timeZone, false)}`,
    speech: `${notice}${describeSubscription(sub, input.timeZone, true)}`,
    items,
    nextActions: [VIEW_QUEUE],
  };
};

/** "Qual senha está sendo atendida?" */
export const queueCurrentCall: QueueResponder = async (input, queue) => {
  const status = await load(input, queue);
  if (!status) return unavailable();
  const notice = staleNotice(status, input.timeZone);
  const { latestCall, currentCalls } = status.queue;
  if (!latestCall) {
    const message = status.queue.status === 'empty' ? 'Nenhuma senha foi chamada hoje no painel do ASA até agora.' : 'Ainda não tenho as chamadas do painel do ASA.';
    return { status: 'empty', title: 'Senhas chamadas', message: `${notice}${message}`, speech: `${notice}${message}`, nextActions: [VIEW_QUEUE] };
  }
  const main = latestCall.desk
    ? `A senha ${latestCall.ticket} está entre as últimas chamadas e foi direcionada para a ${latestCall.desk}.`
    : `A última senha chamada foi a ${latestCall.ticket}.`;
  const others = currentCalls.filter((call) => call.desk && call.desk !== latestCall.desk && call.ticket !== latestCall.ticket);
  const otherText = others.length > 0 ? ` ${others.map((call) => `Na ${call.desk}, a última chamada foi a ${call.ticket}.`).join(' ')}` : '';
  return {
    status: 'success',
    title: 'Senhas chamadas',
    message: `${notice}${main}${otherText}`,
    speech: `${notice}${main}${otherText}`,
    items: currentCalls.slice(0, 4).map(callItem),
    nextActions: [VIEW_QUEUE],
  };
};

/** "Quanto tempo falta?" — nunca inventa: sem dados suficientes, diz que não consegue estimar. */
export const queueEstimate: QueueResponder = async (input, queue) => {
  const status = await load(input, queue);
  if (!status) return unavailable();
  const sub = status.subscription;
  if (!sub) return notTracking(status);
  const notice = staleNotice(status, input.timeZone);
  if (sub.status === 'called' || sub.status === 'completed') {
    const text = describeSubscription(sub, input.timeZone, false);
    return { status: 'success', title: `Senha ${sub.ticket}`, message: `${notice}${text}`, speech: `${notice}${text}`, nextActions: [VIEW_QUEUE] };
  }
  const estimate = status.subscription?.estimate;
  if (estimate && status.queue.sync.status === 'live') {
    const message = `A estimativa atual é de aproximadamente ${estimate.minMinutes} a ${estimate.maxMinutes} minutos.`;
    const position = sub.positionKnown && sub.ahead !== null ? ` ${describeSubscription(sub, input.timeZone, false)}` : '';
    return {
      status: 'success',
      title: 'Estimativa aproximada',
      message: `${message}${position} O cálculo usa o ritmo recente de chamadas e pode mudar.`,
      speech: `${message}${position}`,
      nextActions: [VIEW_QUEUE],
    };
  }
  const position = sub.positionKnown && sub.ahead !== null ? ` ${describeSubscription(sub, input.timeZone, false)}` : '';
  const message = `${notice}Não consigo estimar o tempo com segurança agora, mas posso acompanhar sua posição na fila.${position}`;
  return { status: 'empty', title: 'Estimativa indisponível', message, speech: message, nextActions: [VIEW_QUEUE] };
};
