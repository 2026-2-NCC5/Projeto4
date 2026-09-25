import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { AppState, Pressable, Text } from 'react-native';

import { AssistantOverlay } from '../components/assistant/AssistantOverlay';
import { AssistantProvider, useAssistant } from '../features/assistant/hooks/useAssistant';
import { loadConversationHistory } from '../features/assistant/services/conversationHistory';
import type { WakeWordDetection, WakeWordHandlers, WakeWordService } from '../features/assistant/services/wakeWordService';
import { PreferencesProvider, type Preferences } from '../hooks/usePreferences';
import { NavigationProvider, useAppNavigation } from '../navigation/AppNavigator';
import { ApiClientError } from '../services/apiClient';
import type { PermissionState } from '../types/voice';
import { MESSAGES } from '../utils/messages';

import { makeAssistantResponse } from './support/fixtures';
import { controllableSend, fakeHaptics, FakeRecognition, FakeSynthesis } from './support/voiceFakes';

/** Serviço de wake word controlável pelo teste. */
class FakeWakeWord implements WakeWordService {
  readonly provider = 'expo-speech-recognition' as const;
  available = true;
  permission: PermissionState = 'granted';
  handlers: WakeWordHandlers | null = null;
  active = false;
  start = jest.fn(async (handlers: WakeWordHandlers) => {
    this.handlers = handlers;
    this.active = true;
    handlers.onStatus?.('listening');
  });
  stop = jest.fn(async () => {
    this.active = false;
    this.handlers = null;
  });
  getAvailability = jest.fn(async () => (this.available ? { available: true } : { available: false as const, reason: 'expo_go' as const }));
  getPermission = jest.fn(async () => this.permission);
  requestPermission = jest.fn(async () => this.permission);
  isActive = () => this.active;
  detect(transcript: string, remainder = '', isFinal = true) {
    const detection: WakeWordDetection = { matched: true, phrase: 'hey asa', remainder, transcript, isFinal };
    this.active = false;
    this.handlers?.onDetected(detection);
  }
}

function Probe() {
  const assistant = useAssistant();
  const navigation = useAppNavigation();
  return (
    <>
      <Text testID="state">{assistant.state}</Text>
      <Text testID="wake">{assistant.wakeWord.status}</Text>
      <Text testID="overlay">{assistant.overlayVisible ? 'open' : 'closed'}</Text>
      <Text testID="screen">{navigation.currentScreen}</Text>
      <Text testID="phase">{assistant.voice.state.phase}</Text>
      <Text testID="permission">{assistant.microphonePermission ?? 'null'}</Text>
      <Pressable testID="probe-open" onPress={() => assistant.openOverlay('button')} />
      <Pressable testID="probe-activate" onPress={() => void assistant.activate('gesture')} />
      <Pressable testID="probe-enable" onPress={() => void assistant.enableWakeWord()} />
    </>
  );
}

interface SetupOptions {
  preferences?: Partial<Preferences>;
  configure?: (deps: { wake: FakeWakeWord; recognition: FakeRecognition }) => void;
}

async function setup(options: SetupOptions = {}) {
  const wake = new FakeWakeWord();
  const recognition = new FakeRecognition();
  const synthesis = new FakeSynthesis();
  const { send, requests } = controllableSend();
  options.configure?.({ wake, recognition });
  const utils = render(
    <PreferencesProvider initialPreferences={{ wakeWordEnabled: true, heyAsaOnboardingSeen: true, ...options.preferences }}>
      <NavigationProvider>
        <AssistantProvider wakeWordService={wake} recognition={recognition} synthesis={synthesis} sendMessage={send} haptics={fakeHaptics()}>
          <Probe />
          <AssistantOverlay />
        </AssistantProvider>
      </NavigationProvider>
    </PreferencesProvider>,
  );
  await act(async () => undefined);
  return { ...utils, wake, recognition, synthesis, send, requests };
}

const text = (id: string) => screen.getByTestId(id).props.children as string;
const advance = async (ms = 500) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};
async function typeAndSend(value: string) {
  fireEvent.changeText(screen.getByLabelText('Digite sua pergunta'), value);
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Enviar pergunta'));
  });
}

