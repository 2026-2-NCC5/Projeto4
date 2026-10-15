import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { SUPPORT_MOTION, useSupportMotion } from '../../features/support/motion';
import { useTheme } from '../../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Comprimento do traço do check no viewBox 52×52 (arredondado para cima). */
const CHECK_LENGTH = 36;

export interface AnimatedCheckProps {
  size?: number;
  /** cor do traço/borda (padrão: verde de sucesso) */
  color?: string;
  /** fundo do círculo */
  background?: string;
  /** atraso antes de começar (ms) */
  delay?: number;
  testID?: string;
}

/**
 * Confirmação: o círculo se expande suavemente e o check é desenhado. Na web o traço aparece inteiro (o
 * círculo continua animando); com "Reduzir movimento" tudo aparece pronto.
 */
export function AnimatedCheck({ size = 72, color, background, delay = 0, testID }: AnimatedCheckProps) {
  const theme = useTheme();
  const motion = useSupportMotion();
  const circle = useSharedValue(motion.reduce ? 1 : 0);
  const draw = useSharedValue(motion.reduce ? 1 : 0);
  const stroke = color ?? theme.colors.status.success;
  const fill = background ?? theme.colors.status.successSoft;
  const animateStroke = Platform.OS !== 'web';

  useEffect(() => {
    if (motion.reduce) {
      circle.set(1);
      draw.set(1);
      return;
    }
    circle.set(withDelay(delay, withSpring(1, motion.spring)));
    draw.set(withDelay(delay + SUPPORT_MOTION.duration.fast, withTiming(1, motion.timing(SUPPORT_MOTION.duration.slow))));
  }, [circle, delay, draw, motion]);

  const circleStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, circle.get() * 1.4), transform: [{ scale: 0.6 + circle.get() * 0.4 }] }));
  const pathProps = useAnimatedProps(() => ({ strokeDashoffset: animateStroke ? CHECK_LENGTH * (1 - draw.get()) : 0 }));

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={testID}>
      <Animated.View style={[{ width: size, height: size }, circleStyle]}>
        <Svg width={size} height={size} viewBox="0 0 52 52">
          <Circle cx={26} cy={26} r={25} fill={fill} />
          <AnimatedPath d="M15 27 L23 35 L38 19" stroke={stroke} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={CHECK_LENGTH} animatedProps={pathProps} />
        </Svg>
      </Animated.View>
    </View>
  );
}
