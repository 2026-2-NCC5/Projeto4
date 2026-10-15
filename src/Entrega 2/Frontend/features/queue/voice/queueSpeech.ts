import type { QueueAlertKind } from '../state/alerts';

const WORDS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];

function spoken(count: number): string {
  return WORDS[count] ?? String(count);
}

function atendimentos(count: number): string {
  return `${spoken(count)} ${count === 1 ? 'atendimento' : 'atendimentos'}`;
}

/** "Vinícius, chegou..." com nome; "Chegou..." sem nome (primeira letra maiúscula). */
function withName(firstName: string | null, sentence: string): string {
  const name = firstName?.trim();
  if (name) return `${name}, ${sentence}`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export interface QueueSpeechContext {
  firstName: string | null;
  ticket: string;
  /** só quando o painel informou — nunca inventada */
  desk: string | null;
  ahead: number | null;
}

/**
 * Fala natural do ASA IA para cada alerta da fila. A mesa só é anunciada quando existe no evento;
 * sem mesa, o aluno é orientado a conferir o painel.
 */
export function queueSpeech(kind: QueueAlertKind, ctx: QueueSpeechContext): string {
  switch (kind) {
    case 'five_ahead':
      return withName(
        ctx.firstName,
        ctx.ahead !== null
          ? `sua vez no ASA está se aproximando. Existem cerca de ${atendimentos(ctx.ahead)} antes da sua senha.`
          : 'sua vez no ASA está se aproximando.',
      );
    case 'three_ahead':
      return withName(ctx.firstName, ctx.ahead !== null ? `fique por perto. Faltam apenas ${atendimentos(ctx.ahead)} para a sua senha no ASA.` : 'fique por perto. Faltam poucos atendimentos para a sua senha no ASA.');
    case 'next':
      return withName(ctx.firstName, 'prepare-se. Sua senha está entre as próximas a serem chamadas.');
    case 'called':
      return withName(
        ctx.firstName,
        ctx.desk
          ? `chegou a sua vez! Sua senha ${ctx.ticket} foi chamada. Dirija-se à ${ctx.desk}.`
          : `chegou a sua vez! Sua senha ${ctx.ticket} foi chamada. Verifique a mesa indicada no painel do ASA.`,
      );
  }
}

/** Texto do leitor de tela quando a senha é chamada. */
export function calledAccessibilityAnnouncement(ticket: string, desk: string | null): string {
  return desk ? `Sua senha ${ticket} foi chamada para a ${desk}.` : `Sua senha ${ticket} foi chamada. Confira a mesa no painel do ASA.`;
}

/** Título e texto do aviso interno (banner) de cada alerta. */
export function alertBannerCopy(kind: QueueAlertKind, ctx: { ticket: string; ahead: number | null; desk: string | null }): { title: string; message: string } {
  switch (kind) {
    case 'five_ahead':
      return { title: 'Sua vez está chegando', message: ctx.ahead !== null ? `Há ${ctx.ahead === 1 ? '1 senha' : `${ctx.ahead} senhas`} antes da sua.` : 'Sua senha está se aproximando.' };
    case 'three_ahead':
      return { title: 'Fique por perto', message: ctx.ahead !== null ? `Faltam apenas ${ctx.ahead === 1 ? '1 atendimento' : `${ctx.ahead} atendimentos`} para a senha ${ctx.ticket}.` : `Faltam poucos atendimentos para a senha ${ctx.ticket}.` };
    case 'next':
      return { title: 'Prepare-se', message: 'Sua senha é uma das próximas.' };
    case 'called':
      return { title: 'É a sua vez!', message: ctx.desk ? `Senha ${ctx.ticket} · ${ctx.desk}` : `Senha ${ctx.ticket}` };
  }
}
