import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import { splitStreamingUnits, STREAMING_CHAR_DELAY_MS, STREAMING_FADE_DURATION_MS, StreamingText } from '../components/assistant/StreamingText';
import { PreferencesProvider } from '../hooks/usePreferences';

function renderText(ui: React.ReactElement) {
  return render(<PreferencesProvider>{ui}</PreferencesProvider>);
}

describe('splitStreamingUnits', () => {
  it('modo caractere: palavras não quebram no meio e o espaço viaja com a palavra anterior', () => {
    const [line] = splitStreamingUnits('Olá mundo', true);
    expect(line?.words).toEqual([
      ['O', 'l', 'á', ' '],
      ['m', 'u', 'n', 'd', 'o'],
    ]);
  });

  it('modo palavra: uma unidade por palavra; quebras de linha viram linhas separadas', () => {
    const lines = splitStreamingUnits('Você tem 1 pendência.\n\nVeja abaixo.', false);
    expect(lines).toHaveLength(3);
    expect(lines[0]?.words).toEqual([['Você '], ['tem '], ['1 '], ['pendência.']]);
    expect(lines[1]?.words).toEqual([]);
    expect(lines[2]?.words.flat().join('')).toBe('Veja abaixo.');
  });
});

describe('StreamingText', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('sem animação: texto completo e selecionável imediatamente, onComplete chamado uma vez', () => {
    const onComplete = jest.fn();
    renderText(<StreamingText text="Você tem 1 atividade pendente." animate={false} onComplete={onComplete} />);
    expect(screen.getByText('Você tem 1 atividade pendente.')).toBeTruthy();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('com animação: revela unidade a unidade (18 ms) com fade de 250 ms e depois vira texto único', () => {
    const onComplete = jest.fn();
    renderText(<StreamingText text="Olá" onComplete={onComplete} />);
    // Durante a revelação o texto é acessível como um todo (accessibilityLabel), mas ainda não é um único Text.
    expect(screen.getByLabelText('Olá')).toBeTruthy();
    expect(screen.queryByText('Olá')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(STREAMING_CHAR_DELAY_MS * 3 + STREAMING_FADE_DURATION_MS + 100);
    });

    expect(screen.getByText('Olá')).toBeTruthy();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('streaming-ready: texto que cresce mantendo o prefixo continua a revelação sem recomeçar', () => {
    const onComplete = jest.fn();
    const { rerender } = renderText(<StreamingText text="Você tem" onComplete={onComplete} />);
    act(() => {
      jest.advanceTimersByTime(STREAMING_CHAR_DELAY_MS * 8 + STREAMING_FADE_DURATION_MS + 100);
    });
    expect(screen.getByText('Você tem')).toBeTruthy();
    expect(onComplete).toHaveBeenCalledTimes(1);

    rerender(
      <PreferencesProvider>
        <StreamingText text="Você tem 1 pendência." onComplete={onComplete} />
      </PreferencesProvider>,
    );
    expect(screen.getByLabelText('Você tem 1 pendência.')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(STREAMING_CHAR_DELAY_MS * 14 + STREAMING_FADE_DURATION_MS + 100);
    });
    expect(screen.getByText('Você tem 1 pendência.')).toBeTruthy();
    expect(onComplete).toHaveBeenCalledTimes(2);
  });
});
