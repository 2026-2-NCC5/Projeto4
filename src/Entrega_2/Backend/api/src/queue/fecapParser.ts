import { isValidTicket, normalizeTicket } from './ticket.js';
import { QueueSourceError, type QueueCall, type QueueServiceStatus, type QueueWaiting } from './types.js';

/**
 * Interpretação da página https://presencial.fecap.br/ (Microsoft Power Pages / Dataverse).
 *
 * A página identifica as listas "PRÓXIMAS SENHAS" e "SENHAS ANTERIORES" como entity-grids do
 * Power Pages, com dados carregados por POST /_services/entity-grid-data.json/<site>. O acesso aos
 * registros depende das permissões configuradas na FECAP; o HTML público ou um token anti-CSRF não
 * comprovam autorização. O provider só consulta as listas quando a integração foi habilitada após
 * aprovação institucional. Não há WebSocket/SSE documentado na origem.
 *
 * As listas são identificadas pelas COLUNAS (nomes lógicos), não pela posição no HTML.
 */

export const FECAP_FIELDS = {
  ticket: 'fecap_senhanopresencial',
  position: 'fecap_posicaonafilapresencial',
  desk: 'fecap_mesaasa_porextenso',
  calledAt: 'fecap_datadeatribuicao',
  status: 'statuscode',
} as const;

export interface PortalViewConfig {
  entityName: string;
  viewId: string | null;
  columns: string[];
  base64SecureConfiguration: string;
  sortExpression: string;
}

export interface PortalPage {
  /** URL relativa do endpoint de dados das listas (inclui o id do site) */
  gridDataPath: string;
  /** "PRÓXIMAS SENHAS": posição + senha */
  waitingView: PortalViewConfig;
  /** "SENHAS ANTERIORES": senha + mesa + hora da chamada */
  callsView: PortalViewConfig;
}

