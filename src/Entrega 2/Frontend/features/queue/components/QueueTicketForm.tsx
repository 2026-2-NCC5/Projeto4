import React, { useState } from 'react';
import { TextInput, View } from 'react-native';

import { AppButton, AppText, Surface } from '../../../components/ui';
import { makeStyles, useTheme } from '../../../theme';

/** Mesmo formato aceito pela API: letras opcionais + dígitos ("0029", "P012"). */
export const TICKET_INPUT_PATTERN = /^[A-Za-z]{0,3}-?\d{1,6}$/;

export function validateTicketInput(raw: string): string | null {
  const value = raw.replace(/\s+/g, '');
  return TICKET_INPUT_PATTERN.test(value) ? null : 'Digite uma senha válida.';
}

const useStyles = makeStyles((theme) => ({
  input: {
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    fontSize: theme.typography.metric.fontSize,
    lineHeight: theme.typography.metric.lineHeight,
    fontWeight: '600',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
    backgroundColor: theme.colors.control.inputBackground,
    color: theme.colors.text.primary,
  },
  actions: { marginTop: theme.spacing.lg },
}));

export interface QueueTicketFormProps {
  onSubmit: (ticket: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** desabilita enquanto offline */
  disabled?: boolean;
  intro?: string;
}

/** "Qual é a sua senha?" — validação no aparelho com a mesma regra da API; erros sem jargão técnico. */
export function QueueTicketForm({ onSubmit, disabled = false, intro }: QueueTicketFormProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const invalid = validateTicketInput(value);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSubmitting(true);
    const result = await onSubmit(value.replace(/\s+/g, ''));
    setSubmitting(false);
    if (result.ok) {
      setValue('');
      setError(null);
    } else {
      setError(result.message);
    }
  };

  return (
    <Surface testID="queue-ticket-form">
      <AppText variant="h3" accessibilityRole="header">
        Qual é a sua senha?
      </AppText>
      <AppText variant="bodySmall" tone="secondary" style={{ marginTop: theme.spacing.xxs }}>
        {intro ?? 'Digite a senha impressa no papel que você retirou no ASA.'}
      </AppText>
      <TextInput
        value={value}
        onChangeText={(text) => {
          setValue(text.toUpperCase());
          if (error) setError(null);
        }}
        placeholder="0029"
        placeholderTextColor={theme.colors.text.placeholder}
        autoCapitalize="characters"
        autoCorrect={false}
        keyboardType="default"
        returnKeyType="done"
        maxLength={10}
        editable={!disabled && !submitting}
        onSubmitEditing={() => void submit()}
        accessibilityLabel="Sua senha"
        accessibilityHint="Digite a senha da fila presencial do ASA"
        style={[styles.input, { borderColor: error ? theme.colors.status.error : theme.colors.control.inputBorder }]}
        testID="queue-ticket-input"
      />
      {error ? (
        <AppText variant="bodySmall" tone="error" style={{ marginTop: theme.spacing.xs }} accessibilityRole="alert" accessibilityLiveRegion="assertive" testID="queue-ticket-error">
          {error}
        </AppText>
      ) : null}
      <View style={styles.actions}>
        <AppButton label="Acompanhar senha" icon="notifications-outline" onPress={() => void submit()} loading={submitting} disabled={disabled} fullWidth testID="queue-ticket-submit" />
      </View>
    </Surface>
  );
}
