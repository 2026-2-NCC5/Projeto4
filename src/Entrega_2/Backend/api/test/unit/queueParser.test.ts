import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAntiForgeryToken, parseGridResponse, parsePortalPage, recordsToCalls, recordsToWaiting } from '../../src/queue/fecapParser.js';
import { buildSnapshot, currentCallsByDesk, locateTicket } from '../../src/queue/snapshot.js';
import { htmlToText, parseQueueText } from '../../src/queue/textParser.js';
import { isValidTicket, normalizeTicket, sameTicket, ticketKey } from '../../src/queue/ticket.js';
import { QueueSourceError } from '../../src/queue/types.js';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures/queue');
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name), 'utf8');
const json = (name: string) => JSON.parse(fixture(name)) as unknown;
/** 06/10/2026 20:47 em São Paulo — momento da captura das fixtures. */
const CAPTURE_NOW = new Date('2026-10-06T23:47:00.000Z');
const TZ = 'America/Sao_Paulo';
const SP_OFFSET = -180;

describe('senhas: texto, nunca número', () => {
  it('preserva zeros à esquerda e normaliza espaços/quebras de linha da fonte', () => {
    expect(normalizeTicket('0026\n')).toBe('0026');
    expect(normalizeTicket(' p 012 ')).toBe('P012');
    expect(isValidTicket('0029')).toBe(true);
    expect(isValidTicket('A-15')).toBe(true);
    expect(isValidTicket('29a')).toBe(false);
    expect(isValidTicket('')).toBe(false);
  });

  it('compara pela chave canônica: "29" e "0029" são a mesma senha, "P29" não', () => {
    expect(ticketKey('0029')).toBe('29');
    expect(ticketKey('0000')).toBe('0');
    expect(sameTicket('29', '0029')).toBe(true);
    expect(sameTicket('P0029', '0029')).toBe(false);
  });
});

describe('portal FECAP (Power Pages): estrutura e JSON das listas', () => {
  it('encontra as listas pelas COLUNAS, não pela posição no HTML', () => {
    const page = parsePortalPage(fixture('fecap-portal-page.html'));
    expect(page.gridDataPath).toBe('/_services/entity-grid-data.json/1ff6bf57-24c6-426e-b77c-55df2d243e84');
    expect(page.waitingView.columns).toEqual(['fecap_posicaonafilapresencial', 'fecap_senhanopresencial']);
    expect(page.waitingView.base64SecureConfiguration).toBe('FIXTURE-SECURE-CONFIG-WAITING');
    expect(page.waitingView.sortExpression).toBe('fecap_posicaonafilapresencial ASC');
    expect(page.callsView.columns).toContain('fecap_mesaasa_porextenso');
    expect(page.callsView.base64SecureConfiguration).toBe('FIXTURE-SECURE-CONFIG-CALLS');
  });

  it('mudança de estrutura (listas ausentes) vira erro de parser, não fila vazia', () => {
    expect(() => parsePortalPage('<html><body><p>ÚLTIMA SENHA</p></body></html>')).toThrow(QueueSourceError);
    try {
      parsePortalPage('<div class="entity-grid" data-get-url="/_services/entity-grid-data.json/abc"></div>');
    } catch (error) {
      expect((error as QueueSourceError).kind).toBe('parse');
    }
  });

  it('lê o token anti-CSRF; sem token pede nova sessão', () => {
    expect(parseAntiForgeryToken(fixture('fecap-tokenhtml.html'))).toBe('FIXTURE-ANTIFORGERY-TOKEN');
    expect(() => parseAntiForgeryToken('<html></html>')).toThrow(expect.objectContaining({ renewSession: true }));
  });

  it('SENHAS ANTERIORES (resposta real): senha como string, mesa, horário UTC e situação do atendimento', () => {
    const page = parseGridResponse(json('fecap-grid-calls.json'));
    expect(page.itemCount).toBe(27);
    expect(page.moreRecords).toBe(true);
    const calls = recordsToCalls(page.records);
    expect(calls.slice(0, 4)).toEqual([
      { ticket: '0026', desk: 'Mesa 03', calledAt: '2026-10-06T23:23:19.000Z', serviceStatus: 'in_service', sourceId: '16835784-dcc1-f111-aaaf-000d3a88fcb9' },
      { ticket: '0025', desk: 'Mesa 03', calledAt: '2026-10-06T23:23:09.000Z', serviceStatus: 'completed', sourceId: '98a44c6a-dbc1-f111-aaaf-7ced8da88e4d' },
      { ticket: '0024', desk: 'Mesa 01', calledAt: '2026-10-06T23:07:57.000Z', serviceStatus: 'in_service', sourceId: '2f1d6e1f-d8c1-f111-a05a-002248dea911' },
      { ticket: '0023', desk: 'Mesa 01', calledAt: '2026-10-06T23:04:05.000Z', serviceStatus: 'in_service', sourceId: '199aeb2d-d5c1-f111-a05a-002248dea911' },
    ]);
    expect(calls).toHaveLength(10);
    expect(calls.every((call) => /^\d{4}$/.test(call.ticket))).toBe(true);
  });

  it('PRÓXIMAS SENHAS: posição informada pela fonte; lista vazia real é aceita', () => {
    const waiting = recordsToWaiting(parseGridResponse(json('fecap-grid-waiting.json')).records);
    expect(waiting.map((item) => [item.position, item.ticket])).toEqual([[1, '0027'], [2, '0028'], [3, '0029'], [4, '0030']]);
    const empty = parseGridResponse(json('fecap-grid-waiting-empty.json'));
    expect(empty.records).toEqual([]);
    expect(empty.moreRecords).toBe(false);
  });

  it('resposta sem "Records" é erro de parser e pede nova sessão', () => {
    expect(() => parseGridResponse({ error: 'denied' })).toThrow(expect.objectContaining({ kind: 'parse', renewSession: true }));
  });

  it('datas no formato /Date(ms)/ quando não há DisplayValue ISO', () => {
    const calls = recordsToCalls(
      parseGridResponse({
        Records: [
          {
            Id: 'x',
            Attributes: [
              { Name: 'fecap_senhanopresencial', Value: '0031' },
              { Name: 'fecap_datadeatribuicao', Value: '/Date(1791328999000)/', DisplayValue: null },
            ],
          },
        ],
      }).records,
    );
    expect(calls[0]).toMatchObject({ ticket: '0031', desk: null, calledAt: '2026-10-06T23:23:19.000Z', serviceStatus: 'unknown' });
  });
});

