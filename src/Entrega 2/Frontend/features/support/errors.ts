import { isApiClientError, type ApiClientError } from '../../services/apiClient';

/**
 * Mensagens do Atendimento para o estudante — nunca "Error 500", "Fetch failed" ou "Network request failed".
 * Validações e conflitos (409) já chegam do servidor com texto amigável em português.
 */
export function supportErrorMessage(error: unknown, fallback = 'Não conseguimos concluir agora. Tente novamente.'): string {
  if (!isApiClientError(error)) return fallback;
  const apiError = error as ApiClientError;
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
      return 'Você não tem acesso a este chamado.';
    case 'not_found':
      return 'Não encontramos este chamado.';
    case 'validation':
      return apiError.message || fallback;
    default:
      return apiError.status === 409 && apiError.message ? apiError.message : fallback;
  }
}

/** O pedido falhou por falta de conexão (a tela mostra o modo offline em vez de erro). */
export function isConnectivityError(error: ApiClientError | null | undefined): boolean {
  return error?.kind === 'offline' || error?.kind === 'network' || error?.kind === 'timeout';
}
