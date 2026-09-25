import { act, renderHook } from '@testing-library/react-native';
import React from 'react';

import { VOICE } from '../config/services';
import { useVoiceAssistant, VoiceAssistantProvider } from '../hooks/useVoiceAssistant';
import { ApiClientError } from '../services/apiClient';
import type { SendAssistantMessage } from '../types/assistant';
import type { AssistantResponse } from '../types/api';
import { MESSAGES } from '../utils/messages';

import { makeAssistantResponse } from './support/fixtures';
import { controllableSend, fakeHaptics, FakeRecognition, FakeSynthesis } from './support/voiceFakes';

interface SetupOptions {
  ttsEnabled?: boolean;
  configure?: (recognition: FakeRecognition) => void;
  sendMessage?: SendAssistantMessage;
}

async function setup(options: SetupOptions = {}) {
  const recognition = new FakeRecognition();
  options.configure?.(recognition);
  const synthesis = new FakeSynthesis();
  const haptics = fakeHaptics();
  const { send, requests } = controllableSend();
  const onGoBack = jest.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <VoiceAssistantProvider
      recognition={recognition}
      synthesis={synthesis}
      sendMessage={options.sendMessage ?? send}
      haptics={haptics}
      ttsEnabled={options.ttsEnabled ?? true}
      onGoBack={onGoBack}
    >
      {children}
    </VoiceAssistantProvider>
  );
  const hook = renderHook(() => useVoiceAssistant(), { wrapper });
  // disponibilidade é verificada na montagem (sem pedir permissão)
  await act(async () => undefined);
  const current = () => hook.result.current;
  return { ...hook, current, recognition, synthesis, haptics, send, requests, onGoBack };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function listen(t: Setup) {
  await act(async () => {
    await t.current().startListening();
  });
}

/** Dispara o envio sem aguardar a resposta (a requisição fake só resolve quando o teste mandar). */
async function submit(t: Setup, text: string) {
  await act(async () => {
    void t.current().submitText(text);
  });
}

async function respond(t: Setup, response: AssistantResponse, index = t.requests.length - 1) {
  await act(async () => {
    t.requests[index]?.resolve(response);
  });
}

async function fail(t: Setup, error: unknown, index = t.requests.length - 1) {
  await act(async () => {
    t.requests[index]?.reject(error);
  });
}

