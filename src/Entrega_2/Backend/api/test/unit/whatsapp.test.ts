import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { logEntryForEvent, logEntryForMessage } from '../../src/support/realtime/canonical.js';
import { decodeFeedCursor, encodeFeedCursor } from '../../src/support/realtime/feedService.js';
import { canTransition, STAFF_TRANSITIONS } from '../../src/support/statuses.js';
import { event } from '../../src/support/supportService.js';
import { maskPhone, normalizePhone, parseContact, sendTargetJid } from '../../src/support/whatsapp/contactRef.js';
import { ContactVault } from '../../src/support/whatsapp/contactVault.js';
import { canAdvanceDelivery, canForceDelivery, nextAttemptDelayMs } from '../../src/support/whatsapp/delivery.js';
import { sniffAllowedType } from '../../src/support/whatsapp/ingestService.js';
import { WebhookSchemaError } from '../../src/support/whatsapp/provider.js';
import { FakeProvider } from '../../src/support/whatsapp/providers/fakeProvider.js';
import { MetaCloudProvider } from '../../src/support/whatsapp/providers/metaCloudProvider.js';
import { WaAkgProvider } from '../../src/support/whatsapp/providers/waAkgProvider.js';
import type { WhatsAppRepository } from '../../src/support/whatsapp/repository.js';
import * as meta from '../fixtures/whatsapp/meta.js';
import * as waAkg from '../fixtures/whatsapp/waAkg.js';

const NOW = new Date('2026-11-02T18:06:10.000Z');
const SECRET = 'segredo-de-teste-do-webhook-0123456789';
const channel = { channelId: '11111111-2222-3333-4444-555555555555', externalSessionId: waAkg.SESSION };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function waProvider(fetchImpl: typeof fetch = vi.fn() as unknown as typeof fetch, publicBaseUrl: string | null = 'https://api.exemplo.test') {
  return new WaAkgProvider({ baseUrl: 'http://gateway.interno:3000/', apiKey: 'chave-gateway', webhookSecret: SECRET, timeoutMs: 1000, publicBaseUrl, fetch: fetchImpl, now: () => NOW });
}

function metaProvider(fetchImpl: typeof fetch = vi.fn() as unknown as typeof fetch) {
  return new MetaCloudProvider({ graphApiVersion: 'v26.0', accessToken: 'token-meta', phoneNumberId: meta.PHONE_NUMBER_ID, verifyToken: 'token-verificacao', appSecret: SECRET, timeoutMs: 1000, fetch: fetchImpl, now: () => NOW });
}

const signed = (raw: Buffer) => `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;

describe('identificadores do WhatsApp', () => {
  it('normaliza telefone, JID com dispositivo, c.us e LID', () => {
    expect(normalizePhone('+55 (11) 99999-0000')).toBe('+5511999990000');
    expect(parseContact('5511999990000:12@s.whatsapp.net')).toMatchObject({ kind: 'phone', value: '+5511999990000' });
    expect(parseContact('5511999990000@c.us')).toMatchObject({ kind: 'phone', value: '+5511999990000' });
    expect(parseContact('123456789012345:7@lid')).toMatchObject({ kind: 'lid', value: 'lid:123456789012345' });
  });

  it('recusa grupos, listas, status, canais e lixo', () => {
    for (const jid of ['120363@g.us', '123@broadcast', 'status@broadcast', '123@newsletter', 'abc', '', '@lid', '12@lid', '123@desconhecido']) expect(parseContact(jid)).toBeNull();
  });

  it('nunca mostra o identificador inteiro e reconstrói o destino de envio', () => {
    expect(maskPhone('+5511999990000')).toBe('+55 •••• 0000');
    const lid = parseContact('123456789012345@lid')!;
    expect(lid.masked).not.toContain('123456789012345');
    expect(sendTargetJid('+5511999990000')).toBe('5511999990000@s.whatsapp.net');
    expect(sendTargetJid('lid:123456789012345')).toBe('123456789012345@lid');
  });
});

describe('cofre de contatos', () => {
  const vault = new ContactVault('chave-de-teste-com-mais-de-trinta-e-dois-caracteres');

  it('cifra com IV aleatório e decifra; correlaciona pela impressão digital', () => {
    const a = vault.encrypt('+5511999990000');
    const b = vault.encrypt('+5511999990000');
    expect(a).not.toBe(b);
    expect(a).not.toContain('5511999990000');
    expect(vault.decrypt(a)).toBe('+5511999990000');
    expect(vault.fingerprint('+5511999990000')).toBe(vault.fingerprint('+5511999990000'));
    expect(vault.fingerprint('+5511999990000')).not.toBe(vault.fingerprint('+5511999990001'));
  });

  it('rejeita cifra adulterada e chave errada', () => {
    const token = vault.encrypt('+5511999990000');
    const tampered = `${token.slice(0, -2)}${token.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(() => vault.decrypt(tampered)).toThrow();
    expect(() => new ContactVault('outra-chave-de-teste-com-mais-de-trinta-e-dois').decrypt(token)).toThrow();
  });

  it('chaves independentes: impressão digital não serve de hash de código', () => {
    expect(vault.fingerprint('ABC')).not.toBe(vault.codeHash('ABC'));
  });
});

