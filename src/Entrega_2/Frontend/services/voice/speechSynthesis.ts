import * as ExpoSpeech from 'expo-speech';

import { VOICE } from '../../config/services';
import type { SpeechSynthesisHandlers, SpeechSynthesisService } from '../../types/voice';

type SpeechModule = Pick<typeof ExpoSpeech, 'speak' | 'stop'> & { maxSpeechInputLength?: number };

export interface SpeechSynthesisOptions {
  speech?: SpeechModule;
  language?: string;
  now?: () => number;
  /** Identificador da voz preferida (Perfil → Assistente ASA → Voz); null = padrão do idioma. */
  getVoice?: () => string | null;
}

let preferredVoiceId: string | null = null;

/** Define a voz usada pelas próximas falas (chamado pelo provider quando a preferência muda). */
export function setPreferredVoice(voiceId: string | null): void {
  preferredVoiceId = voiceId;
}

/**
 * Text-to-Speech com expo-speech (funciona no Expo Go, iOS, Android e web).
 * Cada fala resolve exatamente um callback final (onDone, onStopped ou onError) com a duração medida.
 */
export function createSpeechSynthesisService(options: SpeechSynthesisOptions = {}): SpeechSynthesisService {
  const speech: SpeechModule = options.speech ?? ExpoSpeech;
  const language = options.language ?? VOICE.LANGUAGE;
  const now = options.now ?? Date.now;
  const getVoice = options.getVoice ?? (() => preferredVoiceId);

  return {
    provider: 'expo-speech',

    speak(text: string, handlers: SpeechSynthesisHandlers = {}) {
      const startedAt = now();
      let finished = false;
      const finish = (callback: () => void) => {
        if (finished) return;
        finished = true;
        callback();
      };
      const maxLength = speech.maxSpeechInputLength;
      const utterance = typeof maxLength === 'number' && maxLength > 0 ? text.slice(0, maxLength) : text;

      try {
        const voice = getVoice();
        speech.speak(utterance, {
          language,
          ...(voice ? { voice } : {}),
          onStart: () => handlers.onStart?.(),
          onDone: () => finish(() => handlers.onDone?.(now() - startedAt)),
          onStopped: () => finish(() => handlers.onStopped?.(now() - startedAt)),
          onError: (error: Error) => finish(() => handlers.onError?.(error)),
        });
      } catch (error) {
        finish(() => handlers.onError?.(error));
      }
    },

    async stop() {
      try {
        await speech.stop();
      } catch {
        // nada tocando ou TTS indisponível
      }
    },
  };
}
