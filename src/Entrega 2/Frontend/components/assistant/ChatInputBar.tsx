import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, Platform, TextInput, View, type NativeSyntheticEvent, type StyleProp, type TextInputContentSizeChangeEventData, type ViewStyle } from 'react-native';

import { VOICE } from '../../config/services';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { makeStyles, NATIVE_DRIVER, useTheme } from '../../theme';
import { PressableScale } from '../ui/PressableScale';
import { VOICE_BUTTON_LABELS, type VoiceButtonMode } from '../voice/voiceModes';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface ChatInputAction {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  hint?: string;
  /** role "switch" para alternâncias (ex.: resposta por voz). */
  role?: 'button' | 'switch';
  checked?: boolean;
  disabled?: boolean;
  testID?: string;
}

export interface ChatInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: (text: string) => void;
  /** Estado do botão de voz quando o campo está vazio. */
  voiceMode: VoiceButtonMode;
  onVoicePress: () => void;
  /** Cancela a interação em andamento (modo 'busy'). */
  onCancel?: () => void;
  /** Ações secundárias à esquerda (Nova conversa, análise, TTS...). */
  actions?: ChatInputAction[];
  inputRef?: React.Ref<TextInput>;
  placeholder?: string;
  /** Máximo de linhas visíveis antes de rolar (padrão 5; 3 no layout em linha). */
  maxLines?: number;
  /**
   * Campo e botões em uma única linha (telas baixas: celular em paisagem, teclado aberto). Padrão: campo
   * em cima e ações embaixo.
   */
  inline?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

type TrailingKind = 'send' | 'mic' | 'mic-off' | 'stop' | 'cancel';

const LINE_HEIGHT = 22;
const VERTICAL_PADDING = 10;

export const CHAT_INPUT_MIN_HEIGHT = LINE_HEIGHT + VERTICAL_PADDING * 2;

/**
 * Na web o contentSize do campo multilinha é o scrollHeight do <textarea>, que já inclui o padding
 * vertical. Sem descontar, cada medição soma o padding de novo e o campo vazio cresce até `maxLines`.
 */
const MEASURED_PADDING = Platform.OS === 'web' ? VERTICAL_PADDING * 2 : 0;

/** Altura do campo limitada a `maxLines` linhas (a partir daí o conteúdo rola). */
export function clampInputHeight(contentHeight: number, maxLines: number): number {
  const max = LINE_HEIGHT * maxLines + VERTICAL_PADDING * 2;
  return Math.min(max, Math.max(CHAT_INPUT_MIN_HEIGHT, Math.ceil(contentHeight) + VERTICAL_PADDING * 2));
}

/** Decide o botão à direita a partir do texto digitado e do estado da voz. */
export function trailingKindFor(value: string, voiceMode: VoiceButtonMode): TrailingKind {
  if (voiceMode === 'listening') return 'stop';
  if (voiceMode === 'busy') return 'cancel';
  if (value.trim().length > 0) return 'send';
  if (voiceMode === 'unavailable') return 'mic-off';
  return 'mic';
}

const useStyles = makeStyles((theme) => ({
  container: { borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.chat.inputBorder, backgroundColor: theme.colors.chat.inputBackground, paddingHorizontal: theme.spacing.xs, paddingTop: theme.spacing.xxs, paddingBottom: theme.spacing.xs },
  containerFocused: { borderColor: theme.colors.chat.inputBorderFocus },
  input: { paddingHorizontal: theme.spacing.sm, paddingTop: VERTICAL_PADDING, paddingBottom: VERTICAL_PADDING, color: theme.colors.text.primary, fontSize: 16, lineHeight: LINE_HEIGHT, textAlignVertical: 'top' },
  containerInline: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.xxs, paddingTop: theme.spacing.xxs, paddingBottom: theme.spacing.xxs },
  inputInline: { flex: 1, minWidth: 0, paddingHorizontal: theme.spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  // Alinha os botões (36/40 px) ao centro da primeira linha do campo (CHAT_INPUT_MIN_HEIGHT).
  actionsInline: { marginBottom: (CHAT_INPUT_MIN_HEIGHT - 36) / 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs, flexShrink: 1 },
  action: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  actionPressed: { backgroundColor: theme.colors.surface.muted },
  actionActive: { backgroundColor: theme.colors.brand.primarySoft },
  trailing: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
}));

/**
 * Barra de mensagem do assistente (padrão "Chat V1"): campo multilinha que cresce até `maxLines`,
 * ações secundárias à esquerda e um botão à direita que se transforma de microfone em seta de envio
 * quando há texto (crossfade + escala no native driver). O campo de texto está sempre disponível —
 * é a alternativa completa à voz.
 */
