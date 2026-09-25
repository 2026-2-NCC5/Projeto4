import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '../../services/haptics';
import { makeStyles, useTheme } from '../../theme';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'assistant' | 'inverse';
export type AppButtonSize = 'small' | 'medium' | 'large';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  icon?: IconName;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Rótulo lido pelo leitor de tela durante o carregamento. */
  loadingLabel?: string;
  /** Feedback tátil ao tocar (padrão: só em primary/assistant/danger). */
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  base: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: theme.spacing.sm },
  small: { minHeight: 40, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.md },
  medium: { minHeight: 48, paddingHorizontal: theme.spacing.lg, borderRadius: theme.radius.lg },
  large: { minHeight: 56, paddingHorizontal: theme.spacing.xl, borderRadius: theme.radius.lg },
  fullWidth: { alignSelf: 'stretch' },
}));

/** Botão padrão do design system. `variant="assistant"` usa o brilho verde do ASA. */
export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'medium',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  loadingLabel,
  haptic,
  style,
  testID,
}: AppButtonProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { colors } = theme;
  const isDisabled = disabled || loading;

  const palette: Record<AppButtonVariant, { background: string; text: string; border?: string; shadow?: ViewStyle }> = {
    primary: { background: colors.brand.primaryStrong, text: colors.text.onPrimary, shadow: theme.shadows.button },
    secondary: { background: colors.surface.primary, text: colors.text.primary, border: colors.border.default },
    ghost: { background: 'transparent', text: colors.text.link },
    danger: { background: colors.status.error, text: '#FFFFFF' },
    assistant: { background: colors.brand.primaryStrong, text: colors.text.onPrimary, shadow: theme.shadows.assistantGlow },
    inverse: { background: colors.surface.onInverse, text: colors.text.inverse, border: 'rgba(255,255,255,0.18)' },
  };
  const tone = palette[variant];
  const textVariant = size === 'small' ? 'buttonSmall' : 'button';
  const iconSize = size === 'small' ? 16 : 20;
  const shouldHaptic = haptic ?? (variant === 'primary' || variant === 'assistant' || variant === 'danger');

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={() => {
        if (shouldHaptic) haptics.impactLight();
        onPress();
      }}
      testID={testID}
      style={[
        styles.base,
        styles[size],
        { backgroundColor: isDisabled && variant !== 'ghost' ? colors.control.disabled : tone.background },
        tone.border ? { borderWidth: 1, borderColor: tone.border } : null,
        !isDisabled && tone.shadow ? tone.shadow : null,
        fullWidth ? styles.fullWidth : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone.text} accessibilityLabel={loadingLabel ?? `${label}, carregando`} />
      ) : (
        <View style={styles.base}>
          {icon && iconPosition === 'left' ? <Ionicons name={icon} size={iconSize} color={isDisabled ? colors.control.disabledText : tone.text} /> : null}
          <AppText variant={textVariant} style={{ color: isDisabled ? colors.control.disabledText : tone.text }}>
            {label}
          </AppText>
          {icon && iconPosition === 'right' ? <Ionicons name={icon} size={iconSize} color={isDisabled ? colors.control.disabledText : tone.text} /> : null}
        </View>
      )}
    </PressableScale>
  );
}
