import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Feedback háptico do app (best-effort): nunca lança erro, nunca bloqueia o fluxo e é no-op no web.
 * Use com moderação — login concluído, erro de formulário, biometria ativada, senha alterada.
 */
export interface AppHaptics {
  success(): void;
  error(): void;
  warning(): void;
  selection(): void;
  impactLight(): void;
}

export type HapticsModule = Pick<typeof Haptics, 'impactAsync' | 'selectionAsync' | 'notificationAsync'>;

function bestEffort(run: () => Promise<void>) {
  try {
    void run().catch(() => undefined);
  } catch {
    // háptica é opcional: aparelho sem motor de vibração, web, etc.
  }
}

const NOOP_HAPTICS: AppHaptics = {
  success: () => undefined,
  error: () => undefined,
  warning: () => undefined,
  selection: () => undefined,
  impactLight: () => undefined,
};

export function createAppHaptics(module: HapticsModule = Haptics, platformOS: string = Platform.OS): AppHaptics {
  if (platformOS === 'web') return NOOP_HAPTICS;
  return {
    success: () => bestEffort(() => module.notificationAsync(Haptics.NotificationFeedbackType.Success)),
    error: () => bestEffort(() => module.notificationAsync(Haptics.NotificationFeedbackType.Error)),
    warning: () => bestEffort(() => module.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
    selection: () => bestEffort(() => module.selectionAsync()),
    impactLight: () => bestEffort(() => module.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  };
}

/** Instância compartilhada (lê a plataforma na criação do módulo). */
export const haptics: AppHaptics = createAppHaptics();
