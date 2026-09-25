import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Token aleatório opaco (base64url) para refresh, redefinição e credenciais de dispositivo. */
export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** HMAC com segredo do servidor: um vazamento do banco não permite testar códigos curtos offline. */
export function hmacHex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/** Código numérico uniforme (sem viés de módulo), com zeros à esquerda. */
export function numericCode(length: number): string {
  let code = '';
  for (let index = 0; index < length; index += 1) code += String(randomInt(0, 10));
  return code;
}

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}
