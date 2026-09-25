import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';

interface VoiceTranscriptProps {
  text: string;
  /** Coloca a pergunta no campo de texto para correção. */
  onEdit?: (text: string) => void;
  onDark?: boolean;
}

const useStyles = makeStyles((theme) => ({
  bubble: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, alignSelf: 'stretch', backgroundColor: theme.colors.surface.primary, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border.subtle, paddingVertical: theme.spacing.sm, paddingLeft: theme.spacing.lg, paddingRight: theme.spacing.xs, marginTop: theme.spacing.md },
  bubbleDark: { backgroundColor: theme.colors.surface.onInverse, borderColor: 'rgba(255,255,255,0.14)' },
  textWrap: { flex: 1 },
  edit: { minHeight: theme.minTouchTarget, minWidth: theme.minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: theme.spacing.sm, borderRadius: theme.radius.md },
  pressed: { opacity: 0.7 },
}));

/** "Você disse:" — mostra exatamente o texto enviado à API. */
export function VoiceTranscript({ text, onEdit, onDark = false }: VoiceTranscriptProps) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.bubble, onDark && styles.bubbleDark]} testID="voice-transcript">
      <View style={styles.textWrap} accessible accessibilityLabel={`Você disse: ${text}`}>
        <AppText variant="caption" tone={onDark ? 'inverseMuted' : 'muted'}>
          Você disse:
        </AppText>
        <AppText variant="bodyStrong" tone={onDark ? 'inverse' : 'primary'} style={{ marginTop: 2 }}>
          {text}
        </AppText>
      </View>
      {onEdit ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Editar" accessibilityHint="Coloca sua pergunta no campo de texto para você corrigir e enviar de novo" onPress={() => onEdit(text)} style={({ pressed }) => [styles.edit, pressed && styles.pressed]}>
          <Ionicons name="create-outline" size={16} color={onDark ? theme.colors.assistant.primary : theme.colors.brand.primaryStrong} />
          <AppText variant="bodySmallStrong" tone={onDark ? 'inverse' : 'brand'}>
            Editar
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
