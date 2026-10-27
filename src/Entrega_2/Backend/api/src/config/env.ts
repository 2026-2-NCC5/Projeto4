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
  // Conexões por instância. Em funções serverless cada instância tem o próprio pool: mantenha baixo (ex.: 3)
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  // db:reset apaga o schema inteiro: em bancos remotos exige opt-in explícito
  ALLOW_REMOTE_DB_RESET: z.enum(['true', 'false', '1', '0']).default('false'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  // Sem valor: true na Vercel (o proxy dela sobrescreve X-Forwarded-For com o IP real), false fora dela
  TRUST_PROXY: z.string().optional(),
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
  // Segredo compartilhado com o Agent Service (Authorization: Bearer); o serviço exige quando também o define
  AGENT_SERVICE_TOKEN: z.string().min(16, 'AGENT_SERVICE_TOKEN deve ter pelo menos 16 caracteres').optional(),
  CORS_ORIGIN: z.string().default('*'),
  VOICE_ASSISTANT_ENABLED: z.enum(['true', 'false', '1', '0']).default('true'),
  INTENT_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.6),
  APP_TIMEZONE: z.string().min(1).default('America/Sao_Paulo'),
  // ---- queue (Fila presencial do ASA): UM monitor no backend consulta a fonte pública
  ASA_QUEUE_ENABLED: z.enum(['true', 'false', '1', '0']).default('true'),
  // fecap: endpoint JSON do portal com fallback para o HTML | fecap-html: só HTML | mock/demo: simulador (nunca em produção).
  // Sem valor: simulador fora de produção; em produção a fila fica desativada até a fonte ser escolhida (não presume autorização).
  ASA_QUEUE_PROVIDER: z.enum(['fecap', 'fecap-html', 'mock', 'demo']).optional(),
  // A leitura de presencial.fecap.br só é tratada como integração autorizada quando a instituição confirmar (painel admin)
  ASA_QUEUE_SOURCE_AUTHORIZED: z.enum(['true', 'false', '1', '0']).default('false'),
  ASA_QUEUE_SOURCE_URL: z.string().url().default('https://presencial.fecap.br/'),
  ASA_QUEUE_POLL_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(300).default(10),
  ASA_QUEUE_CACHE_TTL_SECONDS: z.coerce.number().int().min(5).max(3600).default(30),
  ASA_QUEUE_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(8000),
  ASA_QUEUE_MAX_BACKOFF_SECONDS: z.coerce.number().int().min(10).max(3600).default(300),
  ASA_QUEUE_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(50).default(5),
  ASA_QUEUE_SUBSCRIPTION_RATE_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  // Duração de cada conexão de tempo real (SSE); o app reconecta. Sem valor: 240 s na Vercel (limite da função: 300 s), 300 s fora
  ASA_QUEUE_STREAM_MAX_SECONDS: z.coerce.number().int().min(30).max(3600).optional(),
  ASA_QUEUE_MOCK_SCENARIO: z.enum(['empty', 'waiting', '5_ahead', '3_ahead', 'next', 'called', 'completed', 'offline', 'progression']).default('progression'),
  ASA_QUEUE_MOCK_STEP_SECONDS: z.coerce.number().int().min(2).max(600).default(20),
  // Push: expo (Expo Push Service) | log (desenvolvimento, só registra) | disabled
  PUSH_PROVIDER: z.enum(['expo', 'log', 'disabled']).default('expo'),
  // Opcional: só com "Enhanced Security for Push" no projeto Expo. Segredo do backend; nunca no app.
  EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
  PUSH_RECEIPT_DELAY_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
  // ---- plataforma (portal web, modo demonstração, flags)
  // Ambiente lógico exibido nos clientes; padrão derivado de NODE_ENV
  APP_ENV: z.enum(['development', 'test', 'staging', 'demo', 'production']).optional(),
  // Dados fictícios identificados como DEMONSTRAÇÃO. false: contas demo não entram e nada fictício é exibido
  DEMO_DATA_ENABLED: z.enum(['true', 'false', '1', '0']).default('true'),
  // Seeds fictícios (database/seeds) — nunca em produção; banco remoto só com DEMO_SEED_ALLOW_REMOTE=true
  DEMO_SEED_ENABLED: z.enum(['true', 'false', '1', '0']).default('true'),
  DEMO_SEED_ALLOW_REMOTE: z.enum(['true', 'false', '1', '0']).default('false'),
  DEMO_SCENARIO: z.string().regex(/^[a-z0-9-]{1,40}$/).default('academic-full'),
  // demo: disciplinas/notas/frequência do seed fictício | institutional: fonte oficial (ainda não configurada)
  ACADEMIC_DATA_PROVIDER: z.enum(['demo', 'institutional']).default('demo'),
  FEATURE_TICKETS_ENABLED: z.enum(['true', 'false', '1', '0']).default('true'),
  FEATURE_APPOINTMENTS_ENABLED: z.enum(['true', 'false', '1', '0']).default('true'),
  FEATURE_KB_ENABLED: z.enum(['true', 'false', '1', '0']).default('true'),
  FEATURE_NOTIFICATIONS_ENABLED: z.enum(['true', 'false', '1', '0']).default('true'),
  // Só a fila presencial usa eventos em tempo real (SSE); o portal web usa atualização periódica visível
  FEATURE_REALTIME_ENABLED: z.enum(['true', 'false', '1', '0']).default('false'),
  // Varredura dos prazos para as automações (segundos; 0 desliga). As regras continuam desligadas até a administração ativar.
  AUTOMATION_SCAN_INTERVAL_SECONDS: z.coerce.number().int().min(0).max(86_400).default(300),
  // Rotas /api/internal/jobs/* (Vercel Cron, agendador externo): exigem Authorization: Bearer <CRON_SECRET>. Sem valor: desativadas
  CRON_SECRET: z.string().min(16, 'CRON_SECRET deve ter pelo menos 16 caracteres').optional(),
  // Tamanho máximo de cada anexo de chamado. Sem valor: 3 MiB na Vercel (corpo da função limitado a 4,5 MB; o envio
  // vai em base64), 5 MiB fora dela
  SUPPORT_MAX_ATTACHMENT_BYTES: z.coerce.number().int().min(64 * 1024).max(5 * 1024 * 1024).optional(),
  // Origens do portal web aceitas nas requisições com cookie de sessão (verificação de CSRF). Na Vercel as URLs do
  // próprio deploy entram automaticamente (VERCEL_URL, VERCEL_BRANCH_URL, VERCEL_PROJECT_PRODUCTION_URL)
  WEB_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  // auto: cookies Secure só em produção (HTTPS); true/false força
  WEB_COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),
  // Provedor de IA do assistente: existing (regras + base de conhecimento) | jev (integração futura, desligada)
  AI_PROVIDER: z.enum(['existing', 'jev']).default('existing'),
  JEV_ENABLED: z.enum(['true', 'false', '1', '0']).default('false'),
});

