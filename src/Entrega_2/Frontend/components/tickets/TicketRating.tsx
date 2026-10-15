import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { SUPPORT_MOTION, useSupportMotion } from '../../features/support/motion';
import { haptics } from '../../services/haptics';
import { makeStyles, useTheme } from '../../theme';
import type { SupportTicketRating } from '../../types/api';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';

import { AnimatedCheck } from './AnimatedCheck';

type Stars = 1 | 2 | 3 | 4 | 5;
const STAR_LABELS: Record<Stars, string> = { 1: 'Muito ruim', 2: 'Ruim', 3: 'Regular', 4: 'Bom', 5: 'Excelente' };

export interface TicketRatingProps {
  rating: SupportTicketRating | null;
  canRate: boolean;
  submitting: boolean;
  onSubmit: (rating: Stars, comment: string) => Promise<string | null>;
}

const useStyles = makeStyles((theme) => ({
  card: { borderRadius: theme.radius.lg, padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.border.default, backgroundColor: theme.colors.surface.primary },
  stars: { flexDirection: 'row', gap: theme.spacing.xs, marginTop: theme.spacing.md },
  star: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { ...theme.typography.input, color: theme.colors.text.primary, borderWidth: 1, borderColor: theme.colors.control.inputBorder, borderRadius: theme.radius.md, padding: theme.spacing.md, minHeight: 72, textAlignVertical: 'top', marginTop: theme.spacing.md },
  thanks: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
}));

/** "Como foi seu atendimento?": estrelas respondem ao toque com mola moderada; o envio mostra um agradecimento. */
export function TicketRating({ rating, canRate, submitting, onSubmit }: TicketRatingProps) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useSupportMotion();
  const [selected, setSelected] = useState<Stars | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (rating) {
    return (
      <Animated.View entering={FadeIn.duration(SUPPORT_MOTION.duration.normal).reduceMotion(motion.mode)} style={styles.card} testID="ticket-rating-done" accessibilityLiveRegion="polite">
        <View style={styles.thanks}>
          <AnimatedCheck size={36} />
          <View style={{ flex: 1 }}>
            <AppText variant="h4">Obrigado pela avaliação!</AppText>
            <AppText variant="bodySmall" tone="secondary">{`Você avaliou o atendimento como ${STAR_LABELS[rating.rating].toLowerCase()} (${rating.rating} de 5).`}</AppText>
          </View>
        </View>
      </Animated.View>
    );
  }
  if (!canRate) return null;

  const submit = () => {
    if (!selected) return;
    setError(null);
    onSubmit(selected, comment)
      .then((problem) => setError(problem))
      .catch(() => setError('Não conseguimos registrar sua avaliação.'));
  };

  return (
    <View style={styles.card} testID="ticket-rating">
      <AppText variant="h4" accessibilityRole="header">
        Como foi seu atendimento?
      </AppText>
      <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
        Sua avaliação ajuda o ASA a melhorar.
      </AppText>
      <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel="Nota de 1 a 5 estrelas">
        {([1, 2, 3, 4, 5] as const).map((value) => (
          <Star
            key={value}
            value={value}
            filled={selected !== null && value <= selected}
            selected={selected === value}
            onPress={() => {
              haptics.selection();
              setSelected(value);
            }}
          />
        ))}
      </View>
      {selected ? (
        <Animated.View entering={FadeIn.duration(SUPPORT_MOTION.duration.normal).reduceMotion(motion.mode)}>
          <AppText variant="bodySmallStrong" tone="secondary" style={{ marginTop: theme.spacing.xs }}>
            {STAR_LABELS[selected]}
          </AppText>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Quer contar mais alguma coisa? (opcional)"
            placeholderTextColor={theme.colors.text.placeholder}
            multiline
            maxLength={500}
            style={styles.input}
            accessibilityLabel="Comentário sobre o atendimento (opcional)"
            testID="rating-comment"
          />
          {error ? (
            <AppText variant="bodySmall" tone="error" style={{ marginTop: theme.spacing.sm }} accessibilityRole="alert">
              {error}
            </AppText>
          ) : null}
          <View style={{ marginTop: theme.spacing.md }}>
            <AppButton label="Enviar avaliação" onPress={submit} loading={submitting} loadingLabel="Enviando avaliação" testID="rating-submit" />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function Star({ value, filled, selected, onPress }: { value: Stars; filled: boolean; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useSupportMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${value} ${value === 1 ? 'estrela' : 'estrelas'}, ${STAR_LABELS[value]}`}
      onPress={() => {
        if (!motion.reduce) scale.set(withSequence(withTiming(1.18, { duration: SUPPORT_MOTION.duration.fast }), withSpring(1, motion.spring)));
        onPress();
      }}
      style={styles.star}
      testID={`rating-star-${value}`}
    >
      <Animated.View style={animated}>
        <Ionicons name={filled ? 'star' : 'star-outline'} size={30} color={filled ? theme.colors.status.warning : theme.colors.border.strong} />
      </Animated.View>
    </Pressable>
  );
}
