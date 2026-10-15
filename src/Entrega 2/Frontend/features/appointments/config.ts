/** Agendamentos com o ASA (contrato mobile v1.6). */
export const APPOINTMENTS = {
  /** Fuso da instituição: datas e horários sempre exibidos no horário de Brasília. */
  TIMEZONE: 'America/Sao_Paulo',
  /** Dias exibidos na escolha do dia (hoje + 13). */
  DAYS_SHOWN: 14,
  /** Atualização em segundo plano do detalhe aberto (ex.: confirmação pelo ASA). */
  DETAIL_POLL_MS: 60_000,
  /** Limite das observações enviadas ao ASA (o servidor aceita até 500 caracteres). */
  NOTES_MAX_LENGTH: 500,
  /** Limite do motivo de cancelamento (o servidor aceita até 500 caracteres). */
  CANCEL_REASON_MAX_LENGTH: 500,
} as const;

/** Rotas da API (o aluno vem sempre da sessão; nada de studentId no corpo). */
export const APPOINTMENT_ROUTES = {
  catalog: '/api/appointments/catalog',
  slots: '/api/appointments/slots',
  list: '/api/appointments',
  appointment: (id: string) => `/api/appointments/${encodeURIComponent(id)}`,
  cancel: (id: string) => `/api/appointments/${encodeURIComponent(id)}/cancel`,
  reschedule: (id: string) => `/api/appointments/${encodeURIComponent(id)}/reschedule`,
} as const;
