import React, { memo, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { NATIVE_DRIVER, useTheme } from '../../theme';

type AnimatedLevel = Animated.Value | Animated.AnimatedAddition<number> | Animated.AnimatedInterpolation<number>;

export interface VoiceWaveProps {
  /** Diâmetro do núcleo do orb; os anéis nascem nele e se expandem. */
  size: number;
  active: boolean;
  /** Intensidade 0–1 (nível do microfone); controla a opacidade dos anéis. */
  level?: AnimatedLevel;
  ringCount?: number;
  /** Tempo para um anel ir do núcleo até sumir. Um anel novo nasce a cada periodMs / ringCount. */
  periodMs?: number;
  color?: string;
  reduceMotion?: boolean;
}

/**
 * Anéis concêntricos emitidos continuamente. Um único Animated.Value (0→1 em loop) alimenta todos os
 * anéis via interpolação com defasagem — só transform/opacity, sempre com useNativeDriver.
 */
export const VoiceWave = memo(function VoiceWave({ ringCount = 3, reduceMotion = false, ...rest }: VoiceWaveProps) {
  if (reduceMotion) return null;
  // Remonta quando a quantidade de anéis muda: o Animated.Value antigo (ainda ligado a views
  // desmontadas) é descartado em vez de ser reaproveitado por uma animação nativa.
  return <WaveRings key={`rings-${ringCount}`} ringCount={ringCount} {...rest} />;
});

type WaveRingsProps = Omit<VoiceWaveProps, 'reduceMotion' | 'ringCount'> & { ringCount: number };

function WaveRings({ size, active, level, ringCount, periodMs = 2400, color }: WaveRingsProps) {
  const theme = useTheme();
  const ringColor = color ?? theme.colors.assistant.primary;
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) {
      progress.stopAnimation();
      return undefined;
    }
    const loop = Animated.loop(Animated.timing(progress, { toValue: 1, duration: periodMs, easing: Easing.linear, useNativeDriver: NATIVE_DRIVER }));
    loop.start();
    return () => loop.stop();
  }, [active, periodMs, progress]);

  const rings = useMemo(
    () =>
      Array.from({ length: ringCount }, (_, index) => {
        const offset = index / ringCount;
        const phase =
          offset === 0
            ? progress
            : progress.interpolate({ inputRange: [0, 1 - offset, 1 - offset + 0.0001, 1], outputRange: [offset, 1, 0, offset] });
        return {
          key: `ring-${index}`,
          scale: phase.interpolate({ inputRange: [0, 1], outputRange: [1, 1.75] }),
          opacity: phase.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.55, 0] }),
        };
      }),
    [progress, ringCount],
  );

  const intensity = useMemo(
    () => (level ? level.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1], extrapolate: 'clamp' }) : 1),
    [level],
  );

  return (
    <Animated.View style={[styles.layer, { opacity: intensity }]} testID="voice-wave">
      {rings.map((ring) => (
        <Animated.View
          key={ring.key}
          style={[
            styles.ring,
            { width: size, height: size, borderRadius: size / 2, borderColor: ringColor, opacity: ring.opacity, transform: [{ scale: ring.scale }] },
          ]}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  ring: { position: 'absolute', borderWidth: 2 },
});
