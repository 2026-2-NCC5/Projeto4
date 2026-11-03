import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';

function derive(secret: string, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'asa-conecta:whatsapp', info, 32));
}

/**
 * Proteção de telefones e identificadores do WhatsApp em repouso. Três chaves independentes derivadas de um segredo
 * fora do repositório: cifra (AES-256-GCM, para responder), impressão digital (HMAC, para correlacionar sem decifrar)
 * e códigos de verificação. Sem a chave, um vazamento do banco não revela os números.
 */
export class ContactVault {
  private readonly encryptionKey: Buffer;
  private readonly fingerprintKey: Buffer;
  private readonly codeKey: Buffer;

  constructor(secret: string) {
    this.encryptionKey = derive(secret, 'contact-encryption');
    this.fingerprintKey = derive(secret, 'contact-fingerprint');
    this.codeKey = derive(secret, 'verification-code');
  }

  fingerprint(value: string): string {
    return createHmac('sha256', this.fingerprintKey).update(value).digest('hex');
  }

  codeHash(code: string): string {
    return createHmac('sha256', this.codeKey).update(code).digest('hex');
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const content = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), content.toString('base64url')].join('.');
  }

  decrypt(token: string): string {
    const [version, iv, tag, content] = token.split('.');
    if (version !== VERSION || !iv || !tag || content === undefined) throw new Error('formato de cifra desconhecido');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(content, 'base64url')), decipher.final()]).toString('utf8');
  }
}