describe('snapshot: posição pela lista real e várias mesas', () => {
  const snapshot = () =>
    buildSnapshot({
      provider: 'test',
      calls: recordsToCalls(parseGridResponse(json('fecap-grid-calls.json')).records),
      upcoming: recordsToWaiting(parseGridResponse(json('fecap-grid-waiting.json')).records),
      upcomingComplete: true,
      callsTotal: 27,
      now: CAPTURE_NOW,
      timeZone: TZ,
    });

  it('fila aberta, chamada mais recente primeiro e última chamada por mesa', () => {
    const snap = snapshot();
    expect(snap.status).toBe('open');
    expect(snap.sourceUpdatedAt).toBe('2026-10-06T23:23:19.000Z');
    expect(currentCallsByDesk(snap).map((call) => `${call.ticket} ${call.desk}`)).toEqual(['0026 Mesa 03', '0024 Mesa 01']);
  });

  it('pessoas à frente = senhas antes na lista (sem subtrair números)', () => {
    const snap = snapshot();
    expect(locateTicket(snap, '0029')).toEqual({ kind: 'waiting', position: 3, ahead: 2 });
    expect(locateTicket(snap, '29')).toEqual({ kind: 'waiting', position: 3, ahead: 2 });
    expect(locateTicket(snap, '0026')).toMatchObject({ kind: 'called', call: { desk: 'Mesa 03' } });
    // 0031 não está em nenhuma lista: posição desconhecida (não "5 = 31 - 26")
    expect(locateTicket(snap, '0031')).toEqual({ kind: 'not_found' });
  });

  it('PRÓXIMAS SENHAS vazia com chamadas no dia continua "open" (não é fila encerrada)', () => {
    const snap = buildSnapshot({ provider: 'test', calls: snapshot().calls, upcoming: [], upcomingComplete: true, callsTotal: null, now: CAPTURE_NOW, timeZone: TZ });
    expect(snap.status).toBe('open');
  });

  it('chamadas de outro dia são descartadas (senhas recomeçam a cada dia)', () => {
    const nextDay = new Date('2026-10-07T13:00:00.000Z');
    const snap = buildSnapshot({ provider: 'test', calls: snapshot().calls, upcoming: [], upcomingComplete: true, callsTotal: null, now: nextDay, timeZone: TZ });
    expect(snap.calls).toEqual([]);
    expect(snap.status).toBe('empty');
  });
});

