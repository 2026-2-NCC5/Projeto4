import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '../../theme';

import { PressableScale } from './PressableScale';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface IconButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  accessibilityHint?: string;
  size?: number;
  tone?: 'default' | 'brand' | 'inverse' | 'muted';
  /** role "switch" para alternâncias (ex.: resposta por voz). */
  accessibilityRole?: 'button' | 'switch';
  checked?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Botão só com ícone, com área mínima de toque e rótulo acessível obrigatório. */
export function IconButton({ icon, accessibilityLabel, accessibilityHint, onPress, size = 44, tone = 'default', accessibilityRole = 'button', checked, disabled = false, style, testID }: IconButtonProps) {
  const theme = useTheme();
  const { colors } = theme;
  const palette = {
    default: { background: colors.surface.secondary, color: colors.text.primary, border: colors.border.subtle },
    brand: { background: colors.brand.primarySoft, color: colors.brand.primaryStrong, border: colors.brand.primarySoft },
    inverse: { background: colors.surface.onInverse, color: colors.text.inverse, border: 'rgba(255,255,255,0.14)' },
    muted: { background: colors.control.segmentTrack, color: colors.text.muted, border: colors.control.segmentTrack },
  }[tone];
  const diameter = Math.max(size, theme.minTouchTarget);
  return (
    <PressableScale
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityRole === 'switch' ? { checked: Boolean(checked), disabled } : { disabled }}
      hitSlop={theme.hitSlop}
      disabled={disabled}
      onPress={onPress}
      pressedScale={theme.motion.scale.pressedStrong}
      testID={testID}
      style={[
        { width: diameter, height: diameter, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background, borderWidth: 1, borderColor: palette.border },
        style,
      ]}
    >
      <Ionicons name={icon} size={Math.round(diameter * 0.45)} color={palette.color} />
    </PressableScale>
  );
}
