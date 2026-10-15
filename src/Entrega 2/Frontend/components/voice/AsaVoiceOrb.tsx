import React, { memo, useEffect, useId, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { NATIVE_DRIVER, useTheme } from '../../theme';

import { VoiceWave } from './VoiceWave';

export type AsaOrbState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'answering' | 'error';
export type AsaOrbTone = 'default' | 'attention';

export const ORB_STATE_LABELS: Record<AsaOrbState, string> = {
  idle: 'aguardando',
  listening: 'ouvindo',
  transcribing: 'entendendo o que você disse',
  thinking: 'analisando suas informações',
  answering: 'respondendo',
  error: 'não foi possível concluir',
};

export function orbAccessibilityLabel(state: AsaOrbState): string {
  return `Assistente ASA, ${ORB_STATE_LABELS[state]}`;
}

export interface AsaVoiceOrbProps {
  state: AsaOrbState;
  /** Nível do microfone 0–1 (Animated.Value atualizado fora do React). */
  audioLevel?: Animated.Value;
  reduceMotion?: boolean;
  size?: number;
  /** 'attention' (abstenção / validação humana) troca anéis e arco para o tom âmbar. */
  tone?: AsaOrbTone;
  /** Disparo de ativação ("Hey Asa"): um pulso único, uma vez por mudança para true. */
  activating?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface MotionProfile {
  /** Amplitude da respiração (0 = sem respiração). */
  breath: number;
  breathMs: number;
  /** Escala base do núcleo no estado. */
  scale: number;
  /** Halo sólido e translúcido (sem gradiente nem brilho), só enquanto há som. */
  haloOpacity: number;
  ringsOpacity: number;
  /** Arco girando em volta do núcleo (processando). */
  arc: boolean;
  speechPulse: boolean;
  /** Onda suave somada ao nível do microfone (mantém o orb vivo sem eventos de volume). */
  procedural: boolean;
  warmOverlay: number;
}

const MOTION: Record<AsaOrbState, MotionProfile> = {
  idle: { breath: 0.03, breathMs: 2400, scale: 1, haloOpacity: 0, ringsOpacity: 0, arc: false, speechPulse: false, procedural: false, warmOverlay: 0 },
  listening: { breath: 0, breathMs: 1600, scale: 1, haloOpacity: 0.12, ringsOpacity: 1, arc: false, speechPulse: false, procedural: true, warmOverlay: 0 },
  transcribing: { breath: 0.02, breathMs: 700, scale: 0.94, haloOpacity: 0, ringsOpacity: 0, arc: true, speechPulse: false, procedural: false, warmOverlay: 0 },
  thinking: { breath: 0.025, breathMs: 900, scale: 1, haloOpacity: 0, ringsOpacity: 0, arc: true, speechPulse: false, procedural: false, warmOverlay: 0 },
  answering: { breath: 0, breathMs: 1600, scale: 1.04, haloOpacity: 0.1, ringsOpacity: 0.7, arc: false, speechPulse: true, procedural: false, warmOverlay: 0 },
  error: { breath: 0, breathMs: 1600, scale: 0.97, haloOpacity: 0, ringsOpacity: 0, arc: false, speechPulse: false, procedural: false, warmOverlay: 0.35 },
};

/** Fração da circunferência desenhada pelo arco de processamento. */
const ARC_FRACTION = 0.22;

function useAnimatedNumber(initial: number): Animated.Value {
  const [value] = useState(() => new Animated.Value(initial));
  return value;
}

function timing(value: Animated.Value, toValue: number, duration: number, easing: (t: number) => number = Easing.inOut(Easing.sin)) {
  return Animated.timing(value, { toValue, duration, easing, useNativeDriver: NATIVE_DRIVER });
}

// ------------------------------------------------------------------ SVG estático (memoizado)

/** Núcleo: um único matiz, levemente mais claro no centro, com reflexo discreto e aro interno. */
const Core = memo(function Core({ size, id, center, edge }: { size: number; id: string; center: string; edge: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${id}-core`} cx="42" cy="38" r="62" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={center} stopOpacity="1" />
          <Stop offset="1" stopColor={edge} stopOpacity="1" />
        </RadialGradient>
        <RadialGradient id={`${id}-spec`} cx="36" cy="30" r="22" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.22" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="50" fill={`url(#${id}-core)`} />
      <Ellipse cx="36" cy="30" rx="22" ry="16" fill={`url(#${id}-spec)`} />
      <Circle cx="50" cy="50" r="44" fill="none" stroke="#FFFFFF" strokeOpacity="0.14" strokeWidth="1.5" />
    </Svg>
  );
});

const Arc = memo(function Arc({ size, color, strokeWidth }: { size: number; color: string; strokeWidth: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeOpacity="0.16" strokeWidth={strokeWidth} />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${circumference * ARC_FRACTION} ${circumference}`}
      />
    </Svg>
  );
});

// ------------------------------------------------------------------ orb

/**
 * Orb de voz do ASA: um círculo no verde institucional que respira em repouso, cresce com a voz
 * (anéis discretos ao ouvir e ao falar) e ganha um arco girando enquanto processa. Nenhum setState por
 * frame: todas as animações são Animated + useNativeDriver sobre transform/opacity, reiniciadas quando o
 * estado muda e paradas no cleanup. Com "Reduzir movimento" nada entra em loop.
 */
export function AsaVoiceOrb({ state, audioLevel, reduceMotion = false, size = 200, tone = 'default', activating = false, accessibilityLabel, style, testID }: AsaVoiceOrbProps) {
  const theme = useTheme();
  const rawId = useId();
  const id = useMemo(() => `asa${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [rawId]);
  const profile = MOTION[state];
  const accent = tone === 'attention' ? theme.colors.assistant.attention : theme.colors.assistant.primary;

  const burst = useAnimatedNumber(0);
  const phaseScale = useAnimatedNumber(1);
  const haloOpacity = useAnimatedNumber(0);
  const ringsOpacity = useAnimatedNumber(0);
  const arcOpacity = useAnimatedNumber(0);
  const warmOpacity = useAnimatedNumber(0);
  const breath = useAnimatedNumber(0);
  const pulse = useAnimatedNumber(0);
  const procedural = useAnimatedNumber(0);
  const arcRotation = useAnimatedNumber(0);
  const silentLevel = useAnimatedNumber(0);

  // Ativação: pulso único (escala 1 → 1,12 → 1). Com reduceMotion, só um aceno curto.
  useEffect(() => {
    if (!activating) return undefined;
    const animation = reduceMotion
      ? Animated.sequence([timing(burst, 0.4, 120), timing(burst, 0, 180)])
      : Animated.sequence([timing(burst, 1, 160, Easing.out(Easing.cubic)), timing(burst, 0, 280, Easing.inOut(Easing.cubic))]);
    animation.start();
    return () => animation.stop();
  }, [activating, burst, reduceMotion]);

  useEffect(() => {
    const running: Animated.CompositeAnimation[] = [];
    const run = (animation: Animated.CompositeAnimation) => {
      running.push(animation);
      animation.start();
    };
    const transitionMs = reduceMotion ? theme.motion.duration.reduced : theme.motion.duration.slower;

    run(
      Animated.parallel([
        timing(phaseScale, reduceMotion ? 1 + (profile.scale - 1) * 0.4 : profile.scale, transitionMs, Easing.out(Easing.cubic)),
        timing(haloOpacity, profile.haloOpacity, transitionMs),
        timing(ringsOpacity, reduceMotion ? 0 : profile.ringsOpacity, transitionMs),
        // Sem movimento, o arco fica parado mas visível: o estado "processando" continua legível.
        timing(arcOpacity, profile.arc ? 1 : 0, transitionMs),
        timing(warmOpacity, profile.warmOverlay, transitionMs),
      ]),
    );

    // Valores de loop que não pertencem a este estado voltam suavemente ao repouso.
    const settle = (value: Animated.Value) => run(timing(value, 0, theme.motion.duration.base, Easing.out(Easing.quad)));

    if (reduceMotion) {
      [breath, pulse, procedural].forEach(settle);
      return () => running.forEach((animation) => animation.stop());
    }

    const ease = Easing.inOut(Easing.sin);
    if (profile.breath > 0) run(Animated.loop(Animated.sequence([timing(breath, 1, profile.breathMs, ease), timing(breath, 0, profile.breathMs, ease)])));
    else settle(breath);

    if (profile.speechPulse) {
      // Pulso irregular enquanto fala (o TTS não fornece amplitude).
      run(Animated.loop(Animated.sequence([timing(pulse, 0.6, 180), timing(pulse, 0.2, 160), timing(pulse, 0.85, 220), timing(pulse, 0.3, 180), timing(pulse, 0.7, 200), timing(pulse, 0, 260)])));
    } else {
      settle(pulse);
    }

    if (profile.procedural) run(Animated.loop(Animated.sequence([timing(procedural, 1, 900, ease), timing(procedural, 0.3, 700, ease), timing(procedural, 0.8, 800, ease), timing(procedural, 0, 900, ease)])));
    else settle(procedural);

    if (profile.arc) {
      arcRotation.setValue(0);
      run(Animated.loop(timing(arcRotation, 1, 1100, Easing.linear)));
    }

    return () => running.forEach((animation) => animation.stop());
  }, [state, reduceMotion, profile, theme.motion.duration, phaseScale, haloOpacity, ringsOpacity, arcOpacity, warmOpacity, breath, pulse, procedural, arcRotation]);

  const animated = useMemo(() => {
    const level = reduceMotion ? silentLevel : Animated.add(audioLevel ?? silentLevel, procedural.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] }));
    return {
      level,
      coreLevelScale: level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12], extrapolate: 'clamp' }),
      haloLevelScale: level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3], extrapolate: 'clamp' }),
      breathScale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + profile.breath] }),
      pulseScale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }),
      burstScale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }),
      arcRotate: arcRotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
    };
  }, [reduceMotion, silentLevel, audioLevel, procedural, breath, pulse, burst, arcRotation, profile]);

  const container = Math.round(size * 1.5);
  const haloSize = Math.round(size * 1.3);
  const arcSize = Math.round(size * 1.22);
  const arcStroke = Math.max(1.5, Math.round(size * 0.025 * 2) / 2);
  const label = accessibilityLabel ?? orbAccessibilityLabel(state);

  return (
    <View style={[styles.container, { width: container, height: container }, style]} accessible accessibilityRole="image" accessibilityLabel={label} testID={testID}>
      <View style={styles.decor} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {/* Halo translúcido (cor sólida, sem brilho) */}
        <Animated.View
          style={[styles.centered, { width: haloSize, height: haloSize, borderRadius: haloSize / 2, backgroundColor: accent, opacity: haloOpacity, transform: [{ scale: phaseScale }, { scale: animated.haloLevelScale }] }]}
        />

        {/* Anéis de voz */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: ringsOpacity }]}>
          <VoiceWave
            size={size}
            active={!reduceMotion && (state === 'listening' || state === 'answering')}
            level={state === 'listening' ? animated.level : undefined}
            ringCount={state === 'answering' ? 2 : 3}
            periodMs={state === 'answering' ? 2800 : 2400}
            color={accent}
            reduceMotion={reduceMotion}
          />
        </Animated.View>

        {/* Arco de processamento */}
        <Animated.View style={[styles.centered, { width: arcSize, height: arcSize, opacity: arcOpacity, transform: [{ rotate: animated.arcRotate }] }]}>
          <Arc size={arcSize} color={accent} strokeWidth={arcStroke} />
        </Animated.View>

        {/* Núcleo */}
        <Animated.View
          style={[
            styles.centered,
            { width: size, height: size, transform: [{ scale: phaseScale }, { scale: animated.burstScale }, { scale: animated.breathScale }, { scale: animated.pulseScale }, { scale: animated.coreLevelScale }] },
          ]}
          testID="orb-activation-flash"
        >
          <View style={[styles.core, { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.assistant.core[1] }]}>
            <Core size={size} id={id} center={theme.colors.assistant.core[0]} edge={theme.colors.assistant.core[1]} />
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.assistant.error, opacity: warmOpacity }]} testID="orb-warm-overlay" />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center', pointerEvents: 'none' },
  decor: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  centered: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  core: { overflow: 'hidden' },
});
