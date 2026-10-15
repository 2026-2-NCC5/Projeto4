import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Platform, Pressable, TextInput, View, type NativeSyntheticEvent, type TextInputContentSizeChangeEventData, type TextInputProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import type { AttachmentUploads } from '../../features/support/hooks/useAttachmentUploads';
import { SUPPORT_MOTION, useSupportMotion } from '../../features/support/motion';
import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';

import { UploadRow } from './AttachmentItems';

export interface TicketComposerProps {
  uploads: AttachmentUploads;
  maxLength: number;
  onSend: (content: string) => void;
  /** espaço inferior (barra de navegação + área segura) */
  bottomInset: number;
  /** destaca o botão de anexo quando o ASA pediu um documento */
  emphasizeAttach?: boolean;
  onAttachError: (message: string) => void;
  inputRef?: React.Ref<TextInput>;
}

/** Uma linha de texto (input) até ~5 linhas; depois disso o campo rola. */
const INPUT_MIN_HEIGHT = 22;
const INPUT_MAX_HEIGHT = 112;
/** Na web o campo multilinha é um textarea com 2 linhas por padrão; começa com 1 e cresce pelo conteúdo. */
const WEB_SINGLE_ROW = (Platform.OS === 'web' ? { rows: 1 } : {}) as Partial<TextInputProps>;

const useStyles = makeStyles((theme) => ({
  bar: { backgroundColor: theme.colors.surface.primary, borderTopWidth: 1, borderTopColor: theme.colors.border.default, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm },
  uploads: { marginHorizontal: -theme.spacing.md, marginBottom: theme.spacing.xs },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm },
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flex: 1, borderRadius: 22, borderWidth: 1, borderColor: theme.colors.chat.inputBorder, backgroundColor: theme.colors.chat.inputBackground, paddingHorizontal: theme.spacing.md, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  input: { ...theme.typography.input, color: theme.colors.text.primary, paddingVertical: 0, paddingTop: 0, paddingBottom: 0 },
  counter: { alignSelf: 'flex-end', marginTop: 2, marginRight: 56 },
}));

/** Campo de resposta: [+] anexar · mensagem · enviar. O envio é otimista e o campo limpa na hora. */
export function TicketComposer({ uploads, maxLength, onSend, bottomInset, emphasizeAttach = false, onAttachError, inputRef }: TicketComposerProps) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useSupportMotion();
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const sendScale = useSharedValue(1);
  const hasFiles = uploads.uploadedIds.length > 0;
  const canSend = (text.trim().length > 0 || hasFiles) && !uploads.busy;
  const { colors } = theme;

  const send = () => {
    if (!canSend) return;
    if (!motion.reduce) {
      sendScale.set(SUPPORT_MOTION.pressedScale);
      sendScale.set(withSpring(1, motion.spring));
    }
    onSend(text);
    setText('');
    setInputHeight(INPUT_MIN_HEIGHT);
  };

  const grow = (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
    const next = Math.min(INPUT_MAX_HEIGHT, Math.max(INPUT_MIN_HEIGHT, Math.ceil(event.nativeEvent.contentSize.height)));
    if (next !== inputHeight) setInputHeight(next);
  };

  const attach = () => {
    uploads
      .pick()
      .then((problem) => {
        if (problem) onAttachError(problem);
      })
      .catch(() => undefined);
  };

  const sendStyle = useAnimatedStyle(() => ({ transform: [{ scale: sendScale.get() }] }));
  const nearLimit = text.length > maxLength * 0.9;

  return (
    <View style={[styles.bar, { paddingBottom: bottomInset + theme.spacing.sm }]} testID="ticket-composer">
      {uploads.items.length > 0 ? (
        <View style={styles.uploads}>
          {uploads.items.map((item) => (
            <UploadRow key={item.localId} item={item} onRemove={() => uploads.remove(item.localId)} onRetry={() => uploads.retry(item.localId)} testID={`composer-upload-${item.localId}`} />
          ))}
        </View>
      ) : null}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Anexar arquivo"
          accessibilityHint="PDF, imagem ou documento de até 5 MB"
          onPress={attach}
          style={({ pressed }) => [styles.button, { backgroundColor: emphasizeAttach ? colors.brand.primarySoft : pressed ? colors.surface.muted : 'transparent' }]}
          testID="composer-attach"
        >
          <Ionicons name="add" size={24} color={emphasizeAttach ? colors.brand.primaryStrong : colors.text.secondary} />
        </Pressable>
        <View style={styles.inputWrap}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            onContentSizeChange={grow}
            placeholder="Digite sua mensagem..."
            placeholderTextColor={colors.text.placeholder}
            style={[styles.input, { height: inputHeight }]}
            multiline
            {...WEB_SINGLE_ROW}
            maxLength={maxLength}
            accessibilityLabel="Mensagem para o ASA"
            testID="composer-input"
          />
        </View>
        <Animated.View style={sendStyle}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enviar mensagem"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={send}
            style={[styles.button, { backgroundColor: canSend ? colors.chat.send : colors.control.disabled }]}
            testID="composer-send"
          >
            <Ionicons name="arrow-up" size={20} color={canSend ? colors.chat.sendIcon : colors.control.disabledText} />
          </Pressable>
        </Animated.View>
      </View>
      {nearLimit ? (
        <AppText variant="caption" tone="warning" style={styles.counter}>
          {`${text.length} / ${maxLength}`}
        </AppText>
      ) : null}
    </View>
  );
}
