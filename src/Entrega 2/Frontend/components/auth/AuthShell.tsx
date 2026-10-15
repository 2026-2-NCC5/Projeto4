import { Ionicons } from '@expo/vector-icons';
import React, { type PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import AsaLogo from '../../assets/branding/Asa_Logo.svg';
import FecapLogo from '../../assets/branding/FECAP_Logo.svg';
import { useResponsive } from '../../hooks/useResponsive';
import { makeStyles, useTheme } from '../../theme';
import { MESSAGES } from '../../utils/messages';
import { AppText } from '../ui/AppText';

import { useAuthMotion } from './authMotion';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  /** Conteúdo abaixo do formulário (links secundários, avisos). */
  footer?: React.ReactNode;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.background.primary },
  scroll: { flexGrow: 1, paddingHorizontal: theme.spacing.screen, paddingBottom: theme.spacing.xxxxl },
  container: { width: '100%', alignSelf: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: theme.minTouchTarget, paddingRight: theme.spacing.md, marginLeft: -theme.spacing.xs },
  pressed: { opacity: 0.6 },
  logosRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg },
  /** O logo ASA é branco: vive num bloco no verde institucional FECAP. */
  asaBlock: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.brand.secondary },
  logoDivider: { width: 1, height: 24, backgroundColor: theme.colors.border.default },
  hero: { marginTop: theme.spacing.xxxl, marginBottom: theme.spacing.xl },
  footer: { marginTop: theme.spacing.xl },
  legal: { marginTop: theme.spacing.xxl, paddingHorizontal: theme.spacing.sm },
}));

/**
 * Moldura comum das telas de autenticação: fundo neutro, logo ASA (branco) em bloco verde FECAP,
 * logo FECAP ao lado, título responsivo e rolagem que respeita o teclado.
 * Os blocos entram em cascata com animações de layout do Reanimated; o formulário vem como children.
 */
export function AuthShell({ title, subtitle, onBack, backLabel = MESSAGES.back, footer, children, testID }: PropsWithChildren<AuthShellProps>) {
  const theme = useTheme();
  const styles = useStyles();
  const responsive = useResponsive();
  const motion = useAuthMotion();
  const maxWidth = responsive.isWide ? 520 : 480;
  const titleSize = responsive.fs(responsive.isCompact ? 24 : 28);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']} testID={testID}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: responsive.sp(theme.spacing.xl) }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.container, { maxWidth }]}>
            {onBack ? (
              <Animated.View entering={motion.fade(0)}>
                <Pressable accessibilityRole="button" accessibilityLabel={backLabel} accessibilityHint="Retorna à tela anterior" hitSlop={theme.hitSlop} onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
                  <Ionicons name="chevron-back" size={20} color={theme.colors.text.link} />
                  <AppText variant="bodyStrong" tone="link">
                    {backLabel}
                  </AppText>
                </Pressable>
              </Animated.View>
            ) : null}

            <Animated.View entering={motion.enter(0)} style={[styles.logosRow, { marginTop: onBack ? theme.spacing.md : theme.spacing.sm }]}>
              <View style={styles.asaBlock} accessible accessibilityLabel="Logo ASA" testID="auth-logo-asa">
                <AsaLogo width={responsive.sp(72)} height={responsive.sp(29)} />
              </View>
              <View style={styles.logoDivider} />
              <View accessible accessibilityLabel="Logo FECAP" testID="auth-logo-fecap">
                <FecapLogo width={responsive.sp(88)} height={responsive.sp(20)} />
              </View>
            </Animated.View>

            <Animated.View entering={motion.enter(1)} style={styles.hero}>
              <AppText variant="display" accessibilityRole="header" style={{ fontSize: titleSize, lineHeight: Math.round(titleSize * 1.2) }}>
                {title}
              </AppText>
              {subtitle ? (
                <AppText variant="body" tone="secondary" style={{ marginTop: theme.spacing.xs }}>
                  {subtitle}
                </AppText>
              ) : null}
            </Animated.View>

            <Animated.View entering={motion.enter(2)}>{children}</Animated.View>

            {footer ? (
              <Animated.View entering={motion.fade(3)} style={styles.footer}>
                {footer}
              </Animated.View>
            ) : null}

            <Animated.View entering={motion.fade(4)} style={styles.legal}>
              <AppText variant="caption" tone="muted" align="center">
                O ASA Conecta é uma ferramenta de apoio à decisão. Recomendações e alertas não substituem registros, decisões ou procedimentos oficiais da instituição.
              </AppText>
              <AppText variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.sm }}>
                ASA - Agentes Inteligentes para o Sucesso do Estudante
              </AppText>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
