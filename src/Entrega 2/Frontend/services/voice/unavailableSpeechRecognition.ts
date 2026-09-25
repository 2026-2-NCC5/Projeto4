import type { SpeechAvailability, SpeechRecognitionHandlers, SpeechRecognitionResult, SpeechRecognitionService, SpeechUnavailableReason } from '../../types/voice';

/**
 * Serviço usado quando a entrada por voz não pode funcionar (Expo Go, provedor desativado,
 * navegador sem Web Speech API...). A UI continua em modo texto.
 */
export function createUnavailableSpeechRecognition(reason: SpeechUnavailableReason, language = 'pt-BR'): SpeechRecognitionService {
  const availability: SpeechAvailability = { available: false, reason };
  return {
    provider: 'unavailable',
    getAvailability: async () => availability,
    getPermission: async () => 'denied',
    requestPermission: async () => 'denied',
    start: async (handlers: SpeechRecognitionHandlers) => {
      handlers.onError?.({ kind: 'unavailable' });
    },
    stop: async (): Promise<SpeechRecognitionResult> => ({ transcript: '', language }),
    cancel: async () => undefined,
  };
}
