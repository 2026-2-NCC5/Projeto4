import type { QueueCall } from './types.js';

export interface WaitEstimate {
  minMinutes: number;
  maxMinutes: number;
  /** 'medium' com 8+ chamadas na janela; nunca "alta": é uma aproximação */
  confidence: 'low' | 'medium';
  basedOnCalls: number;
  windowMinutes: number;
  /** mesas distintas que chamaram senhas na janela (atendimento paralelo) */
  activeDesks: number;
}

export interface EstimateOptions {
  /** janela de chamadas recentes consideradas */
  windowMinutes?: number;
  minCalls?: number;
  /** intervalo mínimo entre a primeira e a última chamada da janela */
  minSpanMinutes?: number;
  /** sem chamadas há mais tempo que isto, o atendimento pode estar pausado: sem estimativa */
  maxIdleMinutes?: number;
}

/**
 * Estimativa de espera a partir do ritmo REAL de chamadas (throughput global da fila).
 *
 * Usar o intervalo entre chamadas de todas as mesas juntas já considera o atendimento paralelo
 * (duas mesas → chamadas mais frequentes) sem supor atendimento serial. Limitações: não conhece
 * prioridades, pausas, desistências nem a duração individual de cada atendimento — por isso devolve
 * uma faixa larga ou null quando não há dados suficientes. Nunca promete um horário exato.
 */
export function estimateWait(calls: QueueCall[], ahead: number, now: Date, options: EstimateOptions = {}): WaitEstimate | null {
  const windowMinutes = options.windowMinutes ?? 60;
  const minCalls = options.minCalls ?? 4;
  const minSpanMinutes = options.minSpanMinutes ?? 5;
  const maxIdleMinutes = options.maxIdleMinutes ?? 20;
  if (!Number.isInteger(ahead) || ahead < 0) return null;

  const nowMs = now.getTime();
  const recent = calls
    .filter((call) => call.calledAt)
    .map((call) => ({ at: Date.parse(call.calledAt!), desk: call.desk }))
    .filter((call) => Number.isFinite(call.at) && call.at <= nowMs && nowMs - call.at <= windowMinutes * 60_000)
    .sort((a, b) => a.at - b.at);
  if (recent.length < minCalls) return null;

  const first = recent[0]!.at;
  const last = recent[recent.length - 1]!.at;
  const spanMinutes = (last - first) / 60_000;
  if (spanMinutes < minSpanMinutes) return null;
  if ((nowMs - last) / 60_000 > maxIdleMinutes) return null;

  const callsPerMinute = (recent.length - 1) / spanMinutes;
  // a senha do estudante é chamada depois das `ahead` senhas à frente
  const expected = (ahead + 1) / callsPerMinute;
  const step = expected >= 10 ? 5 : 1;
  const minMinutes = Math.max(1, Math.floor((expected * 0.75) / step) * step);
  const maxMinutes = Math.max(minMinutes + step, Math.ceil((expected * 1.3) / step) * step);
  return {
    minMinutes,
    maxMinutes,
    confidence: recent.length >= 8 && spanMinutes >= 20 ? 'medium' : 'low',
    basedOnCalls: recent.length,
    windowMinutes,
    activeDesks: new Set(recent.map((call) => call.desk).filter(Boolean)).size,
  };
}
