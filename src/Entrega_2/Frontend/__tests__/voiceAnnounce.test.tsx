import { act, renderHook } from '@testing-library/react-native';
import React from 'react';

import { useVoiceAssistant, VoiceAssistantProvider } from '../hooks/useVoiceAssistant';

import { makeAssistantResponse } from './support/fixtures';
import { controllableSend, fakeHaptics, FakeRecognition, FakeSynthesis } from './support/voiceFakes';

/** Anúncios do app (fila presencial) usam o MESMO TTS do assistente, com prioridade. */
async function setup() {
  const recognition = new FakeRecognition();
  const synthesis = new FakeSynthesis();
  const { send, requests } = controllableSend();
  const onSpeakingChange = jest.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <VoiceAssistantProvider recognition={recognition} synthesis={synthesis} sendMessage={send} haptics={fakeHaptics()} ttsEnabled onSpeakingChange={onSpeakingChange}>
      {children}
    </VoiceAssistantProvider>
  );
  const hook = renderHook(() => useVoiceAssistant(), { wrapper });
  await act(async () => undefined);
  return { current: () => hook.result.current, recognition, synthesis, requests, onSpeakingChange };
}

describe('announce (alertas da fila pelo TTS do assistente)', () => {
  it('assistente ocioso: fala o aviso sem mudar a conversa e pausa o "Hey Asa" durante a fala', async () => {
    const t = await setup();
    let spoke = false;
    act(() => {
      spoke = t.current().announce('Prepare-se. Sua senha está entre as próximas.');
    });
    expect(spoke).toBe(true);
    expect(t.synthesis.spoken).toEqual(['Prepare-se. Sua senha está entre as próximas.']);
    expect(t.current().state.phase).toBe('idle');
    expect(t.onSpeakingChange).toHaveBeenLastCalledWith(true, 'Prepare-se. Sua senha está entre as próximas.');
    act(() => t.synthesis.finish());
    expect(t.onSpeakingChange).toHaveBeenLastCalledWith(false, null);
  });

  it('prioridade normal não interrompe o assistente ocupado; alta interrompe a resposta falada', async () => {
    const t = await setup();
    await act(async () => {
      void t.current().submitText('Tenho alguma atividade pendente?');
    });
    await act(async () => {
      t.requests[0]?.resolve(makeAssistantResponse({ speech: { text: 'Você tem duas atividades pendentes.' } }));
    });
    expect(t.current().state.phase).toBe('answering');

    let spoke = true;
    act(() => {
      spoke = t.current().announce('Fique por perto.', 'normal');
    });
    expect(spoke).toBe(false);

    act(() => {
      spoke = t.current().announce('Chegou a sua vez! Sua senha 0029 foi chamada. Dirija-se à Mesa 03.', 'high');
    });
    expect(spoke).toBe(true);
    expect(t.synthesis.stop).toHaveBeenCalled();
    expect(t.synthesis.spoken.at(-1)).toBe('Chegou a sua vez! Sua senha 0029 foi chamada. Dirija-se à Mesa 03.');
    expect(t.current().state.phase).not.toBe('answering');
  });

  it('prioridade alta fecha o microfone antes de falar (a escuta não captura a própria fala)', async () => {
    const t = await setup();
    t.recognition.availability = { available: true };
    await act(async () => {
      await t.current().startListening();
    });
    expect(t.current().state.phase).toBe('listening');
    act(() => {
      t.current().announce('Chegou a sua vez!', 'high');
    });
    expect(t.recognition.cancel).toHaveBeenCalled();
    expect(t.current().state.phase).not.toBe('listening');
    expect(t.synthesis.spoken).toContain('Chegou a sua vez!');
  });

  it('texto vazio não fala', async () => {
    const t = await setup();
    expect(t.current().announce('   ', 'high')).toBe(false);
    expect(t.synthesis.speak).not.toHaveBeenCalled();
  });
});
