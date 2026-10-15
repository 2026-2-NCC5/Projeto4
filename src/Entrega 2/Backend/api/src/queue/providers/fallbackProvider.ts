import type { QueueProvider, QueueSnapshot } from '../types.js';

/**
 * Tenta os providers em ordem (API estruturada → HTML). Se todos falharem, propaga o erro do
 * primeiro (o mais informativo para diagnóstico); o monitor mantém o último snapshot válido.
 */
export class FallbackQueueProvider implements QueueProvider {
  readonly name: string;

  constructor(
    private readonly providers: QueueProvider[],
    private readonly onFallback?: (failed: QueueProvider, error: unknown) => void,
  ) {
    this.name = providers.map((provider) => provider.name).join('+');
  }

  async getCurrentQueue(): Promise<QueueSnapshot> {
    let firstError: unknown = null;
    for (const provider of this.providers) {
      try {
        return await provider.getCurrentQueue();
      } catch (error) {
        firstError ??= error;
        this.onFallback?.(provider, error);
      }
    }
    throw firstError ?? new Error('nenhum provider de fila configurado');
  }
}
