/**
 * Payloads do WA-AKG na revisão fixada 04d6c0f (v1.7.0), montados campo a campo a partir do código do gateway
 * (src/lib/webhook.ts:588-663, src/modules/whatsapp/store/index.ts:178-198). Valores fictícios.
 */
export const SESSION = 'asa_pilot';

export const inboundText = {
  event: 'message.received',
  sessionId: SESSION,
  timestamp: '2026-11-02T18:00:01.123Z',
  data: {
    key: { id: '3EB0A1B2C3D4E5F60718', remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, participant: '' },
    pushName: 'Aluno Teste',
    messageTimestamp: 1793642400,
    from: '5511999990000@s.whatsapp.net',
    receiver: '5511888880000@s.whatsapp.net',
    sender: '5511999990000@s.whatsapp.net',
    isGroup: false,
    chatType: 'PERSONAL',
    type: 'TEXT',
    content: 'Oi, preciso de ajuda com a matrícula',
    fileUrl: null,
    quoted: null,
  },
};

export const inboundMedia = {
  event: 'message.received',
  sessionId: SESSION,
  timestamp: '2026-11-02T18:05:03.456Z',
  data: {
    key: { id: '3EB0F00DBABE00112233', remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, participant: '' },
    pushName: 'Aluno Teste',
    messageTimestamp: 1793642700,
    from: '5511999990000@s.whatsapp.net',
    receiver: '5511888880000@s.whatsapp.net',
    sender: '5511999990000@s.whatsapp.net',
    isGroup: false,
    chatType: 'PERSONAL',
    type: 'IMAGE',
    content: 'Comprovante',
    fileUrl: '/api/media/asa_pilot-3EB0F00DBABE00112233.jpeg',
    caption: 'Comprovante',
  },
};

export const inboundDocument = {
  ...inboundMedia,
  data: { ...inboundMedia.data, key: { ...inboundMedia.data.key, id: '3EB0D0C000000000AAAA' }, type: 'DOCUMENT', content: 'historico.pdf', caption: '', fileUrl: '/api/media/asa_pilot-3EB0D0C000000000AAAA.pdf' },
};

export const inboundFromLid = {
  ...inboundText,
  data: { ...inboundText.data, key: { ...inboundText.data.key, id: '3EB0LID0000000000001', remoteJid: '123456789012345@lid' }, from: '123456789012345@lid', sender: '123456789012345@lid' },
};

export const inboundGroup = {
  ...inboundText,
  data: { ...inboundText.data, key: { id: '3EB0GROUP00000000001', remoteJid: '120363000000000000@g.us', fromMe: false, participant: '5511999990000@s.whatsapp.net' }, from: '120363000000000000@g.us', isGroup: true, chatType: 'GROUP' },
};

/** Tipo que o gateway não conhece: TEXT com conteúdo vazio. */
export const inboundUnknownType = {
  ...inboundText,
  data: { ...inboundText.data, key: { ...inboundText.data.key, id: '3EB0EMPTY00000000001' }, content: '' },
};

export const outboundSent = {
  event: 'message.sent',
  sessionId: SESSION,
  timestamp: '2026-11-02T18:06:00.100Z',
  data: { key: { id: '3EB0C0FFEE0011223344', remoteJid: '5511999990000@s.whatsapp.net', fromMe: true }, from: '5511888880000@s.whatsapp.net', receiver: '5511999990000@s.whatsapp.net', sender: 'ME', isGroup: false, chatType: 'PERSONAL', type: 'TEXT', content: 'Olá', fileUrl: null, quoted: null, timestamp: 1793642760100 },
};

export const statusEvent = (status: string) => ({
  event: 'message.status',
  sessionId: SESSION,
  timestamp: '2026-11-02T18:06:02.000Z',
  data: { keyId: '3EB0C0FFEE0011223344', remoteJid: '5511999990000@s.whatsapp.net', status },
});

export const testEvent = { event: 'test', sessionId: 'test', timestamp: '2026-11-02T18:06:02.000Z', data: { message: 'This is a test webhook from WA-AKG' } };
