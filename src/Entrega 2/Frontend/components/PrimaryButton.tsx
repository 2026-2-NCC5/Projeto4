import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { AppButton, type AppButtonVariant } from './ui/AppButton';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Rótulo lido pelo leitor de tela durante o carregamento. */
  loadingLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Botão legado — delega ao `AppButton` do design system (tamanho grande, largura total). */
export function PrimaryButton({ variant = 'primary', ...rest }: PrimaryButtonProps) {
  return <AppButton {...rest} variant={variant as AppButtonVariant} size="large" fullWidth />;
}
