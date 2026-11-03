import { AsyncLocalStorage } from 'node:async_hooks';

/** Liga o correlation_id da requisição (ou do webhook/worker) aos eventos gravados, sem passar por toda a pilha de chamadas. */
const store = new AsyncLocalStorage<string>();

export function runWithCorrelation<T>(correlationId: string, fn: () => T): T {
  return store.run(correlationId, fn);
}

export function currentCorrelationId(): string | null {
  return store.getStore() ?? null;
}
