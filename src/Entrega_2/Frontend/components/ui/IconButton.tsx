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
  /** default: sem fundo · brand: fundo verde suave (estado ativo) · outline: borda neutra · muted: ícone apagado. */
  tone?: 'default' | 'brand' | 'outline' | 'muted';
  /** role "switch" para alternâncias (ex.: resposta por voz). */
  accessibilityRole?: 'button' | 'switch';
  checked?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Botão só com ícone (20 px), com área mínima de toque e rótulo acessível obrigatório. */
export function IconButton({ icon, accessibilityLabel, accessibilityHint, onPress, size = 44, tone = 'default', accessibilityRole = 'button', checked, disabled = false, style, testID }: IconButtonProps) {
  const theme = useTheme();
  const { colors } = theme;
  const palette = {
    default: { background: 'transparent', color: colors.text.primary, border: 'transparent' },
    brand: { background: colors.brand.primarySoft, color: colors.brand.primaryStrong, border: colors.brand.primarySoft },
    outline: { background: colors.surface.primary, color: colors.text.primary, border: colors.border.default },
    muted: { background: 'transparent', color: colors.text.muted, border: 'transparent' },
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
      pressedStyle={{ backgroundColor: tone === 'brand' ? colors.brand.primarySoft : colors.surface.muted }}
      testID={testID}
      style={[
        { width: diameter, height: diameter, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background, borderWidth: 1, borderColor: palette.border },
        style,
      ]}
    >
      <Ionicons name={icon} size={20} color={palette.color} />
    </PressableScale>
  );
}
