import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { API_BASE_URL } from '../config/env';
import { AUTH } from '../config/services';
import { ApiClientError, configureApiClient, isApiClientError } from '../services/apiClient';
import { BiometricError, isBiometricError } from '../services/authErrors';
import { authService } from '../services/authService';
import {
  biometricService,
  CHECKING_BIOMETRICS,
  type BiometricAvailability,
  type BiometricEnvironment,
  type BiometricMeta,
} from '../services/biometricService';
import { haptics } from '../services/haptics';
import {
  canPersistSession,
  clearLegacySessionKeys,
  clearPersistedSession,
  loadPersistedSession,
  persistSession,
  toMemorySession,
  type MemorySession,
} from '../services/sessionStorage';
import type { AuthSession, AuthStudent, AuthUser, RegisterRequest } from '../types/api';
import { normalizeEmail } from '../utils/authValidation';

import { loadAuthPolicyOrDefault } from './useAuthPolicy';

export type SessionStatus = 'booting' | 'unauthenticated' | 'authenticated';

/** Motivo do último encerramento de sessão (para exibir aviso na tela de login). */
export type SignOutReason = 'expired' | null;

/** Falha ao restaurar a sessão no boot por rede/timeout (a credencial é mantida). */
export type RestoreError = 'network' | null;

/** Como a sessão atual foi obtida — define a transição visual da SessionGate. */
export type AuthMethod = 'password' | 'register' | 'biometric' | 'restore';

export interface SignInOptions {
  /** "Manter conectado": persiste o refresh token no armazenamento seguro (somente nativo). */
  rememberMe?: boolean;
}

export interface BiometricAccountHint {
  fullName: string;
  email: string;
}

export interface BiometricState {
  availability: BiometricAvailability;
  /** Existe credencial biométrica neste aparelho. */
  enabled: boolean;
  /** Conta vinculada à credencial (para "Continuar como …"). */
  accountHint: BiometricAccountHint | null;
}

export interface BiometricOffer {
  visible: boolean;
  /** Ativa a biometria; lança em falha (a oferta continua aberta para nova tentativa). */
  accept: () => Promise<void>;
  /** "Agora não": não oferece de novo para este usuário neste aparelho. */
  decline: () => void;
}

export interface SessionContextValue {
  status: SessionStatus;
  user: AuthUser | null;
  student: AuthStudent | null;
  signOutReason: SignOutReason;
  restoreError: RestoreError;
  rememberMe: boolean;
  authMethod: AuthMethod | null;
  /** Incrementa a cada nova autenticação. */
  sessionEpoch: number;
  /** Nome salvo da sessão sendo restaurada (tela de boot/conexão). */
  restoreHint: { fullName: string } | null;
  /** false no web: tokens nunca são persistidos e "Manter conectado" fica oculto. */
  canRememberSession: boolean;
  signIn: (email: string, password: string, options?: SignInOptions) => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  signOut: () => Promise<void>;
  /** Força a renovação da sessão; retorna false quando não foi possível. */
  refresh: () => Promise<boolean>;
  /** Tenta restaurar novamente a sessão salva (tela "Não foi possível conectar"). */
  restoreSession: () => Promise<void>;
  clearSignOutReason: () => void;
  biometric: BiometricState;
  signInWithBiometrics: () => Promise<void>;
  enableBiometrics: () => Promise<void>;
  disableBiometrics: () => Promise<void>;
  biometricOffer: BiometricOffer;
  /** true no máximo uma vez por abertura do app (nunca após logout explícito, expiração ou cancelamento). */
  claimBiometricAutoPrompt: () => boolean;
  /** Após redefinir a senha a API revoga as credenciais biométricas: limpa a local se for da mesma conta. */
  forgetBiometricsForEmail: (email: string) => Promise<void>;
}

interface SessionState {
  status: SessionStatus;
  user: AuthUser | null;
  student: AuthStudent | null;
  signOutReason: SignOutReason;
  restoreError: RestoreError;
  rememberMe: boolean;
  authMethod: AuthMethod | null;
  sessionEpoch: number;
  restoreHint: { fullName: string } | null;
}

