import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { formatFileSize, formatShortDate } from '../../features/support/format';
import type { UploadItem } from '../../features/support/hooks/useAttachmentUploads';
import { fileIcon, fileKind } from '../../features/support/labels';
import { SUPPORT_MOTION, useSupportMotion } from '../../features/support/motion';
import { makeStyles, useTheme } from '../../theme';
import type { SupportAttachment } from '../../types/api';
import { AppText } from '../ui/AppText';

import { AnimatedCheck } from './AnimatedCheck';
import { Appear } from './Appear';

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg, minHeight: 60 },
  pressed: { backgroundColor: theme.colors.surface.secondary },
  icon: { width: 36, height: 36, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface.muted },
  text: { flex: 1, minWidth: 0 },
  track: { height: 4, borderRadius: 2, backgroundColor: theme.colors.border.subtle, marginTop: 6, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: theme.colors.brand.primaryStrong },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  status: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
}));

/**
 * Arquivo sendo anexado: entra com slide + fade + scale leve, mostra a barra de progresso animada durante o envio e
 * um check desenhado ao concluir. Falha mostra a causa e "Tentar novamente".
 */
export function UploadRow({ item, onRemove, onRetry, testID }: { item: UploadItem; onRemove: () => void; onRetry: () => void; testID?: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useSupportMotion();
  const progress = useSharedValue(0);
  const failed = item.status === 'failed';

  useEffect(() => {
    // Leitura é rápida; o envio avança devagar até a confirmação do servidor completar a barra.
    const duration = item.status === 'uploading' ? 1600 : SUPPORT_MOTION.duration.slow;
    progress.set(withTiming(item.progress, motion.timing(duration)));
  }, [item.progress, item.status, motion, progress]);

  const fill = useAnimatedStyle(() => ({ width: `${Math.round(progress.get() * 100)}%` }));
  const statusText = failed ? item.error ?? 'Não foi possível enviar.' : item.status === 'uploaded' ? `${formatFileSize(item.file.sizeBytes)} · Enviado` : `${formatFileSize(item.file.sizeBytes)} · Enviando...`;

  return (
    <Appear offsetX={12} offset={0}>
      <View style={styles.row} accessible accessibilityLabel={`${item.file.name}, ${statusText}`} testID={testID}>
        <View style={styles.icon}>
          <Ionicons name={fileIcon(item.file.mimeType)} size={18} color={theme.colors.text.secondary} />
        </View>
        <View style={styles.text}>
          <AppText variant="bodySmallStrong" numberOfLines={1}>
            {item.file.name}
          </AppText>
          <AppText variant="caption" tone={failed ? 'error' : 'muted'} numberOfLines={2}>
            {statusText}
          </AppText>
          {item.status === 'reading' || item.status === 'uploading' ? (
            <View style={styles.track}>
              <Animated.View style={[styles.fill, fill]} />
            </View>
          ) : null}
        </View>
        <View style={styles.status}>
          {item.status === 'uploaded' ? <AnimatedCheck size={22} /> : failed ? <Ionicons name="alert-circle" size={20} color={theme.colors.status.error} /> : <ActivityIndicator size="small" color={theme.colors.text.muted} />}
        </View>
        {failed ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Tentar enviar ${item.file.name} novamente`} onPress={onRetry} style={styles.remove} hitSlop={theme.hitSlop}>
            <Ionicons name="refresh" size={18} color={theme.colors.text.link} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${item.file.name}`} onPress={onRemove} style={styles.remove} hitSlop={theme.hitSlop} testID={testID ? `${testID}-remove` : undefined}>
          <Ionicons name="close" size={18} color={theme.colors.text.secondary} />
        </Pressable>
      </View>
    </Appear>
  );
}

/** Arquivo do chamado: nome, tipo, tamanho, data e autor; toque abre o arquivo. */
export function FileRow({ attachment, onOpen, testID }: { attachment: SupportAttachment; onOpen: () => void; testID?: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const author = attachment.uploadedBy === 'student' ? 'Você' : attachment.uploaderName;
  const meta = `${fileKind(attachment.mimeType)} · ${formatFileSize(attachment.sizeBytes)} · ${formatShortDate(attachment.createdAt)} · ${author}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${attachment.name}, ${meta}`} accessibilityHint="Abre o arquivo" onPress={onOpen} style={({ pressed }) => [styles.row, pressed && styles.pressed]} testID={testID}>
      <View style={styles.icon}>
        <Ionicons name={fileIcon(attachment.mimeType)} size={18} color={theme.colors.text.secondary} />
      </View>
      <View style={styles.text}>
        <AppText variant="bodySmallStrong" numberOfLines={1}>
          {attachment.name}
        </AppText>
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {meta}
        </AppText>
      </View>
      <Ionicons name="open-outline" size={16} color={theme.colors.text.muted} />
    </Pressable>
  );
}
