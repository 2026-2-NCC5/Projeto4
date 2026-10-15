import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '../../services/haptics';
import { makeStyles, useTheme } from '../../theme';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
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
  /** Feedback tátil ao tocar (padrão: só no primary). */
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  base: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: theme.spacing.sm, borderRadius: theme.radius.md },
  content: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: theme.spacing.sm },
  small: { minHeight: 36, paddingHorizontal: theme.spacing.md },
  medium: { minHeight: 44, paddingHorizontal: theme.spacing.lg },
  large: { minHeight: 48, paddingHorizontal: theme.spacing.xl },
  fullWidth: { alignSelf: 'stretch' },
  ghost: { paddingHorizontal: theme.spacing.sm },
}));

/**
 * Botão padrão do design system.
 * - primary: a ação principal da tela (uma por tela), verde institucional sólido.
 * - secondary: fundo branco, borda neutra, texto escuro.
 * - ghost: sem fundo, texto verde (ações terciárias e links de ação).
 * - danger: ação destrutiva discreta (texto vermelho, borda neutra).
 */
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

  const palette: Record<AppButtonVariant, { background: string; pressed: string; text: string; border?: string }> = {
    primary: { background: colors.brand.primaryStrong, pressed: colors.brand.primaryPressed, text: colors.text.onPrimary },
    secondary: { background: colors.surface.primary, pressed: colors.surface.secondary, text: colors.text.primary, border: colors.border.default },
    ghost: { background: 'transparent', pressed: colors.brand.primarySoft, text: colors.text.link },
    danger: { background: colors.surface.primary, pressed: colors.status.errorSoft, text: colors.status.errorText, border: colors.border.default },
  };
  const tone = palette[variant];
  const textColor = disabled && !loading && variant === 'primary' ? colors.control.disabledText : tone.text;
  const textVariant = size === 'small' ? 'buttonSmall' : 'button';
  const iconSize = size === 'small' ? 16 : 18;
  const shouldHaptic = haptic ?? variant === 'primary';

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      // primary desabilitado já muda de cor; os demais esmaecem. Em carregamento o botão continua nítido.
      dimWhenDisabled={variant !== 'primary' && !loading}
      hitSlop={size === 'small' ? theme.hitSlop : undefined}
      onPress={() => {
        if (shouldHaptic) haptics.impactLight();
        onPress();
      }}
      testID={testID}
      pressedStyle={{ backgroundColor: tone.pressed }}
      style={[
        styles.base,
        styles[size],
        variant === 'ghost' ? styles.ghost : null,
        { backgroundColor: disabled && !loading && variant === 'primary' ? colors.control.disabled : tone.background },
        tone.border ? { borderWidth: 1, borderColor: tone.border } : null,
        fullWidth ? styles.fullWidth : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.text.onPrimary : colors.brand.primaryStrong} accessibilityLabel={loadingLabel ?? `${label}, carregando`} />
      ) : (
        <View style={styles.content}>
          {icon && iconPosition === 'left' ? <Ionicons name={icon} size={iconSize} color={textColor} /> : null}
          <AppText variant={textVariant} style={{ color: textColor }}>
            {label}
          </AppText>
          {icon && iconPosition === 'right' ? <Ionicons name={icon} size={iconSize} color={textColor} /> : null}
        </View>
      )}
    </PressableScale>
  );
}