describe('estado de entrega só avança', () => {
  it('confirmações fora de ordem não recuam', () => {
    expect(canAdvanceDelivery('delivered', 'sent')).toBe(false);
    expect(canAdvanceDelivery('read', 'delivered')).toBe(false);
    expect(canAdvanceDelivery('read', 'failed')).toBe(false);
    expect(canAdvanceDelivery('delivered', 'failed')).toBe(false);
    expect(canAdvanceDelivery('sent', 'sent')).toBe(false);
    expect(canAdvanceDelivery('queued', 'sending')).toBe(true);
    expect(canAdvanceDelivery('sending', 'sent')).toBe(true);
    expect(canAdvanceDelivery('sent', 'delivered')).toBe(true);
    expect(canAdvanceDelivery('delivered', 'read')).toBe(true);
    expect(canAdvanceDelivery('sent', 'failed')).toBe(true);
  });

  it('resultado desconhecido aceita confirmação real do provedor (reconciliação), mas não volta para a fila', () => {
    expect(canAdvanceDelivery('unknown', 'delivered')).toBe(true);
    expect(canAdvanceDelivery('unknown', 'failed')).toBe(true);
    expect(canAdvanceDelivery('unknown', 'queued')).toBe(false);
    expect(canAdvanceDelivery('failed', 'delivered')).toBe(true);
    expect(canAdvanceDelivery('not_applicable', 'sent')).toBe(false);
  });

  it('a própria fila nunca desfaz o que o provedor já confirmou', () => {
    for (const confirmed of ['sent', 'delivered', 'read'] as const) {
      expect(canForceDelivery(confirmed, 'unknown')).toBe(false);
      expect(canForceDelivery(confirmed, 'failed')).toBe(false);
      expect(canForceDelivery(confirmed, 'queued')).toBe(false);
    }
    expect(canForceDelivery('sending', 'unknown')).toBe(true);
    expect(canForceDelivery('sending', 'queued')).toBe(true);
    expect(canForceDelivery('failed', 'queued')).toBe(true);
    expect(canForceDelivery('unknown', 'queued')).toBe(true);
    expect(canForceDelivery('unknown', 'failed')).toBe(true);
  });

  it('espera cresce com variação e tem teto', () => {
    expect(nextAttemptDelayMs(1, () => 0.5)).toBe(5000);
    expect(nextAttemptDelayMs(3, () => 0.5)).toBe(20_000);
    expect(nextAttemptDelayMs(50, () => 0.5)).toBe(300_000);
    expect(nextAttemptDelayMs(1, () => 0)).toBe(4000);
    expect(nextAttemptDelayMs(1, () => 1)).toBe(6000);
  });
});

describe('máquina de estados do chamado', () => {
  it('encerrados não mudam e resolvido só encerra', () => {
    expect(STAFF_TRANSITIONS.closed).toEqual([]);
    expect(STAFF_TRANSITIONS.cancelled).toEqual([]);
    expect(STAFF_TRANSITIONS.resolved).toEqual(['closed']);
    expect(canTransition('resolved', 'in_progress')).toBe(false);
    expect(canTransition('closed', 'in_progress')).toBe(false);
    expect(canTransition('received', 'in_progress')).toBe(true);
    expect(canTransition('waiting_student', 'in_analysis')).toBe(true);
  });

  it('nenhuma transição direta leva a aguardando estudante ou resolvido: têm ação própria', () => {
    for (const targets of Object.values(STAFF_TRANSITIONS)) {
      expect(targets).not.toContain('waiting_student');
      expect(targets).not.toContain('resolved');
    }
  });
});

