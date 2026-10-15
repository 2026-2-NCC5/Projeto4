import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchCsrfToken, onSessionExpired, setCsrfToken } from '@/services/api/client';
import { authApi } from '@/services/api/endpoints';
import type { AuthMe, Permission, RegisterRequest, UserRole } from '@/types/api';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

export interface SessionValue {
  status: SessionStatus;
  me: AuthMe | null;
  /** motivo da última saída forçada (sessão expirada/encerrada), exibido no login */
  notice: string | null;
  login(email: string, password: string, rememberMe: boolean): Promise<AuthMe>;
  register(input: RegisterRequest): Promise<AuthMe>;
  logout(): Promise<void>;
  reload(): Promise<void>;
  clearNotice(): void;
  can(permission: Permission): boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Página inicial de cada papel (o servidor confere o acesso de qualquer forma). */
export function homeFor(role: UserRole): string {
  if (role === 'institutional_staff') return '/asa';
  if (role === 'technical_admin') return '/admin';
  return '/aluno';
}

async function bootstrap(): Promise<AuthMe | null> {
  await fetchCsrfToken({ reuse: true });
  const state = await authApi.session();
  setCsrfToken(state.csrfToken);
  return state.authenticated ? state.me : null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [me, setMe] = useState<AuthMe | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const signOutLocally = useCallback(
    (message: string | null) => {
      queryClient.clear();
      setMe(null);
      setStatus('anonymous');
      setNotice(message);
    },
    [queryClient],
  );

  useEffect(() => {
    let active = true;
    bootstrap()
      .then((result) => {
        if (!active) return;
        setMe(result);
        setStatus(result ? 'authenticated' : 'anonymous');
      })
      .catch(() => {
        if (!active) return;
        setStatus('anonymous');
        setNotice('Não foi possível verificar sua sessão. Verifique a conexão e entre novamente.');
      });
    return () => {
      active = false;
    };
  }, []);

  // Só escuta enquanto há sessão: a renovação falhou → volta para o login com o aviso.
  useEffect(() => {
    if (status !== 'authenticated') return undefined;
    return onSessionExpired(() => signOutLocally('Sua sessão expirou ou foi encerrada. Entre novamente.'));
  }, [status, signOutLocally]);

  const login = useCallback(
    async (email: string, password: string, rememberMe: boolean) => {
      if (!(await fetchCsrfToken())) await fetchCsrfToken();
      const session = await authApi.login({ email, password, rememberMe });
      setCsrfToken(session.csrfToken);
      const profile = await authApi.me();
      queryClient.clear();
      setMe(profile);
      setStatus('authenticated');
      setNotice(null);
      return profile;
    },
    [queryClient],
  );

  const register = useCallback(
    async (input: RegisterRequest) => {
      await fetchCsrfToken();
      const session = await authApi.register(input);
      setCsrfToken(session.csrfToken);
      const profile = await authApi.me();
      queryClient.clear();
      setMe(profile);
      setStatus('authenticated');
      setNotice(null);
      return profile;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      signOutLocally(null);
    }
  }, [signOutLocally]);

  const reload = useCallback(async () => {
    const profile = await authApi.me();
    setMe(profile);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      me,
      notice,
      login,
      register,
      logout,
      reload,
      clearNotice: () => setNotice(null),
      can: (permission) => Boolean(me?.permissions.includes(permission)),
    }),
    [status, me, notice, login, register, logout, reload],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Sessão fixa para testes de componentes (sem rede). */
export function StaticSessionProvider({ value, children }: { value: SessionValue; children: ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession precisa do SessionProvider');
  return value;
}

/** Perfil da sessão autenticada (uso dentro das rotas protegidas). */
export function useMe(): AuthMe {
  const { me } = useSession();
  if (!me) throw new Error('useMe usado fora de uma rota autenticada');
  return me;
}
