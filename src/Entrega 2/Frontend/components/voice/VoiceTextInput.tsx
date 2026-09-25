import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { TextInput, View } from 'react-native';

import { VOICE } from '../../config/services';
import { makeStyles, useTheme } from '../../theme';
import { PressableScale } from '../ui/PressableScale';

interface VoiceTextInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: (text: string) => void;
  /** Durante o processamento o campo continua editável, mas o envio fica bloqueado. */
  busy?: boolean;
  inputRef?: React.Ref<TextInput>;
  placeholder?: string;
  onDark?: boolean;
}

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  input: { flex: 1, minHeight: 50, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.control.inputBorder, backgroundColor: theme.colors.control.inputBackground, paddingHorizontal: theme.spacing.lg, color: theme.colors.text.primary, ...theme.typography.input },
  inputDark: { backgroundColor: theme.colors.surface.onInverse, borderColor: 'rgba(255,255,255,0.16)', color: theme.colors.text.inverse },
  send: { width: 50, height: 50, borderRadius: theme.radius.lg, alignItems: 'center', justifyContent: 'center' },
}));

/** Campo de texto sempre disponível — alternativa completa à voz. */
export function VoiceTextInput({ value, onChangeText, onSubmit, busy = false, inputRef, placeholder = 'Digite uma mensagem...', onDark = false }: VoiceTextInputProps) {
  const theme = useTheme();
  const styles = useStyles();
  const canSend = value.trim().length > 0 && !busy;
  const submit = () => {
    if (canSend) onSubmit(value.trim());
  };

  return (
    <View style={styles.row}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={submit}
        placeholder={placeholder}
        placeholderTextColor={onDark ? theme.colors.text.inverseMuted : theme.colors.text.placeholder}
        accessibilityLabel="Digite sua pergunta"
        returnKeyType="send"
        maxLength={VOICE.MAX_TEXT_CHARS}
        style={[styles.input, onDark && styles.inputDark]}
        testID="voice-text-input"
      />
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Enviar pergunta"
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        onPress={submit}
        testID="voice-send"
        style={[styles.send, { backgroundColor: canSend ? theme.colors.brand.primaryStrong : theme.colors.control.disabled }]}
      >
        <Ionicons name="send" size={18} color={canSend ? theme.colors.text.onPrimary : theme.colors.control.disabledText} />
      </PressableScale>
    </View>
  );
}
