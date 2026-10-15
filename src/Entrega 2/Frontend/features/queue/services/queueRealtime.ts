import { createSseParser, type SseMessage } from './sse';

export interface QueueStreamHandlers {
  onOpen?: () => void;
  onMessage: (message: SseMessage) => void;
  /** conexão encerrada (erro, fim do stream pelo servidor ou HTTP != 200) */
  onClose: (reason: { status: number | null; error: boolean }) => void;
}

export interface QueueStream {
  close(): void;
}

type XhrFactory = () => XMLHttpRequest;

/**
 * Canal em tempo real (SSE) sobre XMLHttpRequest: o fetch do React Native não entrega o corpo aos
 * poucos, o XHR entrega (`onprogress` com responseText parcial). O token vai no header Authorization.
 * O servidor encerra o stream periodicamente; o chamador reconecta com o token atualizado.
 */
export function openQueueStream(url: string, token: string, handlers: QueueStreamHandlers, createXhr: XhrFactory = () => new XMLHttpRequest()): QueueStream {
  const xhr = createXhr();
  const parser = createSseParser(handlers.onMessage);
  let seen = 0;
  let closed = false;
  let opened = false;

  const consume = () => {
    const text = xhr.responseText ?? '';
    if (text.length > seen) {
      parser.feed(text.slice(seen));
      seen = text.length;
    }
  };
  const finish = (error: boolean) => {
    if (closed) return;
    closed = true;
    handlers.onClose({ status: xhr.status || null, error });
  };

  xhr.open('GET', url, true);
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.setRequestHeader('Cache-Control', 'no-cache');
  xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  xhr.onreadystatechange = () => {
    if (xhr.readyState >= 2 && !opened && xhr.status === 200) {
      opened = true;
      handlers.onOpen?.();
    }
    if (xhr.readyState >= 3 && xhr.status === 200) consume();
    if (xhr.readyState === 4) {
      consume();
      finish(xhr.status !== 200);
    }
  };
  xhr.onprogress = () => consume();
  xhr.onerror = () => finish(true);
  xhr.ontimeout = () => finish(true);
  xhr.send();

  return {
    close() {
      if (closed) return;
      closed = true;
      xhr.onreadystatechange = null;
      xhr.onprogress = null;
      xhr.onerror = null;
      try {
        xhr.abort();
      } catch {
        // já encerrado
      }
    },
  };
}
