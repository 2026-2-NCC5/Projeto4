import { Linking } from 'react-native';

/**
 * asaconecta://atendimento/fila (push, QR code ou outro app) → tela da fila.
 * Aceita variações de barra final e query string; qualquer outro caminho é ignorado.
 */
export function isQueueDeepLink(url: string | null | undefined): boolean {
  if (!url) return false;
  const match = /^asaconecta:\/\/+([^?#]*)/i.exec(url.trim());
  if (!match) return false;
  const path = (match[1] ?? '').replace(/\/+$/, '').toLowerCase();
  return path === 'atendimento/fila';
}

/** O link que abriu o app vale uma vez por execução (não reabre a fila a cada novo login). */
let initialUrlHandled = false;

/** Abre a fila quando o app é aberto por um link (início a frio ou com o app rodando). */
export function addQueueDeepLinkListener(onOpen: () => void): () => void {
  let active = true;
  if (!initialUrlHandled) {
    Linking.getInitialURL()
      .then((url) => {
        if (!active || initialUrlHandled) return;
        initialUrlHandled = true;
        if (isQueueDeepLink(url)) onOpen();
      })
      .catch(() => undefined);
  }
  const subscription = Linking.addEventListener('url', ({ url }) => {
    if (isQueueDeepLink(url)) onOpen();
  });
  return () => {
    active = false;
    subscription.remove();
  };
}
