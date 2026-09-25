import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Switch, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AuthLinkRow, AuthSection, AuthShell, AuthTextField, PasswordRequirements, useAuthMotion } from '../components/auth';
import { ErrorBanner } from '../components/ErrorBanner';
import { PrimaryButton } from '../components/PrimaryButton';
import { AppText, PressableScale, Surface } from '../components/ui';
import { useAuthPolicy } from '../hooks/useAuthPolicy';
import { useSession } from '../hooks/useSession';
import { normalizeAuthError } from '../services/authErrors';
import { authService } from '../services/authService';
import { makeStyles, useTheme } from '../theme';
import type { AuthPolicy, ProgramOption } from '../types/api';
import { AUTH_VALIDATION_MESSAGES, evaluatePassword, isAllowedEmailDomain, validateEmail, validateFullName, validatePasswordConfirmation, validateRegistrationNumber } from '../utils/authValidation';

export interface SignUpFields {
  fullName: string;
  email: string;
  registrationNumber: string;
  password: string;
  confirmPassword: string;
}

export type SignUpFieldErrors = Partial<Record<keyof SignUpFields, string>>;

/** Validação local (somente UX). A API revalida tudo e continua sendo a fonte de verdade. */
export function validateSignUpFields(fields: SignUpFields, policy: AuthPolicy): SignUpFieldErrors {
  const errors: SignUpFieldErrors = {};
  const fullName = validateFullName(fields.fullName);
  if (fullName) errors.fullName = fullName;
  const email = validateEmail(fields.email);
  if (email) errors.email = email;
  else if (!isAllowedEmailDomain(fields.email, policy.allowedEmailDomains)) errors.email = AUTH_VALIDATION_MESSAGES.emailDomainNotAllowed(policy.allowedEmailDomains);
  const registration = validateRegistrationNumber(fields.registrationNumber, policy.registrationNumber.pattern, policy.registrationNumber.example);
  if (registration) errors.registrationNumber = registration;
  const password = evaluatePassword(fields.password, policy.password);
  if (!fields.password) errors.password = AUTH_VALIDATION_MESSAGES.passwordRequired;
  else if (password.tooLong) errors.password = AUTH_VALIDATION_MESSAGES.passwordTooLong(policy.password.maxLength);
  else if (!password.valid) errors.password = 'A senha ainda não atende a todos os requisitos.';
  const confirmation = validatePasswordConfirmation(fields.password, fields.confirmPassword);
  if (confirmation) errors.confirmPassword = confirmation;
  return errors;
}

interface SignUpScreenProps {
  onBack: () => void;
}

const EMPTY_FIELDS: SignUpFields = { fullName: '', email: '', registrationNumber: '', password: '', confirmPassword: '' };

const useStyles = makeStyles((theme) => ({
  card: { padding: theme.spacing.xl },
  programs: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  programChip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, borderWidth: 1.5, borderColor: theme.colors.border.default, backgroundColor: theme.colors.surface.glass },
  programChipSelected: { borderColor: theme.colors.aurora.focus, backgroundColor: theme.colors.brand.accentSoft },
  remember: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.md, minHeight: theme.minTouchTarget },
  submit: { marginTop: theme.spacing.xl },
  legalRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: theme.spacing.xxs, marginTop: theme.spacing.md },
  pressed: { opacity: 0.7 },
}));

/**
 * Cadastro de estudante em blocos nomeados (dados, curso, senha, sessão): fundo aurora, campos com
 * foco roxo, requisitos de senha dinâmicos vindos da política pública da API e curso opcional.
 * Ao concluir, a sessão é criada pela própria API (o AppShell troca para a área autenticada).
 */
