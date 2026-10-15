import { parseAntiForgeryToken, parseGridResponse, parsePortalPage, recordsToCalls, recordsToWaiting, type PortalPage, type PortalViewConfig } from '../fecapParser.js';
import { buildSnapshot } from '../snapshot.js';
import { timezoneOffsetMinutes } from '../time.js';
import { QueueSourceError, type QueueProvider, type QueueSnapshot } from '../types.js';
import { CookieJar, fetchWithTimeout, QUEUE_USER_AGENT, readText, type FetchFn } from './http.js';

export interface FecapPortalProviderOptions {
  sourceUrl: string;
  timeoutMs: number;
  timeZone: string;
  fetchFn?: FetchFn;
  now?: () => Date;
  /** tamanho da página de "PRÓXIMAS SENHAS" (cobre a fila inteira na prática) */
  upcomingPageSize?: number;
  /** chamadas recentes lidas a cada ciclo */
  callsPageSize?: number;
  /** renova página + token periodicamente, mesmo sem erro */
  sessionTtlMs?: number;
}

interface PortalSession {
  page: PortalPage;
  token: string;
  cookies: CookieJar;
  createdAt: number;
}

/**
 * Provider principal (FecapQueueApiProvider): consome o endpoint JSON que a própria página usa.
 *
 * Por ciclo: 2 POSTs pequenos (próximas senhas + chamadas recentes). A página HTML e o token
 * anti-CSRF só são buscados na descoberta, a cada `sessionTtlMs` ou quando a fonte rejeita a sessão.
 */
export class FecapPortalQueueProvider implements QueueProvider {
  readonly name = 'fecap-portal';
  private session: PortalSession | null = null;
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;

  constructor(private readonly options: FecapPortalProviderOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async getCurrentQueue(): Promise<QueueSnapshot> {
    const session = await this.ensureSession();
    try {
      return await this.read(session);
    } catch (error) {
      if (!(error instanceof QueueSourceError) || !error.renewSession) throw error;
      // Token/configuração expirados (portal republicado, cookie trocado): uma nova sessão e uma nova tentativa.
      this.session = null;
      return this.read(await this.ensureSession());
    }
  }

  private origin(): string {
    return new URL(this.options.sourceUrl).origin;
  }

  private async ensureSession(): Promise<PortalSession> {
    const ttl = this.options.sessionTtlMs ?? 30 * 60_000;
    if (this.session && this.now().getTime() - this.session.createdAt < ttl) return this.session;
    const cookies = new CookieJar();
    const pageResponse = await fetchWithTimeout(this.fetchFn, this.options.sourceUrl, { headers: { 'User-Agent': QUEUE_USER_AGENT, Accept: 'text/html' } }, this.options.timeoutMs);
    cookies.store(pageResponse);
    const page = parsePortalPage(await readText(pageResponse, this.options.sourceUrl));
    const tokenUrl = `${this.origin()}/_layout/tokenhtml`;
    const tokenResponse = await fetchWithTimeout(this.fetchFn, tokenUrl, { headers: { 'User-Agent': QUEUE_USER_AGENT, Cookie: cookies.header() } }, this.options.timeoutMs);
    cookies.store(tokenResponse);
    const token = parseAntiForgeryToken(await readText(tokenResponse, tokenUrl));
    this.session = { page, token, cookies, createdAt: this.now().getTime() };
    return this.session;
  }

  private async fetchView(session: PortalSession, view: PortalViewConfig, pageSize: number) {
    const url = `${this.origin()}${session.page.gridDataPath}`;
    const now = this.now();
    const response = await fetchWithTimeout(
      this.fetchFn,
      url,
      {
        method: 'POST',
        headers: {
          'User-Agent': QUEUE_USER_AGENT,
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
          'X-Requested-With': 'XMLHttpRequest',
          __RequestVerificationToken: session.token,
          Cookie: session.cookies.header(),
          Referer: this.options.sourceUrl,
          Origin: this.origin(),
        },
        body: JSON.stringify({
          base64SecureConfiguration: view.base64SecureConfiguration,
          sortExpression: view.sortExpression,
          search: null,
          page: 1,
          pageSize,
          pagingCookie: '',
          filter: null,
          metaFilter: null,
          nlSearch: false,
          // mesmo sinal de Date#getTimezoneOffset do navegador (São Paulo = 180)
          timezoneOffset: -timezoneOffsetMinutes(now, this.options.timeZone),
          customParameters: [],
          entityName: null,
          entityId: null,
        }),
      },
      this.options.timeoutMs,
    );
    session.cookies.store(response);
    if (!response.ok) {
      // 4xx: token/configuração recusados → renovar sessão; 5xx: falha da fonte (backoff do monitor).
      throw new QueueSourceError('http', `HTTP ${response.status} na lista ${view.viewId ?? '?'}`, { status: response.status, renewSession: response.status >= 400 && response.status < 500 });
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      throw new QueueSourceError('parse', 'lista devolveu JSON inválido', { cause: error, renewSession: true });
    }
    return parseGridResponse(json);
  }

  private async read(session: PortalSession): Promise<QueueSnapshot> {
    const [waitingPage, callsPage] = await Promise.all([
      this.fetchView(session, session.page.waitingView, this.options.upcomingPageSize ?? 50),
      this.fetchView(session, session.page.callsView, this.options.callsPageSize ?? 12),
    ]);
    return buildSnapshot({
      provider: this.name,
      calls: recordsToCalls(callsPage.records),
      upcoming: recordsToWaiting(waitingPage.records),
      upcomingComplete: !waitingPage.moreRecords,
      callsTotal: callsPage.itemCount,
      now: this.now(),
      timeZone: this.options.timeZone,
    });
  }
}
