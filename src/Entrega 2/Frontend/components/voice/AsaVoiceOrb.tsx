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
  /** 'attention' (abstenção / validação humana) acrescenta um halo âmbar sutil. */
  tone?: AsaOrbTone;
  /** Disparo de ativação ("Hey Asa"): expansão rápida + brilho, uma vez por mudança para true. */
  activating?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface OrbPalette {
  core: readonly [string, string, string, string];
  aurora: readonly [string, string, string];
  halo: string;
  attention: string;
  warm: string;
  particle: string;
  highlight: string;
}

interface MotionProfile {
  /** Duração de uma volta de cada aurora (0 = parada). */
  rotationMs: readonly [number, number, number];
  /** Amplitude da deformação orgânica (scaleX/scaleY em fases opostas). */
  deform: number;
  deformMs: number;
  /** Amplitude da respiração/pulso interno. */
  breath: number;
  breathMs: number;
  /** Escala base do núcleo. */
  scale: number;
  haloOpacity: number;
  ringsOpacity: number;
  particles: boolean;
  speechPulse: boolean;
  procedural: boolean;
  warmOverlay: number;
}

const MOTION: Record<AsaOrbState, MotionProfile> = {
  idle: { rotationMs: [24000, 32000, 28000], deform: 0.03, deformMs: 2800, breath: 0.04, breathMs: 1600, scale: 1, haloOpacity: 0.35, ringsOpacity: 0, particles: false, speechPulse: false, procedural: false, warmOverlay: 0 },
  listening: { rotationMs: [15000, 19000, 17000], deform: 0.03, deformMs: 1800, breath: 0, breathMs: 1600, scale: 1, haloOpacity: 0.6, ringsOpacity: 1, particles: false, speechPulse: false, procedural: true, warmOverlay: 0 },
  transcribing: { rotationMs: [9000, 12000, 10500], deform: 0.02, deformMs: 1400, breath: 0.015, breathMs: 700, scale: 0.92, haloOpacity: 0.3, ringsOpacity: 0, particles: false, speechPulse: false, procedural: false, warmOverlay: 0 },
  thinking: { rotationMs: [7000, 9500, 8200], deform: 0.05, deformMs: 2400, breath: 0.03, breathMs: 900, scale: 1, haloOpacity: 0.45, ringsOpacity: 0, particles: true, speechPulse: false, procedural: false, warmOverlay: 0 },
  answering: { rotationMs: [12000, 16000, 14000], deform: 0.03, deformMs: 1700, breath: 0, breathMs: 1600, scale: 1.06, haloOpacity: 0.55, ringsOpacity: 0.8, particles: false, speechPulse: true, procedural: false, warmOverlay: 0 },
  error: { rotationMs: [0, 0, 0], deform: 0, deformMs: 1600, breath: 0, breathMs: 1600, scale: 0.97, haloOpacity: 0.2, ringsOpacity: 0, particles: false, speechPulse: false, procedural: false, warmOverlay: 0.3 },
};

const PARTICLE_COUNT = 6;

function useAnimatedNumber(initial: number): Animated.Value {
  const [value] = useState(() => new Animated.Value(initial));
  return value;
}

function timing(value: Animated.Value, toValue: number, duration: number, easing: (t: number) => number = Easing.inOut(Easing.sin)) {
  return Animated.timing(value, { toValue, duration, easing, useNativeDriver: NATIVE_DRIVER });
}

// ------------------------------------------------------------------ SVG estático (memoizado)

const CoreGradient = memo(function CoreGradient({ size, id, stops }: { size: number; id: string; stops: OrbPalette['core'] }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${id}-core`} cx="42" cy="38" r="62" fx="40" fy="34" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={stops[0]} stopOpacity="1" />
          <Stop offset="0.32" stopColor={stops[1]} stopOpacity="1" />
          <Stop offset="0.72" stopColor={stops[2]} stopOpacity="1" />
          <Stop offset="1" stopColor={stops[3]} stopOpacity="1" />
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="50" fill={`url(#${id}-core)`} />
    </Svg>
  );
});

