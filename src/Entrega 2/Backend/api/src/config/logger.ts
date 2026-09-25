import pino, { type Logger } from 'pino';

/**
 * Logs estruturados (TASK-004 §62-63). Campos sensíveis são redigidos e o
 * conteúdo acadêmico nunca é logado — apenas identificadores técnicos.
 */
export function createLogger(level: string, service = 'api'): Logger {
  return pino({
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        'passwordHash',
        'accessToken',
        'refreshToken',
        'token',
        '*.password',
        '*.accessToken',
        '*.refreshToken',
      ],
      censor: '[REDACTED]',
    },
  });
}

export type { Logger };
