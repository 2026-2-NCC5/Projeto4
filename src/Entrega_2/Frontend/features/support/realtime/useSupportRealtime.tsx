import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { useOptionalSession } from '../../../hooks/useSession';
import { getSupportApi } from '../api';
import { clearSupportCache, purgeOtherUsers, setSupportCacheOwner } from '../cache';

import { emitSupportChange } from './changes';
import { SupportRealtimeController, type SupportRealtimeSnapshot } from './controller';

export interface SupportRealtimeView extends SupportRealtimeSnapshot {
  /** false: sem sessão ou em modo de demonstração. Nada é lido e a tela não diz nada sobre atualizações automáticas. */
  enabled: boolean;
}

const OFF: SupportRealtimeView = { enabled: false, state: 'connecting', lastSyncAt: null };

const SupportRealtimeContext = createContext<SupportRealtimeView>(OFF);

/**
 * Atualizações dos chamados na área autenticada. Só lê com sessão, em primeiro plano e fora do modo de demonstração.
 * Quando a sessão acaba (logout, expiração) ou a conta muda, a leitura para e o cache do Atendimento é apagado.
 */
export function SupportRealtimeProvider({ children }: { children: React.ReactNode }) {
  const session = useOptionalSession();
  const userId = session?.user?.id ?? null;
  const network = useNetworkStatus();
  const [controller] = useState(() => new SupportRealtimeController({ fetchEvents: (params, options) => getSupportApi().getEvents(params, options), onChange: emitSupportChange }));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const enabled = Boolean(userId) && !session?.signingOut && getSupportApi().mode !== 'mock';

  // Efeitos de layout: rodam antes das buscas das telas e, na saída, no mesmo commit em que a sessão acaba.
  useLayoutEffect(() => {
    if (!userId) return undefined;
    setSupportCacheOwner(userId);
    void purgeOtherUsers(userId);
    return () => {
      setSupportCacheOwner(null);
      void clearSupportCache();
    };
  }, [userId]);

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    controller.setForeground(AppState.currentState !== 'background');
    controller.start();
    const subscription = AppState.addEventListener('change', (next) => controller.setForeground(next === 'active'));
    return () => {
      subscription.remove();
      controller.stop();
    };
  }, [controller, enabled, userId]);

  useEffect(() => {
    controller.setOffline(network.isOffline);
  }, [controller, network.isOffline]);

  const value = useMemo<SupportRealtimeView>(() => (enabled ? { enabled: true, ...snapshot } : OFF), [enabled, snapshot]);
  return <SupportRealtimeContext.Provider value={value}>{children}</SupportRealtimeContext.Provider>;
}

/** Estado das atualizações automáticas. Fora do provider (telas isoladas): desligado. */
export function useSupportRealtime(): SupportRealtimeView {
  return useContext(SupportRealtimeContext);
}
