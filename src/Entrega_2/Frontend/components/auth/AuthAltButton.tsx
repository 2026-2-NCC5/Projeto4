import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { haptics } from '../../services/haptics';
import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface AuthAltButtonProps {
  label: string;
  icon: IconName;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}

const PRESS_SPRING = { damping: 16, stiffness: 240 } as const;

const useStyles = makeStyles((theme) => ({
  button: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border.default, backgroundColor: theme.colors.surface.primary, paddingHorizontal: theme.spacing.lg },
  pressed: { backgroundColor: theme.colors.surface.secondary },
  disabled: { opacity: 0.5 },
}));

/**
 * Botão alternativo de acesso (biometria): estilo secundário, ícone + rótulo.
 * O toque encolhe o botão com uma mola do Reanimated (só opacidade com "Reduzir movimento").
 */
export function AuthAltButton({ label, icon, onPress, accessibilityLabel, accessibilityHint, loading = false, disabled = false, testID }: AuthAltButtonProps) {
  const theme = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const isDisabled = disabled || loading;
  const pressedScale = theme.motion.scale.pressed;

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const scaleTo = (value: number) => {
    if (reduceMotion) return;
    scale.set(withSpring(value, PRESS_SPRING));
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPressIn={() => scaleTo(pressedScale)}
      onPressOut={() => scaleTo(1)}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      testID={testID}
    >
      {({ pressed }) => (
        <Animated.View style={[styles.button, animated, pressed ? styles.pressed : null, isDisabled ? styles.disabled : null]}>
          {loading ? (
            <ActivityIndicator color={theme.colors.brand.primaryStrong} accessibilityLabel={`${label}, aguarde`} />
          ) : (
            <>
              <Ionicons name={icon} size={20} color={theme.colors.text.primary} />
              <AppText variant="button">{label}</AppText>
            </>
          )}
        </Animated.View>
      )}
    </Pressable>
  );
}
