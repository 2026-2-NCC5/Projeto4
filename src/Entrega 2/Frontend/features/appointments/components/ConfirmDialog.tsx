import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '../../../components/ui/AppButton';
import { AppText } from '../../../components/ui/AppText';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { useResponsive } from '../../../hooks/useResponsive';
import { makeStyles, useTheme } from '../../../theme';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  destructive?: boolean;
  loading?: boolean;
  error?: string | null;
  children?: React.ReactNode;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.background.backdrop },
  sheet: {
    width: '100%',
    alignSelf: 'center',
    backgroundColor: theme.colors.surface.primary,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
  },
  actions: { gap: theme.spacing.sm, marginTop: theme.spacing.lg },
}));

/**
 * Confirmação de ação importante (ex.: cancelar um agendamento): folha inferior com fade simples (sem movimento
 * com "Reduzir movimento"). Fecha tocando fora, pelo voltar do Android ou pela ação secundária.
 */
export function ConfirmDialog({ visible, title, description, confirmLabel, cancelLabel, onConfirm, onClose, destructive = false, loading = false, error, children, testID }: ConfirmDialogProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();
  const reduceMotion = useReducedMotion();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent testID={testID}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={loading ? undefined : onClose} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) + theme.spacing.sm, maxWidth: responsive.contentMaxWidth ?? undefined }]} accessibilityViewIsModal>
          <AppText variant="h3" accessibilityRole="header">
            {title}
          </AppText>
          {description ? (
            <AppText variant="bodySmall" tone="secondary" style={{ marginTop: theme.spacing.xxs }}>
              {description}
            </AppText>
          ) : null}
          {children ? <View style={{ marginTop: theme.spacing.lg }}>{children}</View> : null}
          {error ? (
            <AppText variant="bodySmall" tone="error" style={{ marginTop: theme.spacing.sm }} accessibilityRole="alert">
              {error}
            </AppText>
          ) : null}
          <View style={styles.actions}>
            <AppButton label={confirmLabel} variant={destructive ? 'danger' : 'primary'} onPress={onConfirm} loading={loading} fullWidth testID={testID ? `${testID}-confirm` : undefined} />
            <AppButton label={cancelLabel} variant="ghost" onPress={onClose} disabled={loading} fullWidth testID={testID ? `${testID}-dismiss` : undefined} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
