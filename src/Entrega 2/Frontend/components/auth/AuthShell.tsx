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
import { AuroraBackground } from '../ui/AuroraBackground';

import { useAuthMotion } from './authMotion';

interface AuthShellProps {
  /** Rótulo pequeno acima do título (ex.: "ASA Conecta"). */
  eyebrow?: string;
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
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: theme.minTouchTarget, paddingRight: theme.spacing.md, marginLeft: -theme.spacing.xs, borderRadius: theme.radius.md },
  pressed: { opacity: 0.7 },
  logosRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg },
  /** O logo ASA é branco: vive num bloco verde institucional com borda no verde ASA. */
  asaBlock: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm + 2, borderRadius: theme.radius.lg, backgroundColor: theme.colors.brand.secondary, borderWidth: 1.5, borderColor: theme.colors.brand.primary, ...theme.shadows.sm },
  logoDivider: { width: 1, height: 28, backgroundColor: theme.colors.border.default },
  hero: { marginTop: theme.spacing.xxl, marginBottom: theme.spacing.xl },
  footer: { marginTop: theme.spacing.xl },
  legal: { marginTop: theme.spacing.xxl, paddingHorizontal: theme.spacing.sm },
}));

/**
 * Moldura comum das telas de autenticação: fundo aurora (radial roxo → verde), logo ASA (branco)
 * em bloco verde com borda verde, logo FECAP solto ao lado, título responsivo e rolagem que
 * respeita o teclado.
 * Os blocos entram em cascata com animações de layout do Reanimated; o formulário vem como children.
 */
export function AuthShell({ eyebrow = 'ASA Conecta', title, subtitle, onBack, backLabel = MESSAGES.back, footer, children, testID }: PropsWithChildren<AuthShellProps>) {
  const theme = useTheme();
  const styles = useStyles();
  const responsive = useResponsive();
  const motion = useAuthMotion();
  const maxWidth = responsive.isWide ? 520 : 480;
  const titleSize = responsive.fs(responsive.isCompact ? 26 : 30);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']} testID={testID}>
      <AuroraBackground variant="hero" />
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: responsive.sp(theme.spacing.xl) }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.container, { maxWidth }]}>
            {onBack ? (
              <Animated.View entering={motion.fade(0)}>
                <Pressable accessibilityRole="button" accessibilityLabel={backLabel} accessibilityHint="Retorna à tela anterior" hitSlop={theme.hitSlop} onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
                  <Ionicons name="chevron-back" size={20} color={theme.colors.text.primary} />
                  <AppText variant="bodyStrong">{backLabel}</AppText>
                </Pressable>
              </Animated.View>
            ) : null}

            <Animated.View entering={motion.enter(0)} style={[styles.logosRow, { marginTop: onBack ? theme.spacing.md : theme.spacing.sm }]}>
              <View style={styles.asaBlock} accessible accessibilityLabel="Logo ASA" testID="auth-logo-asa">
                <AsaLogo width={responsive.sp(92)} height={responsive.sp(37)} />
              </View>
              <View style={styles.logoDivider} />
              <View accessible accessibilityLabel="Logo FECAP" testID="auth-logo-fecap">
                <FecapLogo width={responsive.sp(104)} height={responsive.sp(24)} />
              </View>
            </Animated.View>

            <Animated.View entering={motion.enter(1)} style={styles.hero}>
              {eyebrow ? (
                <AppText variant="label" tone="accent" uppercase>
                  {eyebrow}
                </AppText>
              ) : null}
              <AppText variant="display" accessibilityRole="header" style={{ marginTop: theme.spacing.xs, fontSize: titleSize, lineHeight: Math.round(titleSize * 1.18) }}>
                {title}
              </AppText>
              {subtitle ? (
                <AppText variant="body" tone="secondary" style={{ marginTop: theme.spacing.sm, fontSize: responsive.fs(15), lineHeight: responsive.fs(22) }}>
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
              <AppText variant="caption" tone="muted" align="center" style={{ fontWeight: '400' }}>
                O ASA Conecta é uma ferramenta de apoio à decisão. Recomendações e alertas não substituem registros, decisões ou procedimentos oficiais da instituição.
              </AppText>
              <AppText variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.sm, fontWeight: '400' }}>
                ASA - Agentes Inteligentes para o Sucesso do Estudante
              </AppText>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
