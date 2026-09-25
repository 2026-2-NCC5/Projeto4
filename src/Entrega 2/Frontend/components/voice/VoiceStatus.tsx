import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import type { VoicePhase } from '../../types/voice';
import { AppText } from '../ui/AppText';

/** Texto de status de cada fase — o estado nunca é comunicado só pela animação. */
export function voiceStatusText(phase: VoicePhase, voiceAvailable = true): string {
  switch (phase) {
    case 'listening':
      return 'Ouvindo...';
    case 'transcribing':
      return 'Entendendo o que você disse...';
    case 'understanding':
      return 'Entendendo...';
    case 'thinking':
      return 'Analisando suas informações...';
    case 'answering':
      return 'Respondendo...';
    default:
      return voiceAvailable ? 'Toque no microfone para falar' : 'Digite sua pergunta no campo abaixo';
  }
}

interface VoiceStatusProps {
  phase: VoicePhase;
  voiceAvailable?: boolean;
  /** Transcrição parcial exibida enquanto o aluno fala. */
  partialTranscript?: string;
  showPartial?: boolean;
  /** Sobre fundo escuro. */
  onDark?: boolean;
  /** Texto alternativo (ex.: estado derivado do assistente global). */
  overrideText?: string;
}

const useStyles = makeStyles((theme) => ({
  wrapper: { alignItems: 'center', paddingHorizontal: theme.spacing.lg, minHeight: 28 },
}));

export function VoiceStatus({ phase, voiceAvailable = true, partialTranscript = '', showPartial = true, onDark = false, overrideText }: VoiceStatusProps) {
  const theme = useTheme();
  const styles = useStyles();
  const partial = partialTranscript.trim();
  return (
    <View style={styles.wrapper}>
      <AppText variant="h4" tone={onDark ? 'inverse' : 'primary'} align="center" accessibilityRole="text" accessibilityLiveRegion="polite" testID="voice-status">
        {overrideText ?? voiceStatusText(phase, voiceAvailable)}
      </AppText>
      {showPartial && phase === 'listening' && partial ? (
        <AppText variant="body" tone={onDark ? 'inverseMuted' : 'muted'} align="center" style={{ fontStyle: 'italic', marginTop: theme.spacing.xs }} accessibilityLabel={`Transcrição parcial: ${partial}`} testID="voice-partial">
          “{partial}”
        </AppText>
      ) : null}
    </View>
  );
}
