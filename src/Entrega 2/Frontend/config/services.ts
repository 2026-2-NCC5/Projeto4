/**
 * Configuração centralizada de serviços e timeouts.
 * NENHUM componente deve definir timeout próprio — use estas constantes.
 */

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === null || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function readBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === null) return fallback;
  const value = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  return fallback;
}

export function readOneOf<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  const value = raw?.trim();
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function readNonEmpty(raw: string | undefined, fallback: string): string {
  const value = raw?.trim();
  return value ? value : fallback;
}

/** Porta padrão da API Node.js (src/Entrega 2/Backend/api). */
export const DEFAULT_API_PORT = 3000;

export const TIMEOUTS = {
  /** Chamadas comuns (perfil, disciplinas, histórico...). */
  API_TIMEOUT_MS: readPositiveInt(process.env.EXPO_PUBLIC_API_TIMEOUT_MS, 10_000),
  /** Análise do agente (POST /api/agent/analyze) — mais lenta por envolver o Agent Service. */
  ANALYSIS_TIMEOUT_MS: readPositiveInt(process.env.EXPO_PUBLIC_ANALYSIS_TIMEOUT_MS, 15_000),
  /** Logout remoto é best-effort: nunca prende o aluno na tela esperando a rede. */
  LOGOUT_TIMEOUT_MS: 4_000,
} as const;

/** Autenticação (login, cadastro, recuperação de senha, sessão e biometria). */
export const AUTH = {
  /** Tempo do check animado de sucesso antes de trocar para a área autenticada. */
  SUCCESS_FEEDBACK_MS: 350,
  /** Tempo da confirmação "Conta criada com sucesso!" antes de abrir o aplicativo. */
  REGISTER_SUCCESS_FEEDBACK_MS: 1_100,
  /** Atraso do prompt automático de biometria após a tela de login aparecer. */
  BIOMETRIC_AUTO_PROMPT_DELAY_MS: 450,
  /** Tempo da confirmação "biometria ativada" antes de fechar a oferta. */
  BIOMETRIC_ENABLED_FEEDBACK_MS: 900,
  /** Rótulo enviado ao cadastrar a credencial biométrica (sem dados pessoais do aparelho). */
  BIOMETRIC_DEVICE_LABEL_PREFIX: 'ASA Conecta',
} as const;

export type SpeechProvider = 'device' | 'none';

/**
 * Assistente por voz. O reconhecimento usa o serviço de voz do sistema (Google/Apple no dispositivo;
 * Chrome/Safari no web) — nenhuma chave ou provedor externo é configurado no app.
 * Variáveis EXPO_PUBLIC_* são lidas estaticamente (inlining do babel-preset-expo).
 */
export const VOICE = {
  /** Liga o modo "Conversar" na aba Assistente. false → apenas a análise completa. */
  ENABLED: readBoolean(process.env.EXPO_PUBLIC_VOICE_ASSISTANT_ENABLED, true),
  /** 'device' usa expo-speech-recognition; 'none' desativa a entrada por voz (texto + TTS continuam). */
  SPEECH_PROVIDER: readOneOf<SpeechProvider>(process.env.EXPO_PUBLIC_SPEECH_PROVIDER, ['device', 'none'], 'device'),
  /** Idioma do reconhecimento e da síntese de fala (BCP-47). */
  LANGUAGE: readNonEmpty(process.env.EXPO_PUBLIC_SPEECH_LANGUAGE, 'pt-BR'),
  /** true → exige reconhecimento no dispositivo (o áudio não sai do aparelho; pode não estar disponível). */
  ON_DEVICE_ONLY: readBoolean(process.env.EXPO_PUBLIC_SPEECH_ON_DEVICE_ONLY, false),
  /** Valor inicial da preferência "Resposta por voz". */
  TTS_ENABLED_DEFAULT: readBoolean(process.env.EXPO_PUBLIC_TTS_ENABLED_DEFAULT, true),
  /** Timeout de POST /api/assistant/message (pode disparar uma análise do agente). */
  ASSISTANT_TIMEOUT_MS: readPositiveInt(process.env.EXPO_PUBLIC_ASSISTANT_TIMEOUT_MS, 15_000),
  /** Duração máxima de uma escuta; ao atingir, a fala é finalizada e enviada. */
  LISTEN_MAX_MS: 15_000,
  /** Tempo máximo entre o fim da fala e a transcrição final. */
  TRANSCRIBE_TIMEOUT_MS: 6_000,
  /** Após este atraso sem resposta, a UI passa de "Entendendo..." para "Analisando suas informações...". */
  THINKING_DELAY_MS: 700,
  /** Transcrições menores que isto são tratadas como "não ouvi nada" (sem chamar a API). */
  MIN_TRANSCRIPT_CHARS: 2,
  /** Intervalo dos eventos de volume do microfone (animação do orb). */
  VOLUME_EVENT_INTERVAL_MS: 100,
  /** Limite de caracteres aceito pela API para `text`. */
  MAX_TEXT_CHARS: 500,
  /** Vocabulário de viés (contextualStrings no iOS / EXTRA_BIASING_STRINGS no Android 13+). */
  CONTEXTUAL_STRINGS: ['ASA', 'Hey Asa', 'frequência', 'pendência', 'pendências', 'avaliação', 'Banco de Dados', 'Estruturas de Dados', 'coordenação'],
} as const;

