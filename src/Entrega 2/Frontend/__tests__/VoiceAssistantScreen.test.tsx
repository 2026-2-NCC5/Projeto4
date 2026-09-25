import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { PreferencesProvider } from '../hooks/usePreferences';
import { VoiceAssistantProvider } from '../hooks/useVoiceAssistant';
import { AssistantScreen } from '../screens/AssistantScreen';
import type { AssistantResponse } from '../types/api';
import { MESSAGES } from '../utils/messages';

import { makeAssistantResponse, recommendationFixture } from './support/fixtures';
import { controllableSend, fakeHaptics, FakeRecognition, FakeSynthesis } from './support/voiceFakes';

const mockGetLatest = jest.fn();

// A resposta é revelada em streaming (Animated); com "Reduzir movimento" o texto aparece completo.
// O streaming tem teste próprio (StreamingText.test.tsx).
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true, useSystemReduceMotion: () => false }));

jest.mock('../services/agentService', () => ({
  agentService: {
    analyze: jest.fn(),
    getLatest: () => mockGetLatest(),
    getRecommendation: jest.fn(),
    getHistory: jest.fn(),
    getRun: jest.fn(),
  },
}));

interface RenderOptions {
  configure?: (recognition: FakeRecognition) => void;
}

async function renderScreen(options: RenderOptions = {}) {
  const recognition = new FakeRecognition();
  options.configure?.(recognition);
  const synthesis = new FakeSynthesis();
  const { send, requests } = controllableSend();
  const onNavigate = jest.fn();
  const onViewSubject = jest.fn();
  const utils = render(
    <PreferencesProvider>
      <VoiceAssistantProvider recognition={recognition} synthesis={synthesis} sendMessage={send} haptics={fakeHaptics()}>
        <AssistantScreen onViewSubject={onViewSubject} onNavigate={onNavigate} />
      </VoiceAssistantProvider>
    </PreferencesProvider>,
  );
  await act(async () => undefined);
  return { ...utils, recognition, synthesis, send, requests, onNavigate, onViewSubject };
}

async function respond(requests: ReturnType<typeof controllableSend>['requests'], response: AssistantResponse) {
  await act(async () => {
    requests[requests.length - 1]?.resolve(response);
  });
}

async function typeAndSend(text: string) {
  fireEvent.changeText(screen.getByLabelText('Digite sua pergunta'), text);
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Enviar pergunta'));
  });
}