describe('eventos canônicos não levam conteúdo', () => {
  it('nota interna é só da equipe e sem texto', () => {
    const entry = logEntryForEvent(event({ type: 'internal_note', visibility: 'internal', title: 'Nota interna', description: 'CONTEÚDO SECRETO', actorType: 'agent', details: [{ label: 'x', value: 'DETALHE SECRETO' }] }))!;
    expect(entry.audience).toBe('STAFF_ONLY');
    expect(JSON.stringify(entry)).not.toContain('SECRETO');
  });

  it('mudança pública de situação tem rótulo público; descrição nunca entra', () => {
    const entry = logEntryForEvent(event({ type: 'status_changed', title: 'Em andamento', description: 'detalhe', actorType: 'agent', fromStatus: 'triage', toStatus: 'in_progress' }))!;
    expect(entry).toMatchObject({ type: 'support.ticket.status_changed', audience: 'STUDENT_VISIBLE', data: { from: 'triage', to: 'in_progress', publicLabel: 'Em atendimento' } });
    expect(JSON.stringify(entry)).not.toContain('detalhe');
  });

  it('mensagem gera evento só com identificador; WhatsApp sem espelhamento fica com a equipe', () => {
    const base = { id: 'm1', senderType: 'contact' as const, senderUserId: null, senderName: 'Fulano', content: 'TEXTO DA MENSAGEM', clientMessageId: null };
    const staffOnly = logEntryForMessage({ ...base, transportFields: { transport: 'whatsapp', studentVisible: false } });
    expect(staffOnly.audience).toBe('STAFF_ONLY');
    expect(JSON.stringify(staffOnly)).not.toContain('TEXTO');
    expect(JSON.stringify(staffOnly)).not.toContain('Fulano');
    expect(logEntryForMessage(base).audience).toBe('STUDENT_VISIBLE');
    expect(logEntryForEvent(event({ type: 'message_received', title: 'x', actorType: 'agent' }))).toBeNull();
  });

  it('cursor do feed: ida e volta; lixo é recusado', () => {
    expect(decodeFeedCursor(encodeFeedCursor({ txId: '18446744073709551000', id: '42' }))).toEqual({ txId: '18446744073709551000', id: '42' });
    expect(() => decodeFeedCursor(Buffer.from("1; drop table x").toString('base64url'))).toThrow();
    expect(() => decodeFeedCursor('lixo')).toThrow();
    // fora dos limites de xid8 e bigint: erro de validação, não erro do banco
    expect(() => decodeFeedCursor(Buffer.from('99999999999999999999.0').toString('base64url'))).toThrow();
    expect(() => decodeFeedCursor(Buffer.from('1.9999999999999999999').toString('base64url'))).toThrow();
  });
});

describe('tipo do arquivo vem do conteúdo', () => {
  it('reconhece PDF/PNG e recusa executável com nome de PDF e ZIP qualquer', () => {
    expect(sniffAllowedType(Buffer.from('%PDF-1.4 teste'), 'x.exe')).toBe('application/pdf');
    expect(sniffAllowedType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), null)).toBe('image/png');
    expect(sniffAllowedType(Buffer.from('MZ\x90\x00'), 'documento.pdf')).toBeNull();
    expect(sniffAllowedType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]), 'pacote.zip')).toBeNull();
    expect(sniffAllowedType(Buffer.from('<html><script>alert(1)</script>'), 'pagina.html')).toBeNull();
  });
});