describe('useVoiceAssistant', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fluxo completo por voz: idle → listening → transcribing → understanding → thinking → answering → idle', async () => {
    const t = await setup();
    expect(t.current().state.phase).toBe('idle');
    expect(t.current().availability).toEqual({ available: true });
    // Permissão nunca é pedida no boot.
    expect(t.recognition.getPermission).not.toHaveBeenCalled();
    expect(t.recognition.requestPermission).not.toHaveBeenCalled();

    await listen(t);
    expect(t.current().state.phase).toBe('listening');
    expect(t.recognition.start).toHaveBeenCalledTimes(1);
    expect(t.haptics.listenStart).toHaveBeenCalledTimes(1);

    act(() => t.recognition.emitPartial('Tenho atividade'));
    expect(t.current().state.partialTranscript).toBe('Tenho atividade');
    act(() => t.recognition.emitLevel(0.8));

    act(() => t.recognition.emitSpeechEnd());
    expect(t.current().state.phase).toBe('transcribing');
    expect(t.haptics.listenEnd).toHaveBeenCalled();

    await act(async () => t.recognition.emitFinal('  Tenho atividade pendente?  '));
    expect(t.current().state).toMatchObject({ phase: 'understanding', inputType: 'voice', transcript: 'Tenho atividade pendente?' });
    expect(t.send).toHaveBeenCalledTimes(1);
    const request = t.requests[0]!;
    expect(request.body).toEqual({
      inputType: 'voice',
      text: 'Tenho atividade pendente?',
      conversationContext: {},
      clientMetrics: { speechRecognitionMs: expect.any(Number) },
    });
    expect(request.correlationId).toMatch(/^corr-/);

    act(() => jest.advanceTimersByTime(VOICE.THINKING_DELAY_MS));
    expect(t.current().state.phase).toBe('thinking');

    await respond(t, makeAssistantResponse({ inputType: 'voice' }));
    expect(t.current().state.phase).toBe('answering');
    expect(t.synthesis.speak).toHaveBeenCalledWith('Você tem uma atividade pendente em Banco de Dados.', expect.any(Object));

    act(() => t.synthesis.finish());
    expect(t.current().state.phase).toBe('idle');
    // O texto permanece após o áudio terminar.
    expect(t.current().state.turn).toMatchObject({ transcript: 'Tenho atividade pendente?', inputType: 'voice' });
    expect(t.current().state.turn?.response.display.message).toBe('Você tem 1 atividade pendente.');
    expect(t.current().metrics.ttsMs).not.toBeNull();
    expect(t.current().metrics.totalMs).not.toBeNull();
  });

  it('"Parar e enviar": stopListening finaliza e envia a transcrição', async () => {
    const t = await setup();
    t.recognition.stopTranscript = 'Como está minha frequência?';
    await listen(t);
    await act(async () => {
      await t.current().stopListening();
    });
    expect(t.recognition.stop).toHaveBeenCalledTimes(1);
    expect(t.current().state).toMatchObject({ phase: 'understanding', transcript: 'Como está minha frequência?' });
    expect(t.requests[0]?.body.inputType).toBe('voice');
  });

  it('escuta atinge LISTEN_MAX_MS → finaliza automaticamente', async () => {
    const t = await setup();
    t.recognition.stopTranscript = null;
    await listen(t);
    await act(async () => {
      jest.advanceTimersByTime(VOICE.LISTEN_MAX_MS);
    });
    expect(t.recognition.stop).toHaveBeenCalledTimes(1);
    expect(t.current().state.phase).toBe('transcribing');
    await act(async () => t.recognition.emitFinal('Qual é minha próxima prova?'));
    expect(t.current().state.phase).toBe('understanding');
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('texto usa o MESMO sendMessage com inputType text (sem métricas de fala e sem studentId)', async () => {
    const t = await setup();
    await submit(t, '  Qual é minha próxima prova?  ');
    expect(t.current().state).toMatchObject({ phase: 'understanding', inputType: 'text', transcript: 'Qual é minha próxima prova?' });
    expect(t.send).toHaveBeenCalledTimes(1);
    const body = t.requests[0]!.body;
    expect(body).toEqual({ inputType: 'text', text: 'Qual é minha próxima prova?', conversationContext: {} });
    expect(JSON.stringify(body)).not.toMatch(/student/i);
    expect(t.recognition.start).not.toHaveBeenCalled();
  });

  it('texto vazio não envia nada', async () => {
    const t = await setup();
    await submit(t, '   ');
    expect(t.send).not.toHaveBeenCalled();
    expect(t.current().state.phase).toBe('idle');
  });

  it('permissão é pedida só ao tocar; negada → permission_denied e o texto continua funcionando', async () => {
    const t = await setup({
      configure: (recognition) => {
        recognition.permission = 'undetermined';
        recognition.requestResult = 'denied';
      },
    });
    expect(t.recognition.requestPermission).not.toHaveBeenCalled();

    await listen(t);
    expect(t.recognition.getPermission).toHaveBeenCalledTimes(1);
    expect(t.recognition.requestPermission).toHaveBeenCalledTimes(1);
    expect(t.recognition.start).not.toHaveBeenCalled();
    expect(t.current().state.phase).toBe('error');
    expect(t.current().state.error).toMatchObject({ kind: 'permission_denied', message: MESSAGES.voicePermissionDenied });
    expect(t.haptics.error).toHaveBeenCalled();

    await submit(t, 'Tenho atividade pendente?');
    expect(t.current().state).toMatchObject({ phase: 'understanding', inputType: 'text', error: null });
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('permissão já concedida não abre o diálogo de novo', async () => {
    const t = await setup();
    await listen(t);
    expect(t.recognition.getPermission).toHaveBeenCalledTimes(1);
    expect(t.recognition.requestPermission).not.toHaveBeenCalled();
  });

  it('voz indisponível (Expo Go) → error unavailable com dica de development build; texto segue funcionando', async () => {
    const t = await setup({
      configure: (recognition) => {
        recognition.availability = { available: false, reason: 'expo_go' };
      },
    });
    expect(t.current().availability).toEqual({ available: false, reason: 'expo_go' });
    await listen(t);
    expect(t.recognition.getPermission).not.toHaveBeenCalled();
    expect(t.recognition.start).not.toHaveBeenCalled();
    expect(t.current().state.error).toEqual({ kind: 'unavailable', message: MESSAGES.voiceUnavailable, detail: MESSAGES.voiceUnavailableExpoGo });

    await submit(t, 'Como está minha frequência?');
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['vazia', ''],
    ['curta demais', 'a'],
  ])('transcrição %s → no_speech sem chamar o backend', async (_label, transcript) => {
    const t = await setup();
    t.recognition.stopTranscript = transcript;
    await listen(t);
    await act(async () => {
      await t.current().stopListening();
    });
    expect(t.send).not.toHaveBeenCalled();
    expect(t.current().state.error).toMatchObject({ kind: 'no_speech', message: MESSAGES.voiceNoSpeech });
  });

  it.each([
    ['stt_failed', MESSAGES.voiceSttFailed],
    ['no_speech', MESSAGES.voiceNoSpeech],
    ['network', MESSAGES.errorNetwork],
    ['permission_denied', MESSAGES.voicePermissionDenied],
  ] as const)('erro do reconhecimento %s → mensagem oficial e reconhecimento cancelado', async (kind, message) => {
    const t = await setup();
    await listen(t);
    act(() => t.recognition.emitError(kind));
    expect(t.current().state.phase).toBe('error');
    expect(t.current().state.error).toMatchObject({ kind, message });
    expect(t.recognition.cancel).toHaveBeenCalled();
    expect(t.send).not.toHaveBeenCalled();
    expect(t.haptics.error).toHaveBeenCalled();
  });

  it('transcrição que não chega em TRANSCRIBE_TIMEOUT_MS → stt_failed', async () => {
    const t = await setup();
    await listen(t);
    act(() => t.recognition.emitSpeechEnd());
    act(() => jest.advanceTimersByTime(VOICE.TRANSCRIBE_TIMEOUT_MS));
    expect(t.current().state.error).toMatchObject({ kind: 'stt_failed', message: MESSAGES.voiceSttFailed });
    expect(t.recognition.cancel).toHaveBeenCalled();
    // Resultado atrasado é ignorado.
    act(() => t.recognition.emitFinal('tarde demais'));
    expect(t.send).not.toHaveBeenCalled();
  });

  it.each([
    ['dependency', MESSAGES.errorAnalysisDependency],
    ['timeout', MESSAGES.assistantTimeout],
    ['offline', MESSAGES.errorOffline],
    ['contract', MESSAGES.errorAnalysisContract],
    ['not_found', MESSAGES.assistantGeneric],
  ] as const)('erro de API %s → error com mensagem oficial, mantendo a resposta anterior', async (kind, message) => {
    const t = await setup({ ttsEnabled: false });
    await submit(t, 'Tenho pendência?');
    await respond(t, makeAssistantResponse());
    const previousTurn = t.current().state.turn;
    await submit(t, 'E a frequência?');
    await fail(t, new ApiClientError({ kind, message: 'x' }));
    expect(t.current().state.phase).toBe('error');
    expect(t.current().state.error).toMatchObject({ kind, message });
    expect(t.current().state.turn).toBe(previousTurn);
    expect(t.haptics.error).toHaveBeenCalled();
  });

  it('cancelar durante thinking aborta a requisição e volta a idle; resposta atrasada é ignorada', async () => {
    const t = await setup();
    await submit(t, 'Analise minha situação acadêmica');
    act(() => jest.advanceTimersByTime(VOICE.THINKING_DELAY_MS));
    expect(t.current().state.phase).toBe('thinking');
    const request = t.requests[0]!;

    act(() => t.current().cancel());
    expect(request.signal.aborted).toBe(true);
    expect(t.current().state.phase).toBe('idle');

    await fail(t, new ApiClientError({ kind: 'cancelled', message: 'cancelada' }));
    await respond(t, makeAssistantResponse());
    expect(t.current().state).toMatchObject({ phase: 'idle', error: null, turn: null });
    expect(t.synthesis.speak).not.toHaveBeenCalled();
  });

  it('cancelar durante a escuta cancela o reconhecimento', async () => {
    const t = await setup();
    await listen(t);
    act(() => t.current().cancel());
    expect(t.recognition.cancel).toHaveBeenCalledTimes(1);
    expect(t.current().state.phase).toBe('idle');
    act(() => t.recognition.emitFinal('ignorado'));
    expect(t.send).not.toHaveBeenCalled();
  });

  it('resposta de interação antiga (seq anterior) é ignorada', async () => {
    const t = await setup({ ttsEnabled: false });
    await submit(t, 'primeira');
    act(() => t.current().cancel());
    await submit(t, 'segunda');
    await respond(t, makeAssistantResponse({ interactionId: 'old', display: { title: 'Antiga', message: 'antiga', items: [], recommendations: [] } }), 0);
    expect(t.current().state.phase).toBe('understanding');
    await respond(t, makeAssistantResponse({ interactionId: 'new' }), 1);
    expect(t.current().state.turn?.id).toBe('new');
  });

  it('abstenção: fala e termina em abstained', async () => {
    const t = await setup();
    await submit(t, 'Vou passar de ano?');
    await respond(t, makeAssistantResponse({ status: 'abstained', abstained: true, abstentionReason: 'Dados insuficientes.' }));
    expect(t.current().state.phase).toBe('answering');
    act(() => t.synthesis.finish());
    expect(t.current().state.phase).toBe('abstained');
    expect(t.current().state.turn?.response.abstentionReason).toBe('Dados insuficientes.');
  });

  it('validação humana: sem TTS vai direto para human_validation', async () => {
    const t = await setup({ ttsEnabled: false });
    await submit(t, 'Minha nota está errada');
    await respond(t, makeAssistantResponse({ status: 'human_validation', requiresHumanValidation: true }));
    expect(t.current().state.phase).toBe('human_validation');
    expect(t.synthesis.speak).not.toHaveBeenCalled();
  });

  it('stopSpeaking para o TTS e mantém a resposta', async () => {
    const t = await setup();
    await submit(t, 'Tenho pendência?');
    await respond(t, makeAssistantResponse());
    expect(t.current().state.phase).toBe('answering');
    act(() => t.current().stopSpeaking());
    expect(t.synthesis.stop).toHaveBeenCalledTimes(1);
    expect(t.current().state.phase).toBe('idle');
    expect(t.current().state.turn).not.toBeNull();
  });

  it('tocar no microfone durante a resposta para o TTS antes de ouvir', async () => {
    const t = await setup();
    await submit(t, 'Tenho pendência?');
    await respond(t, makeAssistantResponse());
    await listen(t);
    expect(t.synthesis.stop).toHaveBeenCalledTimes(1);
    expect(t.synthesis.stop.mock.invocationCallOrder[0]).toBeLessThan(t.recognition.start.mock.invocationCallOrder[0]!);
    expect(t.current().state.phase).toBe('listening');
  });

  it('erro no TTS → volta ao repouso com aviso, sem apagar o texto', async () => {
    const t = await setup();
    await submit(t, 'Tenho pendência?');
    await respond(t, makeAssistantResponse());
    act(() => t.synthesis.fail());
    expect(t.current().state).toMatchObject({ phase: 'idle', notice: MESSAGES.voiceTtsFailed });
    expect(t.current().state.turn).not.toBeNull();
  });

  it('clientCommand repeat_last fala de novo a resposta anterior e mantém o turn', async () => {
    const t = await setup();
    await submit(t, 'Tenho pendência?');
    await respond(t, makeAssistantResponse());
    act(() => t.synthesis.finish());
    const firstTurn = t.current().state.turn;

    await submit(t, 'repete');
    await respond(
      t,
      makeAssistantResponse({
        interactionId: 'int-repeat',
        intent: 'repeat_last',
        clientCommand: 'repeat_last',
        speech: { text: '' },
        display: { title: '', message: 'Repetindo a última resposta.', items: [], recommendations: [] },
      }),
    );
    expect(t.synthesis.speak).toHaveBeenCalledTimes(2);
    expect(t.synthesis.spoken[1]).toBe('Você tem uma atividade pendente em Banco de Dados.');
    expect(t.current().state).toMatchObject({ phase: 'answering', notice: 'Repetindo a última resposta.' });
    expect(t.current().state.turn).toBe(firstTurn);
  });

  it('clientCommand stop_speaking chama synthesis.stop', async () => {
    const t = await setup();
    await submit(t, 'Tenho pendência?');
    await respond(t, makeAssistantResponse());
    act(() => t.synthesis.finish());
    t.synthesis.stop.mockClear();

    await submit(t, 'para de falar');
    await respond(t, makeAssistantResponse({ clientCommand: 'stop_speaking', intent: 'stop_speaking', display: { title: '', message: 'Ok, parei.', items: [], recommendations: [] } }));
    expect(t.synthesis.stop).toHaveBeenCalled();
    expect(t.current().state).toMatchObject({ phase: 'idle', notice: 'Ok, parei.' });
    expect(t.synthesis.speak).toHaveBeenCalledTimes(1);
  });

  it('clientCommand go_back chama onGoBack', async () => {
    const t = await setup();
    await submit(t, 'volta');
    await respond(t, makeAssistantResponse({ clientCommand: 'go_back', intent: 'go_back', display: { title: '', message: 'Voltando ao início.', items: [], recommendations: [] } }));
    expect(t.onGoBack).toHaveBeenCalledTimes(1);
    expect(t.synthesis.speak).not.toHaveBeenCalled();
  });

  it('ttsEnabled=false não fala (nem repeat_last) e vai direto ao repouso', async () => {
    const t = await setup({ ttsEnabled: false });
    await submit(t, 'Tenho pendência?');
    await respond(t, makeAssistantResponse());
    expect(t.current().state.phase).toBe('idle');
    act(() => t.current().repeatLast());
    await submit(t, 'repete');
    await respond(t, makeAssistantResponse({ clientCommand: 'repeat_last' }));
    expect(t.synthesis.speak).not.toHaveBeenCalled();
    expect(t.current().state.phase).toBe('idle');
  });

  it('repeatLast (botão) fala novamente a última resposta', async () => {
    const t = await setup();
    await submit(t, 'Tenho pendência?');
    await respond(t, makeAssistantResponse());
    act(() => t.synthesis.finish());
    act(() => t.current().repeatLast());
    expect(t.synthesis.speak).toHaveBeenCalledTimes(2);
    expect(t.current().state.phase).toBe('answering');
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it('releaseMedia cancela o reconhecimento em andamento', async () => {
    const t = await setup();
    await listen(t);
    act(() => t.current().releaseMedia());
    expect(t.recognition.cancel).toHaveBeenCalledTimes(1);
    expect(t.current().state.phase).toBe('idle');
  });

  it('releaseMedia para o TTS e mantém a resposta', async () => {
    const t = await setup();
    await submit(t, 'Tenho pendência?');
    await respond(t, makeAssistantResponse());
    act(() => t.current().releaseMedia());
    expect(t.synthesis.stop).toHaveBeenCalledTimes(1);
    expect(t.current().state.phase).toBe('idle');
    expect(t.current().state.turn).not.toBeNull();
  });

  it('context da resposta é reenviado na mensagem seguinte', async () => {
    const t = await setup({ ttsEnabled: false });
    await submit(t, 'Como estou em Banco de Dados?');
    await respond(t, makeAssistantResponse({ intent: 'get_subject_details', context: { lastIntent: 'get_subject_details', lastSubjectId: 'subject-demo-002' } }));
    await submit(t, 'e a frequência dela?');
    expect(t.requests[1]?.body.conversationContext).toEqual({ lastIntent: 'get_subject_details', lastSubjectId: 'subject-demo-002' });
    for (const request of t.requests) expect(JSON.stringify(request.body)).not.toMatch(/studentId|student_id/);
  });

  it('resetConversation limpa resposta e contexto', async () => {
    const t = await setup({ ttsEnabled: false });
    await submit(t, 'Tenho pendência?');
    await respond(t, makeAssistantResponse());
    act(() => t.current().resetConversation());
    expect(t.current().state).toMatchObject({ phase: 'idle', turn: null, transcript: null, context: {} });
    await submit(t, 'oi');
    expect(t.requests[1]?.body.conversationContext).toEqual({});
  });

  it('desmontar (logout) aborta a requisição em andamento', async () => {
    const t = await setup();
    await submit(t, 'Tenho pendência?');
    t.unmount();
    expect(t.requests[0]?.signal.aborted).toBe(true);
  });

  it('fora do provider lança erro explicativo', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let caught: unknown = null;
    function Probe() {
      try {
        useVoiceAssistant();
      } catch (error) {
        caught = error;
      }
      return null;
    }
    renderHook(() => Probe());
    expect((caught as Error | null)?.message).toBe('useVoiceAssistant deve ser usado dentro de <VoiceAssistantProvider>.');
    spy.mockRestore();
  });
});
