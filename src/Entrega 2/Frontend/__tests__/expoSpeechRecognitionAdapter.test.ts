import type { ExpoSpeechRecognitionNativeEventMap } from 'expo-speech-recognition';

import { VOICE } from '../config/services';
import {
  buildRecognitionOptions,
  createExpoSpeechRecognitionAdapter,
  loadExpoSpeechRecognitionModule,
  mapRecognitionError,
  normalizeVolume,
  type ExpoSpeechModuleLike,
} from '../services/voice/expoSpeechRecognitionAdapter';
import { createSpeechRecognitionService } from '../services/voice/speechRecognition';
import type { SpeechRecognitionHandlers } from '../types/voice';

type EventName = keyof ExpoSpeechRecognitionNativeEventMap;
type Listener = (event: never) => void;

/** Módulo fake com emissor de eventos, no formato de ExpoSpeechRecognitionModule. */
class FakeSpeechModule implements ExpoSpeechModuleLike {
  listeners = new Map<EventName, Set<Listener>>();
  available = true;
  permission = { granted: true, status: 'granted', canAskAgain: true };
  requestResponse = { granted: true, status: 'granted', canAskAgain: true };

  start = jest.fn();
  stop = jest.fn();
  abort = jest.fn();
  getPermissionsAsync = jest.fn(async () => this.permission);
  requestPermissionsAsync = jest.fn(async () => this.requestResponse);
  isRecognitionAvailable = jest.fn(() => this.available);

  addListener = jest.fn(<K extends EventName>(eventName: K, listener: (event: ExpoSpeechRecognitionNativeEventMap[K]) => void) => {
    const set = this.listeners.get(eventName) ?? new Set<Listener>();
    set.add(listener as Listener);
    this.listeners.set(eventName, set);
    return { remove: () => set.delete(listener as Listener) };
  });

  emit<K extends EventName>(eventName: K, event: ExpoSpeechRecognitionNativeEventMap[K]) {
    for (const listener of [...(this.listeners.get(eventName) ?? [])]) (listener as (e: typeof event) => void)(event);
  }

