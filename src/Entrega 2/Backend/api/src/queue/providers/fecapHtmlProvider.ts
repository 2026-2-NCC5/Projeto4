import { buildSnapshot } from '../snapshot.js';
import { htmlToText, parseQueueText } from '../textParser.js';
import { timezoneOffsetMinutes } from '../time.js';
import type { QueueProvider, QueueSnapshot } from '../types.js';
import { fetchWithTimeout, QUEUE_USER_AGENT, readText, type FetchFn } from './http.js';

export interface FecapHtmlProviderOptions {
  sourceUrl: string;
  timeoutMs: number;
  timeZone: string;
  fetchFn?: FetchFn;
  now?: () => Date;
}

/**
 * Fallback (FecapQueueHtmlProvider): lê o texto visível do HTML entregue pelo servidor.
 *
 * Hoje o portal renderiza as senhas no navegador, então este provider costuma falhar com
 * "nenhuma senha encontrada" — e isso é intencional: ele nunca transforma o placeholder
 * "Não há registros" em fila vazia. Passa a funcionar se o portal voltar a renderizar no servidor.
 */
export class FecapQueueHtmlProvider implements QueueProvider {
  readonly name = 'fecap-html';
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;

  constructor(private readonly options: FecapHtmlProviderOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async getCurrentQueue(): Promise<QueueSnapshot> {
    const response = await fetchWithTimeout(this.fetchFn, this.options.sourceUrl, { headers: { 'User-Agent': QUEUE_USER_AGENT, Accept: 'text/html' } }, this.options.timeoutMs);
    const html = await readText(response, this.options.sourceUrl);
    const now = this.now();
    const parsed = parseQueueText(htmlToText(html), { timezoneOffsetMinutes: timezoneOffsetMinutes(now, this.options.timeZone) });
    return buildSnapshot({
      provider: this.name,
      calls: parsed.calls,
      upcoming: parsed.upcoming,
      // sem a seção de próximas senhas não há como afirmar a posição de ninguém
      upcomingComplete: parsed.upcomingSectionFound,
      callsTotal: null,
      now,
      timeZone: this.options.timeZone,
    });
  }
}
