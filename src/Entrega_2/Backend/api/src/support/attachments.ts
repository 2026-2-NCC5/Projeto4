import { createHash } from 'node:crypto';
import { hmacHex, safeEqualHex } from '../auth/secrets.js';
import { ValidationError } from '../errors/AppError.js';
import { SUPPORT_LIMITS } from './catalog.js';

/** Validade do link de download assinado. */
export const ATTACHMENT_LINK_TTL_MS = 5 * 60 * 1000;
/** Envios não vinculados a um chamado são descartados depois disso. */
export const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

/** Tipos exibidos no navegador; os demais são baixados (Content-Disposition: attachment). */
const INLINE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain']);

const startsWith = (buffer: Buffer, bytes: number[], offset = 0) => bytes.every((byte, index) => buffer[offset + index] === byte);

/**
 * Confere a assinatura binária do arquivo com o tipo declarado — um executável renomeado para .pdf é recusado.
 * (Os primeiros bytes bastam: o objetivo é barrar tipos trocados, não validar o documento inteiro.)
 */
export function contentMatchesType(mimeType: string, content: Buffer): boolean {
  switch (mimeType) {
    case 'application/pdf':
      return startsWith(content, [0x25, 0x50, 0x44, 0x46]); // %PDF
    case 'image/png':
      return startsWith(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg':
      return startsWith(content, [0xff, 0xd8, 0xff]);
    case 'image/webp':
      return startsWith(content, [0x52, 0x49, 0x46, 0x46]) && startsWith(content, [0x57, 0x45, 0x42, 0x50], 8); // RIFF....WEBP
    case 'image/heic':
      return startsWith(content, [0x66, 0x74, 0x79, 0x70], 4); // ....ftyp
    case 'application/msword':
      return startsWith(content, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // OLE2
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return startsWith(content, [0x50, 0x4b, 0x03, 0x04]); // ZIP
    case 'text/plain':
      return !content.subarray(0, 4096).includes(0);
    default:
      return false;
  }
}

/** Nome exibível e seguro para cabeçalhos: sem caminhos, sem caracteres de controle, até 120 caracteres. */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const printable = [...base].filter((char) => {
    const code = char.charCodeAt(0);
    return code >= 0x20 && code !== 0x7f;
  });
  const cleaned = printable
    .join('')
    .replace(/["<>|*?:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'arquivo';
  if (cleaned.length <= 120) return cleaned;
  const dot = cleaned.lastIndexOf('.');
  const extension = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : '';
  return `${cleaned.slice(0, 120 - extension.length)}${extension}`;
}

export interface DecodedUpload {
  fileName: string;
  mimeType: string;
  content: Buffer;
  sizeBytes: number;
  sha256: string;
}

/** "5 MB", "3 MB", "1,5 MB" (mebibytes, como o cliente exibe). */
export function formatMegabytes(bytes: number): string {
  const value = Math.round((bytes / (1024 * 1024)) * 10) / 10;
  return `${String(value).replace('.', ',')} MB`;
}

/** Decodifica e valida um envio (tipo permitido, tamanho, assinatura binária). */
export function decodeUpload(input: { name: string; mimeType: string; contentBase64: string }, maxBytes: number = SUPPORT_LIMITS.maxAttachmentBytes): DecodedUpload {
  const mimeType = input.mimeType.trim().toLowerCase();
  if (!SUPPORT_LIMITS.allowedMimeTypes.includes(mimeType)) {
    throw new ValidationError('Tipo de arquivo não permitido. Envie PDF, imagem ou documento.', [{ field: 'mimeType', message: 'tipo não permitido' }], { reason: 'file_type_not_allowed' });
  }
  const base64 = input.contentBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length === 0) {
    throw new ValidationError('Arquivo inválido.', [{ field: 'contentBase64', message: 'base64 inválido' }], { reason: 'file_invalid' });
  }
  const content = Buffer.from(base64, 'base64');
  if (content.length === 0) {
    throw new ValidationError('O arquivo está vazio.', [{ field: 'contentBase64', message: 'arquivo vazio' }], { reason: 'file_empty' });
  }
  if (content.length > maxBytes) {
    throw new ValidationError(`O arquivo é maior que ${formatMegabytes(maxBytes)}.`, [{ field: 'contentBase64', message: 'arquivo maior que o limite' }], { reason: 'file_too_large' });
  }
  if (!contentMatchesType(mimeType, content)) {
    throw new ValidationError('O conteúdo do arquivo não corresponde ao tipo informado.', [{ field: 'contentBase64', message: 'conteúdo não corresponde ao tipo' }], { reason: 'file_type_mismatch' });
  }
  return { fileName: sanitizeFileName(input.name), mimeType, content, sizeBytes: content.length, sha256: createHash('sha256').update(content).digest('hex') };
}

function signature(secret: string, attachmentId: string, expiresAtMs: number): string {
  // Separação de domínio: a mesma chave do JWT nunca assina o mesmo formato de mensagem.
  return hmacHex(secret, `support-attachment:${attachmentId}:${expiresAtMs}`);
}

export function signAttachmentLink(secret: string, attachmentId: string, now: Date): { url: string; expiresAt: Date } {
  const expiresAtMs = now.getTime() + ATTACHMENT_LINK_TTL_MS;
  const sig = signature(secret, attachmentId, expiresAtMs);
  return { url: `/api/support/files/${encodeURIComponent(attachmentId)}?exp=${expiresAtMs}&sig=${sig}`, expiresAt: new Date(expiresAtMs) };
}

export function verifyAttachmentLink(secret: string, attachmentId: string, exp: string | undefined, sig: string | undefined, now: Date): boolean {
  if (!exp || !sig || !/^\d{1,16}$/.test(exp) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const expiresAtMs = Number(exp);
  if (expiresAtMs < now.getTime()) return false;
  return safeEqualHex(signature(secret, attachmentId, expiresAtMs), sig);
}

/** Cabeçalho Content-Disposition com nome UTF-8 (RFC 6266/5987). */
export function contentDisposition(mimeType: string, fileName: string): string {
  const kind = INLINE_TYPES.has(mimeType) ? 'inline' : 'attachment';
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
