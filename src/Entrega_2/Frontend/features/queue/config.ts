import { readBoolean } from '../../config/services';

/**
 * Fila presencial do ASA. O app NÃO consulta presencial.fecap.br: o backend monitora a fonte e envia
 * push (app fechado/em segundo plano) e eventos em tempo real (app aberto). Polling aqui é só o
 * plano B do canal em tempo real, e apenas com o app em primeiro plano.
 */
export const QUEUE = {
  /** EXPO_PUBLIC_USE_MOCK_QUEUE=true → fila simulada no aparelho (desenvolvimento; nunca em produção). */
  USE_MOCK: readBoolean(process.env.EXPO_PUBLIC_USE_MOCK_QUEUE, false),
  /** Plano B quando o canal em tempo real (SSE) não conecta. */
  POLL_INTERVAL_MS: 15_000,
  /** Espera entre tentativas de reconectar o SSE. */
  STREAM_RETRY_MS: [3_000, 10_000, 30_000, 60_000] as readonly number[],
  /** Rota interna aberta pelo push e por links externos. */
  DEEP_LINK: 'asaconecta://atendimento/fila',
  /** Canal Android (importância alta + vibração), o mesmo enviado pelo backend. */
  ANDROID_CHANNEL_ID: 'queue-alerts',
  /** vibrar · pausa · vibrar (iOS ignora o padrão e vibra uma vez). */
  VIBRATION_PATTERN: [0, 400, 200, 400] as number[],
  /** Chamada mais antiga que isto não abre o alerta de "É a sua vez!" (só atualiza a tela). */
  CALLED_ALERT_MAX_AGE_MS: 30 * 60_000,
  /** Tempo do aviso interno (banner) na tela. */
  BANNER_MS: 7_000,
  /** Simulação local: intervalo entre chamadas. */
  MOCK_STEP_MS: 8_000,
  STORAGE: {
    /** alerta mais urgente já exibido por acompanhamento (evita repetir após reiniciar o app) */
    ALERTS: 'asa.queue.alerts.v1',
    /** preferências usadas no próximo acompanhamento */
    PREFERENCES: 'asa.queue.preferences.v1',
  },
} as const;

export const QUEUE_ROUTES = {
  overview: '/api/queue',
  status: '/api/queue/status',
  stream: '/api/queue/stream',
  subscriptions: '/api/queue/subscriptions',
  current: '/api/queue/subscriptions/current',
  pushToken: '/api/notifications/push-token',
  devMock: '/api/queue/dev/mock',
} as const;
