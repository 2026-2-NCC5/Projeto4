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
  title?: string | null;
}

const useStyles = makeStyles((theme) => ({
  wrapper: { marginTop: theme.spacing.lg },
  list: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: theme.spacing.sm },
  chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface.primary, borderWidth: 1, borderColor: theme.colors.border.default },
  pressed: { backgroundColor: theme.colors.surface.secondary },
}));

const CHIP_HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 } as const;

/** Perguntas de exemplo — enviadas como texto, pelo mesmo fluxo de uma pergunta digitada. */
export function VoiceSuggestions({ suggestions = DEFAULT_VOICE_SUGGESTIONS, onSelect, disabled = false, title = 'Experimente perguntar' }: VoiceSuggestionsProps) {
  const styles = useStyles();
  return (
    <View style={styles.wrapper} testID="voice-suggestions">
      {title ? (
        <AppText variant="caption" tone="muted" align="center" accessibilityRole="header" style={{ marginBottom: 8 }}>
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
            hitSlop={CHIP_HIT_SLOP}
            onPress={() => onSelect(text)}
            style={styles.chip}
            pressedStyle={styles.pressed}
          >
            <AppText variant="bodySmall">{text}</AppText>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}