export function SignUpScreen({ onBack }: SignUpScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const motion = useAuthMotion();
  const { register, canRememberSession } = useSession();
  const { policy } = useAuthPolicy();
  const [fields, setFields] = useState<SignUpFields>(EMPTY_FIELDS);
  const [programCode, setProgramCode] = useState<string | null>(null);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  // Desligado por padrão (mesma regra do login): manter a sessão é uma escolha explícita do aluno.
  const [rememberMe, setRememberMe] = useState(false);
  const [touched, setTouched] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<SignUpFieldErrors>({});

  useEffect(() => {
    let active = true;
    authService
      .getPrograms()
      .then((list) => {
        if (active) setPrograms(list);
      })
      .catch(() => undefined); // curso é opcional: sem lista, o bloco simplesmente não aparece
    return () => {
      active = false;
    };
  }, []);

  const localErrors = useMemo(() => validateSignUpFields(fields, policy), [fields, policy]);
  const errors: SignUpFieldErrors = useMemo(() => ({ ...(touched ? localErrors : {}), ...serverErrors }), [touched, localErrors, serverErrors]);
  const rememberAvailable = canRememberSession !== false;
  const registrationIsNumeric = /^\^?\\d/.test(policy.registrationNumber.pattern);

  const update = useCallback(
    (key: keyof SignUpFields) => (value: string) => {
      setFields((current) => ({ ...current, [key]: value }));
      setServerErrors((current) => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
      setError(null);
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setTouched(true);
    setError(null);
    setServerErrors({});
    if (Object.keys(localErrors).length > 0) return;
    setSubmitting(true);
    try {
      await register({
        fullName: fields.fullName,
        email: fields.email,
        password: fields.password,
        registrationNumber: fields.registrationNumber,
        programCode,
        rememberMe: rememberAvailable && rememberMe,
      });
    } catch (caught) {
      const normalized = normalizeAuthError(caught);
      const mapped: SignUpFieldErrors = {};
      for (const [field, message] of Object.entries(normalized.fieldErrors ?? {})) {
        if (field === 'fullName' || field === 'email' || field === 'registrationNumber' || field === 'password') mapped[field] = message;
      }
      setServerErrors(mapped);
      if (normalized.code === 'UNKNOWN_PROGRAM') setProgramCode(null);
      setError(normalized.message);
      setSubmitting(false);
    }
  }, [submitting, localErrors, register, fields, programCode, rememberAvailable, rememberMe]);

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => undefined);
  };

  const domainsHint = policy.allowedEmailDomains.length > 0 ? `Aceitos: ${policy.allowedEmailDomains.map((domain) => `@${domain}`).join(', ')}` : undefined;
  const passwordHint = `Mínimo de ${policy.password.minLength} caracteres, com letras, números e símbolos.`;

  return (
    <AuthShell eyebrow="Cadastro" title="Criar conta" subtitle="Use seu e-mail institucional e seu RA. Leva menos de um minuto." onBack={onBack} backLabel="Entrar" footer={<AuthLinkRow text="Já tem conta?" linkLabel="Entrar" icon="log-in-outline" onPress={onBack} accessibilityLabel="Já tenho conta, entrar" testID="signup-go-login" />} testID="signup-screen">
      <Surface tone="glass" elevation="md" style={styles.card}>
        <AuthSection title="Seus dados" description="Como estão registrados na sua matrícula." first />
        <AuthTextField label="Nome completo" icon="person-outline" value={fields.fullName} onChangeText={update('fullName')} placeholder="Como está na matrícula" autoCapitalize="words" autoComplete="name" textContentType="name" editable={!submitting} returnKeyType="next" error={errors.fullName} testID="signup-name" />
        <AuthTextField label="E-mail institucional" icon="mail-outline" value={fields.email} onChangeText={update('email')} placeholder="nome@edu.fecap.br" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" editable={!submitting} returnKeyType="next" error={errors.email} hint={domainsHint} testID="signup-email" />
        <AuthTextField label="RA (matrícula)" icon="id-card-outline" value={fields.registrationNumber} onChangeText={update('registrationNumber')} placeholder={policy.registrationNumber.example} keyboardType={registrationIsNumeric ? 'number-pad' : 'default'} autoCapitalize="characters" autoCorrect={false} editable={!submitting} returnKeyType="next" error={errors.registrationNumber} hint={`Ex.: ${policy.registrationNumber.example}`} testID="signup-registration" />

        {programs.length > 0 ? (
          <Animated.View entering={motion.fade()} layout={motion.layout}>
            <AuthSection title="Curso" description="Opcional. Ajuda o ASA a contextualizar as recomendações." />
            <View style={styles.programs} accessibilityRole="radiogroup">
              {programs.map((program) => {
                const selected = program.code === programCode;
                return (
                  <PressableScale key={program.code} accessibilityRole="radio" accessibilityState={{ selected, checked: selected }} accessibilityLabel={program.name} onPress={() => setProgramCode(selected ? null : program.code)} disabled={submitting} style={[styles.programChip, selected && styles.programChipSelected]} testID={`signup-program-${program.code}`}>
                    <AppText variant="bodySmallStrong" tone={selected ? 'accent' : 'secondary'}>
                      {program.name}
                    </AppText>
                  </PressableScale>
                );
              })}
            </View>
          </Animated.View>
        ) : null}

        <AuthSection title="Senha de acesso" description={passwordHint} />
        <AuthTextField
          label="Senha"
          icon="lock-closed-outline"
          value={fields.password}
          onChangeText={update('password')}
          placeholder="Crie uma senha forte"
          secureToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          editable={!submitting}
          returnKeyType="next"
          onFocus={() => setPasswordFocused(true)}
          onBlur={() => setPasswordFocused(false)}
          error={errors.password}
          testID="signup-password"
        />
        {passwordFocused || fields.password ? <PasswordRequirements password={fields.password} policy={policy.password} /> : null}
        <AuthTextField label="Confirmar senha" icon="shield-checkmark-outline" value={fields.confirmPassword} onChangeText={update('confirmPassword')} placeholder="Repita a senha" secureToggle autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" editable={!submitting} returnKeyType="done" onSubmitEditing={() => void handleSubmit()} error={errors.confirmPassword} testID="signup-confirm" />

        {rememberAvailable ? (
          <>
            <AuthSection title="Sessão" />
            <View style={styles.remember}>
              <Switch value={rememberMe} onValueChange={setRememberMe} disabled={submitting} accessibilityLabel="Manter conectado" accessibilityHint={`Mantém sua sessão neste aparelho por ${policy.session.rememberMeDays} dias`} trackColor={{ false: theme.colors.control.trackOff, true: theme.colors.control.trackOn }} thumbColor={theme.colors.control.thumb} testID="signup-remember" />
              <AppText variant="bodySmall" tone="secondary">
                Manter conectado neste aparelho
              </AppText>
            </View>
          </>
        ) : null}

        {error ? (
          <Animated.View entering={motion.rise()}>
            <ErrorBanner message={error} testID="signup-error" />
          </Animated.View>
        ) : null}

        <View style={styles.submit}>
          <PrimaryButton label="Criar conta" accessibilityLabel="Criar minha conta" loadingLabel="Criando sua conta, aguarde" onPress={() => void handleSubmit()} loading={submitting} disabled={submitting} testID="signup-submit" />
        </View>

        {policy.legal.termsUrl || policy.legal.privacyUrl ? (
          <View style={styles.legalRow}>
            <AppText variant="caption" tone="muted" style={{ fontWeight: '400' }}>
              Ao criar a conta você concorda com
            </AppText>
            {policy.legal.termsUrl ? (
              <Pressable accessibilityRole="link" accessibilityLabel="Termos de uso" onPress={() => openUrl(policy.legal.termsUrl as string)} style={({ pressed }) => [pressed && styles.pressed]}>
                <AppText variant="caption" tone="link">
                  os Termos de uso
                </AppText>
              </Pressable>
            ) : null}
            {policy.legal.termsUrl && policy.legal.privacyUrl ? (
              <AppText variant="caption" tone="muted" style={{ fontWeight: '400' }}>
                e
              </AppText>
            ) : null}
            {policy.legal.privacyUrl ? (
              <Pressable accessibilityRole="link" accessibilityLabel="Política de privacidade" onPress={() => openUrl(policy.legal.privacyUrl as string)} style={({ pressed }) => [pressed && styles.pressed]}>
                <AppText variant="caption" tone="link">
                  a Política de privacidade
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Surface>
    </AuthShell>
  );
}