const Aurora = memo(function Aurora({ size, id, color, cx, cy, rx, ry }: { size: number; id: string; color: string; cx: number; cy: number; rx: number; ry: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={id} cx={cx} cy={cy} rx={rx} ry={ry} r={Math.max(rx, ry)} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={color} stopOpacity="0.85" />
          <Stop offset="0.55" stopColor={color} stopOpacity="0.28" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id})`} />
    </Svg>
  );
});

const Highlight = memo(function Highlight({ size, id, color }: { size: number; id: string; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${id}-spec`} cx="34" cy="27" r="14" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={color} stopOpacity="0.75" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Ellipse cx="34" cy="27" rx="15" ry="9" fill={`url(#${id}-spec)`} />
    </Svg>
  );
});

const HaloGradient = memo(function HaloGradient({ size, id, color }: { size: number; id: string; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={id} cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
          <Stop offset="0.5" stopColor={color} stopOpacity="0.55" />
          <Stop offset="0.75" stopColor={color} stopOpacity="0.18" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="50" fill={`url(#${id})`} />
    </Svg>
  );
});

// ------------------------------------------------------------------ orb

/**
 * Orb de voz do ASA: núcleo com gradiente radial (mint → teal → navy), auroras girando, deformação
 * orgânica e anéis de voz. Nenhum setState por frame: todas as animações são Animated + useNativeDriver
 * sobre transform/opacity, reiniciadas quando o estado muda e paradas no cleanup.
 */
