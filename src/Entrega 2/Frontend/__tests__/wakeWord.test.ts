import { isDirectCommand, looksLikeEcho, matchWakeWord, normalizeSpeech } from '../features/assistant/services/wakeWordMatcher';
import { createWakeWordService, type WakeWordDetection } from '../features/assistant/services/wakeWordService';
import type { ExpoSpeechModuleLike } from '../services/voice/expoSpeechRecognitionAdapter';

describe('wakeWordMatcher', () => {
  it('normaliza acentos, caixa e pontuação', () => {
    expect(normalizeSpeech('  Hey, ASA!  ')).toBe('hey asa');
  });

  it.each(['Hey Asa', 'hey asa', 'Ei Asa', 'ei aza', 'Hey assa', 'ok asa', 'oi asa', 'Hei Asa', 'Hey aça'])('detecta a variação "%s"', (text) => {
    expect(matchWakeWord(text).matched).toBe(true);
  });

  it('não ativa com "asa" sozinha nem com frases comuns do app', () => {
    expect(matchWakeWord('asa').matched).toBe(false);
    expect(matchWakeWord('o ASA Conecta é um aplicativo').matched).toBe(false);
    expect(matchWakeWord('a asa do avião').matched).toBe(false);
    expect(matchWakeWord('').matched).toBe(false);
  });

  it('separa o comando dito na mesma frase', () => {
    const match = matchWakeWord('Hey Asa, qual é minha próxima aula?');
    expect(match.matched).toBe(true);
    expect(match.remainder).toBe('qual e minha proxima aula');
    expect(isDirectCommand(match.remainder)).toBe(true);
  });

  it('remainder curto não é comando direto (abre a escuta)', () => {
    expect(isDirectCommand('')).toBe(false);
    expect(isDirectCommand('ah')).toBe(false);
    expect(isDirectCommand('oi')).toBe(false);
  });

  it('eco do próprio TTS é descartado', () => {
    const spoken = 'Você tem uma atividade pendente em Banco de Dados. Posso mostrar os detalhes.';
    expect(looksLikeEcho('posso mostrar os detalhes', spoken)).toBe(true);
    expect(looksLikeEcho('hey asa quais minhas notas', spoken)).toBe(false);
    expect(looksLikeEcho('hey asa', null)).toBe(false);
  });
});

type Listener = (event: unknown) => void;

/** Módulo nativo simulado: permite emitir eventos como o reconhecedor do sistema faria. */
function fakeModule(options: { available?: boolean; permission?: 'granted' | 'denied' | 'undetermined' } = {}) {
  const listeners = new Map<string, Set<Listener>>();
  const emit = (name: string, event: unknown) => listeners.get(name)?.forEach((listener) => listener(event));
  const module: ExpoSpeechModuleLike & { emit: typeof emit; listenerCount: () => number } = {
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    addListener: jest.fn((name: string, listener: Listener) => {
      const set = listeners.get(name) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(name, set);
      return {
        remove: () => {
          set.delete(listener);
        },
      };
    }) as unknown as ExpoSpeechModuleLike['addListener'],
    getPermissionsAsync: jest.fn(async () => ({ granted: options.permission === 'granted', status: options.permission ?? 'undetermined', canAskAgain: true })),
    requestPermissionsAsync: jest.fn(async () => ({ granted: options.permission !== 'denied', status: options.permission === 'denied' ? 'denied' : 'granted', canAskAgain: false })),
    isRecognitionAvailable: jest.fn(() => options.available ?? true),
    emit,
    listenerCount: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
  };
  return module;
}