describe('WaAkgProvider: webhook (payloads da revisão fixada)', () => {
  const provider = waProvider();

  it('assinatura sobre os bytes crus; timestamp antigo, futuro ou adulteração são recusados', async () => {
    const raw = Buffer.from(JSON.stringify(waAkg.statusEvent('READ')));
    expect(await provider.verifyWebhook({ rawBody: raw, headers: { 'x-webhook-signature': signed(raw) } })).toBe(true);
    expect(await provider.verifyWebhook({ rawBody: raw, headers: {} })).toBe(false);
    expect(await provider.verifyWebhook({ rawBody: raw, headers: { 'x-webhook-signature': 'sha256=abcd' } })).toBe(false);
    expect(await provider.verifyWebhook({ rawBody: Buffer.from(`${raw.toString()} `), headers: { 'x-webhook-signature': signed(raw) } })).toBe(false);
    const old = Buffer.from(JSON.stringify({ ...waAkg.statusEvent('READ'), timestamp: '2026-11-02T17:00:00.000Z' }));
    expect(await provider.verifyWebhook({ rawBody: old, headers: { 'x-webhook-signature': signed(old) } })).toBe(false);
    const future = Buffer.from(JSON.stringify({ ...waAkg.statusEvent('READ'), timestamp: '2026-11-02T19:00:00.000Z' }));
    expect(await provider.verifyWebhook({ rawBody: future, headers: { 'x-webhook-signature': signed(future) } })).toBe(false);
  });

  it('mensagem de texto vira evento canônico com telefone de `from`', async () => {
    const [item] = await provider.normalizeInboundWebhook(waAkg.inboundText, channel);
    expect(item).toMatchObject({ kind: 'message', providerEventId: 'msg:3EB0A1B2C3D4E5F60718', externalMessageId: '3EB0A1B2C3D4E5F60718', contentKind: 'text', text: 'Oi, preciso de ajuda com a matrícula', displayName: 'Aluno Teste', from: { kind: 'phone', value: '+5511999990000' } });
    expect(item!.kind === 'message' && item!.timestamp.toISOString()).toBe(new Date(1793642400000).toISOString());
  });

  it('mídia carrega só a referência do gateway; contato só com LID é aceito sem inventar telefone', async () => {
    const [media] = await provider.normalizeInboundWebhook(waAkg.inboundMedia, channel);
    expect(media).toMatchObject({ contentKind: 'image', text: 'Comprovante', media: { ref: '/api/media/asa_pilot-3EB0F00DBABE00112233.jpeg' } });
    const [doc] = await provider.normalizeInboundWebhook(waAkg.inboundDocument, channel);
    expect(doc).toMatchObject({ contentKind: 'document', text: null, media: { fileName: 'historico.pdf' } });
    const [lid] = await provider.normalizeInboundWebhook(waAkg.inboundFromLid, channel);
    expect(lid).toMatchObject({ from: { kind: 'lid', value: 'lid:123456789012345' } });
  });

  it('grupo, mensagem própria, teste, sent e sessão errada não entram; tipo desconhecido não é descartado', async () => {
    expect(await provider.normalizeInboundWebhook(waAkg.inboundGroup, channel)).toEqual([]);
    expect(await provider.normalizeInboundWebhook(waAkg.outboundSent, channel)).toEqual([]);
    expect(await provider.normalizeInboundWebhook(waAkg.testEvent, channel)).toEqual([]);
    expect(await provider.normalizeInboundWebhook({ ...waAkg.inboundText, data: { ...waAkg.inboundText.data, key: { ...waAkg.inboundText.data.key, fromMe: true } } }, channel)).toEqual([]);
    await expect(provider.normalizeInboundWebhook({ ...waAkg.inboundText, sessionId: 'outra' }, channel)).rejects.toBeInstanceOf(WebhookSchemaError);
    await expect(provider.normalizeInboundWebhook({ nada: true }, channel)).rejects.toBeInstanceOf(WebhookSchemaError);
    const [unknown] = await provider.normalizeInboundWebhook(waAkg.inboundUnknownType, channel);
    expect(unknown).toMatchObject({ contentKind: 'unsupported', text: null });
  });

  it('mapa de status deslocado do gateway: READ nunca vira "lida"; PENDING não conclui nada', async () => {
    expect(await provider.normalizeInboundWebhook(waAkg.statusEvent('SENT'), channel)).toMatchObject([{ state: 'sent' }]);
    expect(await provider.normalizeInboundWebhook(waAkg.statusEvent('DELIVERED'), channel)).toMatchObject([{ state: 'sent' }]);
    expect(await provider.normalizeInboundWebhook(waAkg.statusEvent('READ'), channel)).toMatchObject([{ state: 'delivered' }]);
    expect(await provider.normalizeInboundWebhook(waAkg.statusEvent('PENDING'), channel)).toEqual([]);
  });
});

describe('WaAkgProvider: envio', () => {
  const message = { channelId: channel.channelId, recipient: '+5511999990000', text: 'Olá', idempotencyKey: 'k1' };

  it('POST na rota /send com JID completo e cabeçalho da chave; devolve o id do provedor', async () => {
    const fetchImpl = vi.fn(async () => json({ status: true, data: { key: { id: 'ABC' } } }));
    const result = await waProvider(fetchImpl as unknown as typeof fetch).sendMessage(channel, { ...message, replyToProviderMessageId: 'Q1' });
    expect(result).toEqual({ accepted: true, providerState: 'ACKNOWLEDGED', providerMessageId: 'ABC' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://gateway.interno:3000/api/messages/asa_pilot/5511999990000%40s.whatsapp.net/send');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('chave-gateway');
    expect(JSON.parse(String(init.body))).toEqual({ message: { text: 'Olá' }, quotedMessageId: 'Q1' });
  });

  it('classifica: timeout e 500 genérico são ambíguos; sessão desconectada e recusa de conexão podem repetir; 4xx é definitivo', async () => {
    const send = (impl: () => Promise<Response>) => waProvider(impl as unknown as typeof fetch).sendMessage(channel, message);
    expect(await send(async () => { throw new DOMException('timeout', 'TimeoutError'); })).toMatchObject({ providerState: 'UNKNOWN', errorCode: 'gateway_timeout' });
    expect(await send(async () => json({ status: false, message: 'erro inesperado' }, 500))).toMatchObject({ providerState: 'UNKNOWN', errorCode: 'gateway_http_500' });
    expect(await send(async () => json({ status: false, message: 'WhatsApp session is disconnected or not found' }, 500))).toMatchObject({ providerState: 'RETRYABLE', errorCode: 'channel_disconnected' });
    expect(await send(async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); })).toMatchObject({ providerState: 'RETRYABLE', errorCode: 'gateway_unreachable' });
    // queda no meio da conexão: o gateway pode já ter enviado, e não tem idempotência
    expect(await send(async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }); })).toMatchObject({ providerState: 'UNKNOWN' });
    expect(await send(async () => json({ error: 'Invalid API key' }, 401))).toMatchObject({ providerState: 'REJECTED', errorCode: 'gateway_auth_failed' });
    expect(await send(async () => json({ status: false }, 400))).toMatchObject({ providerState: 'REJECTED', errorCode: 'gateway_http_400' });
    expect(await send(async () => json({ status: true, data: {} }))).toMatchObject({ providerState: 'UNKNOWN', errorCode: 'gateway_no_message_id' });
  });
});