const ENTITY_GRID_TAG = /<div\b[^>]*class="[^"]*\bentity-grid\b[^"]*"[^>]*>/gi;

/**
 * A página pode responder HTTP 200 e, ainda assim, renderizar o aviso de permissão do Power Pages.
 * Não interpretar a mensagem subsequente "Não há registros" como uma fila realmente vazia.
 */
export function assertQueueAccessAllowed(content: unknown): void {
  let text: string;
  if (typeof content === 'string') text = content;
  else {
    try { text = JSON.stringify(content); } catch { text = String(content); }
  }
  text = text
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&atilde;|&#227;/gi, 'a')
    .replace(/&otilde;|&#245;/gi, 'o')
    .replace(/&ccedil;|&#231;/gi, 'c')
    .replace(/&aacute;|&#225;|&acirc;|&#226;|&agrave;|&#224;/gi, 'a')
    .replace(/&eacute;|&#233;|&ecirc;|&#234;/gi, 'e')
    .replace(/&iacute;|&#237;/gi, 'i')
    .replace(/&oacute;|&#243;|&ocirc;|&#244;/gi, 'o')
    .replace(/&uacute;|&#250;|&uuml;|&#252;/gi, 'u')
    .replace(/<[^>]*>/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  const denied =
    /voce nao tem permissoes para exibir estes registros/.test(text) ||
    /you do not have permission to view these records/.test(text) ||
    /you don't have permission to view these records/.test(text) ||
    /access denied/.test(text);
  if (denied) throw new QueueSourceError('http', 'A fonte da fila negou permissão para ler os registros', { status: 403 });
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:'([^']*)'|"([^"]*)")`, 'i').exec(tag);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

function decodeViewLayouts(encoded: string): PortalViewConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch (error) {
    throw new QueueSourceError('parse', 'data-view-layouts ilegível', { cause: error });
  }
  if (!Array.isArray(parsed)) return [];
  const views: PortalViewConfig[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const layout = item as Record<string, unknown>;
    const configuration = (layout.Configuration ?? {}) as Record<string, unknown>;
    const secure = layout.Base64SecureConfiguration;
    if (typeof secure !== 'string' || secure.length === 0) continue;
    const columns = Array.isArray(layout.Columns)
      ? layout.Columns.map((column) => (typeof column === 'object' && column !== null ? (column as Record<string, unknown>).LogicalName : null)).filter((name): name is string => typeof name === 'string')
      : [];
    views.push({
      entityName: typeof configuration.EntityName === 'string' ? configuration.EntityName : '',
      viewId: typeof configuration.ViewId === 'string' ? configuration.ViewId : null,
      columns,
      base64SecureConfiguration: secure,
      sortExpression: typeof layout.SortExpression === 'string' ? layout.SortExpression : '',
    });
  }
  return views;
}

/** Localiza as duas listas da fila na página do portal. Lança QueueSourceError('parse') se a estrutura mudou. */
export function parsePortalPage(html: string): PortalPage {
  assertQueueAccessAllowed(html);
  let gridDataPath: string | null = null;
  const views: PortalViewConfig[] = [];
  for (const match of html.matchAll(ENTITY_GRID_TAG)) {
    const tag = match[0];
    const getUrl = attribute(tag, 'data-get-url');
    if (getUrl && /^\/_services\/entity-grid-data\.json\/[\w-]+$/i.test(getUrl)) gridDataPath = getUrl;
    const layouts = attribute(tag, 'data-view-layouts');
    if (layouts) views.push(...decodeViewLayouts(layouts));
  }
  const waitingView = views.find((view) => view.columns.includes(FECAP_FIELDS.position) && view.columns.includes(FECAP_FIELDS.ticket));
  const callsView = views.find((view) => view.columns.includes(FECAP_FIELDS.ticket) && view.columns.includes(FECAP_FIELDS.calledAt));
  if (!gridDataPath || !waitingView || !callsView) {
    throw new QueueSourceError('parse', `estrutura do portal não reconhecida (grid=${Boolean(gridDataPath)}, próximas=${Boolean(waitingView)}, chamadas=${Boolean(callsView)})`);
  }
  return { gridDataPath, waitingView, callsView };
}

/** Token anti-CSRF devolvido por /_layout/tokenhtml. */
export function parseAntiForgeryToken(html: string): string {
  const input = /<input\b[^>]*name="__RequestVerificationToken"[^>]*>/i.exec(html)?.[0];
  const value = input ? attribute(input, 'value') : null;
  if (!value) throw new QueueSourceError('parse', 'token anti-CSRF ausente', { renewSession: true });
  return value;
}

// ----------------------------------------------------------------- registros

export interface GridField {
  type: string | null;
  value: unknown;
  formatted: string | null;
  display: unknown;
}

export interface GridRecord {
  id: string | null;
  fields: Map<string, GridField>;
}

export interface GridPage {
  records: GridRecord[];
  moreRecords: boolean;
  itemCount: number | null;
}

/** Valida a resposta de entity-grid-data.json e devolve os registros em forma neutra. */
export function parseGridResponse(json: unknown): GridPage {
  assertQueueAccessAllowed(json);
  if (typeof json !== 'object' || json === null || !Array.isArray((json as Record<string, unknown>).Records)) {
    throw new QueueSourceError('parse', 'resposta da lista sem "Records"', { renewSession: true });
  }
  const body = json as { Records: unknown[]; MoreRecords?: unknown; ItemCount?: unknown };
  const records: GridRecord[] = [];
  for (const raw of body.Records) {
    if (typeof raw !== 'object' || raw === null) continue;
    const record = raw as { Id?: unknown; Attributes?: unknown };
    const fields = new Map<string, GridField>();
    if (Array.isArray(record.Attributes)) {
      for (const attr of record.Attributes) {
        if (typeof attr !== 'object' || attr === null) continue;
        const a = attr as Record<string, unknown>;
        if (typeof a.Name !== 'string') continue;
        fields.set(a.Name, {
          type: typeof a.Type === 'string' ? a.Type : null,
          value: a.Value,
          formatted: typeof a.FormattedValue === 'string' && a.FormattedValue !== '' ? a.FormattedValue : null,
          display: a.DisplayValue,
        });
      }
    }
    records.push({ id: typeof record.Id === 'string' ? record.Id : null, fields });
  }
  return {
    records,
    moreRecords: body.MoreRecords === true,
    itemCount: typeof body.ItemCount === 'number' && Number.isFinite(body.ItemCount) ? body.ItemCount : null,
  };
}

function unwrap(value: unknown): unknown {
  // OptionSetValue/EntityReference chegam como { Value: ... }
  if (typeof value === 'object' && value !== null && 'Value' in value) return (value as { Value: unknown }).Value;
  return value;
}

function textOf(field: GridField | undefined): string | null {
  if (!field) return null;
  for (const candidate of [field.display, unwrap(field.value), field.formatted]) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.replace(/\s+/g, ' ').trim();
  }
  return null;
}

function numberOf(field: GridField | undefined): number | null {
  if (!field) return null;
  for (const candidate of [unwrap(field.value), field.display, field.formatted]) {
    const parsed = typeof candidate === 'number' ? candidate : typeof candidate === 'string' ? Number(candidate.replace(',', '.').trim()) : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Datas do Dataverse: DisplayValue ISO ("2026-10-06T23:23:19Z") ou Value "/Date(1791328999000)/". */
function dateOf(field: GridField | undefined): string | null {
  if (!field) return null;
  if (typeof field.display === 'string' && !Number.isNaN(Date.parse(field.display)) && /\d{4}-\d{2}-\d{2}T/.test(field.display)) {
    return new Date(field.display).toISOString();
  }
  const raw = unwrap(field.value);
  const msDate = typeof raw === 'string' ? /\/Date\((-?\d+)(?:[+-]\d{4})?\)\//.exec(raw) : null;
  if (msDate?.[1]) return new Date(Number(msDate[1])).toISOString();
  if (typeof raw === 'string' && /\d{4}-\d{2}-\d{2}T/.test(raw) && !Number.isNaN(Date.parse(raw))) return new Date(raw).toISOString();
  return null;
}

function serviceStatusOf(field: GridField | undefined): QueueServiceStatus {
  const label = (field?.formatted ?? textOf(field) ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (label.includes('conclu') || label.includes('finaliz') || label.includes('encerr')) return 'completed';
  if (/^(em atendimento|atendimento iniciado|in service)$/.test(label)) return 'in_service';
  return 'unknown';
}

function ticketOf(record: GridRecord): string | null {
  const raw = textOf(record.fields.get(FECAP_FIELDS.ticket));
  if (!raw) return null;
  const ticket = normalizeTicket(raw);
  return isValidTicket(ticket) ? ticket : null;
}

/** Registros de "SENHAS ANTERIORES" → chamadas. Registros sem senha válida são ignorados. */
export function recordsToCalls(records: GridRecord[]): QueueCall[] {
  const calls: QueueCall[] = [];
  for (const record of records) {
    const ticket = ticketOf(record);
    if (!ticket) continue;
    calls.push({
      ticket,
      desk: textOf(record.fields.get(FECAP_FIELDS.desk)),
      calledAt: dateOf(record.fields.get(FECAP_FIELDS.calledAt)),
      serviceStatus: serviceStatusOf(record.fields.get(FECAP_FIELDS.status)),
      sourceId: record.id,
    });
  }
  return calls;
}

/** Registros de "PRÓXIMAS SENHAS" → senhas aguardando, com a posição informada pela fonte. */
export function recordsToWaiting(records: GridRecord[]): QueueWaiting[] {
  const waiting: QueueWaiting[] = [];
  records.forEach((record, index) => {
    const ticket = ticketOf(record);
    if (!ticket) return;
    const position = numberOf(record.fields.get(FECAP_FIELDS.position));
    waiting.push({ ticket, position: position !== null && position > 0 ? Math.round(position) : index + 1, sourceId: record.id });
  });
  return waiting;
}
