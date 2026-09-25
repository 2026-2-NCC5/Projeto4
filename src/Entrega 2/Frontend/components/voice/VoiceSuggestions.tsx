import React from 'react';
import { View } from 'react-native';

import { makeStyles } from '../../theme';
import { AppText } from '../ui/AppText';
import { PressableScale } from '../ui/PressableScale';

export const DEFAULT_VOICE_SUGGESTIONS = [
  'Tenho atividade pendente?',
  'Qual é minha próxima prova?',
  'Como está minha frequência?',
  'Tem alguma matéria que merece atenção?',
] as const;

interface VoiceSuggestionsProps {
  suggestions?: readonly string[];
  onSelect: (text: string) => void;
  disabled?: boolean;
  onDark?: boolean;
  title?: string | null;
}

const useStyles = makeStyles((theme) => ({
  wrapper: { marginTop: theme.spacing.lg },
  list: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: theme.spacing.sm },
  chip: { minHeight: theme.minTouchTarget, justifyContent: 'center', paddingHorizontal: theme.spacing.md + 2, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surface.primary, borderWidth: 1, borderColor: theme.colors.border.default },
  chipDark: { backgroundColor: theme.colors.surface.onInverse, borderColor: 'rgba(255,255,255,0.16)' },
}));

/** Perguntas de exemplo — enviadas como texto, pelo mesmo fluxo de uma pergunta digitada. */
export function VoiceSuggestions({ suggestions = DEFAULT_VOICE_SUGGESTIONS, onSelect, disabled = false, onDark = false, title = 'Experimente perguntar' }: VoiceSuggestionsProps) {
  const styles = useStyles();
  return (
    <View style={styles.wrapper} testID="voice-suggestions">
      {title ? (
        <AppText variant="caption" tone={onDark ? 'inverseMuted' : 'muted'} align="center" accessibilityRole="header" style={{ marginBottom: 8 }}>
          {title}
        </AppText>
      ) : null}
      <View style={styles.list}>
        {suggestions.map((text) => (
          <PressableScale
            key={text}
            accessibilityRole="button"
            accessibilityLabel={text}
            accessibilityHint="Envia esta pergunta ao assistente"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onSelect(text)}
            style={[styles.chip, onDark && styles.chipDark]}
          >
            <AppText variant="bodySmallStrong" tone={onDark ? 'inverse' : 'primary'}>
              {text}
            </AppText>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}
