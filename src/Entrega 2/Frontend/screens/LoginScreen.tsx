import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AuthAltButton, AuthDivider, AuthLinkRow, AuthSection, AuthShell, AuthTextField, useAuthMotion } from '../components/auth';
import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { AppText, Surface } from '../components/ui';
import { useAuthPolicy } from '../hooks/useAuthPolicy';
import { toApiClientError } from '../hooks/useResource';
import { useSession } from '../hooks/useSession';
import { normalizeAuthError } from '../services/authErrors';
import { makeStyles, useTheme } from '../theme';
import { firstName } from '../utils/authValidation';
import { MESSAGES } from '../utils/messages';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLoginFields(email: string, password: string): { email?: string; password?: string } {
  const errors: { email?: string; password?: string } = {};
  const normalizedEmail = email.trim();
  if (!normalizedEmail) errors.email = 'Informe seu e-mail.';
  else if (!EMAIL_PATTERN.test(normalizedEmail)) errors.email = 'Informe um e-mail válido.';
  if (!password) errors.password = 'Informe sua senha.';
  return errors;
}

export function loginErrorMessage(error: unknown): string {
  const apiError = toApiClientError(error);
  switch (apiError.kind) {
    case 'unauthorized':
      return MESSAGES.errorCredentials;
    case 'validation':
      return apiError.details?.[0]?.message ?? 'Verifique os dados informados e tente novamente.';
    case 'offline':
      return MESSAGES.errorOffline;
    case 'timeout':
      return 'O servidor demorou para responder. Tente novamente.';
    case 'network':
      return MESSAGES.errorNetwork;
    case 'dependency':
    case 'server':
      return 'O serviço está temporariamente indisponível. Tente novamente.';
    default:
      return 'Não foi possível entrar. Tente novamente.';
  }
}

interface LoginScreenProps {
  onCreateAccount?: () => void;
  onForgotPassword?: () => void;
}

const useStyles = makeStyles((theme) => ({
  card: { padding: theme.spacing.xl },
  optionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md, marginTop: theme.spacing.lg, minHeight: theme.minTouchTarget },
  remember: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexShrink: 1 },
  link: { minHeight: theme.minTouchTarget, justifyContent: 'center', paddingHorizontal: theme.spacing.xxs },
  submit: { marginTop: theme.spacing.xl },
  pressed: { opacity: 0.7 },
}));

/**
 * Entrada do estudante (e-mail + senha). Sem atalhos de demonstração: as contas fictícias existem
 * apenas no seed do banco e são documentadas no README raiz.
 */
