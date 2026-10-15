import { isApiClientError, type ApiClientError } from '../../services/apiClient';

/** Motivos estáveis (`error.reason`) devolvidos pela API de agendamentos. */
export type AppointmentErrorReason =
  | 'slot_unavailable'
  | 'student_conflict'
  | 'active_limit'
  | 'change_window_closed'
  | 'appointment_not_active'
  | 'appointment_changed'
  | 'too_soon'
  | 'too_far'
  | 'feature_disabled'
  | 'database_required';

export function appointmentErrorReason(error: unknown): string | null {
  return isApiClientError(error) ? ((error as ApiClientError).reason ?? null) : null;
}

/** O recurso está fora do ar neste ambiente (desligado pela administração ou sem banco de dados). */
export function isAppointmentsUnavailable(error: unknown): boolean {
  const reason = appointmentErrorReason(error);
  return reason === 'feature_disabled' || reason === 'database_required';
}

/**
 * Mensagens dos agendamentos para o estudante — nunca "Error 409" ou "Network request failed". Quando o servidor
 * explica a regra (limite de agendamentos, prazo de alteração, antecedência), o texto dele é usado.
 */
export function appointmentErrorMessage(error: unknown, fallback = 'Não conseguimos concluir agora. Tente novamente.'): string {
  if (!isApiClientError(error)) return fallback;
  const apiError = error as ApiClientError;
  const serverText = apiError.message && !/^Falha na requisição/.test(apiError.message) ? apiError.message : null;
  switch (apiError.reason) {
    case 'slot_unavailable':
      return 'Esse horário não está mais disponível. Escolha outro horário.';
    case 'student_conflict':
      return 'Você já tem um atendimento nesse horário. Escolha outro horário.';
    case 'active_limit':
      return serverText ?? 'Você já atingiu o limite de agendamentos ativos. Cancele ou aguarde um deles para marcar outro.';
    case 'change_window_closed':
      return serverText ?? 'O prazo para alterar este agendamento pelo app terminou. Fale com o ASA.';
    case 'appointment_not_active':
      return 'Este agendamento não está mais ativo.';
    case 'appointment_changed':
      return 'Este agendamento acabou de mudar. Confira a situação atualizada e tente de novo.';
    case 'too_soon':
      return serverText ?? 'Escolha um horário com mais antecedência.';
    case 'too_far':
      return serverText ?? 'Esse horário está além do período aberto para agendamento.';
    case 'feature_disabled':
      return 'Os agendamentos com o ASA estão desativados no momento.';
    case 'database_required':
      return 'Os agendamentos não estão disponíveis neste ambiente agora. Tente mais tarde.';
    default:
      break;
  }
  switch (apiError.kind) {
    case 'offline':
      return 'Você está offline. Tente de novo quando a conexão voltar.';
    case 'network':
      return 'Não conseguimos falar com o ASA agora. Verifique sua conexão e tente novamente.';
    case 'timeout':
      return 'A conexão está lenta e a resposta demorou demais. Tente novamente.';
    case 'rate_limited':
      return 'Muitas tentativas seguidas. Aguarde um pouco e tente novamente.';
    case 'forbidden':
      return 'Você não tem acesso a este agendamento.';
    case 'not_found':
      return 'Não encontramos este agendamento.';
    case 'validation':
      return serverText ?? fallback;
    default:
      return apiError.status === 409 && serverText ? serverText : fallback;
  }
}

/**
 * Falha ao carregar listas, catálogo ou horários: 404 aqui significa uma API sem agendamentos (versão anterior), não
 * "agendamento não encontrado".
 */
export function isAppointmentsRouteMissing(error: unknown): boolean {
  return isApiClientError(error) && (error as ApiClientError).kind === 'not_found';
}

export function appointmentLoadErrorMessage(error: unknown, fallback: string): string {
  if (isAppointmentsRouteMissing(error)) return 'Os agendamentos com o ASA ainda não estão disponíveis neste ambiente.';
  return appointmentErrorMessage(error, fallback);
}

/**
 * Recusa definitiva do servidor (regra de negócio, validação, permissão): nada foi criado e a próxima tentativa é
 * um novo pedido. Falhas de rede, tempo esgotado e erros 5xx são incertas — o pedido pode ter chegado — e por isso a
 * nova tentativa reaproveita a mesma chave de idempotência (o servidor devolve o agendamento já criado).
 */
export function isDefinitiveRejection(error: unknown): boolean {
  if (!isApiClientError(error)) return false;
  const status = (error as ApiClientError).status;
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
}