describe('WaAkgProvider: sessão e mídia', () => {
  const routed = (routes: Record<string, () => Response>) => {
    const calls: string[] = [];
    const impl = vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(url).replace('http://gateway.interno:3000', '')}`;
      calls.push(key);
      const route = routes[key];
      if (!route) throw new Error(`rota inesperada: ${key}`);
      return route();
    });
    return { impl: impl as unknown as typeof fetch, calls };
  };

  it('estado da sessão: mapeia vocabulário; nunca lê QR ou segredo; erro de rede não vira "conectado"', async () => {
    const session = (status: string) => ({ 'GET /api/sessions/asa_pilot': () => json({ data: { status, qr: 'QR-SECRETO', secret: 'S', me: { id: '5511888880000:3@s.whatsapp.net' } } }) });
    expect(await waProvider(routed(session('CONNECTED')).impl).getConnectionStatus(channel)).toEqual({ status: 'CONNECTED', maskedNumber: '+55 •••• 0000', errorCode: null });
    expect((await waProvider(routed(session('SCAN_QR')).impl).getConnectionStatus(channel)).status).toBe('QR_REQUIRED');
    expect(await waProvider(routed(session('LOGGED_OUT')).impl).getConnectionStatus(channel)).toMatchObject({ status: 'DISCONNECTED', errorCode: 'session_logged_out' });
    expect((await waProvider(routed(session('STATUS_NOVO')).impl).getConnectionStatus(channel)).status).toBe('ERROR');
    expect(await waProvider((async () => { throw new Error('rede'); }) as unknown as typeof fetch).getConnectionStatus(channel)).toMatchObject({ status: 'ERROR', errorCode: 'gateway_unreachable' });
    expect(await waProvider(routed({ 'GET /api/sessions/asa_pilot': () => json({}, 401) }).impl).getConnectionStatus(channel)).toMatchObject({ errorCode: 'gateway_auth_failed' });
    // CONNECTED sem socket no processo é registro velho (gateway reiniciado): não está conectado
    const stale = routed({ 'GET /api/sessions/asa_pilot': () => json({ data: { status: 'CONNECTED', hasInstance: false } }) });
    expect(await waProvider(stale.impl).getConnectionStatus(channel)).toMatchObject({ status: 'DISCONNECTED', errorCode: 'session_not_running' });
  });

  it('conectar: cria sessão, registra webhook assinado uma vez, inicia e devolve o QR; não reinicia sessão ativa', async () => {
    const { impl, calls } = routed({
      'GET /api/sessions/asa_pilot': () => json({ error: 'x' }, 404),
      'POST /api/sessions': () => json({ data: { status: 'STOPPED' } }),
      'GET /api/webhooks/asa_pilot': () => json({ data: [] }),
      'POST /api/webhooks/asa_pilot': () => json({ data: {} }),
      'POST /api/sessions/asa_pilot/start': () => json({}),
      'GET /api/sessions/asa_pilot/qr': () => json({ success: true, base64: 'data:image/png;base64,AAAA' }),
    });
    const result = await waProvider(impl).connect(channel);
    expect(result).toMatchObject({ action: 'qr', status: 'QR_REQUIRED', qr: { format: 'image_data_url', value: 'data:image/png;base64,AAAA' } });
    expect(calls).toContain('POST /api/webhooks/asa_pilot');
    const webhookCall = (impl as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls.find(([url, init]) => String(url).endsWith('/api/webhooks/asa_pilot') && init.method === 'POST')!;
    expect(JSON.parse(String(webhookCall[1].body))).toMatchObject({ secret: SECRET, url: `https://api.exemplo.test/api/internal/webhooks/wa-akg/${channel.channelId}`, events: ['message.received', 'message.status'] });

    // sessão já ativa: não reinicia, mas garante o webhook (ela pode ter sido criada direto no gateway)
    const active = routed({ 'GET /api/sessions/asa_pilot': () => json({ data: { status: 'CONNECTED', hasInstance: true } }), 'GET /api/webhooks/asa_pilot': () => json({ data: [] }), 'POST /api/webhooks/asa_pilot': () => json({ data: {} }) });
    expect(await waProvider(active.impl).connect(channel)).toMatchObject({ action: 'none', status: 'CONNECTED' });
    expect(active.calls.some((call) => call.includes('/start'))).toBe(false);
    expect(active.calls).toContain('POST /api/webhooks/asa_pilot');

    // registro velho: CONNECTED sem socket precisa iniciar de novo
    const stale = routed({ 'GET /api/sessions/asa_pilot': () => json({ data: { status: 'CONNECTED', hasInstance: false } }), 'GET /api/webhooks/asa_pilot': () => json({ data: [] }), 'POST /api/webhooks/asa_pilot': () => json({ data: {} }), 'POST /api/sessions/asa_pilot/start': () => json({}), 'GET /api/sessions/asa_pilot/qr': () => json({}, 404) });
    expect(await waProvider(stale.impl).connect(channel)).toMatchObject({ action: 'qr', status: 'CONNECTING' });
    expect(stale.calls).toContain('POST /api/sessions/asa_pilot/start');

    const noUrl = routed({ 'GET /api/sessions/asa_pilot': () => json({ data: { status: 'STOPPED', hasInstance: false } }) });
    await expect(waProvider(noUrl.impl, null).connect(channel)).rejects.toThrow('public_base_url_missing');
  });

  it('QR ainda não gerado é informado; desconectar usa logout', async () => {
    const pending = routed({ 'GET /api/sessions/asa_pilot': () => json({ data: { status: 'SCAN_QR', hasInstance: true } }), 'GET /api/webhooks/asa_pilot': () => json({ data: [{ id: 'w1', url: `https://api.exemplo.test/api/internal/webhooks/wa-akg/${channel.channelId}` }] }), 'PUT /api/webhooks/asa_pilot/w1': () => json({}), 'GET /api/sessions/asa_pilot/qr': () => json({}, 404) });
    expect(await waProvider(pending.impl).connect(channel)).toMatchObject({ action: 'qr', status: 'CONNECTING', qr: null });
    // já registrado: não cria outro, mas reaplica o segredo, para valer depois de uma rotação
    expect(pending.calls).not.toContain('POST /api/webhooks/asa_pilot');
    expect(pending.calls).toContain('PUT /api/webhooks/asa_pilot/w1');
    const logout = routed({ 'POST /api/sessions/asa_pilot/logout': () => json({}) });
    await waProvider(logout.impl).disconnect(channel);
    expect(logout.calls).toEqual(['POST /api/sessions/asa_pilot/logout']);
  });

  it('mídia: só caminho do próprio gateway (anti-SSRF), com limite de tamanho', async () => {
    const impl = vi.fn(async () => new Response(Buffer.from('%PDF-1.4'), { headers: { 'content-type': 'application/pdf' } }));
    const provider = waProvider(impl as unknown as typeof fetch);
    const ok = await provider.fetchMedia(channel, { ref: '/api/media/asa_pilot-3EB0.pdf', mimeType: null, fileName: 'h.pdf' }, 1000);
    expect(ok?.content.toString()).toBe('%PDF-1.4');
    for (const ref of ['http://169.254.169.254/latest', 'https://evil.example/x.pdf', '/api/media/../../etc/passwd', '/api/sessions/asa_pilot', '//evil.example/x', '/api/media/a/b.pdf']) {
      expect(await provider.fetchMedia(channel, { ref, mimeType: null, fileName: null }, 1000)).toBeNull();
    }
    expect(impl).toHaveBeenCalledTimes(1);
    expect(await provider.fetchMedia(channel, { ref: '/api/media/a.pdf', mimeType: null, fileName: null }, 2)).toBeNull();
  });

  it('mídia enorme sem content-length: para de ler no limite, sem guardar tudo em memória', async () => {
    let produced = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        produced += 1024 * 1024;
        controller.enqueue(new Uint8Array(1024 * 1024));
        if (produced >= 64 * 1024 * 1024) controller.close();
      },
    });
    const impl = (async () => new Response(stream)) as unknown as typeof fetch;
    expect(await waProvider(impl).fetchMedia(channel, { ref: '/api/media/video.mp4', mimeType: null, fileName: null }, 5 * 1024 * 1024)).toBeNull();
    expect(produced).toBeLessThan(10 * 1024 * 1024);
  });

  it('a chave do gateway não acompanha redirecionamentos', async () => {
    const impl = vi.fn(async () => json({ data: { status: 'CONNECTED', hasInstance: true } }));
    await waProvider(impl as unknown as typeof fetch).getConnectionStatus(channel);
    expect((impl.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe('error');
  });

  it('reconciliação: só mensagens recebidas, a partir do canal; mesmo id do webhook (a inbox deduplica)', async () => {
    const { impl } = routed({
      'GET /api/chat/asa_pilot': () => json({ data: [{ jid: '5511999990000@s.whatsapp.net' }, { jid: '120363@g.us' }] }),
      'GET /api/chat/asa_pilot/5511999990000%40s.whatsapp.net': () =>
        json({
          data: [
            { keyId: 'ANTIGA', remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, type: 'TEXT', content: 'histórico', timestamp: '2020-01-01T00:00:00.000Z' },
            { keyId: 'PROPRIA', remoteJid: '5511999990000@s.whatsapp.net', fromMe: true, type: 'TEXT', content: 'nossa', timestamp: '2026-11-02T18:00:00.000Z' },
            { keyId: 'PERDIDA', remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, type: 'TEXT', content: 'chegou com o gateway fora', timestamp: '2026-11-02T18:00:00.000Z' },
          ],
        }),
    });
    const events = await waProvider(impl).reconcile(channel, new Date('2026-11-01T00:00:00.000Z'), { maxChats: 25 });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ providerEventId: 'msg:PERDIDA', text: 'chegou com o gateway fora' });
  });
});

