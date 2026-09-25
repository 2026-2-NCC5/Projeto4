import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Animated } from 'react-native';

import { AsaVoiceOrb, orbAccessibilityLabel, type AsaOrbState } from '../components/voice/AsaVoiceOrb';

const STATES: AsaOrbState[] = ['idle', 'listening', 'transcribing', 'thinking', 'answering', 'error'];

describe('AsaVoiceOrb', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(STATES)('estado %s: imagem acessível com rótulo do estado', (state) => {
    render(<AsaVoiceOrb state={state} audioLevel={new Animated.Value(0.4)} />);
    const orb = screen.getByLabelText(orbAccessibilityLabel(state));
    expect(orb.props.accessibilityRole).toBe('image');
    expect(orb.props.accessible).toBe(true);
    expect(orbAccessibilityLabel(state)).toMatch(/^Assistente ASA, /);
  });

  it('rótulos específicos por estado', () => {
    expect(orbAccessibilityLabel('listening')).toBe('Assistente ASA, ouvindo');
    expect(orbAccessibilityLabel('thinking')).toBe('Assistente ASA, analisando suas informações');
    expect(orbAccessibilityLabel('answering')).toBe('Assistente ASA, respondendo');
  });

  it('aceita rótulo personalizado', () => {
    render(<AsaVoiceOrb state="idle" accessibilityLabel="Orb personalizado" />);
    expect(screen.getByLabelText('Orb personalizado')).toBeTruthy();
  });

  it('com movimento: inicia loops de animação (rotação, respiração, anéis)', () => {
    const loopSpy = jest.spyOn(Animated, 'loop');
    const { rerender } = render(<AsaVoiceOrb state="idle" />);
    expect(loopSpy).toHaveBeenCalled();
    loopSpy.mockClear();
    rerender(<AsaVoiceOrb state="listening" audioLevel={new Animated.Value(0)} />);
    expect(loopSpy).toHaveBeenCalled();
    // anéis de voz presentes (decorativos: ocultos da acessibilidade)
    expect(screen.getByTestId('voice-wave', { includeHiddenElements: true })).toBeTruthy();
  });

  it.each(STATES)('reduceMotion (%s): nenhum Animated.loop é iniciado e nada de anéis/partículas', (state) => {
    const loopSpy = jest.spyOn(Animated, 'loop');
    render(<AsaVoiceOrb state={state} reduceMotion audioLevel={new Animated.Value(1)} />);
    expect(loopSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('voice-wave', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByLabelText(orbAccessibilityLabel(state))).toBeTruthy();
  });

  it('para os loops ao desmontar', () => {
    const stops: jest.Mock[] = [];
    const realLoop = Animated.loop;
    jest.spyOn(Animated, 'loop').mockImplementation((animation, config) => {
      const composite = realLoop(animation, config);
      const stop = jest.fn(() => composite.stop());
      stops.push(stop);
      return { ...composite, start: composite.start, stop };
    });
    const { unmount } = render(<AsaVoiceOrb state="thinking" />);
    expect(stops.length).toBeGreaterThan(0);
    unmount();
    stops.forEach((stop) => expect(stop).toHaveBeenCalled());
  });
});

describe('VoiceWave', () => {
  it('trocar a quantidade de anéis enquanto ativa não quebra a animação nativa', () => {
    const { rerender } = render(<AsaVoiceOrb state="transcribing" size={164} />);
    // listening (3 anéis) → answering (2 anéis) com mudança de tamanho no mesmo commit
    expect(() => rerender(<AsaVoiceOrb state="answering" size={116} />)).not.toThrow();
    expect(() => rerender(<AsaVoiceOrb state="listening" size={116} audioLevel={new Animated.Value(0.3)} />)).not.toThrow();
    expect(screen.getByTestId('voice-wave', { includeHiddenElements: true })).toBeTruthy();
  });
});
