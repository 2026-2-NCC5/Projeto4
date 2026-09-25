import { VOICE, type SpeechProvider } from '../../config/services';
import type { SpeechRecognitionService } from '../../types/voice';

import { createExpoSpeechRecognitionAdapter, loadExpoSpeechRecognitionModule, type SpeechModuleLoaderDeps } from './expoSpeechRecognitionAdapter';
import { createUnavailableSpeechRecognition } from './unavailableSpeechRecognition';

export type {
  PermissionState,
  SpeechAvailability,
  SpeechRecognitionHandlers,
  SpeechRecognitionResult,
  SpeechRecognitionService,
} from '../../types/voice';

export interface CreateSpeechRecognitionOptions extends SpeechModuleLoaderDeps {
  enabled?: boolean;
  provider?: SpeechProvider;
  language?: string;
}

/**
 * Escolhe a implementação de reconhecimento de fala:
 * - assistente/provedor desativado → indisponível ('provider_disabled');
 * - módulo nativo ausente (Expo Go) ou navegador sem Web Speech API → indisponível;
 * - caso contrário → adapter de expo-speech-recognition.
 * Nunca pede permissão aqui: isso só acontece quando o aluno toca no microfone.
 */
export function createSpeechRecognitionService(options: CreateSpeechRecognitionOptions = {}): SpeechRecognitionService {
  const enabled = options.enabled ?? VOICE.ENABLED;
  const provider = options.provider ?? VOICE.SPEECH_PROVIDER;
  const language = options.language ?? VOICE.LANGUAGE;

  if (!enabled || provider === 'none') return createUnavailableSpeechRecognition('provider_disabled', language);

  const loaded = loadExpoSpeechRecognitionModule(options);
  if (!loaded.module) return createUnavailableSpeechRecognition(loaded.reason, language);

  return createExpoSpeechRecognitionAdapter({ module: loaded.module, language, platformOS: options.platformOS });
}
