import React from 'react';
import { View, type Animated } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import { VoiceWaveform } from '../assistant/VoiceWaveform';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';
import { Surface } from '../ui/Surface';

interface ListeningPanelProps {
  /** Nível do microfone (0–1) para a onda. */
  audioLevel: Animated.Value;
  /** O que já foi entendido (acumulado na escuta contínua). */
  transcript: string;
  /** Preferência "Mostrar transcrição". */
  showTranscript: boolean;
  onSend: () => void;
  onCancel: () => void;
}

const useStyles = makeStyles((theme) => ({
  panel: { gap: theme.spacing.sm, marginBottom: theme.spacing.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.status.error },
  transcript: { minHeight: 24 },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'flex-end' },
}));

/**
 * Painel exibido enquanto o microfone está aberto: deixa claro QUE o app está ouvindo, O QUE já entendeu
 * e COMO terminar (pausa ou botão). O estado nunca depende só da animação.
 */
export function ListeningPanel({ audioLevel, transcript, showTranscript, onSend, onCancel }: ListeningPanelProps) {
  const theme = useTheme();
  const styles = useStyles();
  const heard = transcript.trim();
  return (
    <Surface tone="secondary" padding={theme.spacing.md} style={styles.panel} testID="listening-panel">
      <View style={styles.header}>
        <View style={styles.dot} accessibilityElementsHidden importantForAccessibility="no" />
        <AppText variant="bodySmallStrong" style={{ flex: 1 }} accessibilityLiveRegion="polite">
          Estou ouvindo — fale do seu jeito
        </AppText>
        <VoiceWaveform level={audioLevel} mode="live" height={20} bars={10} />
      </View>

      {showTranscript ? (
        <AppText variant="body" tone={heard ? 'primary' : 'muted'} style={styles.transcript} accessibilityLabel={heard ? `Entendi até agora: ${heard}` : undefined} testID="listening-transcript">
          {heard ? `“${heard}”` : 'As suas palavras aparecem aqui enquanto você fala.'}
        </AppText>
      ) : null}

      <AppText variant="caption" tone="secondary">
        Pode pausar para pensar. Quando terminar, fique em silêncio por 2 segundos ou toque em Enviar.
      </AppText>

      <View style={styles.actions}>
        <AppButton label="Cancelar" variant="ghost" size="small" onPress={onCancel} testID="listening-cancel" />
        <AppButton label="Enviar" icon="send" size="small" onPress={onSend} testID="listening-send" />
      </View>
    </Surface>
  );
}