const INITIAL_STATE: SessionState = {
  status: 'booting',
  user: null,
  student: null,
  signOutReason: null,
  restoreError: null,
  rememberMe: false,
  authMethod: null,
  sessionEpoch: 0,
  restoreHint: null,
};

function unauthenticatedState(current: SessionState, signOutReason: SignOutReason): SessionState {
  return { ...INITIAL_STATE, status: 'unauthenticated', signOutReason, sessionEpoch: current.sessionEpoch };
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Tokens em memória, fora do estado React: nunca disparam render nem chegam a props. */
interface SessionHolder {
  get: () => MemorySession | null;
  set: (session: MemorySession | null) => void;
}

/** Liga o apiClient ao holder de sessão (fora do componente: nenhum ref é lido durante a renderização). */
function installApiClient(holder: SessionHolder, refreshSession: () => Promise<string | null>, forceSignOut: (reason: SignOutReason) => void): void {
  configureApiClient({
    baseUrl: API_BASE_URL,
    getAccessToken: () => holder.get()?.accessToken ?? null,
    refreshSession,
    onUnauthorized: () => forceSignOut('expired'),
  });
}

function createSessionHolder(): SessionHolder {
  let current: MemorySession | null = null;
  return {
    get: () => current,
    set: (session) => {
      current = session;
    },
  };
}

/** 401/400/403/404 no refresh = credencial rejeitada (limpa). Rede, timeout, 429 e 5xx = mantém e oferece retry. */
function isSessionRejected(error: unknown): boolean {
  return isApiClientError(error) && ['unauthorized', 'forbidden', 'validation', 'not_found'].includes(error.kind);
}

function rememberFrom(session: AuthSession, fallback: boolean): boolean {
  return typeof session.rememberMe === 'boolean' ? session.rememberMe : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deviceLabel(availability: BiometricAvailability): string {
  const platform = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS;
  return `${AUTH.BIOMETRIC_DEVICE_LABEL_PREFIX} · ${platform} · ${availability.label}`;
}

export interface SessionProviderProps {
  children: React.ReactNode;
  /** Injeta o ambiente de biometria (testes). */
  biometricEnvironment?: BiometricEnvironment;
}

export function SessionProvider({ children, biometricEnvironment }: SessionProviderProps) {
  const [state, setState] = useState<SessionState>(INITIAL_STATE);
  // Tokens vivem apenas em memória (holder) e, com "Manter conectado", no armazenamento seguro — nunca em state/props.
  const [sessionHolder] = useState(createSessionHolder);

  const [availability, setAvailability] = useState<BiometricAvailability>(CHECKING_BIOMETRICS);
  const [biometricMeta, setBiometricMeta] = useState<BiometricMeta | null>(null);
  const [offerVisible, setOfferVisible] = useState(false);

  const availabilityRef = useRef<BiometricAvailability>(CHECKING_BIOMETRICS);
  const availabilityReady = useRef<Promise<BiometricAvailability> | null>(null);
  const metaRef = useRef<BiometricMeta | null>(null);
  const autoPromptConsumed = useRef(false);
  const biometricBusy = useRef(false);
  const restoreRun = useRef(0);

  const updateMeta = useCallback((meta: BiometricMeta | null) => {
    metaRef.current = meta;
    setBiometricMeta(meta);
  }, []);

  /** Encerramento local por sessão inválida. Idempotente: 401 concorrentes geram um único aviso. */
  const forceSignOut = useCallback(
    (reason: SignOutReason) => {
      if (!sessionHolder.get()) return;
      sessionHolder.set(null);
      autoPromptConsumed.current = true;
      void clearPersistedSession().catch(() => undefined);
      setOfferVisible(false);
      setState((current) => unauthenticatedState(current, reason));
    },
    [sessionHolder],
  );

  const refreshSession = useCallback(async (): Promise<string | null> => {
    const current = sessionHolder.get();
    if (!current) return null;
    const session = await authService.refresh(current.refreshToken);
    // Logout/novo login durante o refresh: descarta o resultado.
    if (sessionHolder.get() !== current) return null;
    const next: MemorySession = { ...toMemorySession(session), rememberMe: rememberFrom(session, current.rememberMe) };
    sessionHolder.set(next);
    try {
      // Refresh rotativo: grava o novo token apenas quando a sessão é "lembrada".
      await persistSession(next);
    } catch {
      // armazenamento seguro indisponível: a sessão segue válida em memória
    }
    return next.accessToken;
  }, [sessionHolder]);

  // Liga o apiClient antes de qualquer efeito passivo dos filhos (layout effects do pai rodam antes
  // dos useEffect dos filhos, onde acontecem as chamadas à API). Dependências estáveis: roda uma vez.
  useLayoutEffect(() => {
    installApiClient(sessionHolder, refreshSession, forceSignOut);
  }, [sessionHolder, refreshSession, forceSignOut]);

  const applySession = useCallback(
    async (session: AuthSession, method: AuthMethod, rememberFallback: boolean) => {
      const memory: MemorySession = { ...toMemorySession(session), rememberMe: rememberFrom(session, rememberFallback) };
      sessionHolder.set(memory);
      autoPromptConsumed.current = true;
      try {
        await persistSession(memory);
      } catch {
        // falha ao gravar no armazenamento seguro: a sessão segue apenas em memória
      }
      setState((current) => ({
        status: 'authenticated',
        user: memory.user,
        student: memory.student,
        signOutReason: null,
        restoreError: null,
        rememberMe: memory.rememberMe && canPersistSession(),
        authMethod: method,
        sessionEpoch: current.sessionEpoch + 1,
        restoreHint: null,
      }));
    },
    [sessionHolder],
  );

  const runRestore = useCallback(async () => {
    const run = ++restoreRun.current;
    await clearLegacySessionKeys().catch(() => undefined);
    const stored = await loadPersistedSession();
    if (run !== restoreRun.current) return;
    if (!stored) {
      setState((current) => unauthenticatedState(current, null));
      return;
    }
    try {
      const session = await authService.refresh(stored.refreshToken);
      if (run !== restoreRun.current) return;
      await applySession(session, 'restore', true);
    } catch (error) {
      if (run !== restoreRun.current) return;
      if (isSessionRejected(error)) {
        await clearPersistedSession().catch(() => undefined);
        setState((current) => unauthenticatedState(current, 'expired'));
      } else {
        setState((current) => ({ ...current, status: 'booting', restoreError: 'network', restoreHint: { fullName: stored.user.fullName } }));
      }
    }
  }, [applySession]);

  useEffect(() => {
    // Restauração assíncrona (o estado só muda nos callbacks, nunca de forma síncrona no efeito).
    void Promise.resolve().then(runRestore);
  }, [runRestore]);

  // Biometria: metadados + disponibilidade do aparelho (a política só é consultada se o aparelho suportar).
  useEffect(() => {
    let active = true;
    const ready = Promise.all([
      biometricService.loadBiometricMeta(),
      biometricService.getBiometricAvailability({ policyEnabled: async () => (await loadAuthPolicyOrDefault()).biometric.enabled }, biometricEnvironment),
    ]).then(([meta, result]) => {
      if (active) {
        metaRef.current = meta;
        availabilityRef.current = result;
        setBiometricMeta(meta);
        setAvailability(result);
      }
      return result;
    });
    availabilityReady.current = ready;
    return () => {
      active = false;
    };
  }, [biometricEnvironment]);

  const maybeOfferBiometrics = useCallback(
    async (user: AuthUser) => {
      try {
        const result = await (availabilityReady.current ?? Promise.resolve(availabilityRef.current));
        if (result.status !== 'available') return;
        // Já existe credencial neste aparelho (desta ou de outra conta): nada a oferecer.
        if (metaRef.current) return;
        if (await biometricService.hasDeclinedBiometricOffer(user.id)) return;
        if (sessionHolder.get()?.user.id !== user.id) return;
        setOfferVisible(true);
      } catch {
        // oferta é opcional
      }
    },
    [sessionHolder],
  );

  const signIn = useCallback(
    async (email: string, password: string, options: SignInOptions = {}) => {
      const rememberMe = canPersistSession() && options.rememberMe === true;
      const session = await authService.login(email, password, rememberMe);
      await applySession(session, 'password', rememberMe);
      void maybeOfferBiometrics(session.user);
    },
    [applySession, maybeOfferBiometrics],
  );

  const register = useCallback(
    async (input: RegisterRequest) => {
      const rememberMe = canPersistSession() && input.rememberMe === true;
      const session = await authService.register({ ...input, rememberMe });
      await applySession(session, 'register', rememberMe);
      void maybeOfferBiometrics(session.user);
    },
    [applySession, maybeOfferBiometrics],
  );

  const signOut = useCallback(async () => {
    autoPromptConsumed.current = true;
    restoreRun.current += 1; // cancela uma restauração em andamento ("Entrar com outra conta")
    const refreshToken = sessionHolder.get()?.refreshToken ?? (await loadPersistedSession().catch(() => null))?.refreshToken;
    try {
      await authService.logout(refreshToken);
    } catch {
      // logout é best-effort: a sessão local é encerrada de qualquer forma
    }
    sessionHolder.set(null);
    await clearPersistedSession().catch(() => undefined);
    // Política: a biometria continua habilitada após o logout (o Perfil oferece desativar).
    setOfferVisible(false);
    setState((current) => unauthenticatedState(current, null));
  }, [sessionHolder]);

  const refresh = useCallback(async () => {
    try {
      return (await refreshSession()) !== null;
    } catch {
      forceSignOut('expired');
      return false;
    }
  }, [refreshSession, forceSignOut]);

  const restoreSession = useCallback(async () => {
    setState((current) => (current.restoreError ? { ...current, restoreError: null } : current));
    await runRestore();
  }, [runRestore]);

  const clearSignOutReason = useCallback(() => {
    setState((current) => (current.signOutReason ? { ...current, signOutReason: null } : current));
  }, []);

  const signInWithBiometrics = useCallback(async () => {
    if (biometricBusy.current) return;
    biometricBusy.current = true;
    try {
      const meta = metaRef.current;
      if (!meta || availabilityRef.current.status !== 'available') throw new BiometricError('BIOMETRIC_UNAVAILABLE');
      const credential = await biometricService.readBiometricCredential();
      let session: AuthSession;
      try {
        session = await authService.biometricLogin(meta.credentialId, credential);
      } catch (error) {
        if (isApiClientError(error) && (error.reason === 'biometric_credential_invalid' || error.kind === 'unauthorized')) {
          await biometricService.clearBiometricCredential();
          updateMeta(null);
          throw new ApiClientError({
            kind: 'unauthorized',
            status: error.status,
            reason: 'biometric_credential_invalid',
            message: 'Credencial biométrica inválida.',
            requestId: error.requestId,
            correlationId: error.correlationId,
          });
        }
        throw error;
      }
      await applySession(session, 'biometric', true);
    } catch (error) {
      if (isBiometricError(error)) {
        autoPromptConsumed.current = true;
        if (error.code === 'BIOMETRIC_INVALIDATED') updateMeta(null);
      }
      throw error;
    } finally {
      biometricBusy.current = false;
    }
  }, [applySession, updateMeta]);

  const enableBiometrics = useCallback(async () => {
    const current = sessionHolder.get();
    const deviceAvailability = availabilityRef.current;
    if (!current || deviceAvailability.status !== 'available') throw new BiometricError('BIOMETRIC_UNAVAILABLE');
    if (biometricBusy.current) return;
    biometricBusy.current = true;
    try {
      await biometricService.confirmBiometricEnrollment();
      const enrollment = await authService.biometricEnroll(deviceLabel(deviceAvailability));
      const previous = metaRef.current;
      const meta: BiometricMeta = {
        credentialId: enrollment.credentialId,
        userId: current.user.id,
        fullName: current.user.fullName,
        email: current.user.email,
        kind: deviceAvailability.kind ?? 'generic',
      };
      try {
        await biometricService.saveBiometricCredential(enrollment.credential, meta);
      } catch (error) {
        // Credencial já emitida mas não guardada: revoga no backend e limpa o que sobrou.
        void authService.biometricRevoke(enrollment.credentialId).catch(() => undefined);
        await biometricService.clearBiometricCredential();
        updateMeta(null);
        throw new BiometricError(biometricService.classifySecureStoreError(error) === 'cancelled' ? 'BIOMETRIC_CANCELLED' : 'BIOMETRIC_FAILED');
      }
      if (previous && previous.userId === current.user.id && previous.credentialId !== meta.credentialId) {
        void authService.biometricRevoke(previous.credentialId).catch(() => undefined);
      }
      updateMeta(meta);
      haptics.success();
    } finally {
      biometricBusy.current = false;
    }
  }, [sessionHolder, updateMeta]);

  const disableBiometrics = useCallback(async () => {
    const meta = metaRef.current;
    if (meta && sessionHolder.get()?.user.id === meta.userId) {
      try {
        await authService.biometricRevoke(meta.credentialId);
      } catch {
        // revogação best-effort: a credencial local é apagada e expira no servidor
      }
    }
    await biometricService.clearBiometricCredential();
    updateMeta(null);
  }, [sessionHolder, updateMeta]);

  const acceptBiometricOffer = useCallback(async () => {
    await enableBiometrics();
    // Deixa a confirmação "ativada" visível por um instante antes de fechar.
    await delay(AUTH.BIOMETRIC_ENABLED_FEEDBACK_MS);
    setOfferVisible(false);
  }, [enableBiometrics]);

  const declineBiometricOffer = useCallback(() => {
    const userId = sessionHolder.get()?.user.id;
    setOfferVisible(false);
    if (userId) void biometricService.setBiometricOfferDeclined(userId);
  }, [sessionHolder]);

  const claimBiometricAutoPrompt = useCallback(() => {
    if (autoPromptConsumed.current) return false;
    autoPromptConsumed.current = true;
    return true;
  }, []);

  const forgetBiometricsForEmail = useCallback(
    async (email: string) => {
      const meta = metaRef.current;
      if (!meta || normalizeEmail(meta.email) !== normalizeEmail(email)) return;
      await biometricService.clearBiometricCredential();
      updateMeta(null);
    },
    [updateMeta],
  );

  const biometric = useMemo<BiometricState>(
    () => ({
      availability,
      enabled: biometricMeta !== null,
      accountHint: biometricMeta ? { fullName: biometricMeta.fullName, email: biometricMeta.email } : null,
    }),
    [availability, biometricMeta],
  );

  const biometricOffer = useMemo<BiometricOffer>(
    () => ({ visible: offerVisible && state.status === 'authenticated', accept: acceptBiometricOffer, decline: declineBiometricOffer }),
    [offerVisible, state.status, acceptBiometricOffer, declineBiometricOffer],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      status: state.status,
      user: state.user,
      student: state.student,
      signOutReason: state.signOutReason,
      restoreError: state.restoreError,
      rememberMe: state.rememberMe,
      authMethod: state.authMethod,
      sessionEpoch: state.sessionEpoch,
      restoreHint: state.restoreHint,
      canRememberSession: canPersistSession(),
      signIn,
      register,
      signOut,
      refresh,
      restoreSession,
      clearSignOutReason,
      biometric,
      signInWithBiometrics,
      enableBiometrics,
      disableBiometrics,
      biometricOffer,
      claimBiometricAutoPrompt,
      forgetBiometricsForEmail,
    }),
    [
      state,
      signIn,
      register,
      signOut,
      refresh,
      restoreSession,
      clearSignOutReason,
      biometric,
      signInWithBiometrics,
      enableBiometrics,
      disableBiometrics,
      biometricOffer,
      claimBiometricAutoPrompt,
      forgetBiometricsForEmail,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Sessão quando disponível; null fora do <SessionProvider> (telas renderizadas isoladamente em testes). */
export function useOptionalSession(): SessionContextValue | null {
  return useContext(SessionContext);
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession deve ser usado dentro de <SessionProvider>.');
  }
  return context;
}

/** Alias semântico de useSession (mesmo contexto único de autenticação). */
export const useAuth = useSession;
