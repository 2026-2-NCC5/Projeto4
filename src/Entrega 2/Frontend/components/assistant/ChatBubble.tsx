import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState, type PropsWithChildren } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { makeStyles, NATIVE_DRIVER, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';

import { StreamingText } from './StreamingText';

const AVATAR_SIZE = 24;

const useStyles = makeStyles((theme) => ({
  userRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end', gap: theme.spacing.xxs, marginTop: theme.spacing.lg },
  userBubble: { maxWidth: '80%', backgroundColor: theme.colors.chat.userBubble, borderRadius: theme.radius.lg, borderBottomRightRadius: theme.radius.xs, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  edit: { minHeight: theme.minTouchTarget, minWidth: theme.minTouchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.md },
  pressed: { opacity: 0.6 },
  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brand.primaryStrong },
  assistantBody: { flex: 1, minWidth: 0 },
  name: { marginBottom: 2, lineHeight: AVATAR_SIZE },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 4, height: AVATAR_SIZE, paddingLeft: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.text.muted },
}));

/** Marca do ASA nas mensagens: círculo pequeno no verde institucional. */
function AsaAvatar() {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no">
      <Ionicons name="sparkles" size={12} color={theme.colors.text.onPrimary} />
    </View>
  );
}

export interface UserBubbleProps {
  text: string;
  /** Legenda pequena acima do texto (ex.: "Você disse:" para entrada por voz). */
  caption?: string;
  /** Mostra um botão "Editar" ao lado do balão (coloca o texto no campo para correção). */
  onEdit?: (text: string) => void;
  testID?: string;
}

/** Mensagem do estudante: balão neutro alinhado à direita, compacto. */
export function UserBubble({ text, caption, onEdit, testID = 'chat-user-bubble' }: UserBubbleProps) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.userRow} testID={testID}>
      {onEdit ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Editar" accessibilityHint="Coloca sua pergunta no campo de texto para você corrigir e enviar de novo" onPress={() => onEdit(text)} style={({ pressed }) => [styles.edit, pressed && styles.pressed]} testID={`${testID}-edit`}>
          <Ionicons name="create-outline" size={18} color={theme.colors.text.muted} />
        </Pressable>
      ) : null}
      <View style={styles.userBubble} accessible accessibilityLabel={`${caption ?? 'Você'}: ${text}`}>
        {caption ? (
          <AppText variant="caption" style={{ color: theme.colors.chat.userTextMuted, marginBottom: 2 }}>
            {caption}
          </AppText>
        ) : null}
        <AppText variant="body" style={{ color: theme.colors.chat.userText }} selectable>
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
  /** Oculta o avatar/nome (mensagens antigas compactas). */
  compact?: boolean;
  testID?: string;
}

/** Resposta do assistente: sem balão (texto corrido), com a marca ASA e o conteúdo estruturado abaixo. */
export function AssistantMessage({ text, animate = false, onComplete, compact = false, children, testID = 'chat-assistant-message' }: PropsWithChildren<AssistantMessageProps>) {
  const styles = useStyles();
  const content = text?.trim() ?? '';
  return (
    <View style={styles.assistantRow} testID={testID}>
      {!compact ? <AsaAvatar /> : null}
      <View style={styles.assistantBody}>
        {!compact ? (
          <AppText variant="bodySmallStrong" tone="secondary" style={styles.name}>
            ASA
          </AppText>
        ) : null}
        {content ? <StreamingText text={content} animate={animate} onComplete={onComplete} tone="primary" testID={`${testID}-text`} /> : null}
        {children}
      </View>
    </View>
  );
}

/** "ASA está digitando": três pontos que pulsam (Animated + native driver; estático com "Reduzir movimento"). */
export function TypingIndicator({ testID = 'chat-typing' }: { testID?: string }) {
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
      <AsaAvatar />
      <View style={styles.typing}>
        {values.map((value, index) => (
          <Animated.View key={index} style={[styles.dot, { opacity: value }]} />
        ))}
      </View>
    </View>
  );
}