export type AppEnvironment = NonNullable<z.infer<typeof envSchema>['APP_ENV']>;

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
  /** onde a API está rodando (padrões que dependem da plataforma) */
  platform: { vercel: boolean; region: string | null };
  database: { poolMax: number };
  jobs: { cronSecret: string | null };
  support: { maxAttachmentBytes: number };
  mail: {
    transport: 'smtp' | 'disabled';
    smtp: { host: string; port: number; secure: boolean; user: string | undefined; pass: string | undefined } | null;
    from: string;
  };
  agentService: { url: string; timeoutMs: number; token: string | null; contractMajor: number; contractVersion: string };
  corsOrigin: string;
  assistant: { enabled: boolean; intentMinConfidence: number; timezone: string; maxTextLength: number };
  // ---- queue (Fila presencial do ASA)
  queue: {
    enabled: boolean;
    provider: QueueProviderName;
    /** a fonte foi escolhida explicitamente (ASA_QUEUE_PROVIDER) */
    providerExplicit: boolean;
    /** instituição confirmou a autorização de uso da fonte (ASA_QUEUE_SOURCE_AUTHORIZED) */
    sourceAuthorized: boolean;
    /** motivo quando a fila foi desativada pela configuração (ex.: produção sem fonte escolhida) */
    disabledReason: string | null;
    sourceUrl: string;
    pollIntervalSeconds: number;
    /** snapshot mais velho que isto aparece como desatualizado (e seguidores releem o banco) */
    cacheTtlSeconds: number;
    /** duração de cada conexão SSE (o app reconecta) */
    streamMaxSeconds: number;
    requestTimeoutMs: number;
    maxBackoffSeconds: number;
    failureThreshold: number;
    subscriptionRateLimit: number;
    mock: { scenario: Env['ASA_QUEUE_MOCK_SCENARIO']; stepSeconds: number };
  };
  push: { provider: Env['PUSH_PROVIDER']; expoAccessToken: string | undefined; receiptDelaySeconds: number };
  // ---- plataforma (portal web, modo demonstração, flags)
  appEnv: AppEnvironment;
  demo: { dataEnabled: boolean; seedEnabled: boolean; seedAllowRemote: boolean; scenario: string };
  academic: { provider: Env['ACADEMIC_DATA_PROVIDER'] };
  features: { tickets: boolean; appointments: boolean; knowledgeBase: boolean; notifications: boolean; realtime: boolean };
  automations: { scanIntervalSeconds: number };
  web: { origins: string[]; cookieSecure: boolean };
  ai: { provider: Env['AI_PROVIDER']; jevEnabled: boolean };
}