describe('MetaCloudProvider (respostas simuladas no formato documentado)', () => {
  it('handshake só com o token certo', () => {
    const provider = metaProvider();
    expect(provider.verifyHandshake({ mode: 'subscribe', token: 'token-verificacao', challenge: '123' })).toBe('123');
    expect(provider.verifyHandshake({ mode: 'subscribe', token: 'errado', challenge: '123' })).toBeNull();
    expect(provider.verifyHandshake({ mode: 'outro', token: 'token-verificacao', challenge: '123' })).toBeNull();
  });

  it('assinatura X-Hub-Signature-256 sobre os bytes crus', async () => {
    const raw = Buffer.from(JSON.stringify(meta.inboundText));
    const provider = metaProvider();
    expect(await provider.verifyWebhook({ rawBody: raw, headers: { 'x-hub-signature-256': signed(raw) } })).toBe(true);
    expect(await provider.verifyWebhook({ rawBody: raw, headers: { 'x-hub-signature-256': 'sha256=00' } })).toBe(false);
    expect(await provider.verifyWebhook({ rawBody: raw, headers: {} })).toBe(false);
  });

  it('normaliza mensagem, documento e status; outro número não entra; janela vencida vira template_required', async () => {
    const provider = metaProvider();
    expect(await provider.normalizeInboundWebhook(meta.inboundText, channel)).toMatchObject([{ kind: 'message', externalMessageId: 'wamid.X1', text: 'Oi', displayName: 'Aluno Teste', from: { value: '+5511999990000' } }]);
    expect(await provider.normalizeInboundWebhook(meta.inboundDocument, channel)).toMatchObject([{ contentKind: 'document', text: 'Segue', media: { ref: 'MEDIA123', fileName: 'historico.pdf' } }]);
    expect(await provider.normalizeInboundWebhook(meta.failedStatus, channel)).toMatchObject([{ kind: 'delivery', state: 'failed', errorCode: 'template_required' }]);
    expect(await provider.normalizeInboundWebhook(meta.readStatus, channel)).toMatchObject([{ kind: 'delivery', state: 'read' }]);
    expect(await provider.normalizeInboundWebhook(meta.otherNumber, channel)).toEqual([]);
    await expect(provider.normalizeInboundWebhook({ object: 1 }, channel)).rejects.toBeInstanceOf(WebhookSchemaError);
  });

  it('envio: corpo documentado; 131047 é template_required; 429 repete; 500 e timeout são ambíguos; LID não é endereçável', async () => {
    const message = { channelId: channel.channelId, recipient: '+5511999990000', text: 'Olá', replyToProviderMessageId: 'wamid.Q', idempotencyKey: 'k' };
    const accepted = vi.fn(async () => json({ messaging_product: 'whatsapp', contacts: [{}], messages: [{ id: 'wamid.NEW' }] }));
    expect(await metaProvider(accepted as unknown as typeof fetch).sendMessage(channel, message)).toEqual({ accepted: true, providerState: 'ACKNOWLEDGED', providerMessageId: 'wamid.NEW' });
    const [url, init] = accepted.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://graph.facebook.com/v26.0/${meta.PHONE_NUMBER_ID}/messages`);
    expect(JSON.parse(String(init.body))).toMatchObject({ messaging_product: 'whatsapp', to: '+5511999990000', type: 'text', text: { body: 'Olá' }, context: { message_id: 'wamid.Q' } });
    const send = (impl: () => Promise<Response>) => metaProvider(impl as unknown as typeof fetch).sendMessage(channel, message);
    expect(await send(async () => json({ error: { code: 131047 } }, 400))).toMatchObject({ providerState: 'REJECTED', errorCode: 'template_required' });
    expect(await send(async () => json({ error: { code: 4 } }, 429))).toMatchObject({ providerState: 'RETRYABLE' });
    expect(await send(async () => json({}, 500))).toMatchObject({ providerState: 'UNKNOWN' });
    expect(await send(async () => { throw new Error('timeout'); })).toMatchObject({ providerState: 'UNKNOWN', errorCode: 'meta_timeout' });
    expect(await metaProvider().sendMessage(channel, { ...message, recipient: 'lid:123' })).toMatchObject({ providerState: 'REJECTED', errorCode: 'recipient_not_addressable' });
  });

  it('mídia: só segue URL https de host da Meta, sem redirecionar', async () => {
    const download = vi.fn(async (url: unknown) => (String(url).includes('MEDIA') ? json({ url: 'https://lookaside.fbsbx.com/whatsapp/x', mime_type: 'application/pdf', file_size: 8 }) : new Response(Buffer.from('%PDF-1.4'))));
    const ok = await metaProvider(download as unknown as typeof fetch).fetchMedia(channel, { ref: 'MEDIA123', mimeType: null, fileName: 'h.pdf' }, 100);
    expect(ok?.content.toString()).toBe('%PDF-1.4');
    expect((download.mock.calls[1] as unknown as [URL, RequestInit])[1].redirect).toBe('error');
    const evil = (async () => json({ url: 'https://evil.example/x', mime_type: 'application/pdf' })) as unknown as typeof fetch;
    expect(await metaProvider(evil).fetchMedia(channel, { ref: 'MEDIA123', mimeType: null, fileName: null }, 100)).toBeNull();
    const metadata = (async () => json({ url: 'http://169.254.169.254/x' })) as unknown as typeof fetch;
    expect(await metaProvider(metadata).fetchMedia(channel, { ref: 'MEDIA123', mimeType: null, fileName: null }, 100)).toBeNull();
    expect(await metaProvider().fetchMedia(channel, { ref: '../evil', mimeType: null, fileName: null }, 100)).toBeNull();
  });
});

