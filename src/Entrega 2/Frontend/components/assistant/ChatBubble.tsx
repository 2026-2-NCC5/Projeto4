import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState, type PropsWithChildren } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { makeStyles, NATIVE_DRIVER, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';

import { StreamingText } from './StreamingText';

const useStyles = makeStyles((theme) => ({
  userRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end', gap: theme.spacing.xs, marginTop: theme.spacing.md },
  userBubble: { maxWidth: '84%', backgroundColor: theme.colors.chat.userBubble, borderRadius: theme.radius.xl, borderBottomRightRadius: 6, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm + 3 },
  userBubbleDark: { backgroundColor: theme.colors.surface.onInverse, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  edit: { minHeight: theme.minTouchTarget, minWidth: theme.minTouchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.md },
  pressed: { opacity: 0.6 },
  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm + 2, marginTop: theme.spacing.lg },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brand.primarySoft, marginTop: 1 },
  avatarDark: { backgroundColor: theme.colors.surface.onInverse },
  assistantBody: { flex: 1, minWidth: 0 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 22, paddingLeft: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.text.muted },
  dotDark: { backgroundColor: theme.colors.text.inverseMuted },
}));

export interface UserBubbleProps {
  text: string;
  /** Legenda pequena acima do texto (ex.: "Você disse:" para entrada por voz). */
  caption?: string;
  /** Mostra um botão "Editar" ao lado do balão (coloca o texto no campo para correção). */
  onEdit?: (text: string) => void;
  onDark?: boolean;
  testID?: string;
}

/** Mensagem do estudante: balão escuro alinhado à direita (receiver/sender styling do padrão Chat V1). */
export function UserBubble({ text, caption, onEdit, onDark = false, testID = 'chat-user-bubble' }: UserBubbleProps) {
  const theme = useTheme();
  const styles = useStyles();
  const textTone = onDark ? 'inverse' : undefined;
  return (
    <View style={styles.userRow} testID={testID}>
      {onEdit ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Editar" accessibilityHint="Coloca sua pergunta no campo de texto para você corrigir e enviar de novo" onPress={() => onEdit(text)} style={({ pressed }) => [styles.edit, pressed && styles.pressed]} testID={`${testID}-edit`}>
          <Ionicons name="create-outline" size={18} color={onDark ? theme.colors.text.inverseMuted : theme.colors.text.muted} />
        </Pressable>
      ) : null}
      <View style={[styles.userBubble, onDark && styles.userBubbleDark]} accessible accessibilityLabel={`${caption ?? 'Você'}: ${text}`}>
        {caption ? (
          <AppText variant="caption" tone={textTone ?? 'inverseMuted'} style={{ color: onDark ? theme.colors.text.inverseMuted : theme.colors.chat.userTextMuted, marginBottom: 2 }}>
            {caption}
          </AppText>
        ) : null}
        <AppText variant="body" style={{ color: onDark ? theme.colors.text.inverse : theme.colors.chat.userText }} selectable>
          {text}
        </AppText>
      </View>
    </View>
  );
}

export interface AssistantMessageProps {
  /** Texto principal da resposta (opcional quando a resposta é só cards). */
  text?: string | null;
  /** Anima a revelação (apenas para a resposta recém-chegada). */
  animate?: boolean;
  onComplete?: () => void;
  onDark?: boolean;
  /** Oculta o avatar/nome (mensagens antigas compactas). */
  compact?: boolean;
  testID?: string;
}

/** Resposta do assistente: sem balão (texto corrido, como no padrão Chat V1), com avatar ASA e cards abaixo. */
export function AssistantMessage({ text, animate = false, onComplete, onDark = false, compact = false, children, testID = 'chat-assistant-message' }: PropsWithChildren<AssistantMessageProps>) {
  const theme = useTheme();
  const styles = useStyles();
  const content = text?.trim() ?? '';
  return (
    <View style={styles.assistantRow} testID={testID}>
      {!compact ? (
        <View style={[styles.avatar, onDark && styles.avatarDark]} accessibilityElementsHidden importantForAccessibility="no">
          <Ionicons name="sparkles" size={14} color={onDark ? theme.colors.assistant.primary : theme.colors.brand.primaryStrong} />
        </View>
      ) : null}
      <View style={styles.assistantBody}>
        {!compact ? (
          <AppText variant="label" tone={onDark ? 'inverseMuted' : 'brand'} uppercase style={{ marginBottom: 4 }}>
            ASA
          </AppText>
        ) : null}
        {content ? <StreamingText text={content} animate={animate} onComplete={onComplete} tone={onDark ? 'inverse' : 'primary'} testID={`${testID}-text`} /> : null}
        {children}
      </View>
    </View>
  );
}

/** "ASA está digitando": três pontos que pulsam (Animated + native driver; estático com "Reduzir movimento"). */
export function TypingIndicator({ onDark = false, testID = 'chat-typing' }: { onDark?: boolean; testID?: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const [values] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.35)));

  useEffect(() => {
    if (reduceMotion) return undefined;
    const loop = Animated.loop(
      Animated.stagger(
        140,
        values.map((value) =>
          Animated.sequence([
            Animated.timing(value, { toValue: 1, duration: 320, easing: theme.motion.easing.gentle, useNativeDriver: NATIVE_DRIVER }),
            Animated.timing(value, { toValue: 0.35, duration: 320, easing: theme.motion.easing.gentle, useNativeDriver: NATIVE_DRIVER }),
          ]),
        ),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, [values, reduceMotion, theme.motion.easing.gentle]);

  return (
    <View style={styles.assistantRow} accessible accessibilityRole="progressbar" accessibilityLabel="ASA está preparando a resposta" accessibilityLiveRegion="polite" testID={testID}>
      <View style={[styles.avatar, onDark && styles.avatarDark]}>
        <Ionicons name="sparkles" size={14} color={onDark ? theme.colors.assistant.primary : theme.colors.brand.primaryStrong} />
      </View>
      <View style={styles.typing}>
        {values.map((value, index) => (
          <Animated.View key={index} style={[styles.dot, onDark && styles.dotDark, { opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0.35, 1], outputRange: [0, -3] }) }] }]} />
        ))}
      </View>
    </View>
  );
}
