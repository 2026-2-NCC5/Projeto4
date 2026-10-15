import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SUPPORT_MOTION, useSupportMotion } from '../../features/support/motion';
import { useResponsive } from '../../hooks/useResponsive';
import { makeStyles } from '../../theme';
import { AppText } from '../ui/AppText';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  testID?: string;
}

const OFFSCREEN = 480;

const useStyles = makeStyles((theme) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.background.backdrop },
  sheet: { backgroundColor: theme.colors.surface.primary, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.sm, width: '100%', alignSelf: 'center', maxHeight: '88%', ...theme.shadows.lg },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.border.strong, marginBottom: theme.spacing.md },
  header: { marginBottom: theme.spacing.md },
}));

/**
 * Folha inferior para ações, filtros, confirmações e anexos: backdrop com fade e folha com mola amortecida.
 * Fecha tocando fora, pelo botão voltar (Android) ou pelas ações. Modal para leitores de tela.
 */
export function BottomSheet({ visible, onClose, title, description, children, testID }: BottomSheetProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();
  const motion = useSupportMotion();
  const [mounted, setMounted] = useState(visible);
  const translate = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      translate.set(motion.reduce ? 0 : withSpring(0, motion.spring));
      backdrop.set(withTiming(1, motion.timing(SUPPORT_MOTION.duration.normal)));
      return undefined;
    }
    translate.set(withTiming(OFFSCREEN, motion.timing(SUPPORT_MOTION.duration.normal)));
    backdrop.set(withTiming(0, motion.timing(SUPPORT_MOTION.duration.normal)));
    const timer = setTimeout(() => setMounted(false), motion.reduce ? 0 : SUPPORT_MOTION.duration.normal + 40);
    return () => clearTimeout(timer);
  }, [backdrop, motion, translate, visible]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translate.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent testID={testID}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" />
        </Animated.View>
        <Animated.View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8, maxWidth: responsive.contentMaxWidth ?? undefined }, sheetStyle]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.header}>
            <AppText variant="h3" accessibilityRole="header">
              {title}
            </AppText>
            {description ? (
              <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 4 }}>
                {description}
              </AppText>
            ) : null}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
