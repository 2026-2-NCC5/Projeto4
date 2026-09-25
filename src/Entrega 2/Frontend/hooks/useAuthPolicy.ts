import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_AUTH_POLICY } from '../config/authPolicy';
import { authService } from '../services/authService';
import type { AuthPolicy } from '../types/api';

export type AuthPolicySource = 'loading' | 'remote' | 'fallback';

export interface AuthPolicyState {
  /** Sempre definida: a política remota ou DEFAULT_AUTH_POLICY enquanto carrega/falhou. */
  policy: AuthPolicy;
  source: AuthPolicySource;
  reload: () => void;
}

let cachedPolicy: AuthPolicy | null = null;
let inFlight: Promise<AuthPolicy> | null = null;

/**
 * Busca `GET /api/auth/policy` uma vez por abertura do app (cache em memória, requisições
 * concorrentes compartilhadas). Em falha rejeita — quem chama decide usar o fallback.
 */
export function fetchAuthPolicy(options: { force?: boolean } = {}): Promise<AuthPolicy> {
  if (cachedPolicy && !options.force) return Promise.resolve(cachedPolicy);
  if (!inFlight) {
    inFlight = authService
      .getPolicy()
      .then((policy) => {
        cachedPolicy = policy;
        return policy;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Política atual ou o fallback, sem lançar. */
export async function loadAuthPolicyOrDefault(): Promise<AuthPolicy> {
  try {
    return await fetchAuthPolicy();
  } catch {
    return DEFAULT_AUTH_POLICY;
  }
}

export function getCachedAuthPolicy(): AuthPolicy | null {
  return cachedPolicy;
}

/** Apenas para testes. */
export function resetAuthPolicyCacheForTests(policy: AuthPolicy | null = null): void {
  cachedPolicy = policy;
  inFlight = null;
}

interface SettledPolicy {
  version: number;
  policy: AuthPolicy;
  source: Exclude<AuthPolicySource, 'loading'>;
}

/** Política de autenticação para as telas. O backend é a fonte de verdade; o fallback evita tela vazia. */
export function useAuthPolicy(): AuthPolicyState {
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState<SettledPolicy | null>(() =>
    cachedPolicy ? { version: 0, policy: cachedPolicy, source: 'remote' } : null,
  );

  const needsFetch = settled === null || settled.version !== version;

  useEffect(() => {
    if (!needsFetch) return undefined;
    let active = true;
    fetchAuthPolicy({ force: version > 0 })
      .then((policy) => {
        if (active) setSettled({ version, policy, source: 'remote' });
      })
      .catch(() => {
        if (active) setSettled({ version, policy: cachedPolicy ?? DEFAULT_AUTH_POLICY, source: cachedPolicy ? 'remote' : 'fallback' });
      });
    return () => {
      active = false;
    };
  }, [needsFetch, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  return {
    policy: settled?.policy ?? cachedPolicy ?? DEFAULT_AUTH_POLICY,
    source: needsFetch ? 'loading' : (settled?.source ?? 'loading'),
    reload,
  };
}