  get listenerCount() {
    let count = 0;
    this.listeners.forEach((set) => (count += set.size));
    return count;
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

function result(transcript: string, isFinal: boolean, confidence = 0.9): ExpoSpeechRecognitionNativeEventMap['result'] {
  return { isFinal, results: [{ transcript, confidence, segments: [] }] };
}

describe('expoSpeechRecognitionAdapter', () => {
  let speechModule: FakeSpeechModule;

  beforeEach(() => {
    speechModule = new FakeSpeechModule();
  });

  function adapter(platformOS = 'android') {
    return createExpoSpeechRecognitionAdapter({ module: speechModule, platformOS, language: 'pt-BR', onDeviceOnly: false });
  }

  it('start usa pt-BR, resultados parciais, sem persistir áudio e com vocabulário de viés', async () => {
    const service = adapter();
    await service.start(handlersMock());
    expect(speechModule.start).toHaveBeenCalledTimes(1);
    const options = speechModule.start.mock.calls[0]![0];
    expect(options).toMatchObject({
      lang: 'pt-BR',
      interimResults: true,
      continuous: false,
      maxAlternatives: 1,
      addsPunctuation: true,
      requiresOnDeviceRecognition: false,
      recordingOptions: { persist: false },
      volumeChangeEventOptions: { enabled: true, intervalMillis: VOICE.VOLUME_EVENT_INTERVAL_MS },
      iosCategory: { category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetooth'], mode: 'measurement' },
      androidIntentOptions: { EXTRA_LANGUAGE_MODEL: 'free_form' },
    });
    expect(options.contextualStrings).toEqual(expect.arrayContaining(['ASA', 'frequência', 'pendências', 'Banco de Dados', 'Estruturas de Dados', 'coordenação']));
  });

  it('buildRecognitionOptions respeita ON_DEVICE_ONLY', () => {
    expect(buildRecognitionOptions({ onDeviceOnly: true }).requiresOnDeviceRecognition).toBe(true);
    expect(buildRecognitionOptions({ language: 'pt-PT' }).lang).toBe('pt-PT');
  });

  it('parciais e resultado final (uma única vez), com confiança', async () => {
    const service = adapter();
    const handlers = handlersMock();
    await service.start(handlers);

    speechModule.emit('result', result('tenho ativ', false));
    speechModule.emit('result', result('tenho atividade', false));
    expect(handlers.onPartialTranscript).toHaveBeenNthCalledWith(1, 'tenho ativ');
    expect(handlers.onPartialTranscript).toHaveBeenNthCalledWith(2, 'tenho atividade');

    speechModule.emit('speechend', null);
    expect(handlers.onSpeechEnd).toHaveBeenCalledTimes(1);

    speechModule.emit('result', result(' Tenho atividade pendente? ', true, 0.87));
    speechModule.emit('result', result('duplicado', true));
    expect(handlers.onFinalResult).toHaveBeenCalledTimes(1);
    expect(handlers.onFinalResult).toHaveBeenCalledWith({ transcript: 'Tenho atividade pendente?', confidence: 0.87, language: 'pt-BR' });

    speechModule.emit('end', null);
    expect(speechModule.listenerCount).toBe(0);
  });

  it('stop() resolve com a transcrição final emitida após o pedido de parada', async () => {
    const service = adapter();
    const handlers = handlersMock();
    await service.start(handlers);
    speechModule.emit('result', result('qual é minha', false));
    const stopped = service.stop();
    expect(speechModule.stop).toHaveBeenCalledTimes(1);
    speechModule.emit('result', result('Qual é minha próxima prova?', true, -1));
    await expect(stopped).resolves.toEqual({ transcript: 'Qual é minha próxima prova?', language: 'pt-BR' });
    expect(handlers.onFinalResult).toHaveBeenCalledTimes(1);
  });

  it('end sem resultado final usa a última parcial; sem nada resolve vazio', async () => {
    const service = adapter();
    const handlers = handlersMock();
    await service.start(handlers);
    speechModule.emit('result', result('como está minha frequência', false));
    const stopped = service.stop();
    speechModule.emit('end', null);
    await expect(stopped).resolves.toMatchObject({ transcript: 'como está minha frequência' });

    const second = handlersMock();
    await service.start(second);
    const empty = service.stop();
    speechModule.emit('end', null);
    await expect(empty).resolves.toEqual({ transcript: '', language: 'pt-BR' });
    expect(second.onFinalResult).toHaveBeenCalledWith({ transcript: '', language: 'pt-BR' });
    expect(speechModule.listenerCount).toBe(0);
  });

  it('volumechange (−2..10) é normalizado para 0..1', async () => {
    const service = adapter();
    const handlers = handlersMock();
    await service.start(handlers);
    speechModule.emit('volumechange', { value: -2 });
    speechModule.emit('volumechange', { value: 4 });
    speechModule.emit('volumechange', { value: 10 });
    speechModule.emit('volumechange', { value: 25 });
    expect(handlers.onAudioLevel.mock.calls.map(([level]) => level)).toEqual([0, 0.5, 1, 1]);
    expect(normalizeVolume(-5)).toBe(0);
    expect(normalizeVolume(Number.NaN)).toBe(0);
  });

  it.each([
    ['not-allowed', 'permission_denied'],
    ['no-speech', 'no_speech'],
    ['speech-timeout', 'no_speech'],
    ['network', 'network'],
    ['audio-capture', 'unavailable'],
    ['service-not-allowed', 'unavailable'],
    ['language-not-supported', 'unavailable'],
    ['busy', 'stt_failed'],
    ['client', 'stt_failed'],
    ['unknown', 'stt_failed'],
    ['aborted', 'stt_failed'],
  ] as const)('erro %s → %s (uma única vez)', async (code, kind) => {
    const service = adapter();
    const handlers = handlersMock();
    await service.start(handlers);
    speechModule.emit('error', { error: code, message: 'falhou' });
    speechModule.emit('error', { error: 'network', message: 'de novo' });
    expect(handlers.onError).toHaveBeenCalledTimes(1);
    expect(handlers.onError).toHaveBeenCalledWith({ kind, message: 'falhou' });
    speechModule.emit('end', null);
    expect(handlers.onFinalResult).not.toHaveBeenCalled();
    expect(speechModule.listenerCount).toBe(0);
  });

  it('mapRecognitionError ignora aborted quando o app cancelou', () => {
    expect(mapRecognitionError('aborted', true)).toBeNull();
    expect(mapRecognitionError('aborted', false)).toBe('stt_failed');
  });

  it('cancel() aborta, remove TODOS os listeners e não emite erro nem resultado', async () => {
    const service = adapter();
    const handlers = handlersMock();
    await service.start(handlers);
    expect(speechModule.listenerCount).toBeGreaterThanOrEqual(5);
    const pendingStop = service.stop();
    await service.cancel();
    expect(speechModule.abort).toHaveBeenCalledTimes(1);
    expect(speechModule.listenerCount).toBe(0);
    await expect(pendingStop).resolves.toEqual({ transcript: '', language: 'pt-BR' });
    speechModule.emit('error', { error: 'aborted', message: 'aborted' });
    speechModule.emit('result', result('tarde', true));
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onFinalResult).not.toHaveBeenCalled();
  });

  it('novo start cancela a sessão anterior antes de assinar eventos', async () => {
    const service = adapter();
    const first = handlersMock();
    await service.start(first);
    const second = handlersMock();
    await service.start(second);
    expect(speechModule.abort).toHaveBeenCalledTimes(1);
    speechModule.emit('result', result('oi', false));
    expect(first.onPartialTranscript).not.toHaveBeenCalled();
    expect(second.onPartialTranscript).toHaveBeenCalledWith('oi');
  });

  it('falha síncrona em start() → stt_failed e listeners removidos', async () => {
    speechModule.start.mockImplementation(() => {
      throw new Error('native crash');
    });
    const service = adapter();
    const handlers = handlersMock();
    await service.start(handlers);
    expect(handlers.onError).toHaveBeenCalledWith({ kind: 'stt_failed', message: 'native crash' });
    expect(speechModule.listenerCount).toBe(0);
  });

  it('disponibilidade: serviço presente/ausente', async () => {
    await expect(adapter().getAvailability()).resolves.toEqual({ available: true });
    speechModule.available = false;
    await expect(adapter('android').getAvailability()).resolves.toEqual({ available: false, reason: 'no_service' });
    await expect(adapter('web').getAvailability()).resolves.toEqual({ available: false, reason: 'not_supported' });
  });

  it('permissões nativas: granted / undetermined / denied definitivo', async () => {
    const service = adapter();
    await expect(service.getPermission()).resolves.toBe('granted');
    speechModule.permission = { granted: false, status: 'undetermined', canAskAgain: true };
    await expect(service.getPermission()).resolves.toBe('undetermined');
    speechModule.permission = { granted: false, status: 'denied', canAskAgain: true };
    await expect(service.getPermission()).resolves.toBe('undetermined');
    speechModule.permission = { granted: false, status: 'denied', canAskAgain: false };
    await expect(service.getPermission()).resolves.toBe('denied');
    speechModule.requestResponse = { granted: false, status: 'denied', canAskAgain: false };
    await expect(service.requestPermission()).resolves.toBe('denied');
    expect(speechModule.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('web: permissão fica a cargo do navegador (sem chamadas nativas)', async () => {
    const service = adapter('web');
    await expect(service.getPermission()).resolves.toBe('granted');
    await expect(service.requestPermission()).resolves.toBe('granted');
    expect(speechModule.getPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('loadExpoSpeechRecognitionModule / createSpeechRecognitionService', () => {
  it('módulo nativo ausente no Expo Go → unavailable (expo_go) sem avaliar o pacote', async () => {
    const requirePackage = jest.fn(() => ({ ExpoSpeechRecognitionModule: new FakeSpeechModule() }));
    const loaded = loadExpoSpeechRecognitionModule({
      platformOS: 'ios',
      requireOptionalNativeModule: () => null,
      isRunningInExpoGo: () => true,
      requirePackage,
    });
    expect(loaded).toEqual({ module: null, reason: 'expo_go' });
    expect(requirePackage).not.toHaveBeenCalled();

    const service = createSpeechRecognitionService({
      enabled: true,
      provider: 'device',
      platformOS: 'android',
      requireOptionalNativeModule: () => null,
      isRunningInExpoGo: () => true,
      requirePackage,
    });
    expect(service.provider).toBe('unavailable');
    await expect(service.getAvailability()).resolves.toEqual({ available: false, reason: 'expo_go' });
    await expect(service.getPermission()).resolves.toBe('denied');
    expect(requirePackage).not.toHaveBeenCalled();
  });

  it('módulo nativo ausente fora do Expo Go (build antigo) → not_supported', () => {
    expect(
      loadExpoSpeechRecognitionModule({ platformOS: 'android', requireOptionalNativeModule: () => null, isRunningInExpoGo: () => false }),
    ).toEqual({ module: null, reason: 'not_supported' });
  });

  it('require do módulo nativo que lança → tratado como ausente', () => {
    expect(
      loadExpoSpeechRecognitionModule({
        platformOS: 'ios',
        requireOptionalNativeModule: () => {
          throw new Error('boom');
        },
        isRunningInExpoGo: () => true,
      }),
    ).toEqual({ module: null, reason: 'expo_go' });
  });

  it('development build: carrega o pacote e cria o adapter', async () => {
    const fake = new FakeSpeechModule();
    const service = createSpeechRecognitionService({
      enabled: true,
      provider: 'device',
      platformOS: 'android',
      requireOptionalNativeModule: () => ({}),
      requirePackage: () => ({ ExpoSpeechRecognitionModule: fake }),
    });
    expect(service.provider).toBe('expo-speech-recognition');
    await expect(service.getAvailability()).resolves.toEqual({ available: true });
  });

  it('web: usa a implementação Web Speech API do pacote sem checar módulo nativo', () => {
    const requireOptional = jest.fn(() => null);
    const fake = new FakeSpeechModule();
    const loaded = loadExpoSpeechRecognitionModule({ platformOS: 'web', requireOptionalNativeModule: requireOptional, requirePackage: () => ({ ExpoSpeechRecognitionModule: fake }) });
    expect(loaded.module).toBe(fake);
    expect(requireOptional).not.toHaveBeenCalled();
  });

  it('pacote que falha ao carregar → not_supported', () => {
    expect(
      loadExpoSpeechRecognitionModule({
        platformOS: 'web',
        requirePackage: () => {
          throw new Error('sem Web Speech API');
        },
      }),
    ).toEqual({ module: null, reason: 'not_supported' });
  });

  it("provedor 'none' ou assistente desativado → provider_disabled sem carregar nada", async () => {
    const requirePackage = jest.fn();
    const none = createSpeechRecognitionService({ enabled: true, provider: 'none', requirePackage });
    await expect(none.getAvailability()).resolves.toEqual({ available: false, reason: 'provider_disabled' });
    const disabled = createSpeechRecognitionService({ enabled: false, provider: 'device', requirePackage });
    await expect(disabled.getAvailability()).resolves.toEqual({ available: false, reason: 'provider_disabled' });
    expect(requirePackage).not.toHaveBeenCalled();
  });

  it('serviço indisponível: start emite unavailable e stop resolve vazio', async () => {
    const service = createSpeechRecognitionService({ enabled: false });
    const handlers = handlersMock();
    await service.start(handlers);
    expect(handlers.onError).toHaveBeenCalledWith({ kind: 'unavailable' });
    await expect(service.stop()).resolves.toMatchObject({ transcript: '' });
    await expect(service.cancel()).resolves.toBeUndefined();
  });
});
