import AsyncStorage from '@react-native-async-storage/async-storage';

import type { QueueAlertMilestone, QueueAlertPreferences } from '../../../types/api';
import { QUEUE } from '../config';

import { MILESTONE_RANK } from './alerts';

export const DEFAULT_ALERT_PREFERENCES: QueueAlertPreferences = Object.freeze({ pushEnabled: true, voiceEnabled: true, vibrationEnabled: true });

const MAX_ENTRIES = 20;

function isMilestone(value: unknown): value is QueueAlertMilestone {
  return typeof value === 'string' && value in MILESTONE_RANK;
}

/** Alertas já exibidos neste aparelho, por acompanhamento (sobrevive a reinícios do app). */
export async function loadHandledAlerts(): Promise<Record<string, QueueAlertMilestone>> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE.STORAGE.ALERTS);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, QueueAlertMilestone] => isMilestone(entry[1])));
  } catch {
    return {};
  }
}

export async function saveHandledAlerts(handled: Record<string, QueueAlertMilestone>): Promise<void> {
  try {
    const entries = Object.entries(handled).slice(-MAX_ENTRIES);
    await AsyncStorage.setItem(QUEUE.STORAGE.ALERTS, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // best-effort: no pior caso um alerta já visto reaparece uma vez
  }
}

/** Preferências usadas ao acompanhar a próxima senha (o servidor guarda as do acompanhamento atual). */
export async function loadDefaultPreferences(): Promise<QueueAlertPreferences> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE.STORAGE.PREFERENCES);
    const value = raw ? (JSON.parse(raw) as Partial<QueueAlertPreferences>) : {};
    return {
      pushEnabled: typeof value.pushEnabled === 'boolean' ? value.pushEnabled : DEFAULT_ALERT_PREFERENCES.pushEnabled,
      voiceEnabled: typeof value.voiceEnabled === 'boolean' ? value.voiceEnabled : DEFAULT_ALERT_PREFERENCES.voiceEnabled,
      vibrationEnabled: typeof value.vibrationEnabled === 'boolean' ? value.vibrationEnabled : DEFAULT_ALERT_PREFERENCES.vibrationEnabled,
    };
  } catch {
    return { ...DEFAULT_ALERT_PREFERENCES };
  }
}

export async function saveDefaultPreferences(preferences: QueueAlertPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE.STORAGE.PREFERENCES, JSON.stringify(preferences));
  } catch {
    // best-effort
  }
}