export function AsaVoiceOrb({ state, audioLevel, reduceMotion = false, size = 200, tone = 'default', activating = false, accessibilityLabel, style, testID }: AsaVoiceOrbProps) {
  const theme = useTheme();
  const ORB = useMemo<OrbPalette>(
    () => ({
      core: theme.colors.assistant.core,
      aurora: theme.colors.assistant.aurora,
      halo: theme.colors.assistant.primary,
      attention: theme.colors.assistant.attention,
      warm: theme.colors.assistant.error,
      particle: theme.colors.assistant.particle,
      highlight: '#FFFFFF',
    }),
    [theme],
  );
  const rawId = useId();
  const id = useMemo(() => `asa${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [rawId]);
  const profile = MOTION[state];
  const burst = useAnimatedNumber(0);

  // Ativação: pulso único (scale 1 → 1.22 → 1) + flash do halo. Com reduceMotion, só o flash.
  useEffect(() => {
    if (!activating) return undefined;
    const animation = reduceMotion
      ? Animated.sequence([timing(burst, 0.5, 120), timing(burst, 0, 220)])
      : Animated.sequence([Animated.spring(burst, { toValue: 1, useNativeDriver: NATIVE_DRIVER, friction: 4, tension: 180 }), timing(burst, 0, 380, Easing.out(Easing.cubic))]);
    animation.start();
    return () => animation.stop();
  }, [activating, burst, reduceMotion]);

  const phaseScale = useAnimatedNumber(1);
  const haloOpacity = useAnimatedNumber(MOTION.idle.haloOpacity);
  const ringsOpacity = useAnimatedNumber(0);
  const particlesOpacity = useAnimatedNumber(0);
  const warmOpacity = useAnimatedNumber(0);
  const breath = useAnimatedNumber(0);
  const pulse = useAnimatedNumber(0);
  const deform = useAnimatedNumber(0);
  const procedural = useAnimatedNumber(0);
  const rotationA = useAnimatedNumber(0);
  const rotationB = useAnimatedNumber(0);
  const rotationC = useAnimatedNumber(0);
  const orbit = useAnimatedNumber(0);
  const silentLevel = useAnimatedNumber(0);

  useEffect(() => {
    const running: Animated.CompositeAnimation[] = [];
    const run = (animation: Animated.CompositeAnimation) => {
      running.push(animation);
      animation.start();
    };
    const transitionMs = reduceMotion ? 180 : 420;
    const settleMs = state === 'error' ? 700 : 320;

    run(
      Animated.parallel([
        timing(phaseScale, reduceMotion ? 1 + (profile.scale - 1) * 0.4 : profile.scale, transitionMs, Easing.out(Easing.cubic)),
        timing(haloOpacity, profile.haloOpacity, transitionMs),
        timing(ringsOpacity, reduceMotion ? 0 : profile.ringsOpacity, transitionMs),
        timing(particlesOpacity, !reduceMotion && profile.particles ? 1 : 0, transitionMs),
        timing(warmOpacity, profile.warmOverlay, transitionMs),
      ]),
    );

    // Valores de loop que não pertencem a este estado voltam suavemente ao repouso.
    const settle = (value: Animated.Value) => run(timing(value, 0, settleMs, Easing.out(Easing.quad)));

    if (reduceMotion) {
      [breath, pulse, deform, procedural].forEach(settle);
      return () => running.forEach((animation) => animation.stop());
    }

    const ease = Easing.inOut(Easing.sin);
    ([rotationA, rotationB, rotationC] as const).forEach((value, index) => {
      const duration = profile.rotationMs[index] ?? 0;
      if (duration > 0) run(Animated.loop(timing(value, 1, duration, Easing.linear)));
    });

    if (profile.deform > 0) {
      run(
        Animated.loop(
          Animated.sequence([timing(deform, 1, profile.deformMs, ease), timing(deform, -1, profile.deformMs * 2, ease), timing(deform, 0, profile.deformMs, ease)]),
        ),
      );
    } else {
      settle(deform);
    }

    if (profile.breath > 0) {
      run(Animated.loop(Animated.sequence([timing(breath, 1, profile.breathMs, ease), timing(breath, 0, profile.breathMs, ease)])));
    } else {
      settle(breath);
    }

    if (profile.speechPulse) {
      // Pulso procedural irregular enquanto fala (TTS não fornece amplitude).
      run(
        Animated.loop(
          Animated.sequence([
            timing(pulse, 0.6, 180),
            timing(pulse, 0.2, 140),
            timing(pulse, 0.9, 220),
            timing(pulse, 0.35, 160),
            timing(pulse, 0.75, 200),
            timing(pulse, 0.1, 260),
            timing(pulse, 0.5, 190),
            timing(pulse, 0, 240),
          ]),
        ),
      );
    } else {
      settle(pulse);
    }

    if (profile.procedural) {
      // Onda suave somada ao nível real: mantém o orb vivo quando não há eventos de volume (ex.: web).
      run(Animated.loop(Animated.sequence([timing(procedural, 1, 900, ease), timing(procedural, 0.3, 700, ease), timing(procedural, 0.8, 800, ease), timing(procedural, 0, 900, ease)])));
    } else {
      settle(procedural);
    }

    if (profile.particles) run(Animated.loop(timing(orbit, 1, 5200, Easing.linear)));

    return () => running.forEach((animation) => animation.stop());
  }, [state, reduceMotion, profile, phaseScale, haloOpacity, ringsOpacity, particlesOpacity, warmOpacity, breath, pulse, deform, procedural, rotationA, rotationB, rotationC, orbit]);

  const animated = useMemo(() => {
    const level = reduceMotion
      ? silentLevel
      : Animated.add(audioLevel ?? silentLevel, procedural.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] }));
    const rotate = (value: Animated.Value, reverse = false) =>
      value.interpolate({ inputRange: [0, 1], outputRange: reverse ? ['360deg', '0deg'] : ['0deg', '360deg'] });
    return {
      level,
      coreLevelScale: level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18], extrapolate: 'clamp' }),
      haloLevelScale: level.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45], extrapolate: 'clamp' }),
      breathScale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + profile.breath] }),
      pulseScale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }),
      haloPulseScale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }),
      deformX: deform.interpolate({ inputRange: [-1, 1], outputRange: [1 - profile.deform, 1 + profile.deform] }),
      deformY: deform.interpolate({ inputRange: [-1, 1], outputRange: [1 + profile.deform, 1 - profile.deform] }),
      rotateA: rotate(rotationA),
      rotateB: rotate(rotationB, true),
      rotateC: rotate(rotationC),
      orbitRotate: rotate(orbit),
      innerGlow: breath.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }),
      burstScale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] }),
      burstHaloScale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }),
      burstHaloOpacity: burst.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }),
    };
  }, [reduceMotion, silentLevel, audioLevel, procedural, breath, pulse, deform, rotationA, rotationB, rotationC, orbit, profile, burst]);

  const container = Math.round(size * 1.5);
  const haloSize = Math.round(size * 1.3);
  const haloColor = tone === 'attention' ? ORB.attention : ORB.halo;
  const particleRadius = size * 0.64;
  const particleSize = Math.max(5, Math.round(size * 0.035));
  const label = accessibilityLabel ?? orbAccessibilityLabel(state);

  return (
    <View
      style={[styles.container, { width: container, height: container }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      testID={testID}
    >
      <View style={styles.decor} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {/* Halo */}
        <Animated.View
          style={[
            styles.centered,
            { width: haloSize, height: haloSize, opacity: haloOpacity, transform: [{ scale: phaseScale }, { scale: animated.haloLevelScale }, { scale: animated.haloPulseScale }] },
          ]}
        >
          <HaloGradient size={haloSize} id={`${id}-halo-${tone}`} color={haloColor} />
        </Animated.View>

        {/* Flash de ativação ("Hey Asa") */}
        <Animated.View
          style={[styles.centered, { width: haloSize, height: haloSize, opacity: animated.burstHaloOpacity, transform: [{ scale: animated.burstHaloScale }], pointerEvents: 'none' }]}
          testID="orb-activation-flash"
        >
          <HaloGradient size={haloSize} id={`${id}-burst`} color={ORB.halo} />
        </Animated.View>

        {/* Anéis de voz */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, { opacity: ringsOpacity }]}>
          <VoiceWave
            size={size}
            active={!reduceMotion && (state === 'listening' || state === 'answering')}
            level={state === 'listening' ? animated.level : undefined}
            ringCount={state === 'answering' ? 2 : 3}
            periodMs={state === 'answering' ? 2800 : 2400}
            color={tone === 'attention' ? ORB.attention : ORB.halo}
            reduceMotion={reduceMotion}
          />
        </Animated.View>

        {/* Partículas orbitando (pensando) */}
        {!reduceMotion ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: particlesOpacity, transform: [{ rotate: animated.orbitRotate }] }]}>
            {Array.from({ length: PARTICLE_COUNT }, (_, index) => {
              const angle = (index / PARTICLE_COUNT) * Math.PI * 2;
              const radius = particleRadius * (index % 2 === 0 ? 1 : 0.9);
              return (
                <View
                  key={`particle-${index}`}
                  style={[
                    styles.particle,
                    {
                      width: particleSize,
                      height: particleSize,
                      borderRadius: particleSize / 2,
                      left: container / 2 + Math.cos(angle) * radius - particleSize / 2,
                      top: container / 2 + Math.sin(angle) * radius - particleSize / 2,
                      backgroundColor: index % 3 === 0 ? ORB.particle : ORB.halo,
                      opacity: index % 2 === 0 ? 0.95 : 0.6,
                    },
                  ]}
                />
              );
            })}
          </Animated.View>
        ) : null}

        {/* Núcleo */}
        <Animated.View
          style={[
            styles.centered,
            {
              width: size,
              height: size,
              transform: [
                { scale: phaseScale },
                { scale: animated.burstScale },
                { scale: animated.breathScale },
                { scale: animated.pulseScale },
                { scale: animated.coreLevelScale },
                { scaleX: animated.deformX },
                { scaleY: animated.deformY },
              ],
            },
          ]}
        >
          <View style={[styles.core, { width: size, height: size, borderRadius: size / 2, backgroundColor: ORB.core[2] }]}>
            <CoreGradient size={size} id={id} stops={ORB.core} />
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: animated.innerGlow, transform: [{ rotate: animated.rotateA }] }]}>
              <Aurora size={size} id={`${id}-a1`} color={ORB.aurora[0]} cx={36} cy={40} rx={30} ry={18} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: animated.rotateB }] }]}>
              <Aurora size={size} id={`${id}-a2`} color={ORB.aurora[1]} cx={64} cy={58} rx={26} ry={20} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: 0.55, transform: [{ rotate: animated.rotateC }] }]}>
              <Aurora size={size} id={`${id}-a3`} color={ORB.aurora[2]} cx={50} cy={72} rx={24} ry={12} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: ORB.warm, opacity: warmOpacity }]} testID="orb-warm-overlay" />
            <View style={StyleSheet.absoluteFill}>
              <Highlight size={size} id={id} color={ORB.highlight} />
            </View>
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
  particle: { position: 'absolute' },
});
