import type { Logger } from '../config/logger.js';
import { validateAgentResponse, type AgentRequest, type AgentResponse } from '../contracts/agentContract.js';
import { ContractError, DependencyError, TimeoutError } from '../errors/AppError.js';

export interface AgentClientOptions {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export interface AgentClient {
  evaluate(request: AgentRequest, logger: Logger): Promise<AgentResponse>;
  health(): Promise<boolean>;
}

/**
 * Cliente HTTP Node.js → Python Agent Service (TASK-004 §37-39, §43-47).
 *
 * - timeout centralizado (AGENT_SERVICE_TIMEOUT_MS) via AbortController;
 * - propaga request_id/correlation_id no corpo e nos headers;
 * - classifica falhas: TIMEOUT (504), DEPENDENCY_ERROR (503), CONTRACT_ERROR (502);
 * - nunca converte falha em "lista vazia de recomendações".
 */
export function createAgentClient(options: AgentClientOptions): AgentClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const evaluateUrl = `${options.baseUrl}/internal/v1/student-agent/evaluate`;
  const healthUrl = `${options.baseUrl}/health`;

  return {
    async evaluate(request, logger) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs);
      const startedAt = Date.now();
      let response: Response;
      try {
        response = await fetchImpl(evaluateUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'x-request-id': request.request_id,
            'x-correlation-id': request.correlation_id,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        if (controller.signal.aborted) {
          logger.warn({ correlation_id: request.correlation_id, request_id: request.request_id, status: 'timeout', duration_ms: durationMs, timeout_ms: options.timeoutMs }, 'agent service timeout');
          throw new TimeoutError(undefined, error);
        }
        logger.error({ correlation_id: request.correlation_id, request_id: request.request_id, status: 'dependency_error', duration_ms: durationMs, error_type: error instanceof Error ? error.name : 'unknown' }, 'agent service unreachable');
        throw new DependencyError(undefined, error);
      } finally {
        clearTimeout(timer);
      }

      const durationMs = Date.now() - startedAt;
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        logger.error({ correlation_id: request.correlation_id, request_id: request.request_id, status: 'contract_error', http_status: response.status, duration_ms: durationMs }, 'agent service returned non-json body');
        throw new ContractError('A resposta do serviço de análise não é um JSON válido.');
      }

      if (response.status === 422) {
        const code = (payload as { error?: { code?: string } } | null)?.error?.code;
        logger.error({ correlation_id: request.correlation_id, request_id: request.request_id, status: 'contract_error', http_status: 422, duration_ms: durationMs, agent_error_code: code }, 'agent service rejected contract');
        throw new ContractError(
          code === 'CONTRACT_VERSION_UNSUPPORTED'
            ? 'O serviço de análise não aceita a versão de contrato enviada.'
            : 'O serviço de análise rejeitou o contexto enviado.',
        );
      }
      if (!response.ok) {
        logger.error({ correlation_id: request.correlation_id, request_id: request.request_id, status: 'dependency_error', http_status: response.status, duration_ms: durationMs }, 'agent service error response');
        throw new DependencyError();
      }

      try {
        const validated = validateAgentResponse(payload, request.request_id);
        logger.info({ correlation_id: request.correlation_id, request_id: request.request_id, run_id: validated.run_id, status: validated.status, duration_ms: durationMs }, 'agent service evaluated');
        return validated;
      } catch (error) {
        if (error instanceof ContractError) {
          logger.error({ correlation_id: request.correlation_id, request_id: request.request_id, status: 'contract_error', duration_ms: durationMs, details: error.details }, 'agent service response incompatible');
        }
        throw error;
      }
    },

    async health() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(options.timeoutMs, 2000));
      try {
        const response = await fetchImpl(healthUrl, { signal: controller.signal });
        return response.ok;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