describe('MetaCloudProvider: conexão', () => {
  it('conectar confere as credenciais; sem elas, orienta a configuração externa', async () => {
    const ok = (async () => json({ display_phone_number: '+55 11 88888-0000' })) as unknown as typeof fetch;
    expect(await metaProvider(ok).connect(channel)).toMatchObject({ action: 'none', status: 'CONNECTED' });
    const denied = (async () => json({}, 401)) as unknown as typeof fetch;
    expect(await metaProvider(denied).connect(channel)).toMatchObject({ action: 'external-setup', status: 'ERROR' });
  });
});

describe('FakeProvider: só dados sintéticos', () => {
  it('recusa número real no simulador', async () => {
    const provider = new FakeProvider({} as WhatsAppRepository, SECRET, () => NOW);
    const event = (from: string) => ({ events: [{ kind: 'message', providerEventId: 'a', externalMessageId: 'a', from, displayName: null, timestamp: NOW.toISOString(), contentKind: 'text', text: 'x', mediaRef: null }] });
    await expect(provider.normalizeInboundWebhook(event('+5511999990000'), channel)).rejects.toBeInstanceOf(WebhookSchemaError);
    expect(await provider.normalizeInboundWebhook(event('+99900000002'), channel)).toHaveLength(1);
  });
});

