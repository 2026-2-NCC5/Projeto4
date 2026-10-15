import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { CHAT_INPUT_MIN_HEIGHT, ChatInputBar, clampInputHeight, trailingKindFor } from '../components/assistant/ChatInputBar';
import { PreferencesProvider } from '../hooks/usePreferences';

function renderBar(props: Partial<React.ComponentProps<typeof ChatInputBar>> = {}) {
  const onSubmit = jest.fn();
  const onVoicePress = jest.fn();
  const onCancel = jest.fn();
  const onChangeText = jest.fn();
  const utils = render(
    <PreferencesProvider>
      <ChatInputBar value="" onChangeText={onChangeText} onSubmit={onSubmit} voiceMode="idle" onVoicePress={onVoicePress} onCancel={onCancel} {...props} />
    </PreferencesProvider>,
  );
  return { ...utils, onSubmit, onVoicePress, onCancel, onChangeText };
}

describe('ChatInputBar', () => {
  it('trailingKindFor: microfone sem texto, seta de envio com texto, parar ao ouvir, cancelar ao processar', () => {
    expect(trailingKindFor('', 'idle')).toBe('mic');
    expect(trailingKindFor('  ', 'idle')).toBe('mic');
    expect(trailingKindFor('oi', 'idle')).toBe('send');
    expect(trailingKindFor('oi', 'answering')).toBe('send');
    expect(trailingKindFor('', 'unavailable')).toBe('mic-off');
    expect(trailingKindFor('oi', 'unavailable')).toBe('send');
    expect(trailingKindFor('oi', 'listening')).toBe('stop');
    expect(trailingKindFor('oi', 'busy')).toBe('cancel');
  });

  it('clampInputHeight: cresce com o conteúdo até 5 linhas', () => {
    expect(clampInputHeight(10, 5)).toBe(CHAT_INPUT_MIN_HEIGHT);
    expect(clampInputHeight(22 * 3, 5)).toBe(22 * 3 + 20);
    expect(clampInputHeight(22 * 12, 5)).toBe(22 * 5 + 20);
  });

  it('campo vazio mostra o microfone; com texto vira "Enviar" e envia o texto sem espaços extras', () => {
    const t = renderBar();
    expect(screen.getByLabelText('Falar com o assistente ASA')).toBeTruthy();
    expect(screen.queryByLabelText('Enviar pergunta')).toBeNull();
    fireEvent.press(screen.getByLabelText('Falar com o assistente ASA'));
    expect(t.onVoicePress).toHaveBeenCalledTimes(1);

    t.rerender(
      <PreferencesProvider>
        <ChatInputBar value="  Como está minha frequência?  " onChangeText={t.onChangeText} onSubmit={t.onSubmit} voiceMode="idle" onVoicePress={t.onVoicePress} />
      </PreferencesProvider>,
    );
    expect(screen.queryByLabelText('Falar com o assistente ASA')).toBeNull();
    fireEvent.press(screen.getByLabelText('Enviar pergunta'));
    expect(t.onSubmit).toHaveBeenCalledWith('Como está minha frequência?');
  });

  it('processando: botão "Cancelar" (ocupado); ouvindo: "Parar e enviar"; voz indisponível: microfone desabilitado com explicação', () => {
    const t = renderBar({ voiceMode: 'busy' });
    const cancel = screen.getByLabelText('Cancelar');
    expect(cancel.props.accessibilityState).toMatchObject({ busy: true });
    fireEvent.press(cancel);
    expect(t.onCancel).toHaveBeenCalledTimes(1);

    t.rerender(
      <PreferencesProvider>
        <ChatInputBar value="" onChangeText={t.onChangeText} onSubmit={t.onSubmit} voiceMode="listening" onVoicePress={t.onVoicePress} />
      </PreferencesProvider>,
    );
    fireEvent.press(screen.getByLabelText('Parar e enviar'));
    expect(t.onVoicePress).toHaveBeenCalledTimes(1);

    t.rerender(
      <PreferencesProvider>
        <ChatInputBar value="" onChangeText={t.onChangeText} onSubmit={t.onSubmit} voiceMode="unavailable" onVoicePress={t.onVoicePress} />
      </PreferencesProvider>,
    );
    const mic = screen.getByLabelText('Entrada por voz indisponível. Use o campo de texto para perguntar');
    expect(mic.props.accessibilityState).toMatchObject({ disabled: true });
    // O campo de texto continua utilizável.
    fireEvent.changeText(screen.getByLabelText('Digite sua pergunta'), 'oi');
    expect(t.onChangeText).toHaveBeenCalledWith('oi');
  });

  it('ações secundárias: botões e alternâncias (switch) com estado acessível', () => {
    const onNew = jest.fn();
    const onTts = jest.fn();
    renderBar({
      actions: [
        { key: 'new', icon: 'add', label: 'Nova conversa', onPress: onNew, disabled: true },
        { key: 'tts', icon: 'volume-high', label: 'Resposta por voz ativada', onPress: onTts, role: 'switch', checked: true },
      ],
    });
    expect(screen.getByLabelText('Nova conversa').props.accessibilityState).toMatchObject({ disabled: true });
    const tts = screen.getByLabelText('Resposta por voz ativada');
    expect(tts.props.accessibilityRole).toBe('switch');
    expect(tts.props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(tts);
    expect(onTts).toHaveBeenCalledTimes(1);
  });

  it('campo multilinha cresce com o conteúdo e volta ao mínimo após enviar', () => {
    const t = renderBar({ value: 'linha 1\nlinha 2\nlinha 3' });
    const input = screen.getByLabelText('Digite sua pergunta');
    expect(input.props.multiline).toBe(true);
    fireEvent(input, 'contentSizeChange', { nativeEvent: { contentSize: { width: 300, height: 22 * 3 } } });
    expect(input.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ height: 22 * 3 + 20 })]));
    fireEvent(input, 'contentSizeChange', { nativeEvent: { contentSize: { width: 300, height: 22 * 9 } } });
    expect(input.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ height: 22 * 5 + 20 })]));
    fireEvent.press(screen.getByLabelText('Enviar pergunta'));
    expect(t.onSubmit).toHaveBeenCalledWith('linha 1\nlinha 2\nlinha 3');
  });
});