describe('createWakeWordService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('indisponível sem módulo nativo (Expo Go) — nunca finge detectar', async () => {
    const service = createWakeWordService({ module: null, unavailableReason: 'expo_go', platformOS: 'android' });
    expect(service.provider).toBe('unavailable');
    expect(await service.getAvailability()).toEqual({ available: false, reason: 'expo_go' });
    const onStatus = jest.fn();
    await service.start({ onDetected: jest.fn(), onStatus });
    expect(onStatus).toHaveBeenCalledWith('unavailable', 'unavailable');
    expect(service.isActive()).toBe(false);
  });

  it('feature flag desligada → indisponível (provider_disabled)', async () => {
    const service = createWakeWordService({ module: fakeModule(), featureEnabled: false, platformOS: 'android' });
    expect(await service.getAvailability()).toEqual({ available: false, reason: 'provider_disabled' });
  });

  it('inicia em modo contínuo, detecta "Hey Asa" e libera o reconhecedor', async () => {
    const module = fakeModule();
    const service = createWakeWordService({ module, platformOS: 'android', now: () => 10_000 });
    const detections: WakeWordDetection[] = [];
    const statuses: string[] = [];
    await service.start({ onDetected: (detection) => detections.push(detection), onStatus: (status) => statuses.push(status) });
    expect(module.start).toHaveBeenCalledWith(expect.objectContaining({ continuous: true, interimResults: true, recordingOptions: { persist: false } }));
    module.emit('start', {});
    expect(statuses).toEqual(['starting', 'listening']);

    module.emit('result', { isFinal: false, results: [{ transcript: 'ei' }] });
    expect(detections).toHaveLength(0);
    module.emit('result', { isFinal: true, results: [{ transcript: 'Hey Asa qual minha próxima aula' }] });
    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({ matched: true, remainder: 'qual minha proxima aula', isFinal: true });
    expect(module.abort).toHaveBeenCalled();
    expect(service.isActive()).toBe(false);
    expect(module.listenerCount()).toBe(0);
    expect(statuses).toContain('stopped');
  });

  it('reinicia após o reconhecedor encerrar por silêncio e recicla a sessão', async () => {
    const module = fakeModule();
    const service = createWakeWordService({ module, platformOS: 'android' });
    await service.start({ onDetected: jest.fn() });
    expect(module.start).toHaveBeenCalledTimes(1);
    module.emit('end', {});
    jest.advanceTimersByTime(400);
    expect(module.start).toHaveBeenCalledTimes(2);
    module.emit('error', { error: 'no-speech' });
    jest.advanceTimersByTime(400);
    expect(module.start).toHaveBeenCalledTimes(3);
    await service.stop();
    expect(service.isActive()).toBe(false);
    expect(module.listenerCount()).toBe(0);
  });

  it('permissão negada pelo sistema → indisponível (permission_denied) e para', async () => {
    const module = fakeModule();
    const service = createWakeWordService({ module, platformOS: 'android' });
    const onStatus = jest.fn();
    await service.start({ onDetected: jest.fn(), onStatus });
    module.emit('error', { error: 'not-allowed' });
    expect(onStatus).toHaveBeenLastCalledWith('unavailable', 'permission_denied');
    expect(service.isActive()).toBe(false);
  });

  it('falhas consecutivas desistem com status error (volta ao botão)', async () => {
    const module = fakeModule();
    const service = createWakeWordService({ module, platformOS: 'android' });
    const onStatus = jest.fn();
    await service.start({ onDetected: jest.fn(), onStatus });
    for (let index = 0; index < 4; index += 1) {
      module.emit('error', { error: 'network' });
      jest.advanceTimersByTime(2_000);
    }
    expect(onStatus).toHaveBeenLastCalledWith('error', 'network');
    expect(service.isActive()).toBe(false);
  });

  it('cooldown evita disparo duplo (parcial + final)', async () => {
    let now = 1_000;
    const module = fakeModule();
    const service = createWakeWordService({ module, platformOS: 'android', now: () => now });
    const onDetected = jest.fn();
    await service.start({ onDetected });
    module.emit('result', { isFinal: false, results: [{ transcript: 'hey asa' }] });
    expect(onDetected).toHaveBeenCalledTimes(1);
    // Serviço já parou após a detecção; religar dentro do cooldown não dispara de novo.
    now += 500;
    await service.start({ onDetected });
    module.emit('result', { isFinal: true, results: [{ transcript: 'hey asa' }] });
    expect(onDetected).toHaveBeenCalledTimes(1);
  });

  it('permissão: consulta e solicitação passam pelo módulo nativo', async () => {
    const module = fakeModule({ permission: 'undetermined' });
    const service = createWakeWordService({ module, platformOS: 'android' });
    expect(await service.getPermission()).toBe('undetermined');
    expect(await service.requestPermission()).toBe('granted');
    expect(module.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});
