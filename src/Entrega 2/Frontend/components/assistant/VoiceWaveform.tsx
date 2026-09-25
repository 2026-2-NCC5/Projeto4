import React, { useEffect, useMemo, useState } from 'react';
import { Animated, View } from 'react-native';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { NATIVE_DRIVER, useTheme } from '../../theme';

export interface VoiceWaveformProps {
  /** Nível do microfone 0–1 (Animated.Value alimentado fora do React). */
  level?: Animated.Value;
  /** 'live' reage ao nível; 'procedural' anima sozinha (fala do ASA); 'idle' fica baixa. */
  mode: 'live' | 'procedural' | 'idle';
  bars?: number;
  height?: number;
  color?: string;
  testID?: string;
}

/**
 * Barras de áudio (estilo equalizador) — transform scaleY no native driver.
 * Cada barra combina o nível real com um desvio próprio para parecer orgânica.
 */
export function VoiceWaveform({ level, mode, bars = 14, height = 36, color, testID = 'voice-waveform' }: VoiceWaveformProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [drift] = useState(() => new Animated.Value(0));
  const [idle] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion || mode === 'idle') {
      drift.stopAnimation();
      drift.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: mode === 'procedural' ? 520 : 380, easing: theme.motion.easing.gentle, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(drift, { toValue: 0, duration: mode === 'procedural' ? 460 : 340, easing: theme.motion.easing.gentle, useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, mode, reduceMotion, theme.motion.easing.gentle]);

  const scales = useMemo(() => {
    const source = mode === 'live' && level && !reduceMotion ? level : idle;
    return Array.from({ length: bars }, (_, index) => {
      const center = Math.abs(index - (bars - 1) / 2) / ((bars - 1) / 2); // 0 no meio, 1 nas bordas
      const envelope = 1 - center * 0.65;
      const phaseShift = (index % 3) / 3;
      const driftScale = drift.interpolate({ inputRange: [0, 1], outputRange: [0.35 + phaseShift * 0.3, 1] });
      const levelScale = source.interpolate({ inputRange: [0, 1], outputRange: [0.18, 1], extrapolate: 'clamp' });
      const base = mode === 'procedural' ? driftScale : mode === 'live' ? Animated.add(Animated.multiply(levelScale, 0.75), Animated.multiply(driftScale, 0.25)) : levelScale;
      return Animated.multiply(base, envelope);
    });
  }, [bars, drift, idle, level, mode, reduceMotion]);

  const barColor = color ?? theme.colors.assistant.primary;
  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }} testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {scales.map((scaleY, index) => (
        <Animated.View key={index} style={{ width: 4, height, borderRadius: 2, backgroundColor: barColor, opacity: mode === 'idle' ? 0.35 : 0.9, transform: [{ scaleY }] }} />
      ))}
    </View>
  );
}
