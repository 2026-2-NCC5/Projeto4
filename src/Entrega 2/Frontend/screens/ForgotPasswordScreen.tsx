import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AuthLinkRow, AuthShell, AuthStepper, AuthTextField, PasswordRequirements, useAuthMotion } from '../components/auth';
import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { AppButton, AppText, Surface } from '../components/ui';
import { useAuthPolicy } from '../hooks/useAuthPolicy';
import { useSession } from '../hooks/useSession';
import { normalizeAuthError } from '../services/authErrors';
import { authService } from '../services/authService';
import { makeStyles, useTheme } from '../theme';
import { AUTH_VALIDATION_MESSAGES, evaluatePassword, formatCountdown, maskEmail, validateEmail, validatePasswordConfirmation } from '../utils/authValidation';

type Step =
  | { kind: 'email' }
  | { kind: 'code'; email: string; codeLength: number; expiresAt: number; resendAt: number }
  | { kind: 'password'; email: string; resetToken: string; expiresAt: number }
  | { kind: 'done'; email: string };

interface ForgotPasswordScreenProps {
  onBack: () => void;
  /** Volta para a tela de login após a redefinição. */
  onDone: () => void;
  /** Injetável em testes. */
  now?: () => number;
}

const STEPS = ['E-mail', 'Código', 'Nova senha'] as const;
const STEP_INDEX: Record<Step['kind'], number> = { email: 0, code: 1, password: 2, done: 2 };

const useStyles = makeStyles((theme) => ({
  card: { padding: theme.spacing.xl },
  submit: { marginTop: theme.spacing.xl },
  info: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center', marginBottom: theme.spacing.xs },
  inline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md, marginTop: theme.spacing.md, flexWrap: 'wrap' },
  link: { minHeight: theme.minTouchTarget, justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  done: { alignItems: 'center', paddingVertical: theme.spacing.md },
  doneIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.status.successSoft, marginBottom: theme.spacing.md },
}));

/** Relógio que avança a cada segundo enquanto houver prazo a exibir. */
function useTicker(active: boolean, now: () => number): number {
  const [tick, setTick] = useState(() => now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setTick(now()), 1000);
    return () => clearInterval(id);
  }, [active, now]);
  return active ? tick : now();
}

/**
 * Redefinição de senha em três etapas (e-mail → código de 6 dígitos → nova senha), usando os
 * endpoints públicos da API. Nenhum código ou token fica salvo no aparelho; o fluxo vive só em memória.
 */