describe('AssistantProvider', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await AsyncStorage.clear();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('Caso 1: "Hey Asa" → ativação → overlay aberto e assistente ouvindo (detecção pausada durante a conversa)', async () => {
    const t = await setup();
    await waitFor(() => expect(text('wake')).toBe('listening'));
    expect(text('state')).toBe('wake-word-listening');

    act(() => t.wake.detect('hey asa'));
    expect(text('state')).toBe('activating');
    expect(text('overlay')).toBe('open');
    await advance();
    expect(t.recognition.start).toHaveBeenCalledTimes(1);
    expect(text('state')).toBe('listening');
    expect(t.wake.stop).toHaveBeenCalled();
    expect(screen.getByText('Microfone ativo')).toBeTruthy();
  });

  it('comando dito junto com "Hey Asa" é enviado direto como fala, com a tela atual como contexto', async () => {
    const t = await setup();
    await waitFor(() => expect(text('wake')).toBe('listening'));
    act(() => t.wake.detect('hey asa qual minha próxima prova', 'qual minha proxima prova'));
    await advance();
    expect(t.recognition.start).not.toHaveBeenCalled();
    expect(t.requests[0]?.body).toMatchObject({ inputType: 'voice', text: 'qual minha proxima prova', currentScreen: 'home' });
    expect(JSON.stringify(t.requests[0]?.body)).not.toMatch(/studentId/);
  });

  it('Caso 2: microfone negado → "Hey Asa" indisponível, nada é iniciado e o texto continua funcionando', async () => {
    const t = await setup({ configure: ({ wake }) => (wake.permission = 'denied') });
    await waitFor(() => expect(text('wake')).toBe('unavailable'));
    expect(text('permission')).toBe('denied');
    expect(t.wake.start).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByTestId('probe-open'));
    });
    expect(text('overlay')).toBe('open');
    await typeAndSend('Tenho pendência?');
    expect(t.requests[0]?.body).toMatchObject({ inputType: 'text', text: 'Tenho pendência?' });
  });

  it('Caso 3: API indisponível → mensagem amigável (sem erro técnico) e o overlay segue utilizável', async () => {
    const t = await setup();
    await waitFor(() => expect(text('wake')).toBe('listening'));
    act(() => t.wake.detect('hey asa como estão minhas notas', 'como estao minhas notas'));
    await advance();
    await act(async () => {
      t.requests[0]?.reject(new ApiClientError({ kind: 'dependency', message: 'ECONNREFUSED 127.0.0.1:8000' }));
    });
    expect(text('state')).toBe('error');
    expect(screen.getByText(MESSAGES.errorAnalysisDependency)).toBeTruthy();
    expect(screen.queryByText(/ECONNREFUSED/)).toBeNull();
    await typeAndSend('Tenho pendência?');
    expect(t.requests[1]?.body).toMatchObject({ inputType: 'text', text: 'Tenho pendência?' });
  });

  it('Caso 4: intenção open_screen → o app navega para Avaliações e recolhe o overlay', async () => {
    const t = await setup({ preferences: { wakeWordEnabled: false } });
    expect(text('screen')).toBe('home');
    await act(async () => {
      fireEvent.press(screen.getByTestId('probe-open'));
    });
    await typeAndSend('Abre minhas notas');
    await act(async () => {
      t.requests[0]?.resolve(
        makeAssistantResponse({
          intent: 'open_screen',
          display: { title: 'Abrindo', message: 'Claro. Abrindo suas avaliações e notas.', items: [], recommendations: [] },
          speech: { text: '' },
          navigation: { target: 'academic.assessments' },
          context: {},
        }),
      );
    });
    expect(text('screen')).toBe('academic.assessments');
    expect(text('overlay')).toBe('closed');
  });

  it('navegação fora da allow-list é ignorada', async () => {
    const t = await setup({ preferences: { wakeWordEnabled: false } });
    await act(async () => {
      fireEvent.press(screen.getByTestId('probe-open'));
    });
    await typeAndSend('abre o painel');
    await act(async () => {
      t.requests[0]?.resolve(makeAssistantResponse({ speech: { text: '' }, navigation: { target: 'admin.panel' as never } }));
    });
    expect(text('screen')).toBe('home');
  });

  it('Caso 5: "Hey Asa" durante a fala do ASA interrompe o TTS e começa a ouvir (barge-in)', async () => {
    const t = await setup({ preferences: { bargeInEnabled: true } });
    await waitFor(() => expect(text('wake')).toBe('listening'));
    act(() => t.wake.detect('hey asa tenho pendência hoje', 'tenho pendencia hoje'));
    await advance();
    await act(async () => {
      t.requests[0]?.resolve(makeAssistantResponse());
    });
    expect(text('phase')).toBe('answering');
    expect(t.synthesis.speak).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(text('wake')).toBe('listening'));
    act(() => t.wake.detect('hey asa'));
    expect(text('state')).toBe('interrupted');
    await advance();
    expect(t.synthesis.stop).toHaveBeenCalled();
    expect(text('phase')).toBe('listening');
  });

  it('sem barge-in, a detecção fica pausada enquanto o ASA fala', async () => {
    const t = await setup({ preferences: { bargeInEnabled: false } });
    await waitFor(() => expect(text('wake')).toBe('listening'));
    act(() => t.wake.detect('hey asa tenho pendência hoje', 'tenho pendencia hoje'));
    await advance();
    await act(async () => {
      t.requests[0]?.resolve(makeAssistantResponse());
    });
    expect(text('phase')).toBe('answering');
    expect(text('wake')).toBe('paused');
    act(() => t.synthesis.finish());
    await waitFor(() => expect(text('wake')).toBe('listening'));
  });

  it('eco do próprio TTS não ativa o assistente e a detecção é religada', async () => {
    const t = await setup({ preferences: { bargeInEnabled: true } });
    await waitFor(() => expect(text('wake')).toBe('listening'));
    act(() => t.wake.detect('hey asa tenho pendência hoje', 'tenho pendencia hoje'));
    await advance();
    await act(async () => {
      t.requests[0]?.resolve(makeAssistantResponse({ speech: { text: 'Você tem uma atividade pendente em Banco de Dados. Posso mostrar os detalhes.' } }));
    });
    await waitFor(() => expect(text('wake')).toBe('listening'));
    const startsBefore = t.wake.start.mock.calls.length;
    act(() => t.wake.detect('posso mostrar os detalhes'));
    expect(text('state')).toBe('speaking');
    await waitFor(() => expect(t.wake.start.mock.calls.length).toBeGreaterThan(startsBefore));
  });

  it('em background a detecção é desligada (nunca microfone escondido) e volta em primeiro plano', async () => {
    let listener: ((state: string) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      listener = handler as (state: string) => void;
      return { remove: jest.fn() };
    });
    const t = await setup();
    await waitFor(() => expect(text('wake')).toBe('listening'));
    expect(listener).not.toBeNull();
    act(() => listener?.('background'));
    await waitFor(() => expect(text('wake')).toBe('paused'));
    expect(t.wake.stop).toHaveBeenCalled();
    const startsBefore = t.wake.start.mock.calls.length;
    act(() => listener?.('active'));
    await waitFor(() => expect(t.wake.start.mock.calls.length).toBeGreaterThan(startsBefore));
  });

  it('"Hey Asa" desligado nas preferências: nada é iniciado', async () => {
    const t = await setup({ preferences: { wakeWordEnabled: false } });
    expect(t.wake.start).not.toHaveBeenCalled();
    expect(text('wake')).toBe('off');
    expect(text('state')).toBe('idle');
  });

  it('ativar "Hey Asa" pela primeira vez abre o onboarding antes de pedir permissão; recusar mantém tudo por texto', async () => {
    const t = await setup({ preferences: { wakeWordEnabled: false, heyAsaOnboardingSeen: false }, configure: ({ wake }) => (wake.permission = 'undetermined') });
    await act(async () => {
      fireEvent.press(screen.getByTestId('probe-enable'));
    });
    expect(t.wake.requestPermission).not.toHaveBeenCalled();
    expect(text('wake')).toBe('off');
  });

  it('fechar o overlay cancela a escuta e religa a detecção de "Hey Asa"', async () => {
    const t = await setup();
    await waitFor(() => expect(text('wake')).toBe('listening'));
    act(() => t.wake.detect('hey asa'));
    await advance();
    expect(text('phase')).toBe('listening');
    await act(async () => {
      fireEvent.press(screen.getByTestId('overlay-close'));
    });
    expect(t.recognition.cancel).toHaveBeenCalled();
    expect(text('overlay')).toBe('closed');
    await waitFor(() => expect(text('wake')).toBe('listening'));
  });

  it('histórico local guarda só texto/horário/intenção quando permitido e é apagado ao desligar', async () => {
    const t = await setup({ preferences: { wakeWordEnabled: false, historyEnabled: true } });
    await act(async () => {
      fireEvent.press(screen.getByTestId('probe-open'));
    });
    await typeAndSend('Tenho pendência?');
    await act(async () => {
      t.requests[0]?.resolve(makeAssistantResponse({ speech: { text: '' } }));
    });
    await waitFor(async () => expect((await loadConversationHistory()).length).toBe(1));
    const [entry] = await loadConversationHistory();
    expect(entry).toMatchObject({ question: 'Tenho pendência?', intent: 'get_pending_items', status: 'success' });
    expect(Object.keys(entry ?? {})).not.toEqual(expect.arrayContaining(['audio', 'token']));
  });

  it('ativação por gesto (toque longo) abre o overlay e começa a ouvir', async () => {
    const t = await setup({ preferences: { wakeWordEnabled: false } });
    await act(async () => {
      fireEvent.press(screen.getByTestId('probe-activate'));
    });
    expect(text('overlay')).toBe('open');
    await advance();
    expect(t.recognition.start).toHaveBeenCalledTimes(1);
    expect(text('state')).toBe('listening');
  });
});
