import React, { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { SUPPORT_MOTION, useSupportMotion } from '../../features/support/motion';

export interface AppearProps {
  children: React.ReactNode;
  /** posição na lista (atraso de entrada curto, limitado) */
  index?: number;
  /** deslocamento vertical inicial em px (padrão 8) */
  offset?: number;
  /** deslocamento horizontal (troca de filtro: slide lateral discreto) */
  offsetX?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Entrada discreta: fade + translateY 8 px → 0, com stagger curto. Instantânea com "Reduzir movimento". */
export function Appear({ children, index = 0, offset = SUPPORT_MOTION.offset, offsetX = 0, duration = SUPPORT_MOTION.duration.normal, style, testID }: AppearProps) {
  const motion = useSupportMotion();
  const progress = useSharedValue(motion.reduce ? 1 : 0);

  useEffect(() => {
    if (motion.reduce) {
      progress.set(1);
      return;
    }
    progress.set(withDelay(motion.stagger(index), withTiming(1, motion.timing(duration))));
  }, [duration, index, motion, progress]);

  const animated = useAnimatedStyle(() => {
    const value = progress.get();
    return { opacity: value, transform: [{ translateY: (1 - value) * offset }, { translateX: (1 - value) * offsetX }] };
  });

  return (
    <Animated.View style={[style, animated]} testID={testID}>
      {children}
    </Animated.View>
  );
}
