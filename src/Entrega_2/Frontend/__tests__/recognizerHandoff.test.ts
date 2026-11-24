import type { ExpoSpeechRecognitionNativeEventMap, ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';

import { WAKE_WORD } from '../config/services';
import { createWakeWordService } from '../features/assistant/services/wakeWordService';
import { createExpoSpeechRecognitionAdapter, HANDOFF_TIMEOUT_MS, type ExpoSpeechModuleLike } from '../services/voice/expoSpeechRecognitionAdapter';
import { createRecognizerArbiter } from '../services/voice/recognizerArbiter';
import type { SpeechRecognitionHandlers } from '../types/voice';

type EventName = keyof ExpoSpeechRecognitionNativeEventMap;
type Listener = (event: unknown) => void;

/**
 * Reconhecedor como o do Android (expo-speech-recognition): UMA sessão nativa para o app inteiro,
 * eventos entregues a todos os listeners e `abort()` que derruba a sessão atual e emite `end` em seguida.
 */
class AndroidLikeSpeechModule implements ExpoSpeechModuleLike {
  private listeners = new Map<EventName, Set<Listener>>();
  /** Quem abriu a sessão nativa atual: 'wake' (contínua) ou 'question' (uma fala). */
  session: 'wake' | 'question' | null = null;

  start = jest.fn((options: ExpoSpeechRecognitionOptions) => {
    this.session = options.continuous ? 'wake' : 'question';
  });
  stop = jest.fn();
  abort = jest.fn(() => {
    this.session = null;
    setTimeout(() => this.emit('end', null), 20);
  });
  getPermissionsAsync = jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true }));
  requestPermissionsAsync = jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true }));
  isRecognitionAvailable = jest.fn(() => true);

  addListener = jest.fn(<K extends EventName>(eventName: K, listener: (event: ExpoSpeechRecognitionNativeEventMap[K]) => void) => {
    const set = this.listeners.get(eventName) ?? new Set<Listener>();
    set.add(listener as Listener);
    this.listeners.set(eventName, set);
    return { remove: () => set.delete(listener as Listener) };
  }) as unknown as ExpoSpeechModuleLike['addListener'];

  emit(eventName: EventName, event: unknown) {
    for (const listener of [...(this.listeners.get(eventName) ?? [])]) listener(event);
  }
}

function handlersMock() {
  return {
    onPartialTranscript: jest.fn(),
    onAudioLevel: jest.fn(),
    onSpeechEnd: jest.fn(),
    onFinalResult: jest.fn(),
    onError: jest.fn(),
  } satisfies Required<SpeechRecognitionHandlers>;
}

function setup() {
  const arbiter = createRecognizerArbiter();
  const module = new AndroidLikeSpeechModule();
  const wake = createWakeWordService({ module, arbiter, platformOS: 'android' });
  const conversation = createExpoSpeechRecognitionAdapter({ module, arbiter, platformOS: 'android', language: 'pt-BR' });
  return { arbiter, module, wake, conversation };
}

describe('reconhecedor compartilhado: "Hey Asa" × microfone da conversa', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('tocar no microfone com o "Hey Asa" ligado: a pergunta não é derrubada quando a tela desliga a detecção', async () => {
    const { module, wake, conversation } = setup();
    await wake.start({ onDetected: jest.fn() });
    module.emit('start', null);
    expect(module.session).toBe('wake');

    const handlers = handlersMock();
    const opening = conversation.start(handlers);
    // Encerra a sessão do "Hey Asa" e só abre a pergunta depois do `end` dela.
    expect(module.abort).toHaveBeenCalledTimes(1);
    expect(module.start).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(20);
    await opening;
    expect(module.start).toHaveBeenCalledTimes(2);
    expect(module.session).toBe('question');

    // O AssistantShell desliga a detecção assim que a conversa passa a ouvir.
    await wake.stop();
    expect(module.abort).toHaveBeenCalledTimes(1);
    expect(module.session).toBe('question');

    module.emit('start', null);
    module.emit('result', { isFinal: false, results: [{ transcript: 'qual minha', confidence: 0 }] });
    module.emit('result', { isFinal: true, results: [{ transcript: 'qual minha frequência', confidence: 0.9 }] });
    expect(handlers.onFinalResult).toHaveBeenCalledWith({ transcript: 'qual minha frequência', confidence: 0.9, language: 'pt-BR' });
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('o `end` da sessão do "Hey Asa" não encerra a pergunta, nem quando chega atrasado (limite de espera)', async () => {
    const { module, wake, conversation } = setup();
    module.abort.mockImplementation(() => {
      module.session = null;
      setTimeout(() => module.emit('end', null), HANDOFF_TIMEOUT_MS + 100);
    });
    await wake.start({ onDetected: jest.fn() });
    module.emit('start', null);

    const handlers = handlersMock();
    const opening = conversation.start(handlers);
    jest.advanceTimersByTime(HANDOFF_TIMEOUT_MS);
    await opening;
    expect(module.start).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(100); // `end` atrasado da sessão antiga
    expect(handlers.onFinalResult).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('o "Hey Asa" não disputa o microfone enquanto o aluno fala e volta depois que a escuta termina', async () => {
    const { arbiter, module, wake, conversation } = setup();
    const handlers = handlersMock();
    await conversation.start(handlers);
    expect(arbiter.current()).toBe('conversation');

    await wake.start({ onDetected: jest.fn() });
    expect(module.start).toHaveBeenCalledTimes(1);

    module.emit('start', null);
    module.emit('result', { isFinal: true, results: [{ transcript: 'tenho pendências', confidence: 0.8 }] });
    module.emit('end', null);
    expect(handlers.onFinalResult).toHaveBeenCalledTimes(1);
    expect(arbiter.current()).toBeNull();

    jest.advanceTimersByTime(WAKE_WORD.RETRY_DELAY_MS);
    expect(module.start).toHaveBeenCalledTimes(2);
    expect(module.session).toBe('wake');
    expect(arbiter.current()).toBe('wake_word');
  });

  it('"Hey Asa" detectado libera o reconhecedor para a conversa sem espera', async () => {
    const { arbiter, module, wake, conversation } = setup();
    const onDetected = jest.fn();
    await wake.start({ onDetected });
    module.emit('start', null);
    module.emit('result', { isFinal: false, results: [{ transcript: 'hey asa', confidence: 0 }] });
    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(arbiter.current()).toBeNull();

    jest.advanceTimersByTime(20);
    const handlers = handlersMock();
    await conversation.start(handlers);
    expect(module.abort).toHaveBeenCalledTimes(1);
    expect(module.session).toBe('question');
  });

  it('depois de um erro, o `end` não encurta a espera para religar o "Hey Asa"', async () => {
    const { module, wake } = setup();
    await wake.start({ onDetected: jest.fn() });
    module.emit('error', { error: 'network', message: 'sem rede' });
    module.emit('end', null);
    jest.advanceTimersByTime(WAKE_WORD.RESTART_DELAY_MS + 50);
    expect(module.start).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(WAKE_WORD.RETRY_DELAY_MS);
    expect(module.start).toHaveBeenCalledTimes(2);
  });
});
