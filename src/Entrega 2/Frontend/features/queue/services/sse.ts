export interface SseMessage {
  event: string;
  data: string;
  id: string | null;
}

/**
 * Parser incremental de Server-Sent Events (text/event-stream). Recebe pedaços arbitrários do corpo
 * (o XHR entrega o texto acumulado aos poucos) e emite cada mensagem completa uma única vez.
 */
export function createSseParser(onMessage: (message: SseMessage) => void) {
  let buffer = '';
  let event = 'message';
  let data: string[] = [];
  let id: string | null = null;

  const dispatch = () => {
    if (data.length > 0) onMessage({ event, data: data.join('\n'), id });
    event = 'message';
    data = [];
  };

  return {
    feed(chunk: string) {
      buffer += chunk;
      let newline = buffer.search(/\r\n|\r|\n/);
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        const separatorLength = buffer.startsWith('\r\n', newline) ? 2 : 1;
        buffer = buffer.slice(newline + separatorLength);
        if (line === '') dispatch();
        else if (!line.startsWith(':')) {
          const colon = line.indexOf(':');
          const field = colon >= 0 ? line.slice(0, colon) : line;
          const value = colon >= 0 ? line.slice(colon + 1).replace(/^ /, '') : '';
          if (field === 'event') event = value || 'message';
          else if (field === 'data') data.push(value);
          else if (field === 'id') id = value;
        }
        newline = buffer.search(/\r\n|\r|\n/);
      }
    },
  };
}
