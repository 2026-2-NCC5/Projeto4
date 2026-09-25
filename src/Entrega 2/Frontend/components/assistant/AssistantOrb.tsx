import React from 'react';
import type { Animated, StyleProp, ViewStyle } from 'react-native';

import { assistantStateAccessibilityLabel, type AssistantState } from '../../features/assistant/state/assistantStateMachine';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { AsaVoiceOrb, type AsaOrbState, type AsaOrbTone } from '../voice/AsaVoiceOrb';

export interface AssistantOrbProps {
  state: AssistantState;
  audioLevel?: Animated.Value;
  size?: number;
  tone?: AsaOrbTone;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Estado global do assistente → estado visual do orb. */
export function orbStateForAssistant(state: AssistantState): AsaOrbState {
  switch (state) {
    case 'listening':
    case 'interrupted':
      return 'listening';
    case 'processing':
      return 'transcribing';
    case 'thinking':
      return 'thinking';
    case 'speaking':
      return 'answering';
    case 'error':
    case 'offline':
      return 'error';
    case 'activating':
      return 'listening';
    default:
      return 'idle';
  }
}

/**
 * Identidade visual do Assistente ASA: núcleo luminoso com auroras, anéis de voz e partículas.
 * Reage ao estado derivado (idle → respiração; wake-word → brilho suave; ativação → pulse;
 * ouvindo → amplitude real; pensando → órbita; falando → pulso; erro → tom quente breve).
 */
export function AssistantOrb({ state, audioLevel, size = 160, tone = 'default', style, testID }: AssistantOrbProps) {
  const reduceMotion = useReducedMotion();
  return (
    <AsaVoiceOrb
      state={orbStateForAssistant(state)}
      audioLevel={audioLevel}
      reduceMotion={reduceMotion}
      size={size}
      tone={tone}
      activating={state === 'activating' || state === 'interrupted'}
      accessibilityLabel={assistantStateAccessibilityLabel(state)}
      style={style}
      testID={testID}
    />
  );
}
