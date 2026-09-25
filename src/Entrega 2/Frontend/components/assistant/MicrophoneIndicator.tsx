import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, Pressable } from 'react-native';

import type { AssistantState, WakeWordStatus } from '../../features/assistant/state/assistantStateMachine';
import { isMicrophoneCapturing } from '../../features/assistant/state/assistantStateMachine';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { makeStyles, NATIVE_DRIVER, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';

export interface MicrophoneIndicatorProps {
  state: AssistantState;
  wakeWordStatus: WakeWordStatus;
  onPress?: () => void;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: theme.spacing.md, minHeight: 32, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surface.glass, borderWidth: 1, borderColor: theme.colors.surface.glassBorder, ...theme.shadows.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.status.error },
}));

/**
 * Indicador SEMPRE visível quando o microfone está capturando áudio (conversa ou detecção de "Hey Asa").
 * Requisito de privacidade: o estado de captura nunca fica escondido.
 */
export function MicrophoneIndicator({ state, wakeWordStatus, onPress, testID = 'microphone-indicator' }: MicrophoneIndicatorProps) {
  const theme = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(1));
  const capturing = isMicrophoneCapturing(state, wakeWordStatus);

  useEffect(() => {
    if (!capturing || reduceMotion) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: NATIVE_DRIVER }), Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: NATIVE_DRIVER })]));
    loop.start();
    return () => loop.stop();
  }, [capturing, pulse, reduceMotion]);

  if (!capturing) return null;
  const conversation = state === 'listening' || state === 'interrupted';
  const label = conversation ? 'Microfone ativo' : 'Ouvindo "Hey Asa"';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}. Toque para abrir o assistente ou desligar.`} onPress={onPress} style={styles.pill} testID={testID}>
      <Animated.View style={[styles.dot, { opacity: pulse }]} />
      <Ionicons name="mic" size={14} color={theme.colors.text.primary} />
      <AppText variant="caption">{label}</AppText>
    </Pressable>
  );
}