describe('parser de texto/HTML do painel (fallback)', () => {
  const PANEL = `
ÚLTIMA SENHA
0026
Mesa 03
0025
Mesa 03
0024
Mesa 01
0023
Mesa 01
PRÓXIMAS SENHAS
Posição Senha
1 0027
2 0028
3 0029
SENHAS ANTERIORES
Senha Mesa Hora de Chamada
0026 Mesa 03 06/10/2026 20:23
0025 Mesa 03 06/10/2026 20:23
`;

  it('fila normal com várias mesas: chamadas, mesas, horário e próximas senhas', () => {
    const parsed = parseQueueText(PANEL, { timezoneOffsetMinutes: SP_OFFSET });
    expect(parsed.calls.map((call) => [call.ticket, call.desk])).toEqual([['0026', 'Mesa 03'], ['0025', 'Mesa 03'], ['0024', 'Mesa 01'], ['0023', 'Mesa 01']]);
    expect(parsed.calls[0]?.calledAt).toBe('2026-10-06T23:23:00.000Z');
    expect(parsed.upcoming).toEqual([
      { ticket: '0027', position: 1, sourceId: null },
      { ticket: '0028', position: 2, sourceId: null },
      { ticket: '0029', position: 3, sourceId: null },
    ]);
  });

  it('sem próximas senhas ("Não há registros a serem exibidos.")', () => {
    const parsed = parseQueueText('ÚLTIMA SENHA\n0026\nMesa 03\nPRÓXIMAS SENHAS\nPosição\nSenha\nNão há registros a serem exibidos.\n', { timezoneOffsetMinutes: SP_OFFSET });
    expect(parsed.calls).toHaveLength(1);
    expect(parsed.upcoming).toEqual([]);
    expect(parsed.upcomingSectionFound).toBe(true);
  });

  it('chamada sem mesa: mesa fica null (nunca inventada)', () => {
    const parsed = parseQueueText('ÚLTIMA SENHA\n0026\n0025\nMesa 01', { timezoneOffsetMinutes: SP_OFFSET });
    expect(parsed.calls).toEqual([
      { ticket: '0026', desk: null, calledAt: null, serviceStatus: 'unknown', sourceId: null },
      { ticket: '0025', desk: 'Mesa 01', calledAt: null, serviceStatus: 'unknown', sourceId: null },
    ]);
  });

  it('próximas senhas em linhas separadas (posição e senha em linhas diferentes)', () => {
    const parsed = parseQueueText('PRÓXIMAS SENHAS\nPosição\nSenha\n1\n0027\n2\n0028', { timezoneOffsetMinutes: SP_OFFSET });
    expect(parsed.upcoming.map((item) => item.ticket)).toEqual(['0027', '0028']);
  });

  it('HTML vazio ou estrutura diferente → erro (nunca "fila vazia")', () => {
    expect(() => parseQueueText(htmlToText(''), { timezoneOffsetMinutes: SP_OFFSET })).toThrow(QueueSourceError);
    expect(() => parseQueueText('Página em manutenção', { timezoneOffsetMinutes: SP_OFFSET })).toThrow(QueueSourceError);
  });

  it('a página real (listas renderizadas no navegador) NÃO é lida como fila vazia', () => {
    const text = htmlToText(fixture('fecap-portal-page.html'));
    expect(text).toContain('ÚLTIMA SENHA');
    expect(text).toContain('Não há registros a serem exibidos.');
    expect(() => parseQueueText(text, { timezoneOffsetMinutes: SP_OFFSET })).toThrow(/nenhuma senha/);
  });

  it('htmlToText remove scripts, entidades e caracteres de largura zero', () => {
    const text = htmlToText('<p>&#8203;<b>&#218;LTIMA SENHA</b></p><script>var x = "0099";</script><div>0026</div><div>Mesa&nbsp;03</div>');
    expect(text.split('\n')).toEqual(['ÚLTIMA SENHA', '0026', 'Mesa 03']);
  });
});