describe('AssistantScreen (modo Conversar)', () => {
  beforeEach(async () => {
    mockGetLatest.mockReset();
    mockGetLatest.mockResolvedValue(null);
    // Preferências persistidas por um teste não podem vazar para o próximo.
    await AsyncStorage.clear();
  });

  it('abre em "Conversar" com orb, status, sugestões e botão de voz acessível', async () => {
    await renderScreen();
    expect(screen.getByText('Como posso ajudar?')).toBeTruthy();
    expect(screen.getByLabelText('Conversar').props.accessibilityState).toMatchObject({ selected: true });
    const voiceButton = screen.getByLabelText('Falar com o assistente ASA');
    expect(voiceButton.props.accessibilityRole).toBe('button');
    expect(screen.getByLabelText('Assistente ASA, aguardando')).toBeTruthy();
    expect(screen.getByText('Toque no microfone para falar')).toBeTruthy();
    expect(screen.getByText('Tenho atividade pendente?')).toBeTruthy();
    // Campo vazio: o botão à direita é o microfone; ao digitar, vira "Enviar".
    expect(screen.queryByLabelText('Enviar pergunta')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Digite sua pergunta'), 'oi');
    expect(screen.getByLabelText('Enviar pergunta').props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent.changeText(screen.getByLabelText('Digite sua pergunta'), '');
    expect(screen.getByLabelText('Falar com o assistente ASA')).toBeTruthy();
    const ttsToggle = screen.getByTestId('tts-toggle');
    expect(ttsToggle.props.accessibilityRole).toBe('switch');
    expect(ttsToggle.props.accessibilityState).toMatchObject({ checked: true });
  });

  it('digitar e enviar: "Você disse", resposta, itens e recomendações com "Por que estou vendo isso?"', async () => {
    const t = await renderScreen();
    await typeAndSend('Tenho atividade pendente?');
    expect(t.requests[0]?.body).toMatchObject({ inputType: 'text', text: 'Tenho atividade pendente?' });
    // Pergunta digitada vira balão do estudante (sem a legenda "Você disse:", reservada à voz).
    expect(screen.getByLabelText('Você: Tenho atividade pendente?')).toBeTruthy();
    expect(screen.getByTestId('chat-typing')).toBeTruthy();
    expect(screen.getByText('Entendendo...')).toBeTruthy();
    expect(screen.getByLabelText('Cancelar')).toBeTruthy();

    await respond(
      t.requests,
      makeAssistantResponse({
        display: {
          title: 'Suas pendências',
          message: 'Você tem 1 atividade pendente.',
          items: makeAssistantResponse().display.items,
          recommendations: [recommendationFixture],
        },
      }),
    );

    expect(screen.getByText('Suas pendências')).toBeTruthy();
    expect(screen.getByText('Você tem 1 atividade pendente.')).toBeTruthy();
    expect(screen.getByText('Trabalho prático de Banco de Dados')).toBeTruthy();
    expect(screen.getByText('⚠ Pendente')).toBeTruthy();
    expect(screen.getByText(recommendationFixture.message)).toBeTruthy();
    expect(screen.getByText('Por que estou vendo isso?')).toBeTruthy();
    expect(screen.getByText('Trabalho prático sem entrega registrada')).toBeTruthy();
    expect(screen.getByText(recommendationFixture.nextAction as string)).toBeTruthy();
    expect(screen.getByText(/interactionId: int-001/)).toBeTruthy();
    expect(screen.getByText('Tenho atividade pendente?')).toBeTruthy();
    // Respondendo em voz: botão de parar a resposta.
    expect(screen.getByText('Respondendo...')).toBeTruthy();
    // Sugestões somem quando há resposta.
    expect(screen.queryByTestId('voice-suggestions')).toBeNull();
  });

  it('"Parar resposta" aparece durante answering e para o TTS', async () => {
    const t = await renderScreen();
    await typeAndSend('Tenho atividade pendente?');
    await respond(t.requests, makeAssistantResponse());
    expect(screen.getByLabelText('Assistente ASA, respondendo')).toBeTruthy();
    expect(screen.getByLabelText('Parar resposta e falar novamente')).toBeTruthy();
    const stop = screen.getByLabelText('Parar resposta');
    await act(async () => {
      fireEvent.press(stop);
    });
    expect(t.synthesis.stop).toHaveBeenCalled();
    expect(screen.queryByLabelText('Parar resposta')).toBeNull();
    expect(screen.getByText('Você tem 1 atividade pendente.')).toBeTruthy();
    expect(screen.getByLabelText('Repetir resposta')).toBeTruthy();
  });

  it('nextAction navigate chama onNavigate com target e params; ask envia a pergunta', async () => {
    const t = await renderScreen();
    await typeAndSend('Qual é minha próxima prova?');
    await respond(
      t.requests,
      makeAssistantResponse({
        speech: { text: '' },
        nextActions: [
          { type: 'navigate', label: 'Ver avaliações', target: 'academic.assessments' },
          { type: 'navigate', label: 'Abrir disciplina', target: 'subject', params: { subjectId: 'subject-demo-002' } },
          { type: 'ask', label: 'E minha frequência?', text: 'Como está minha frequência?' },
        ],
      }),
    );
    fireEvent.press(screen.getByLabelText('Ver avaliações'));
    expect(t.onNavigate).toHaveBeenCalledWith('academic.assessments', undefined);
    fireEvent.press(screen.getByLabelText('Abrir disciplina'));
    expect(t.onNavigate).toHaveBeenCalledWith('subject', { subjectId: 'subject-demo-002' });
    fireEvent.press(screen.getByLabelText('Ver disciplina: Trabalho prático de Banco de Dados'));
    expect(t.onNavigate).toHaveBeenCalledWith('subject', { subjectId: 'subject-demo-002' });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('E minha frequência?'));
    });
    expect(t.requests[1]?.body).toMatchObject({ inputType: 'text', text: 'Como está minha frequência?' });
  });

  it('abstenção e validação humana usam os cards existentes', async () => {
    const t = await renderScreen();
    await typeAndSend('Vou ser aprovado?');
    await respond(t.requests, makeAssistantResponse({ status: 'abstained', abstained: true, abstentionReason: 'Não há dados suficientes.', speech: { text: '' } }));
    expect(screen.getByText(MESSAGES.abstained)).toBeTruthy();
    expect(screen.getByText('Não há dados suficientes.')).toBeTruthy();

    await typeAndSend('Minha nota está errada');
    await respond(t.requests, makeAssistantResponse({ interactionId: 'int-002', status: 'human_validation', requiresHumanValidation: true, speech: { text: '' } }));
    expect(screen.getByText(MESSAGES.humanValidation)).toBeTruthy();
  });

  it('permissão negada mostra a mensagem e o campo de texto continua utilizável', async () => {
    const t = await renderScreen({
      configure: (recognition) => {
        recognition.permission = 'undetermined';
        recognition.requestResult = 'denied';
      },
    });
    expect(t.recognition.requestPermission).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Falar com o assistente ASA'));
    });
    expect(t.recognition.requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.getByText(MESSAGES.voicePermissionDenied)).toBeTruthy();
    expect(screen.getByTestId('voice-error').props.accessibilityRole).toBe('alert');

    await typeAndSend('Tenho atividade pendente?');
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(MESSAGES.voicePermissionDenied)).toBeNull();
  });

  it('voz indisponível (Expo Go): aviso, botão desabilitado com rótulo explicativo e texto funcionando', async () => {
    const t = await renderScreen({
      configure: (recognition) => {
        recognition.availability = { available: false, reason: 'expo_go' };
      },
    });
    await waitFor(() => expect(screen.getByTestId('voice-unavailable-notice')).toBeTruthy());
    expect(screen.getByText(MESSAGES.voiceUnavailable)).toBeTruthy();
    expect(screen.getByText(MESSAGES.voiceUnavailableExpoGo)).toBeTruthy();
    const button = screen.getByLabelText('Entrada por voz indisponível. Use o campo de texto para perguntar');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    await typeAndSend('Como está minha frequência?');
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('voz: ouvindo mostra parcial, "Parar e enviar" envia e "Editar" leva o texto ao campo', async () => {
    const t = await renderScreen();
    t.recognition.stopTranscript = 'Como está minha frequência?';
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Falar com o assistente ASA'));
    });
    expect(screen.getByText('Ouvindo...')).toBeTruthy();
    expect(screen.getByLabelText('Assistente ASA, ouvindo')).toBeTruthy();
    act(() => t.recognition.emitPartial('como está minha'));
    expect(screen.getByText('“como está minha”')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Parar e enviar'));
    });
    expect(t.requests[0]?.body).toMatchObject({ inputType: 'voice', text: 'Como está minha frequência?' });
    expect(screen.getByText('Você disse:')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Editar'));
    expect(screen.getByLabelText('Digite sua pergunta').props.value).toBe('Como está minha frequência?');
  });

  it('erro de API mostra mensagem oficial com "Tentar novamente" por voz', async () => {
    const t = await renderScreen();
    await typeAndSend('Tenho pendência?');
    const { ApiClientError } = jest.requireActual<typeof import('../services/apiClient')>('../services/apiClient');
    await act(async () => {
      t.requests[0]?.reject(new ApiClientError({ kind: 'timeout', message: 'x' }));
    });
    expect(screen.getByText(MESSAGES.assistantTimeout)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText(MESSAGES.retry));
    });
    expect(t.recognition.start).toHaveBeenCalledTimes(1);
  });

  it('comando da API mostra aviso e mantém a resposta anterior; "Nova conversa" limpa tudo', async () => {
    const t = await renderScreen();
    await typeAndSend('Tenho pendência?');
    await respond(t.requests, makeAssistantResponse({ speech: { text: '' } }));
    await typeAndSend('para de falar');
    await respond(t.requests, makeAssistantResponse({ interactionId: 'cmd', clientCommand: 'stop_speaking', display: { title: '', message: 'Tudo bem, parei de falar.', items: [], recommendations: [] } }));
    expect(screen.getByText('Tudo bem, parei de falar.')).toBeTruthy();
    expect(screen.getByText('Você tem 1 atividade pendente.')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Nova conversa'));
    expect(screen.queryByText('Você tem 1 atividade pendente.')).toBeNull();
    expect(screen.getByTestId('voice-suggestions')).toBeTruthy();
  });

  it('desligar "Resposta por voz" no cabeçalho impede a fala', async () => {
    const t = await renderScreen();
    fireEvent.press(screen.getByTestId('tts-toggle'));
    expect(screen.getByLabelText('Resposta por voz desativada').props.accessibilityState).toMatchObject({ checked: false });
    await typeAndSend('Tenho pendência?');
    await respond(t.requests, makeAssistantResponse());
    expect(t.synthesis.speak).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Parar resposta')).toBeNull();
  });

  it('modo "Análise completa" ainda mostra o botão "Solicitar análise"', async () => {
    await renderScreen();
    fireEvent.press(screen.getByLabelText('Análise completa'));
    await screen.findByText(MESSAGES.emptyRecommendations);
    expect(screen.getByLabelText('Solicitar análise')).toBeTruthy();
    expect(screen.queryByLabelText('Falar com o assistente ASA')).toBeNull();
  });

  it('sair do modo Conversar libera mídia (para o TTS) e a conversa sobrevive ao voltar', async () => {
    const t = await renderScreen();
    await typeAndSend('Tenho pendência?');
    await respond(t.requests, makeAssistantResponse());
    expect(t.synthesis.stop).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Análise completa'));
    expect(t.synthesis.stop).toHaveBeenCalledTimes(1);
    await screen.findByText(MESSAGES.emptyRecommendations);
    fireEvent.press(screen.getByLabelText('Conversar'));
    expect(screen.getByText('Você tem 1 atividade pendente.')).toBeTruthy();
    expect(screen.queryByLabelText('Parar resposta')).toBeNull();
  });
});
