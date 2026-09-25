import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface AuthTextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Identificador estável para `accessibilityLabelledBy` (padrão: derivado do testID/label). */
  nativeID?: string;
  icon?: IconName;
  error?: string | null;
  /** Texto auxiliar abaixo do campo (some quando há erro). */
  hint?: string;
  /** Campo de senha com botão "Mostrar/Ocultar". */
  secureToggle?: boolean;
  /** Conteúdo à direita (ex.: contador). Ignorado com secureToggle. */
  right?: React.ReactNode;
  inputRef?: React.Ref<TextInput>;
  containerTestID?: string;
}

const SHAKE_STEP_MS = 45;

const useStyles = makeStyles((theme) => ({
  wrapper: { marginTop: theme.spacing.lg },
  field: { flexDirection: 'row', alignItems: 'center', minHeight: 54, borderRadius: theme.radius.lg, borderWidth: 1.5, backgroundColor: theme.colors.control.inputBackground, paddingLeft: theme.spacing.md, paddingRight: theme.spacing.xs },
  fieldFocused: { ...theme.shadows.sm },
  fieldError: { borderColor: theme.colors.status.error },
  input: { flex: 1, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.md, color: theme.colors.text.primary, ...theme.typography.input },
  toggle: { minHeight: theme.minTouchTarget, minWidth: theme.minTouchTarget, paddingHorizontal: theme.spacing.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: theme.spacing.xxs, borderRadius: theme.radius.md },
  pressed: { opacity: 0.7 },
}));

/**
 * Campo de texto das telas de autenticação: ícone à esquerda, borda que transita para o roxo do
 * logo ASA no foco (Reanimated), leve "tremor" ao receber erro, mensagem de erro abaixo e
 * alternância de visibilidade para senhas. Com "Reduzir movimento" as transições são imediatas.
 */
export function AuthTextField({ label, nativeID, icon, error, hint, secureToggle = false, right, inputRef, secureTextEntry, onFocus, onBlur, testID, accessibilityLabel, ...rest }: AuthTextFieldProps) {
  const theme = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const [secure, setSecure] = useState(true);
  const focus = useSharedValue(0);
  const shake = useSharedValue(0);
  const labelId = nativeID ?? `${testID ?? label.toLowerCase().replace(/\s+/g, '-')}-label`;
  const hidden = secureToggle ? secure : Boolean(secureTextEntry);
  const iconColor = error ? theme.colors.status.error : focused ? theme.colors.aurora.focus : theme.colors.text.muted;
  const idleBorder = theme.colors.control.inputBorder;
  const focusBorder = theme.colors.aurora.focus;
  const fastMs = theme.motion.duration.fast;

  useEffect(() => {
    if (!error || reduceMotion) return;
    shake.set(withSequence(withTiming(-6, { duration: SHAKE_STEP_MS }), withTiming(6, { duration: SHAKE_STEP_MS }), withTiming(-3, { duration: SHAKE_STEP_MS }), withTiming(0, { duration: SHAKE_STEP_MS })));
  }, [error, reduceMotion, shake]);

  const animatedField = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.get(), [0, 1], [idleBorder, focusBorder]),
    transform: [{ translateX: shake.get() }],
  }));

  const setFocus = (value: 0 | 1) => {
    focus.set(reduceMotion ? value : withTiming(value, { duration: fastMs }));
  };

  return (
    <View style={styles.wrapper}>
      <AppText variant="bodySmallStrong" nativeID={labelId} style={{ marginBottom: theme.spacing.xs }}>
        {label}
      </AppText>
      <Animated.View style={[styles.field, animatedField, focused && styles.fieldFocused, error ? styles.fieldError : null]} testID={testID ? `${testID}-field` : undefined}>
        {icon ? <Ionicons name={icon} size={18} color={iconColor} accessibilityElementsHidden importantForAccessibility="no" /> : null}
        <TextInput
          ref={inputRef}
          {...rest}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityLabelledBy={labelId}
          secureTextEntry={hidden}
          placeholderTextColor={theme.colors.text.placeholder}
          onFocus={(event) => {
            setFocused(true);
            setFocus(1);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            setFocus(0);
            onBlur?.(event);
          }}
          style={styles.input}
          testID={testID}
        />
        {secureToggle ? (
          <Pressable accessibilityRole="button" accessibilityLabel={secure ? 'Mostrar senha' : 'Ocultar senha'} accessibilityState={{ expanded: !secure }} hitSlop={theme.hitSlop} onPress={() => setSecure((current) => !current)} style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
            <Ionicons name={secure ? 'eye-outline' : 'eye-off-outline'} size={18} color={theme.colors.text.secondary} />
            <AppText variant="caption" tone="secondary">
              {secure ? 'Mostrar' : 'Ocultar'}
            </AppText>
          </Pressable>
        ) : (
          right ?? null
        )}
      </Animated.View>
      {error ? (
        <AppText variant="bodySmall" tone="error" accessibilityRole="alert" style={{ marginTop: theme.spacing.xs }}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs, fontWeight: '400' }}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}
