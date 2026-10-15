import type { AppHaptics } from '../../../services/haptics';
import type { QueueAlertPreferences } from '../../../types/api';
import type { QueueInAppAlert } from '../state/alerts';
import { calledAccessibilityAnnouncement, queueSpeech } from '../voice/queueSpeech';

export interface AlertEffectDeps {
  haptics: AppHaptics;
  /** TTS do assistente (useVoiceAssistant.announce); null fora do assistente */
  speak: ((text: string, priority: 'high' | 'normal') => boolean) | null;
  /** AccessibilityInfo.announceForAccessibility */
  announceAccessibility: (text: string) => void;
  /** com leitor de tela ativo a fala vai pelo leitor (sem duas vozes ao mesmo tempo) */
  screenReaderEnabled: boolean;
  firstName: string | null;
  schedule?: (run: () => void, ms: number) => void;
}

export interface AlertEffectResult {
  spoke: boolean;
  vibrated: boolean;
  announcedToScreenReader: boolean;
}

/** Pausa entre os dois pulsos da vibração de "É a sua vez!". */
export const CALLED_VIBRATION_GAP_MS = 400;

/**
 * Efeitos de um alerta interno, conforme as preferências do acompanhamento:
 * - vibração: leve ao se aproximar, mais marcada em "prepare-se", dois pulsos na chamada
 *   (expo-haptics respeita as configurações de vibração do aparelho);
 * - voz: ASA IA pelo TTS do assistente; a chamada tem prioridade alta e interrompe outra fala;
 * - leitor de tela: a chamada é sempre anunciada; com leitor ativo, ele substitui o TTS.
 */
export function performQueueAlert(alert: QueueInAppAlert, preferences: QueueAlertPreferences, deps: AlertEffectDeps): AlertEffectResult {
  const schedule = deps.schedule ?? ((run, ms) => setTimeout(run, ms));
  const result: AlertEffectResult = { spoke: false, vibrated: false, announcedToScreenReader: false };

  if (preferences.vibrationEnabled) {
    result.vibrated = true;
    if (alert.kind === 'called') {
      deps.haptics.success();
      schedule(() => deps.haptics.success(), CALLED_VIBRATION_GAP_MS);
    } else if (alert.kind === 'next') {
      deps.haptics.warning();
    } else {
      deps.haptics.impactLight();
    }
  }

  const speech = queueSpeech(alert.kind, { firstName: deps.firstName, ticket: alert.ticket, desk: alert.desk, ahead: alert.ahead });
  if (deps.screenReaderEnabled) {
    if (alert.kind === 'called') {
      deps.announceAccessibility(calledAccessibilityAnnouncement(alert.ticket, alert.desk));
      result.announcedToScreenReader = true;
    } else if (preferences.voiceEnabled) {
      deps.announceAccessibility(speech);
      result.announcedToScreenReader = true;
    }
    return result;
  }
  if (alert.kind === 'called') {
    deps.announceAccessibility(calledAccessibilityAnnouncement(alert.ticket, alert.desk));
    result.announcedToScreenReader = true;
  }
  if (preferences.voiceEnabled && deps.speak) {
    result.spoke = deps.speak(speech, alert.kind === 'called' ? 'high' : 'normal');
  }
  return result;
}