/**
 * Ativação por voz "Hey Asa". Não existe motor de wake word dedicado no Expo: a detecção usa o
 * reconhecedor de fala do sistema em modo contínuo, SOMENTE com o app em primeiro plano e SOMENTE
 * quando o aluno liga a opção. Nunca roda em background (ver documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/assistant/wake-word.md).
 */
export const WAKE_WORD = {
  /** Disponibiliza a funcionalidade no app (a preferência do aluno continua decidindo se ela roda). */
  FEATURE_ENABLED: readBoolean(process.env.EXPO_PUBLIC_WAKE_WORD_ENABLED, true),
  /** Valor inicial da preferência "Hey Asa" — desligado: o aluno opta após o onboarding. */
  ENABLED_DEFAULT: false,
  /** Frases aceitas (normalizadas sem acento/maiúsculas). Variantes fonéticas comuns do reconhecedor. */
  PHRASES: ['hey asa', 'ei asa', 'hei asa', 'ok asa', 'oi asa', 'hey aza', 'ei aza', 'hey assa', 'ei assa', 'hey aça', 'ei aça', 'hey haza', 'hey lasa'],
  /** Atraso para reiniciar o reconhecedor quando ele encerra sozinho (silêncio). */
  RESTART_DELAY_MS: 350,
  /** Atraso após um erro recuperável (no-speech/network) antes de tentar de novo. */
  RETRY_DELAY_MS: 1_500,
  /** Falhas consecutivas toleradas antes de desistir e voltar ao botão. */
  MAX_CONSECUTIVE_FAILURES: 4,
  /** Janela mínima entre duas ativações (evita disparo duplo pelo parcial + final). */
  COOLDOWN_MS: 2_500,
  /** Duração máxima de uma sessão contínua antes de reciclar o reconhecedor (bateria/limites do SO). */
  MAX_SESSION_MS: 55_000,
  /** Tempo da animação de ativação (pulse + expansão) antes de abrir o microfone da conversa. */
  ACTIVATION_MS: 420,
  /** Barge-in (interromper o TTS por voz) — experimental; depende de cancelamento de eco do aparelho. */
  BARGE_IN_FEATURE_ENABLED: readBoolean(process.env.EXPO_PUBLIC_BARGE_IN_ENABLED, true),
} as const;

/** Histórico local de conversas (somente texto + horário + intenção; nunca áudio). */
export const HISTORY = {
  MAX_ENTRIES: 60,
  STORAGE_KEY: 'asa.assistant.history.v1',
} as const;

/** Quantidade padrão de itens do histórico de análises. */
export const HISTORY_LIMIT = 20;

export const API_ROUTES = {
  health: '/health',
  auth: {
    login: '/api/auth/login',
    refresh: '/api/auth/refresh',
    logout: '/api/auth/logout',
    register: '/api/auth/register',
    policy: '/api/auth/policy',
    programs: '/api/auth/programs',
    forgotPassword: '/api/auth/forgot-password',
    resendResetCode: '/api/auth/resend-reset-code',
    verifyResetCode: '/api/auth/verify-reset-code',
    resetPassword: '/api/auth/reset-password',
    biometricEnroll: '/api/auth/biometric/enroll',
    biometricLogin: '/api/auth/biometric/login',
    biometricRevoke: '/api/auth/biometric/revoke',
  },
  student: {
    me: '/api/student/me',
    summary: '/api/student/summary',
    subjects: '/api/student/subjects',
    assessments: '/api/student/assessments',
    attendance: '/api/student/attendance',
    pendingItems: '/api/student/pending-items',
  },
  agent: {
    analyze: '/api/agent/analyze',
    recommendations: '/api/agent/recommendations',
    recommendation: (id: string) => `/api/agent/recommendations/${encodeURIComponent(id)}`,
    history: (limit: number) => `/api/agent/history?limit=${limit}`,
    run: (runId: string) => `/api/agent/history/${encodeURIComponent(runId)}`,
  },
  assistant: {
    message: '/api/assistant/message',
  },
} as const;
