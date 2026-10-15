import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { VOICE, WAKE_WORD } from '../config/services';

export type ReduceMotionPreference = 'system' | 'always';
export type AppearancePreference = 'system' | 'light' | 'dark';

export interface Preferences {
  /** Respostas do assistente também são faladas (TTS). */
  ttsEnabled: boolean;
  /** Mostra "Você disse:" e a transcrição parcial. */
  transcriptVisible: boolean;
  /** 'system' segue a configuração de acessibilidade do aparelho; 'always' sempre reduz. */
  reduceMotion: ReduceMotionPreference;
  /** Tema: seguir o sistema, claro ou escuro. */
  appearance: AppearancePreference;
  /** Feedback tátil em ações principais e no assistente. */
  hapticsEnabled: boolean;
  /**
   * Ativação por voz "Hey Asa" enquanto o app está aberto. Desligada por padrão: o aluno liga
   * conscientemente após o onboarding (o microfone fica ativo em primeiro plano).
   */
  wakeWordEnabled: boolean;
  /** Interromper a resposta falada dizendo "Hey Asa" (barge-in). Experimental. */
  bargeInEnabled: boolean;
  /** Guardar histórico de conversas (apenas texto + horário; nunca áudio) no aparelho. */
  historyEnabled: boolean;
  /** true depois que o aluno viu "Conheça o Hey Asa". */
  heyAsaOnboardingSeen: boolean;
  /** Identificador da voz do sistema para o TTS (null = padrão do idioma). */
  ttsVoiceId: string | null;
}

/** v1 guardava só as três primeiras preferências; a leitura aceita as duas versões. */
export const PREFERENCES_STORAGE_KEY = 'asa.preferences.v2';
export const LEGACY_PREFERENCES_STORAGE_KEY = 'asa.preferences.v1';

export const DEFAULT_PREFERENCES: Preferences = Object.freeze({
  ttsEnabled: VOICE.TTS_ENABLED_DEFAULT,
  transcriptVisible: true,
  reduceMotion: 'system',
  appearance: 'system',
  hapticsEnabled: true,
  wakeWordEnabled: WAKE_WORD.ENABLED_DEFAULT,
  bargeInEnabled: false,
  historyEnabled: true,
  heyAsaOnboardingSeen: false,
  ttsVoiceId: null,
});

export interface PreferencesContextValue {
  preferences: Preferences;
  /** true após a leitura do armazenamento local (ou falha dela). */
  ready: boolean;
  updatePreferences: (changes: Partial<Preferences>) => void;
}

function pickBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Aceita apenas campos conhecidos e com tipo válido (dados antigos/corrompidos caem nos padrões). */
export function sanitizePreferences(raw: unknown): Preferences {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PREFERENCES;
  return {
    ttsEnabled: pickBool(value.ttsEnabled, d.ttsEnabled),
    transcriptVisible: pickBool(value.transcriptVisible, d.transcriptVisible),
    reduceMotion: value.reduceMotion === 'always' || value.reduceMotion === 'system' ? value.reduceMotion : d.reduceMotion,
    appearance: value.appearance === 'light' || value.appearance === 'dark' || value.appearance === 'system' ? value.appearance : d.appearance,
    hapticsEnabled: pickBool(value.hapticsEnabled, d.hapticsEnabled),
    wakeWordEnabled: pickBool(value.wakeWordEnabled, d.wakeWordEnabled),
    bargeInEnabled: pickBool(value.bargeInEnabled, d.bargeInEnabled),
    historyEnabled: pickBool(value.historyEnabled, d.historyEnabled),
    heyAsaOnboardingSeen: pickBool(value.heyAsaOnboardingSeen, d.heyAsaOnboardingSeen),
    ttsVoiceId: typeof value.ttsVoiceId === 'string' && value.ttsVoiceId.trim() ? value.ttsVoiceId : null,
  };
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

async function readStoredPreferences(): Promise<Preferences | null> {
  const current = await AsyncStorage.getItem(PREFERENCES_STORAGE_KEY);
  if (current) return sanitizePreferences(JSON.parse(current));
  const legacy = await AsyncStorage.getItem(LEGACY_PREFERENCES_STORAGE_KEY);
  if (legacy) return sanitizePreferences(JSON.parse(legacy));
  return null;
}

export function PreferencesProvider({ children, initialPreferences }: { children: React.ReactNode; initialPreferences?: Partial<Preferences> }) {
  const [preferences, setPreferences] = useState<Preferences>(() => ({ ...DEFAULT_PREFERENCES, ...initialPreferences }));
  const [ready, setReady] = useState(false);
  // true depois que o aluno altera algo: a escolha dele prevalece sobre a leitura e passa a ser persistida.
  const changedByUser = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await readStoredPreferences();
        if (active && stored && !changedByUser.current) setPreferences(stored);
      } catch {
        // armazenamento indisponível ou JSON inválido: mantém os padrões
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!changedByUser.current) return;
    try {
      AsyncStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences)).catch(() => undefined);
    } catch {
      // persistência é best-effort
    }
  }, [preferences]);

  const updatePreferences = useCallback((changes: Partial<Preferences>) => {
    changedByUser.current = true;
    setPreferences((current) => sanitizePreferences({ ...current, ...changes }));
  }, []);

  const value = useMemo<PreferencesContextValue>(() => ({ preferences, ready, updatePreferences }), [preferences, ready, updatePreferences]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

const FALLBACK: PreferencesContextValue = {
  preferences: DEFAULT_PREFERENCES,
  ready: true,
  updatePreferences: () => undefined,
};

/** Preferências do aparelho. Fora de um PreferencesProvider devolve os padrões (somente leitura). */
export function usePreferences(): PreferencesContextValue {
  return useContext(PreferencesContext) ?? FALLBACK;
}
