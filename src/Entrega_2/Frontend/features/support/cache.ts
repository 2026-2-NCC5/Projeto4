import AsyncStorage from '@react-native-async-storage/async-storage';

import { SUPPORT } from './config';

/**
 * Cache local do Atendimento: chamados já carregados aparecem na hora (e offline) enquanto a atualização acontece
 * em segundo plano. Sempre separado por usuário; ao entrar com outra conta, o cache das demais é apagado.
 * Só texto e metadados — nunca o conteúdo de anexos.
 */
export interface CacheEntry<T> {
  data: T;
  savedAt: number;
}

const memory = new Map<string, CacheEntry<unknown>>();

const storageKey = (userId: string, key: string) => `${SUPPORT.CACHE_KEY_PREFIX}:${userId}:${key}`;

/** Leitura síncrona (somente memória) — usada no primeiro render para evitar esqueleto quando já há dados. */
export function peekCache<T>(userId: string, key: string): CacheEntry<T> | null {
  return (memory.get(storageKey(userId, key)) as CacheEntry<T> | undefined) ?? null;
}

export async function readCache<T>(userId: string, key: string): Promise<CacheEntry<T> | null> {
  const fullKey = storageKey(userId, key);
  const hit = memory.get(fullKey) as CacheEntry<T> | undefined;
  if (hit) return hit;
  try {
    const raw = await AsyncStorage.getItem(fullKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (typeof parsed !== 'object' || parsed === null || !('data' in parsed)) return null;
    memory.set(fullKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function writeCache<T>(userId: string, key: string, data: T, savedAt: number = Date.now()): void {
  const fullKey = storageKey(userId, key);
  const entry: CacheEntry<T> = { data, savedAt };
  memory.set(fullKey, entry);
  // Persistência best-effort: falha de armazenamento nunca atrapalha a tela.
  AsyncStorage.setItem(fullKey, JSON.stringify(entry)).catch(() => undefined);
}

/** Remove do aparelho o cache de outras contas (chamado quando o Atendimento abre). */
export async function purgeOtherUsers(userId: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const own = `${SUPPORT.CACHE_KEY_PREFIX}:${userId}:`;
    const stale = keys.filter((key) => key.startsWith(`${SUPPORT.CACHE_KEY_PREFIX}:`) && !key.startsWith(own));
    if (stale.length > 0) await AsyncStorage.multiRemove(stale);
    for (const key of [...memory.keys()]) if (!key.startsWith(own)) memory.delete(key);
  } catch {
    // sem armazenamento: nada a limpar
  }
}

/** Apenas para testes. */
export function clearSupportMemoryCache(): void {
  memory.clear();
}
