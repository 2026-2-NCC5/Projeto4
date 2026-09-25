import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useResponsive } from '../../hooks/useResponsive';
import { makeStyles, useTheme } from '../../theme';
import { MESSAGES } from '../../utils/messages';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';
import { AsaVoiceOrb } from '../voice/AsaVoiceOrb';

export interface HeyAsaOnboardingProps {
  visible: boolean;
  /** true = pedir permissão e ativar; false = "Agora não" (continua por texto e botão). */
  onComplete: (accept: boolean) => void;
  /** Voz indisponível neste build (Expo Go): explica e oferece só o modo texto. */
  voiceUnavailableReason?: 'expo_go' | 'not_supported' | 'no_service' | 'provider_disabled' | null;
}

const useStyles = makeStyles((theme) => ({
  backdrop: { flex: 1, backgroundColor: theme.colors.background.backdrop, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: theme.colors.background.elevated, borderTopLeftRadius: theme.radius.xxxl, borderTopRightRadius: theme.radius.xxxl, paddingTop: theme.spacing.lg },
  body: { flexGrow: 0, flexShrink: 1 },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: theme.colors.border.default, marginBottom: theme.spacing.md },
  orb: { alignItems: 'center', marginTop: -theme.spacing.md, marginBottom: -theme.spacing.lg },
  step: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start', marginTop: theme.spacing.md },
  stepIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: theme.colors.brand.primarySoft, alignItems: 'center', justifyContent: 'center' },
  phrase: { alignSelf: 'center', backgroundColor: theme.colors.brand.primarySoft, borderWidth: 1, borderColor: theme.colors.brand.primary, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.sm + 2, marginTop: theme.spacing.lg },
  actions: { gap: theme.spacing.sm, marginTop: theme.spacing.xxl },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: theme.spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.border.default },
  dotActive: { backgroundColor: theme.colors.brand.primary, width: 20 },
}));

/**
 * Primeira ativação do "Hey Asa": explica o que é, como funciona e por que o microfone será usado
 * ANTES de pedir a permissão do sistema. Recusar mantém texto + botão (nada quebra).
 */
export function HeyAsaOnboarding({ visible, onComplete, voiceUnavailableReason = null }: HeyAsaOnboardingProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();
  const [step, setStep] = useState<0 | 1>(0);
  const unavailable = Boolean(voiceUnavailableReason);

  const close = (accept: boolean) => {
    setStep(0);
    onComplete(accept);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => close(false)} accessibilityViewIsModal>
      <Pressable style={styles.backdrop} accessibilityLabel="Fechar" accessibilityRole="button" onPress={() => close(false)}>
        <Pressable
          style={[styles.sheet, { maxHeight: responsive.height - insets.top - theme.spacing.lg, paddingHorizontal: responsive.isCompact ? theme.spacing.lg : theme.spacing.xxl, paddingBottom: insets.bottom + theme.spacing.xl }]}
          onPress={() => undefined}
          accessibilityRole="none"
          testID="hey-asa-onboarding"
        >
          <View style={styles.handle} />
          {/* Telas baixas (paisagem): o conteúdo rola dentro da folha em vez de ser cortado. */}
          <ScrollView style={styles.body} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.orb}>
              <AsaVoiceOrb state={step === 0 ? 'idle' : 'listening'} size={responsive.isShort ? 72 : 110} reduceMotion={false} />
            </View>
            <AppText variant="label" tone="brand" uppercase align="center">
              Assistente ASA
            </AppText>
            <AppText variant="h1" align="center" accessibilityRole="header" style={{ marginTop: theme.spacing.xs }}>
              {step === 0 ? 'Conheça o Hey Asa' : 'Como o microfone é usado'}
            </AppText>

            {step === 0 ? (
              <>
                <AppText variant="body" tone="secondary" align="center" style={{ marginTop: theme.spacing.sm }}>
                  Converse naturalmente com o ASA Conecta. Pergunte sobre suas aulas, notas, frequência e pendências sem procurar onde a informação está.
                </AppText>
                <View style={styles.phrase} accessible accessibilityLabel='Diga "Hey Asa" para começar uma conversa'>
                  <AppText variant="h4" tone="brand">
                    Diga “Hey Asa”
                  </AppText>
                </View>
                <AppText variant="bodySmall" tone="muted" align="center" style={{ marginTop: theme.spacing.sm }}>
                  para começar uma conversa com o app aberto.
                </AppText>
              </>
            ) : (
              <>
                <OnboardingStep icon="mic-outline" title="Só com o app aberto" text="A detecção de “Hey Asa” funciona apenas em primeiro plano. Em segundo plano o microfone fica desligado." />
                <OnboardingStep icon="eye-outline" title="Sempre visível" text="Quando o microfone estiver ativo, um indicador aparece na tela. Nada acontece escondido." />
                <OnboardingStep icon="shield-checkmark-outline" title="Sem gravação" text={MESSAGES.voicePrivacy} />
                {unavailable ? (
                  <OnboardingStep icon="information-circle-outline" title="Neste ambiente a voz não está disponível" text={voiceUnavailableReason === 'expo_go' ? MESSAGES.voiceUnavailableExpoGo : MESSAGES.voiceUnavailable} />
                ) : null}
              </>
            )}

            <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={[styles.dot, step === 0 && styles.dotActive]} />
              <View style={[styles.dot, step === 1 && styles.dotActive]} />
            </View>

            <View style={styles.actions}>
              {step === 0 ? (
                <AppButton label="Continuar" onPress={() => setStep(1)} variant="assistant" size="large" icon="arrow-forward" iconPosition="right" testID="onboarding-next" />
              ) : (
                <AppButton
                  label={unavailable ? 'Entendi' : 'Ativar Hey Asa'}
                  onPress={() => close(!unavailable)}
                  variant="assistant"
                  size="large"
                  icon={unavailable ? 'checkmark' : 'mic'}
                  accessibilityHint={unavailable ? undefined : 'O sistema vai pedir permissão para usar o microfone'}
                  testID="onboarding-accept"
                />
              )}
              <AppButton label={step === 0 ? 'Agora não' : 'Continuar só com texto'} onPress={() => close(false)} variant="ghost" size="medium" testID="onboarding-decline" />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function OnboardingStep({ icon, title, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; text: string }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.step}>
      <View style={styles.stepIcon}>
        <Ionicons name={icon} size={20} color={theme.colors.brand.primaryStrong} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="bodySmall" tone="muted" style={{ marginTop: 2 }}>
          {text}
        </AppText>
      </View>
    </View>
  );
}
