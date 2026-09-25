import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { AuthSession, AuthStudent, AuthUser } from '../types/api';

/**
 * Persistência da sessão — política de segurança:
 * - access token: NUNCA persistido (vive só em memória no SessionProvider);
 * - refresh token: persistido no expo-secure-store (Keychain/Keystore) SOMENTE quando a sessão tem
 *   `rememberMe === true` e a plataforma é nativa. Sem "Manter conectado", fechar o app encerra a sessão;
 * - web: NUNCA persiste tokens (nada em AsyncStorage/localStorage);
 * - senha: nunca é gravada em lugar nenhum.
 */

/** Sessão em memória (holder do SessionProvider). Nunca vai para estado React, props ou logs. */
export interface MemorySession {
  accessToken: string;
  refreshToken: string;
  rememberMe: boolean;
  user: AuthUser;
  student: AuthStudent | null;
}

/** O que fica no armazenamento seguro para restaurar a sessão no próximo boot. */
export interface PersistedSession {
  refreshToken: string;
  rememberMe: true;
  user: AuthUser;
  student: AuthStudent | null;
}

export const SESSION_KEYS = {
  refreshToken: 'asa.auth.refreshToken',
  profile: 'asa.auth.profile',
} as const;

/** Chaves de versões anteriores (guardavam access token e, no web, usavam AsyncStorage). */
export const LEGACY_SESSION_KEYS = ['asa.session.accessToken', 'asa.session.refreshToken', 'asa.session.profile'] as const;

/** Refresh token não sai do aparelho (sem backup/migração para outro dispositivo). */
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export interface StorageOptions {
  platformOS?: string;
}

/** Tokens só podem ser persistidos em plataformas nativas. */
export function canPersistSession(options: StorageOptions = {}): boolean {
  return (options.platformOS ?? Platform.OS) !== 'web';
}

export function toMemorySession(session: AuthSession): MemorySession {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    rememberMe: session.rememberMe === true,
    user: session.user,
    student: session.student,
  };
}

function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== 'object' || value === null) return false;
  const user = value as Partial<AuthUser>;
  return typeof user.id === 'string' && typeof user.email === 'string' && typeof user.fullName === 'string' && typeof user.role === 'string';
}

function isAuthStudent(value: unknown): value is AuthStudent {
  if (typeof value !== 'object' || value === null) return false;
  const student = value as Partial<AuthStudent>;
  return typeof student.id === 'string' && typeof student.registrationNumber === 'string';
}

/**
 * Persiste (ou remove) a sessão conforme `rememberMe` e plataforma.
 * Retorna true quando o refresh token foi gravado no armazenamento seguro.
 */
export async function persistSession(
  session: Pick<MemorySession, 'refreshToken' | 'rememberMe' | 'user' | 'student'>,
  options: StorageOptions = {},
): Promise<boolean> {
  if (!canPersistSession(options)) return false;
  if (!session.rememberMe) {
    await clearPersistedSession(options);
    return false;
  }
  const profile = { user: session.user, student: session.student, rememberMe: true };
  await SecureStore.setItemAsync(SESSION_KEYS.refreshToken, session.refreshToken, SECURE_OPTIONS);
  await SecureStore.setItemAsync(SESSION_KEYS.profile, JSON.stringify(profile), SECURE_OPTIONS);
  return true;
}

/** Lê a sessão persistida; dados ausentes, corrompidos ou ilegíveis → null (e são descartados). */
export async function loadPersistedSession(options: StorageOptions = {}): Promise<PersistedSession | null> {
  if (!canPersistSession(options)) return null;
  try {
    const [refreshToken, profileRaw] = await Promise.all([
      SecureStore.getItemAsync(SESSION_KEYS.refreshToken, SECURE_OPTIONS),
      SecureStore.getItemAsync(SESSION_KEYS.profile, SECURE_OPTIONS),
    ]);
    if (!refreshToken || !profileRaw) {
      if (refreshToken || profileRaw) await clearPersistedSession(options);
      return null;
    }
    const profile = JSON.parse(profileRaw) as { user?: unknown; student?: unknown; rememberMe?: unknown };
    if (!isAuthUser(profile.user) || profile.rememberMe !== true) {
      await clearPersistedSession(options);
      return null;
    }
    return { refreshToken, rememberMe: true, user: profile.user, student: isAuthStudent(profile.student) ? profile.student : null };
  } catch {
    await clearPersistedSession(options);
    return null;
  }
}

export async function clearPersistedSession(options: StorageOptions = {}): Promise<void> {
  if (!canPersistSession(options)) return;
  await Promise.allSettled([
    SecureStore.deleteItemAsync(SESSION_KEYS.refreshToken, SECURE_OPTIONS),
    SecureStore.deleteItemAsync(SESSION_KEYS.profile, SECURE_OPTIONS),
  ]);
}

/** Remove chaves de versões anteriores (SecureStore no nativo; AsyncStorage em todas as plataformas). */
export async function clearLegacySessionKeys(options: StorageOptions = {}): Promise<void> {
  const tasks: Promise<unknown>[] = LEGACY_SESSION_KEYS.map((key) => AsyncStorage.removeItem(key));
  if (canPersistSession(options)) {
    tasks.push(...LEGACY_SESSION_KEYS.map((key) => SecureStore.deleteItemAsync(key)));
  }
  await Promise.allSettled(tasks);
}

export const sessionStorage = {
  canPersistSession,
  toMemorySession,
  persistSession,
  loadPersistedSession,
  clearPersistedSession,
  clearLegacySessionKeys,
};