export function LoginScreen({ onCreateAccount, onForgotPassword }: LoginScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useAuthMotion();
  const { signIn, signOutReason, clearSignOutReason, biometric, canRememberSession, signInWithBiometrics } = useSession();
  const { policy } = useAuthPolicy();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Desligado por padrão: aparelhos compartilhados não devem manter a sessão sem o aluno escolher.
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fieldErrors = useMemo(() => validateLoginFields(email, password), [email, password]);
  const hasFieldErrors = Boolean(fieldErrors.email || fieldErrors.password);
  const rememberAvailable = canRememberSession !== false;

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setTouched(true);
    setError(null);
    clearSignOutReason();
    if (hasFieldErrors) return;
    setSubmitting(true);
    try {
      await signIn(email, password, { rememberMe: rememberAvailable && rememberMe });
    } catch (caught) {
      setError(loginErrorMessage(caught));
      setSubmitting(false);
    }
  }, [submitting, hasFieldErrors, signIn, email, password, rememberAvailable, rememberMe, clearSignOutReason]);

  const handleBiometrics = useCallback(async () => {
    if (biometricBusy || submitting) return;
    setError(null);
    setBiometricBusy(true);
    try {
      await signInWithBiometrics();
    } catch (caught) {
      const normalized = normalizeAuthError(caught);
      if (normalized.code !== 'BIOMETRIC_CANCELLED') setError(normalized.message);
      setBiometricBusy(false);
    }
  }, [biometricBusy, submitting, signInWithBiometrics]);

  const biometricAvailable = Boolean(biometric?.enabled && biometric.availability.status === 'available');
  const biometricLabel = biometric?.availability.label ?? 'biometria';
  const biometricHint = biometric?.accountHint ? `Continuar como ${firstName(biometric.accountHint.fullName)}` : undefined;
  const recoveryAvailable = Boolean(onForgotPassword) && policy.passwordRecoveryAvailable;

  return (
    <AuthShell
      eyebrow="ASA Conecta"
      title="Bem-vindo ao ASA"
      subtitle="Entre com sua conta de estudante para acompanhar sua jornada acadêmica."
      footer={onCreateAccount ? <AuthLinkRow text="Ainda não tem conta?" linkLabel="Criar conta" icon="person-add-outline" onPress={onCreateAccount} accessibilityLabel="Criar conta de estudante" accessibilityHint="Abre o cadastro com e-mail institucional e RA" disabled={submitting || biometricBusy} testID="login-create-account" /> : undefined}
      testID="login-screen"
    >
      <Surface tone="glass" elevation="md" style={styles.card}>
        {signOutReason === 'expired' ? (
          <Animated.View entering={motion.rise()}>
            <ErrorBanner tone="warning" message={MESSAGES.errorUnauthorized} testID="session-expired-banner" />
          </Animated.View>
        ) : null}

        <AuthSection title="Acesse sua conta" description="Use o e-mail e a senha cadastrados na instituição." first />

        <AuthTextField
          label="E-mail"
          nativeID="email-label"
          icon="mail-outline"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError(null);
          }}
          placeholder="nome@instituicao.edu.br"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          editable={!submitting}
          returnKeyType="next"
          error={touched ? fieldErrors.email : null}
          testID="login-email"
        />
        <AuthTextField
          label="Senha"
          nativeID="password-label"
          icon="lock-closed-outline"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setError(null);
          }}
          placeholder="Sua senha"
          secureToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          textContentType="password"
          editable={!submitting}
          returnKeyType="done"
          onSubmitEditing={() => void handleSubmit()}
          error={touched ? fieldErrors.password : null}
          testID="login-password"
        />

        {rememberAvailable || recoveryAvailable ? (
          <View style={styles.optionsRow}>
            {rememberAvailable ? (
              <View style={styles.remember}>
                <Switch
                  value={rememberMe}
                  onValueChange={setRememberMe}
                  disabled={submitting}
                  accessibilityLabel="Manter conectado"
                  accessibilityHint={`Mantém sua sessão neste aparelho por ${policy.session.rememberMeDays} dias`}
                  trackColor={{ false: theme.colors.control.trackOff, true: theme.colors.control.trackOn }}
                  thumbColor={theme.colors.control.thumb}
                  testID="login-remember"
                />
                <AppText variant="bodySmall" tone="secondary">
                  Manter conectado
                </AppText>
              </View>
            ) : (
              <View />
            )}
            {recoveryAvailable ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Esqueci minha senha" accessibilityHint="Abre a redefinição de senha por e-mail" onPress={onForgotPassword} disabled={submitting} style={({ pressed }) => [styles.link, pressed && styles.pressed]} testID="login-forgot">
                <AppText variant="bodySmallStrong" tone="link">
                  Esqueci minha senha
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {error ? (
          <Animated.View entering={motion.rise()}>
            <ErrorBanner message={error} testID="login-error" />
          </Animated.View>
        ) : null}

        <View style={styles.submit}>
          <PrimaryButton label="Entrar" accessibilityLabel="Entrar na sua conta" loadingLabel="Entrando, aguarde" onPress={() => void handleSubmit()} loading={submitting} disabled={submitting} testID="login-submit" />
        </View>

        {biometricAvailable ? (
          <>
            <AuthDivider label="ou" />
            <AuthAltButton label={`Entrar com ${biometricLabel}`} icon={biometric?.availability.iconName ?? 'finger-print'} onPress={() => void handleBiometrics()} accessibilityHint={biometricHint} loading={biometricBusy} disabled={submitting} testID="login-biometric" />
          </>
        ) : null}
      </Surface>
    </AuthShell>
  );
}
