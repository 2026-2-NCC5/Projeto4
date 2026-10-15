import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { formatFileSize, formatFriendlyDateTime } from '../../features/support/format';
import type { PendingMessage } from '../../features/support/hooks/useTicketActions';
import { fileIcon } from '../../features/support/labels';
import { useSupportMotion } from '../../features/support/motion';
import { makeStyles, useTheme } from '../../theme';
import type { SupportAttachment, SupportTicketMessage } from '../../types/api';
import { AppText } from '../ui/AppText';

import { Appear } from './Appear';

export interface TicketMessagesProps {
  messages: SupportTicketMessage[];
  pending: PendingMessage[];
  /** primeira mensagem não lida quando a tela abriu (recebe o divisor "Novas mensagens") */
  firstUnreadId: string | null;
  onOpenAttachment: (attachment: SupportAttachment) => void;
  onRetry: (clientMessageId: string) => void;
  onDiscard: (clientMessageId: string) => void;
  /** posição (y) da primeira não lida dentro da lista, para rolar até ela */
  onFirstUnreadLayout?: (y: number) => void;
  now?: Date;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  list: { gap: theme.spacing.md },
  row: { maxWidth: '86%' },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  bubble: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm + 2, borderRadius: theme.radius.lg },
  bubbleMine: { backgroundColor: theme.colors.chat.userBubble, borderBottomRightRadius: theme.radius.xs },
  bubbleTheirs: { backgroundColor: theme.colors.surface.primary, borderWidth: 1, borderColor: theme.colors.border.default, borderBottomLeftRadius: theme.radius.xs },
  sender: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, marginBottom: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  file: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.sm, paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface.secondary, minHeight: 40 },
  newBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: theme.radius.sm, backgroundColor: theme.colors.brand.primaryStrong },
  divider: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.colors.brand.primarySoft },
  failed: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginTop: 4 },
}));

/** Conversa do chamado. As mensagens do estudante ficam à direita; as do ASA, à esquerda com o nome da equipe. */
export function TicketMessages({ messages, pending, firstUnreadId, onOpenAttachment, onRetry, onDiscard, onFirstUnreadLayout, now, testID = 'ticket-messages' }: TicketMessagesProps) {
  const styles = useStyles();
  return (
    <View style={styles.list} testID={testID}>
      {messages.map((message, index) => (
        <View
          key={message.id}
          onLayout={message.id === firstUnreadId && onFirstUnreadLayout ? (event: LayoutChangeEvent) => onFirstUnreadLayout(event.nativeEvent.layout.y) : undefined}
        >
          {message.id === firstUnreadId ? <UnreadDivider /> : null}
          <MessageBubble message={message} index={index} fresh={message.senderType === 'agent' && !message.readAt} onOpenAttachment={onOpenAttachment} now={now} />
        </View>
      ))}
      {pending.map((message) => (
        <PendingBubble key={message.clientMessageId} message={message} onRetry={() => onRetry(message.clientMessageId)} onDiscard={() => onDiscard(message.clientMessageId)} />
      ))}
    </View>
  );
}

function UnreadDivider() {
  const styles = useStyles();
  return (
    <View style={[styles.divider, { marginBottom: 12 }]} accessibilityRole="header" accessibilityLabel="Novas mensagens">
      <View style={styles.dividerLine} />
      <AppText variant="caption" tone="brand" style={{ fontWeight: '600' }}>
        Novas mensagens
      </AppText>
      <View style={styles.dividerLine} />
    </View>
  );
}

