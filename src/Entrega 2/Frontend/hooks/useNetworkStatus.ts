import * as Network from 'expo-network';
import { useEffect, useState } from 'react';

export interface NetworkStatus {
  /** true somente quando o sistema informa que NÃO há conexão (desconhecido = online). */
  isOffline: boolean;
  isConnected: boolean | null;
}

function toStatus(state: { isConnected?: boolean | null; isInternetReachable?: boolean | null } | null | undefined): NetworkStatus {
  const connected = state?.isConnected ?? null;
  const reachable = state?.isInternetReachable ?? null;
  return { isConnected: connected, isOffline: connected === false || reachable === false };
}

/** Estado da conexão (expo-network), atualizado por evento. Falhas da API de rede contam como online. */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({ isOffline: false, isConnected: null });

  useEffect(() => {
    let active = true;
    Network.getNetworkStateAsync()
      .then((state) => {
        if (active) setStatus(toStatus(state));
      })
      .catch(() => undefined);
    let subscription: { remove(): void } | null = null;
    try {
      subscription = Network.addNetworkStateListener((state) => setStatus(toStatus(state)));
    } catch {
      subscription = null;
    }
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  return status;
}