export function ChatInputBar({ value, onChangeText, onSubmit, voiceMode, onVoicePress, onCancel, actions = [], inputRef, placeholder = 'Pergunte ao ASA...', maxLines, inline = false, style, testID = 'chat-input-bar' }: ChatInputBarProps) {
  const theme = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const [height, setHeight] = useState(CHAT_INPUT_MIN_HEIGHT);
  const [sendProgress] = useState(() => new Animated.Value(value.trim() ? 1 : 0));

  const kind = trailingKindFor(value, voiceMode);
  const hasText = value.trim().length > 0;
  const lines = maxLines ?? (inline ? 3 : 5);
  // Campo esvaziado (envio, "Nova conversa", apagar tudo): volta a uma linha. Na web o scrollHeight nunca
  // fica menor que a altura atual, então o campo não encolheria sozinho.
  if (!value && height !== CHAT_INPUT_MIN_HEIGHT) setHeight(CHAT_INPUT_MIN_HEIGHT);

  useEffect(() => {
    const toValue = hasText ? 1 : 0;
    if (reduceMotion) {
      sendProgress.setValue(toValue);
      return undefined;
    }
    const animation = Animated.spring(sendProgress, { toValue, useNativeDriver: NATIVE_DRIVER, friction: 7, tension: 180 });
    animation.start();
    return () => animation.stop();
  }, [hasText, reduceMotion, sendProgress]);

  const onContentSizeChange = (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
    const next = clampInputHeight(event.nativeEvent.contentSize.height - MEASURED_PADDING, lines);
    if (next !== height) setHeight(next);
  };

  const submit = () => {
    const text = value.trim();
    if (!text || voiceMode === 'busy') return;
    onSubmit(text);
    setHeight(CHAT_INPUT_MIN_HEIGHT);
  };

  const trailing = (() => {
    switch (kind) {
      case 'send':
        return { label: 'Enviar pergunta', hint: undefined, onPress: submit, disabled: false, background: theme.colors.chat.send, icon: theme.colors.chat.sendIcon };
      case 'stop':
        return { label: VOICE_BUTTON_LABELS.listening, hint: undefined, onPress: onVoicePress, disabled: false, background: theme.colors.status.error, icon: theme.colors.text.inverse };
      case 'cancel':
        return { label: 'Cancelar', hint: 'Interrompe a pergunta em andamento', onPress: onCancel ?? (() => undefined), disabled: !onCancel, background: theme.colors.surface.muted, icon: theme.colors.text.primary };
      case 'mic-off':
        return { label: VOICE_BUTTON_LABELS.unavailable, hint: undefined, onPress: () => undefined, disabled: true, background: theme.colors.control.disabled, icon: theme.colors.control.disabledText };
      default:
        return { label: voiceMode === 'answering' ? VOICE_BUTTON_LABELS.answering : VOICE_BUTTON_LABELS.idle, hint: voiceMode === 'idle' ? 'Ativa o microfone para você fazer uma pergunta' : undefined, onPress: onVoicePress, disabled: false, background: theme.colors.chat.mic, icon: theme.colors.chat.micIcon };
    }
  })();

  const morphing = kind === 'send' || kind === 'mic';
  const micOpacity = sendProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const micScale = sendProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] });
  const sendScale = sendProgress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const staticIcon: IconName = kind === 'stop' ? 'stop' : kind === 'cancel' ? 'close' : 'mic-off';

  const input = (
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={onChangeText}
      onContentSizeChange={onContentSizeChange}
      onSubmitEditing={submit}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.text.placeholder}
      accessibilityLabel="Digite sua pergunta"
      accessibilityHint="Você também pode tocar no microfone para falar"
      multiline
      submitBehavior="submit"
      returnKeyType="send"
      maxLength={VOICE.MAX_TEXT_CHARS}
      style={[styles.input, inline && styles.inputInline, { height }]}
      testID="voice-text-input"
    />
  );

  const actionButtons =
    actions.length > 0 ? (
      <View style={[styles.actions, inline && styles.actionsInline]}>
        {actions.map((action) => {
          const active = action.role === 'switch' ? Boolean(action.checked) : false;
          return (
            <PressableScale
              key={action.key}
              accessibilityRole={action.role ?? 'button'}
              accessibilityLabel={action.label}
              accessibilityHint={action.hint}
              accessibilityState={action.role === 'switch' ? { checked: Boolean(action.checked), disabled: Boolean(action.disabled) } : { disabled: Boolean(action.disabled) }}
              disabled={action.disabled}
              onPress={action.onPress}
              hitSlop={theme.hitSlop}
              pressedScale={theme.motion.scale.pressedStrong}
              style={[styles.action, active && styles.actionActive]}
              pressedStyle={active ? null : styles.actionPressed}
              testID={action.testID}
            >
              <Ionicons name={action.icon} size={20} color={active ? theme.colors.brand.primaryStrong : theme.colors.text.secondary} />
            </PressableScale>
          );
        })}
      </View>
    ) : (
      <View />
    );

  const trailingButton = (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={trailing.label}
      accessibilityHint={trailing.hint}
      accessibilityState={{ disabled: trailing.disabled, busy: kind === 'cancel' }}
      disabled={trailing.disabled}
      onPress={trailing.onPress}
      haptic={kind !== 'send'}
      pressedScale={theme.motion.scale.pressedStrong}
      style={[styles.trailing, { backgroundColor: trailing.background }]}
      testID={kind === 'send' ? 'voice-send' : kind === 'cancel' ? 'voice-cancel' : 'voice-button'}
    >
      {morphing ? (
        <>
          <Animated.View style={[styles.layer, { opacity: micOpacity, transform: [{ scale: micScale }], pointerEvents: 'none' }]}>
            <Ionicons name="mic" size={20} color={trailing.icon} />
          </Animated.View>
          <Animated.View style={[styles.layer, { opacity: sendProgress, transform: [{ scale: sendScale }], pointerEvents: 'none' }]}>
            <Ionicons name="arrow-up" size={20} color={trailing.icon} />
          </Animated.View>
        </>
      ) : (
        <Ionicons name={staticIcon} size={20} color={trailing.icon} />
      )}
    </PressableScale>
  );

  const containerStyle = [styles.container, focused && styles.containerFocused, style];

  if (inline) {
    return (
      <View style={[containerStyle, styles.containerInline]} testID={testID}>
        {actions.length > 0 ? actionButtons : null}
        {input}
        {trailingButton}
      </View>
    );
  }

  return (
    <View style={containerStyle} testID={testID}>
      {input}
      <View style={styles.row}>
        {actionButtons}
        {trailingButton}
      </View>
    </View>
  );
}