export function ForgotPasswordScreen({ onBack, onDone, now = Date.now }: ForgotPasswordScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useAuthMotion();
  const { policy } = useAuthPolicy();
  const { forgetBiometricsForEmail } = useSession();
  const [step, setStep] = useState<Step>({ kind: 'email' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<'submit' | 'resend' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const current = useTicker(step.kind === 'code', now);
  const resendIn = step.kind === 'code' ? Math.max(0, Math.ceil((step.resendAt - current) / 1000)) : 0;
  const expiresIn = step.kind === 'code' ? Math.max(0, Math.ceil((step.expiresAt - current) / 1000)) : 0;

  const emailError = useMemo(() => validateEmail(email), [email]);
  const passwordEvaluation = useMemo(() => evaluatePassword(password, policy.password), [password, policy.password]);
  const passwordError = !password ? AUTH_VALIDATION_MESSAGES.passwordRequired : passwordEvaluation.tooLong ? AUTH_VALIDATION_MESSAGES.passwordTooLong(policy.password.maxLength) : passwordEvaluation.valid ? null : 'A senha ainda não atende a todos os requisitos.';
  const confirmError = validatePasswordConfirmation(password, confirm);

  const fail = useCallback((caught: unknown) => {
    const normalized = normalizeAuthError(caught);
    setError(normalized.message);
    if (normalized.code === 'RESET_TOKEN_INVALID') {
      setStep({ kind: 'email' });
      setCode('');
    }
    setBusy(null);
  }, []);

  const requestCode = useCallback(async () => {
    if (busy) return;
    setTouched(true);
    setError(null);
    setInfo(null);
    if (emailError) return;
    setBusy('submit');
    try {
      const response = await authService.forgotPassword(email);
      const at = now();
      setStep({ kind: 'code', email, codeLength: response.codeLength, expiresAt: at + response.expiresInSeconds * 1000, resendAt: at + response.resendAvailableInSeconds * 1000 });
      setInfo(response.message);
      setTouched(false);
      setBusy(null);
    } catch (caught) {
      fail(caught);
    }
  }, [busy, emailError, email, now, fail]);

  const resend = useCallback(async () => {
    if (busy || step.kind !== 'code' || resendIn > 0) return;
    setError(null);
    setBusy('resend');
    try {
      const response = await authService.resendResetCode(step.email);
      const at = now();
      setStep({ ...step, codeLength: response.codeLength, expiresAt: at + response.expiresInSeconds * 1000, resendAt: at + response.resendAvailableInSeconds * 1000 });
      setInfo('Enviamos um novo código.');
      setCode('');
      setBusy(null);
    } catch (caught) {
      fail(caught);
    }
  }, [busy, step, resendIn, now, fail]);

  const verify = useCallback(async () => {
    if (busy || step.kind !== 'code') return;
    setTouched(true);
    setError(null);
    setInfo(null);
    if (code.trim().length !== step.codeLength) return;
    setBusy('submit');
    try {
      const response = await authService.verifyResetCode(step.email, code.trim());
      setStep({ kind: 'password', email: step.email, resetToken: response.resetToken, expiresAt: now() + response.expiresInSeconds * 1000 });
      setTouched(false);
      setBusy(null);
    } catch (caught) {
      fail(caught);
    }
  }, [busy, step, code, now, fail]);

  const reset = useCallback(async () => {
    if (busy || step.kind !== 'password') return;
    setTouched(true);
    setError(null);
    if (passwordError || confirmError) return;
    setBusy('submit');
    try {
      await authService.resetPassword(step.resetToken, password);
      await forgetBiometricsForEmail(step.email).catch(() => undefined);
      setPassword('');
      setConfirm('');
      setStep({ kind: 'done', email: step.email });
      setBusy(null);
    } catch (caught) {
      fail(caught);
    }
  }, [busy, step, passwordError, confirmError, password, forgetBiometricsForEmail, fail]);

  const codeError = touched && step.kind === 'code' && code.trim().length !== step.codeLength ? `Digite o código de ${step.codeLength} dígitos.` : null;

  const titles: Record<Step['kind'], { title: string; subtitle: string }> = {
    email: { title: 'Redefinir senha', subtitle: 'Informe o e-mail da sua conta. Enviaremos um código de verificação para você criar uma nova senha.' },
    code: { title: 'Confira seu e-mail', subtitle: step.kind === 'code' ? `Enviamos um código para ${maskEmail(step.email)}. Ele vale por ${formatCountdown(expiresIn)}.` : '' },
    password: { title: 'Crie a nova senha', subtitle: 'Escolha uma senha forte. Por segurança, você será desconectado dos outros aparelhos.' },
    done: { title: 'Senha redefinida', subtitle: 'Tudo certo. Entre com sua nova senha para continuar.' },
  };

  return (
    <AuthShell
      eyebrow="Recuperação de acesso"
      title={titles[step.kind].title}
      subtitle={titles[step.kind].subtitle}
      onBack={step.kind === 'done' ? undefined : onBack}
      backLabel="Entrar"
      footer={step.kind === 'done' ? undefined : <AuthLinkRow text="Lembrou a senha?" linkLabel="Entrar" icon="log-in-outline" onPress={onBack} accessibilityLabel="Lembrei a senha, entrar" disabled={busy !== null} testID="forgot-go-login" />}
      testID="forgot-screen"
    >
      <Surface tone="glass" elevation="md" style={styles.card}>
        {step.kind !== 'done' ? <AuthStepper steps={STEPS} current={STEP_INDEX[step.kind]} testID="forgot-stepper" /> : null}

        {info ? (
          <Animated.View entering={motion.rise()} style={styles.info} accessibilityLiveRegion="polite" testID="forgot-info">
            <Ionicons name="mail-unread-outline" size={18} color={theme.colors.status.infoText} />
            <AppText variant="bodySmall" tone="info" style={{ flex: 1 }}>
              {info}
            </AppText>
          </Animated.View>
        ) : null}

        {step.kind === 'email' ? (
          <Animated.View key="step-email" entering={motion.rise()}>
            <AuthTextField label="E-mail" icon="mail-outline" value={email} onChangeText={(value) => { setEmail(value); setError(null); }} placeholder="nome@instituicao.edu.br" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" editable={!busy} returnKeyType="send" onSubmitEditing={() => void requestCode()} error={touched ? emailError : null} testID="forgot-email" />
            {error ? <ErrorBanner message={error} testID="forgot-error" /> : null}
            <View style={styles.submit}>
              <PrimaryButton label="Enviar código" accessibilityLabel="Enviar código de recuperação" loadingLabel="Enviando, aguarde" onPress={() => void requestCode()} loading={busy === 'submit'} disabled={busy !== null} testID="forgot-submit" />
            </View>
          </Animated.View>
        ) : null}

        {step.kind === 'code' ? (
          <Animated.View key="step-code" entering={motion.rise()}>
            <AuthTextField label="Código" icon="keypad-outline" value={code} onChangeText={(value) => { setCode(value.replace(/\D/g, '').slice(0, step.codeLength)); setError(null); }} placeholder={'0'.repeat(step.codeLength)} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={step.codeLength} editable={!busy} returnKeyType="done" onSubmitEditing={() => void verify()} error={codeError} hint={expiresIn > 0 ? `Expira em ${formatCountdown(expiresIn)}` : 'Código expirado. Solicite um novo.'} testID="forgot-code" />
            {error ? <ErrorBanner message={error} testID="forgot-error" /> : null}
            <View style={styles.submit}>
              <PrimaryButton label="Confirmar código" accessibilityLabel="Confirmar código" loadingLabel="Confirmando, aguarde" onPress={() => void verify()} loading={busy === 'submit'} disabled={busy !== null || expiresIn === 0} testID="forgot-verify" />
            </View>
            <View style={styles.inline}>
              <AppText variant="bodySmall" tone="secondary">
                Não recebeu o código?
              </AppText>
              <Pressable accessibilityRole="button" accessibilityLabel={resendIn > 0 ? `Reenviar código em ${formatCountdown(resendIn)}` : 'Reenviar código'} accessibilityState={{ disabled: resendIn > 0 || busy !== null }} disabled={resendIn > 0 || busy !== null} onPress={() => void resend()} style={({ pressed }) => [styles.link, pressed && styles.pressed]} testID="forgot-resend">
                <AppText variant="bodySmallStrong" tone={resendIn > 0 || busy ? 'muted' : 'link'}>
                  {busy === 'resend' ? 'Reenviando...' : resendIn > 0 ? `Reenviar em ${formatCountdown(resendIn)}` : 'Reenviar código'}
                </AppText>
              </Pressable>
            </View>
          </Animated.View>
        ) : null}

        {step.kind === 'password' ? (
          <Animated.View key="step-password" entering={motion.rise()}>
            <AuthTextField label="Nova senha" icon="lock-closed-outline" value={password} onChangeText={(value) => { setPassword(value); setError(null); }} placeholder="Crie uma senha forte" secureToggle autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" editable={!busy} returnKeyType="next" error={touched ? passwordError : null} testID="forgot-password" />
            <PasswordRequirements password={password} policy={policy.password} />
            <AuthTextField label="Confirmar nova senha" icon="shield-checkmark-outline" value={confirm} onChangeText={(value) => { setConfirm(value); setError(null); }} placeholder="Repita a senha" secureToggle autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" editable={!busy} returnKeyType="done" onSubmitEditing={() => void reset()} error={touched ? confirmError : null} testID="forgot-confirm" />
            {error ? <ErrorBanner message={error} testID="forgot-error" /> : null}
            <View style={styles.submit}>
              <PrimaryButton label="Salvar nova senha" accessibilityLabel="Salvar nova senha" loadingLabel="Salvando, aguarde" onPress={() => void reset()} loading={busy === 'submit'} disabled={busy !== null} testID="forgot-save" />
            </View>
          </Animated.View>
        ) : null}

        {step.kind === 'done' ? (
          <Animated.View key="step-done" entering={motion.enter()} style={styles.done} accessibilityLiveRegion="polite" testID="forgot-done">
            <View style={styles.doneIcon}>
              <Ionicons name="checkmark" size={32} color={theme.colors.status.successText} />
            </View>
            <AppText variant="h3" align="center" accessibilityRole="header">
              Sua senha foi redefinida
            </AppText>
            <AppText variant="body" tone="secondary" align="center" style={{ marginTop: theme.spacing.xs }}>
              Por segurança, o acesso por biometria deste aparelho foi desativado. Você pode ativá-lo de novo em Perfil.
            </AppText>
            <AppButton label="Voltar para entrar" icon="log-in-outline" size="large" fullWidth onPress={onDone} style={{ marginTop: theme.spacing.xl }} testID="forgot-back-login" />
          </Animated.View>
        ) : null}
      </Surface>
    </AuthShell>
  );
}
