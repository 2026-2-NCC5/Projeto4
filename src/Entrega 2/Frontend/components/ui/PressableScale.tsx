import React, { useCallback, useState } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { haptics } from '../../services/haptics';
import { NATIVE_DRIVER, useTheme } from '../../theme';

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Estilo aplicado enquanto o toque está ativo (ex.: fundo um tom mais escuro). */
  pressedStyle?: StyleProp<ViewStyle>;
  /**
   * Estilo do contêiner externo, que participa do layout do pai. Use para larguras em %, flexBasis e
   * alignSelf: em `style` elas seriam relativas ao próprio botão (o `style` vai na camada animada interna).
   */
  containerStyle?: StyleProp<ViewStyle>;
  /** Escala ao pressionar (padrão: motion.scale.pressed). */
  pressedScale?: number;
  /** Feedback tátil leve ao pressionar (respeita a preferência do aluno). */
  haptic?: boolean;
  /** Reduz a opacidade quando desabilitado (padrão: true; botões em carregamento ficam nítidos). */
  dimWhenDisabled?: boolean;
  children?: React.ReactNode;
}

/**
 * Pressable com microinteração discreta: escala amortecida (Animated + native driver) e, opcionalmente,
 * um estilo de "pressionado". Com "Reduzir movimento" o toque só muda a opacidade.
 */
export function PressableScale({ style, pressedStyle, containerStyle, pressedScale, haptic = false, dimWhenDisabled = true, onPressIn, onPressOut, onPress, disabled, children, ...rest }: PressableScaleProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const target = pressedScale ?? theme.motion.scale.pressed;

  const animateTo = useCallback(
    (value: number) => {
      if (reduceMotion) return;
      Animated.spring(scale, { toValue: value, useNativeDriver: NATIVE_DRIVER, ...theme.motion.spring.press }).start();
    },
    [reduceMotion, scale, theme.motion.spring.press],
  );

  return (
    <Pressable
      {...rest}
      style={containerStyle}
      disabled={disabled}
      onPressIn={(event) => {
        animateTo(target);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animateTo(1);
        onPressOut?.(event);
      }}
      onPress={(event) => {
        if (haptic) haptics.selection();
        onPress?.(event);
      }}
    >
      {({ pressed }) => (
        <Animated.View style={[style, { transform: [{ scale }] }, pressed ? pressedStyle : null, pressed && reduceMotion ? { opacity: 0.8 } : null, disabled && dimWhenDisabled ? { opacity: 0.5 } : null]}>
          {children}
        </Animated.View>
      )}
    </Pressable>
  );
}