describe('configuração do canal', () => {
  const base = { NODE_ENV: 'test', JWT_SECRET: 'test-secret-not-for-production-0123456789', LOG_LEVEL: 'silent', ASA_QUEUE_PROVIDER: 'mock' };

  it('sem provedor o atendimento funciona sem WhatsApp', () => {
    expect(loadConfig(base).whatsapp).toMatchObject({ provider: null, demoMode: false, outboundEnabled: false });
  });

  it('fake nunca roda em produção', () => {
    expect(() => loadConfig({ ...base, APP_ENV: 'production', ASA_WHATSAPP_PROVIDER: 'fake' })).toThrow('nunca é permitido em produção');
    expect(loadConfig({ ...base, ASA_WHATSAPP_PROVIDER: 'fake' }).whatsapp).toMatchObject({ provider: 'fake', demoMode: true });
  });

  it('provedor real sem segredo fica desligado com o motivo, sem derrubar a API e sem expor valores', () => {
    const config = loadConfig({ ...base, ASA_WHATSAPP_PROVIDER: 'wa-akg', ASA_WA_AKG_BASE_URL: 'http://gateway:3000', ASA_WA_AKG_API_KEY: 'VALOR-SECRETO' }).whatsapp;
    expect(config.provider).toBeNull();
    expect(config.disabledReason).toContain('ASA_WHATSAPP_PII_KEY');
    expect(config.disabledReason).not.toContain('VALOR-SECRETO');
    expect(loadConfig({ ...base, ASA_WHATSAPP_PROVIDER: 'meta-cloud-api' }).whatsapp.disabledReason).toContain('ASA_META_ACCESS_TOKEN');
  });

  it('travas de envio e sessão começam desligadas nos provedores reais', () => {
    const config = loadConfig({ ...base, ASA_WHATSAPP_PROVIDER: 'wa-akg', ASA_WA_AKG_BASE_URL: 'http://gateway:3000', ASA_WA_AKG_API_KEY: 'chave', ASA_WHATSAPP_WEBHOOK_SECRET: 'a'.repeat(32), ASA_WHATSAPP_PII_KEY: 'b'.repeat(32) }).whatsapp;
    expect(config).toMatchObject({ provider: 'wa-akg', outboundEnabled: false, sessionManagementEnabled: false, demoMode: false });
  });
});
