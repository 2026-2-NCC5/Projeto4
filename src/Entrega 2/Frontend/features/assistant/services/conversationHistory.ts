import AsyncStorage from '@react-native-async-storage/async-storage';

import { HISTORY } from '../../../config/services';
import type { AssistantIntent, AssistantResponseStatus } from '../../../types/api';

/**
 * Histórico local de conversas (Perfil → Assistente ASA → "Salvar histórico").
 * Guarda apenas texto, horário, intenção e status — NUNCA áudio, tokens ou dados de outras pessoas.
 * Fica no aparelho (AsyncStorage) e é apagado no "Limpar histórico" ou ao desligar a opção.
 */
export interface ConversationHistoryEntry {
  id: string;
  conversationId: string;
  question: string;
  answerTitle: string;
  answer: string;
  intent: AssistantIntent;
  status: AssistantResponseStatus;
  createdAt: string;
}

function isEntry(value: unknown): value is ConversationHistoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<ConversationHistoryEntry>;
  return typeof entry.id === 'string' && typeof entry.question === 'string' && typeof entry.answer === 'string' && typeof entry.createdAt === 'string' && typeof entry.intent === 'string' && typeof entry.status === 'string';
}

export async function loadConversationHistory(): Promise<ConversationHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY.STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export async function appendConversationHistory(entry: ConversationHistoryEntry): Promise<ConversationHistoryEntry[]> {
  const current = await loadConversationHistory();
  const next = [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, HISTORY.MAX_ENTRIES);
  try {
    await AsyncStorage.setItem(HISTORY.STORAGE_KEY, JSON.stringify(next));
  } catch {
    // best-effort: histórico é conveniência, nunca requisito
  }
  return next;
}

export async function clearConversationHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HISTORY.STORAGE_KEY);
  } catch {
    // ignorar
  }
}

/** Agrupa por dia ("Hoje", "Ontem", "dd/mm") para a lista do assistente. */
export function groupHistoryByDay(entries: ConversationHistoryEntry[], now: Date = new Date()): { label: string; entries: ConversationHistoryEntry[] }[] {
  const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const groups = new Map<string, { label: string; entries: ConversationHistoryEntry[] }>();
  for (const entry of entries) {
    const date = new Date(entry.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = dayKey(date);
    const label = key === today ? 'Hoje' : key === yesterday ? 'Ontem' : `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    const group = groups.get(key) ?? { label, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()];
}
