import 'dotenv/config';
import { z } from 'zod';

/**
 * Configuração centralizada. Todo valor sensível vem de variável de ambiente
 * (TASK-004 §37-38, §61). Nenhum timeout ou segredo é hardcoded fora daqui.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1).optional(),
  // auto: TLS só para hosts remotos (Supabase); require: sempre; disable: nunca
  DATABASE_SSL: z.enum(['auto', 'require', 'disable']).default('auto'),
  DATABASE_SSL_CA_FILE: z.string().min(1).optional(),
  // db:reset apaga o schema inteiro: em bancos remotos exige opt-in explícito
  ALLOW_REMOTE_DB_RESET: z.enum(['true', 'false', '1', '0']).default('false'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  TRUST_PROXY: z.string().default('false'),
  RATE_LIMIT_ENABLED: z.enum(['true', 'false', '1', '0']).default('true'),
  SIGNUP_ALLOWED_EMAIL_DOMAINS: z.string().default('edu.fecap.br,fecap.br,demo.asa'),
  REGISTRATION_NUMBER_PATTERN: z.string().min(1).default('^\\d{8}$'),
  REGISTRATION_NUMBER_EXAMPLE: z.string().min(1).default('24026962'),
  RESET_CODE_LENGTH: z.coerce.number().int().min(4).max(10).default(6),
  RESET_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  RESET_CODE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  RESET_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(10).default(60),
  RESET_MAX_SENDS: z.coerce.number().int().min(1).max(20).default(5),
  RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  BIOMETRIC_LOGIN_ENABLED: z.enum(['true', 'false', '1', '0']).default('true'),
  BIOMETRIC_CREDENTIAL_TTL_DAYS: z.coerce.number().int().positive().default(30),
  TERMS_URL: z.string().url().optional(),
  PRIVACY_URL: z.string().url().optional(),
  MAIL_TRANSPORT: z.enum(['smtp', 'disabled']).default('disabled'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(['true', 'false', '1', '0']).default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('ASA Conecta <nao-responda@asa-conecta.local>'),
  AGENT_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  AGENT_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  CORS_ORIGIN: z.string().default('*'),
  VOICE_ASSISTANT_ENABLED: z.enum(['true', 'false', '1', '0']).default('true'),
  INTENT_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.6),
  APP_TIMEZONE: z.string().min(1).default('America/Sao_Paulo'),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  nodeEnv: Env['NODE_ENV'];
  port: number;
  logLevel: Env['LOG_LEVEL'];
  databaseUrl: string | undefined;
  databaseSsl: { mode: Env['DATABASE_SSL']; caFile: string | undefined };
  allowRemoteDbReset: boolean;
  jwt: { secret: string; expiresIn: string; issuer: string; audience: string };
  refreshTokenTtlDays: number;
  sessionTtlHours: number;
  trustProxy: boolean | string | number;
  rateLimit: { enabled: boolean };
  auth: {
    allowedEmailDomains: string[];
    registrationNumberPattern: RegExp;
    registrationNumberPatternSource: string;
    registrationNumberExample: string;
    resetCode: { length: number; ttlMinutes: number; maxAttempts: number; resendCooldownSeconds: number; maxSends: number };
    resetTokenTtlMinutes: number;
    biometric: { enabled: boolean; credentialTtlDays: number };
    legal: { termsUrl: string | null; privacyUrl: string | null };
  };
  mail: {
    transport: 'smtp' | 'disabled';
    smtp: { host: string; port: number; secure: boolean; user: string | undefined; pass: string | undefined } | null;
    from: string;
  };
  agentService: { url: string; timeoutMs: number; contractMajor: number; contractVersion: string };
  corsOrigin: string;
  assistant: { enabled: boolean; intentMinConfidence: number; timezone: string; maxTextLength: number };
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  // Variáveis vazias no .env (ex.: TERMS_URL=) equivalem a não definidas.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Configuração inválida: ${issues}`);
  }
  const env = parsed.data;
  const flag = (value: string) => value === 'true' || value === '1';
  let registrationNumberPattern: RegExp;
  try {
    registrationNumberPattern = new RegExp(env.REGISTRATION_NUMBER_PATTERN);
  } catch {
    throw new Error('Configuração inválida: REGISTRATION_NUMBER_PATTERN não é uma expressão regular válida');
  }
  if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) {
    throw new Error('Configuração inválida: MAIL_TRANSPORT=smtp exige SMTP_HOST');
  }
  const trustProxy = env.TRUST_PROXY === 'true' ? true : env.TRUST_PROXY === 'false' ? false : /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: env.APP_TIMEZONE });
  } catch {
    throw new Error(`Configuração inválida: APP_TIMEZONE desconhecido (${env.APP_TIMEZONE})`);
  }
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    databaseSsl: { mode: env.DATABASE_SSL, caFile: env.DATABASE_SSL_CA_FILE },
    allowRemoteDbReset: flag(env.ALLOW_REMOTE_DB_RESET),
    jwt: { secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN, issuer: 'asa-conecta-api', audience: 'asa-conecta-mobile' },
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    sessionTtlHours: env.SESSION_TTL_HOURS,
    trustProxy,
    rateLimit: { enabled: flag(env.RATE_LIMIT_ENABLED) },
    auth: {
      allowedEmailDomains: env.SIGNUP_ALLOWED_EMAIL_DOMAINS.split(',').map((domain) => domain.trim().toLowerCase().replace(/^@/, '')).filter(Boolean),
      registrationNumberPattern,
      registrationNumberPatternSource: env.REGISTRATION_NUMBER_PATTERN,
      registrationNumberExample: env.REGISTRATION_NUMBER_EXAMPLE,
      resetCode: {
        length: env.RESET_CODE_LENGTH,
        ttlMinutes: env.RESET_CODE_TTL_MINUTES,
        maxAttempts: env.RESET_CODE_MAX_ATTEMPTS,
        resendCooldownSeconds: env.RESET_RESEND_COOLDOWN_SECONDS,
        maxSends: env.RESET_MAX_SENDS,
      },
      resetTokenTtlMinutes: env.RESET_TOKEN_TTL_MINUTES,
      biometric: { enabled: flag(env.BIOMETRIC_LOGIN_ENABLED), credentialTtlDays: env.BIOMETRIC_CREDENTIAL_TTL_DAYS },
      legal: { termsUrl: env.TERMS_URL ?? null, privacyUrl: env.PRIVACY_URL ?? null },
    },
    mail: {
      transport: env.MAIL_TRANSPORT,
      smtp:
        env.MAIL_TRANSPORT === 'smtp' && env.SMTP_HOST
          ? { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: flag(env.SMTP_SECURE), user: env.SMTP_USER, pass: env.SMTP_PASS }
          : null,
      from: env.MAIL_FROM,
    },
    agentService: {
      url: env.AGENT_SERVICE_URL.replace(/\/+$/, ''),
      timeoutMs: env.AGENT_SERVICE_TIMEOUT_MS,
      contractMajor: 1,
      contractVersion: '1.0',
    },
    corsOrigin: env.CORS_ORIGIN,
    assistant: {
      enabled: env.VOICE_ASSISTANT_ENABLED === 'true' || env.VOICE_ASSISTANT_ENABLED === '1',
      intentMinConfidence: env.INTENT_MIN_CONFIDENCE,
      timezone: env.APP_TIMEZONE,
      maxTextLength: 500,
    },
  };
}
