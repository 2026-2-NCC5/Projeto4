/**
 * Identificadores do WhatsApp. Um JID/LID identifica uma conta no WhatsApp, não uma pessoa do ASA: nunca é RA, e-mail
 * ou identidade verificada. Identidade só vem do vínculo verificado (support_contact_links).
 */
export interface ContactRef {
  kind: 'phone' | 'lid';
  /** forma canônica estável: +5511999999999 ou lid:123456 (é o que entra na impressão digital e na cifra) */
  value: string;
  /** para exibir: nunca o identificador inteiro */
  masked: string;
}

const E164 = /^\+[1-9][0-9]{7,14}$/;

/** E.164 com "+", ou null. Aceita pontuação comum; não adivinha país. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d+]/g, '');
  const candidate = digits.startsWith('+') ? digits : `+${digits}`;
  return E164.test(candidate) ? candidate : null;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '••••';
  const country = digits.startsWith('55') ? '+55 ' : '+';
  return `${country}•••• ${digits.slice(-4)}`;
}

/** Contas e destinos que o atendimento não trata: grupos, listas, status e canais (fora de escopo do MVP). */
const NON_DIRECT = /@(g\.us|broadcast|newsletter|call)$/i;

/**
 * Normaliza um JID: `5511999999999:12@s.whatsapp.net` (telefone com dispositivo), `123456:7@lid` (LID) ou um número.
 * Devolve null para o que não é conversa direta com uma pessoa.
 */
export function parseContact(raw: string): ContactRef | null {
  const value = raw.trim();
  if (!value || NON_DIRECT.test(value)) return null;
  const at = value.indexOf('@');
  if (at === -1) return phoneRef(value);
  const user = value.slice(0, at).split(':')[0] ?? '';
  const server = value.slice(at + 1).toLowerCase();
  if (server === 'lid') {
    if (!/^\d{4,32}$/.test(user)) return null;
    return { kind: 'lid', value: `lid:${user}`, masked: `Contato •••• ${user.slice(-4)}` };
  }
  if (server === 's.whatsapp.net' || server === 'c.us') return phoneRef(user);
  return null;
}

function phoneRef(raw: string): ContactRef | null {
  const phone = normalizePhone(raw);
  return phone ? { kind: 'phone', value: phone, masked: maskPhone(phone) } : null;
}

/** Destino de envio a partir da forma canônica. */
export function sendTargetJid(value: string): string {
  return value.startsWith('lid:') ? `${value.slice(4)}@lid` : `${value.slice(1)}@s.whatsapp.net`;
}

/** Número sintético não roteável do provedor fake (código de país inexistente). */
export const SYNTHETIC_PHONE = /^\+999\d{8,12}$/;