function NewBadge() {
  const styles = useStyles();
  const motion = useSupportMotion();
  const scale = useSharedValue(motion.reduce ? 1 : 0);
  useEffect(() => {
    if (!motion.reduce) scale.set(withDelay(200, withSpring(1, motion.spring)));
  }, [motion, scale]);
  const animated = useAnimatedStyle(() => ({ opacity: scale.get(), transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View style={[styles.newBadge, animated]}>
      <AppText variant="caption" tone="onPrimary" style={{ fontWeight: '700', fontSize: 10, lineHeight: 14 }}>
        Nova
      </AppText>
    </Animated.View>
  );
}

function FileChip({ attachment, onOpen }: { attachment: SupportAttachment; onOpen: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${attachment.name}, ${formatFileSize(attachment.sizeBytes)}`} onPress={onOpen} style={styles.file}>
      <Ionicons name={fileIcon(attachment.mimeType)} size={16} color={theme.colors.text.secondary} />
      <AppText variant="caption" numberOfLines={1} style={{ flex: 1, fontWeight: '600' }}>
        {attachment.name}
      </AppText>
      <AppText variant="caption" tone="muted">
        {formatFileSize(attachment.sizeBytes)}
      </AppText>
    </Pressable>
  );
}

function MessageBubble({ message, index, fresh, onOpenAttachment, now }: { message: SupportTicketMessage; index: number; fresh: boolean; onOpenAttachment: (attachment: SupportAttachment) => void; now?: Date | undefined }) {
  const theme = useTheme();
  const styles = useStyles();
  const mine = message.senderType === 'student';
  const when = formatFriendlyDateTime(message.createdAt, now);
  return (
    <Appear index={index} offsetX={mine ? 10 : -10} offset={4} style={[styles.row, mine ? styles.mine : styles.theirs]}>
      <View
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
        accessible
        accessibilityLabel={`${mine ? 'Você' : message.senderName}, ${when}: ${message.content}${message.attachments.length > 0 ? `. ${message.attachments.length} anexo(s)` : ''}`}
        testID={`message-${message.id}`}
      >
        {!mine ? (
          <View style={styles.sender}>
            <Ionicons name="chatbubbles-outline" size={13} color={theme.colors.brand.primaryStrong} />
            <AppText variant="caption" tone="brand" style={{ fontWeight: '600' }}>
              {message.senderName}
            </AppText>
            {fresh ? <NewBadge /> : null}
          </View>
        ) : null}
        {message.content ? <AppText variant="body">{message.content}</AppText> : null}
        {message.attachments.map((attachment) => (
          <FileChip key={attachment.id} attachment={attachment} onOpen={() => onOpenAttachment(attachment)} />
        ))}
        <View style={[styles.meta, mine ? { alignSelf: 'flex-end' } : null]}>
          <AppText variant="caption" tone="muted">
            {when}
          </AppText>
          {mine ? (
            <>
              <Ionicons name="checkmark-done" size={13} color={theme.colors.text.muted} />
              <AppText variant="caption" tone="muted">
                Entregue
              </AppText>
            </>
          ) : null}
        </View>
      </View>
    </Appear>
  );
}

function PendingBubble({ message, onRetry, onDiscard }: { message: PendingMessage; onRetry: () => void; onDiscard: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  const failed = message.status === 'failed';
  return (
    <Appear offsetX={12} offset={0} style={[styles.row, styles.mine]}>
      <View style={[styles.bubble, styles.bubbleMine, failed ? { borderWidth: 1, borderColor: theme.colors.status.error } : null]} accessible accessibilityLabel={`Você: ${message.content}. ${failed ? 'Não enviada' : 'Enviando'}`} accessibilityLiveRegion="polite">
        {message.content ? <AppText variant="body">{message.content}</AppText> : null}
        {message.attachmentNames.map((name) => (
          <View key={name} style={styles.file}>
            <Ionicons name="attach-outline" size={16} color={theme.colors.text.secondary} />
            <AppText variant="caption" numberOfLines={1} style={{ flex: 1 }}>
              {name}
            </AppText>
          </View>
        ))}
        <View style={[styles.meta, { alignSelf: 'flex-end' }]}>
          {failed ? <Ionicons name="alert-circle" size={13} color={theme.colors.status.error} /> : <ActivityIndicator size="small" color={theme.colors.text.muted} style={{ transform: [{ scale: 0.6 }] }} />}
          <AppText variant="caption" tone={failed ? 'error' : 'muted'}>
            {failed ? (message.error ?? 'Não enviada') : 'Enviando...'}
          </AppText>
        </View>
      </View>
      {failed ? (
        <View style={[styles.failed, { alignSelf: 'flex-end' }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Tentar enviar novamente" onPress={onRetry} hitSlop={theme.hitSlop} style={{ minHeight: 32, justifyContent: 'center' }}>
            <AppText variant="bodySmallStrong" tone="link">
              Tentar novamente
            </AppText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Descartar mensagem" onPress={onDiscard} hitSlop={theme.hitSlop} style={{ minHeight: 32, justifyContent: 'center' }}>
            <AppText variant="bodySmallStrong" tone="muted">
              Descartar
            </AppText>
          </Pressable>
        </View>
      ) : null}
    </Appear>
  );
}
