import { formatClock } from './time.js';
import type { QueueAlertMilestone } from './types.js';

export interface AlertCopyInput {
  milestone: QueueAlertMilestone;
  ticket: string;
  ahead: number | null;
  /** somente quando a fonte informou a mesa — nunca inventada */
  desk: string | null;
  calledAt: Date | null;
  /** a chamada foi detectada com atraso (ex.: monitor sem acesso à fonte) */
  late: boolean;
  timeZone: string;
}

export interface AlertCopy {
  title: string;
  body: string;
}

function senhas(count: number): string {
  return count === 1 ? '1 senha' : `${count} senhas`;
}

function atendimentos(count: number): string {
  return count === 1 ? '1 atendimento' : `${count} atendimentos`;
}

/** Textos da notificação push de cada alerta progressivo (curtos, sem jargão, sem dados inventados). */
export function alertCopy(input: AlertCopyInput): AlertCopy {
  const { ticket, ahead, desk } = input;
  switch (input.milestone) {
    case 'QUEUE_5_AHEAD':
      return {
        title: 'Sua vez está chegando',
        body: ahead !== null ? `Há ${senhas(ahead)} antes da sua (${ticket}).` : `A senha ${ticket} está se aproximando.`,
      };
    case 'QUEUE_3_AHEAD':
      return {
        title: 'Fique por perto',
        body: ahead !== null ? `Faltam apenas ${atendimentos(ahead)} para a senha ${ticket}.` : `Faltam poucos atendimentos para a senha ${ticket}.`,
      };
    case 'QUEUE_NEXT':
      return { title: 'Prepare-se', body: `A senha ${ticket} é uma das próximas a serem chamadas.` };
    case 'QUEUE_CALLED': {
      if (input.late && input.calledAt) {
        const at = formatClock(input.calledAt, input.timeZone);
        return {
          title: 'Sua senha foi chamada',
          body: desk
            ? `A senha ${ticket} foi chamada às ${at} na ${desk}. Se ainda não foi atendido, procure a equipe do ASA.`
            : `A senha ${ticket} foi chamada às ${at}. Se ainda não foi atendido, procure a equipe do ASA.`,
        };
      }
      return {
        title: 'É a sua vez!',
        body: desk ? `Sua senha ${ticket} foi chamada na ${desk}.` : `Sua senha ${ticket} foi chamada. Confira a mesa no painel do ASA.`,
      };
    }
  }
}