export type QueueProviderName = 'fecap' | 'fecap-html' | 'mock';

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
  // Variável de sistema da Vercel (build e funções); ausente em qualquer outro ambiente
  const onVercel = source.VERCEL === '1';
  if (env.NODE_ENV === 'production' && !cleaned.AGENT_SERVICE_URL) {
    throw new Error('Configuração inválida: defina AGENT_SERVICE_URL em produção (na Vercel ela vem do binding do serviço `agent`)');
  }
  let registrationNumberPattern: RegExp;
  try {
    registrationNumberPattern = new RegExp(env.REGISTRATION_NUMBER_PATTERN);
  } catch {
    throw new Error('Configuração inválida: REGISTRATION_NUMBER_PATTERN não é uma expressão regular válida');
  }
  if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) {
    throw new Error('Configuração inválida: MAIL_TRANSPORT=smtp exige SMTP_HOST');
  }
  const trustProxyRaw = env.TRUST_PROXY ?? (onVercel ? 'true' : 'false');
  const trustProxy = trustProxyRaw === 'true' ? true : trustProxyRaw === 'false' ? false : /^\d+$/.test(trustProxyRaw) ? Number(trustProxyRaw) : trustProxyRaw;
  const queueProviderRaw = env.ASA_QUEUE_PROVIDER === 'demo' ? 'mock' : env.ASA_QUEUE_PROVIDER;
  if (env.NODE_ENV === 'production' && queueProviderRaw === 'mock') {
    throw new Error('Configuração inválida: ASA_QUEUE_PROVIDER=mock não é permitido em produção');
  }
  // Sem fonte escolhida: simulador identificado fora de produção; em produção a fila fica desativada (não presume autorização).
  const queueProvider: QueueProviderName = queueProviderRaw ?? 'mock';
  const queueDisabledReason =
    !queueProviderRaw && env.NODE_ENV === 'production' ? 'Defina ASA_QUEUE_PROVIDER para ativar a fila presencial (a fonte exige autorização institucional).' : null;
  const appEnv: AppEnvironment = env.APP_ENV ?? (env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development');
  const webOrigins = env.WEB_ORIGINS.split(',').map((origin) => origin.trim().replace(/\/+$/, '')).filter(Boolean);
  for (const origin of webOrigins) {
    if (!/^https?:\/\/[^/\s]+$/.test(origin)) throw new Error(`Configuração inválida: WEB_ORIGINS contém uma origem inválida (${origin})`);
  }
  // Vercel (Services): o portal e a API respondem no MESMO deploy. As URLs dele (a do deploy, a do branch e a
  // de produção) vêm das variáveis de sistema; cada preview tem uma URL nova, que não dá para listar à mão.
  // Domínios próprios continuam em WEB_ORIGINS.
  if (onVercel) {
    for (const host of [source.VERCEL_URL, source.VERCEL_BRANCH_URL, source.VERCEL_PROJECT_PRODUCTION_URL]) {
      const origin = host && /^[a-z0-9.-]+$/i.test(host) ? `https://${host.toLowerCase()}` : null;
      if (origin && !webOrigins.includes(origin)) webOrigins.push(origin);
    }
  }
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
    platform: { vercel: onVercel, region: source.VERCEL_REGION ?? null },
    database: { poolMax: env.DATABASE_POOL_MAX },
    jobs: { cronSecret: env.CRON_SECRET ?? null },
    support: { maxAttachmentBytes: env.SUPPORT_MAX_ATTACHMENT_BYTES ?? (onVercel ? 3 * 1024 * 1024 : 5 * 1024 * 1024) },
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
      token: env.AGENT_SERVICE_TOKEN ?? null,
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
    queue: {
      enabled: flag(env.ASA_QUEUE_ENABLED) && queueDisabledReason === null,
      provider: queueProvider,
      providerExplicit: queueProviderRaw !== undefined,
      sourceAuthorized: flag(env.ASA_QUEUE_SOURCE_AUTHORIZED),
      disabledReason: flag(env.ASA_QUEUE_ENABLED) ? queueDisabledReason : 'ASA_QUEUE_ENABLED=false',
      sourceUrl: env.ASA_QUEUE_SOURCE_URL,
      pollIntervalSeconds: env.ASA_QUEUE_POLL_INTERVAL_SECONDS,
      cacheTtlSeconds: env.ASA_QUEUE_CACHE_TTL_SECONDS,
      streamMaxSeconds: env.ASA_QUEUE_STREAM_MAX_SECONDS ?? (onVercel ? 240 : 300),
      requestTimeoutMs: env.ASA_QUEUE_REQUEST_TIMEOUT_MS,
      maxBackoffSeconds: env.ASA_QUEUE_MAX_BACKOFF_SECONDS,
      failureThreshold: env.ASA_QUEUE_FAILURE_THRESHOLD,
      subscriptionRateLimit: env.ASA_QUEUE_SUBSCRIPTION_RATE_LIMIT,
      mock: { scenario: env.ASA_QUEUE_MOCK_SCENARIO, stepSeconds: env.ASA_QUEUE_MOCK_STEP_SECONDS },
    },
    push: { provider: env.PUSH_PROVIDER, expoAccessToken: env.EXPO_ACCESS_TOKEN, receiptDelaySeconds: env.PUSH_RECEIPT_DELAY_SECONDS },
    appEnv,
    demo: {
      dataEnabled: flag(env.DEMO_DATA_ENABLED),
      seedEnabled: flag(env.DEMO_SEED_ENABLED),
      seedAllowRemote: flag(env.DEMO_SEED_ALLOW_REMOTE),
      scenario: env.DEMO_SCENARIO,
    },
    academic: { provider: env.ACADEMIC_DATA_PROVIDER },
    features: {
      tickets: flag(env.FEATURE_TICKETS_ENABLED),
      appointments: flag(env.FEATURE_APPOINTMENTS_ENABLED),
      knowledgeBase: flag(env.FEATURE_KB_ENABLED),
      notifications: flag(env.FEATURE_NOTIFICATIONS_ENABLED),
      realtime: flag(env.FEATURE_REALTIME_ENABLED),
    },
    automations: { scanIntervalSeconds: env.AUTOMATION_SCAN_INTERVAL_SECONDS },
    web: {
      origins: webOrigins,
      cookieSecure: env.WEB_COOKIE_SECURE === 'auto' ? env.NODE_ENV === 'production' : env.WEB_COOKIE_SECURE === 'true',
    },
    ai: { provider: env.AI_PROVIDER, jevEnabled: flag(env.JEV_ENABLED) },
  };
}
