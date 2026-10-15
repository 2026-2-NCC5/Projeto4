import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PrimaryButton, palette } from '../components/UI';

import {
  requestPasswordReset,
  signIn,
  signInWithFecapMicrosoft,
  signUp,
} from '../services/authService';
import {
  Course,
  fallbackCourses,
  listCourses,
} from '../services/courseService';

export type AuthRouteName = 'login' | 'signup' | 'reset';

type InstitutionalAccountType = 'student' | 'institutional' | null;

type AuthRouteConfig = {
  name: AuthRouteName;
  path: string;
  title: string;
};

type AuthScreenProps = {
  initialMode?: AuthRouteName;
  initialRoute?: AuthRouteName;
  route?: {
    params?: {
      mode?: AuthRouteName;
      screen?: AuthRouteName;
    };
  };
};

export const authRoutes: Record<AuthRouteName, AuthRouteConfig> = {
  login: {
    name: 'login',
    path: '/auth/login',
    title: 'Entrar',
  },
  signup: {
    name: 'signup',
    path: '/auth/signup',
    title: 'Criar conta',
  },
  reset: {
    name: 'reset',
    path: '/auth/reset-password',
    title: 'Recuperar senha',
  },
};

const DEFAULT_PROGRAM = 'Ciência da Computação';
const RA_LENGTH = 8;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getInitialMode(props: AuthScreenProps): AuthRouteName {
  return (
    props.route?.params?.screen ??
    props.route?.params?.mode ??
    props.initialRoute ??
    props.initialMode ??
    'login'
  );
}

function getInstitutionalAccountType(email: string): InstitutionalAccountType {
  const normalizedEmail = normalizeEmail(email);

  if (normalizedEmail.endsWith('@edu.fecap.br')) {
    return 'student';
  }

  if (normalizedEmail.endsWith('@fecap.br')) {
    return 'institutional';
  }

  return null;
}

function isValidInstitutionalEmail(email: string) {
  return getInstitutionalAccountType(email) !== null;
}

function normalizeRegistration(value: string) {
  return value.replace(/\D/g, '').slice(0, RA_LENGTH);
}

function isValidRegistration(value: string) {
  return /^\d{8}$/.test(value);
}

function getFriendlyAuthError(err: unknown) {
  const text =
    err instanceof Error
      ? err.message
      : 'Não foi possível concluir a operação.';

  const normalized = text.toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }

  if (normalized.includes('user already registered')) {
    return 'Este e-mail já possui cadastro.';
  }

  if (normalized.includes('email rate limit exceeded')) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
  }

  return text;
}

export function AuthScreen(props: AuthScreenProps) {
  const [mode, setMode] = useState<AuthRouteName>(() => getInitialMode(props));

  const [fullName, setFullName] = useState('');
  const [registration, setRegistration] = useState('');
  const [program, setProgram] = useState(fallbackCourses[0]?.name ?? DEFAULT_PROGRAM);
  const [courses, setCourses] = useState<Course[]>(fallbackCourses);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [courseDropdownOpen, setCourseDropdownOpen] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [secure, setSecure] = useState(true);

  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';

  const accountType = useMemo(
    () => getInstitutionalAccountType(email),
    [email],
  );

  useEffect(() => {
    let mounted = true;

    async function loadCourses() {
      setCoursesLoading(true);

      const { data, error: coursesError } = await listCourses();

      if (!mounted) {
        return;
      }

      if (!coursesError && data?.length) {
        setCourses(data);
        setProgram((currentProgram) => {
          if (data.some((course) => course.name === currentProgram)) {
            return currentProgram;
          }

          return data[0]?.name ?? currentProgram;
        });
      }

      setCoursesLoading(false);
    }

    loadCourses();

    return () => {
      mounted = false;
    };
  }, []);

  const canSubmit = useMemo(() => {
    if (!isValidInstitutionalEmail(email)) {
      return false;
    }

    if (isReset) {
      return true;
    }

    if (password.length < 6) {
      return false;
    }

    if (!isSignup) {
      return true;
    }

    return Boolean(
      fullName.trim() &&
        isValidRegistration(registration) &&
        program.trim() &&
        confirmPassword.length >= 6 &&
        password === confirmPassword,
    );
  }, [
    confirmPassword,
    email,
    fullName,
    isReset,
    isSignup,
    password,
    program,
    registration,
  ]);

  function clearFeedback() {
    setError(null);
    setMessage(null);
  }

  function navigate(nextMode: AuthRouteName) {
    setMode(nextMode);
    clearFeedback();
    setPassword('');
    setConfirmPassword('');

    if (nextMode === 'signup' && !program.trim()) {
      setProgram(DEFAULT_PROGRAM);
    }
  }

  async function handleMicrosoftLogin() {
    clearFeedback();
    setSsoLoading(true);

    try {
      const { error: microsoftError } = await signInWithFecapMicrosoft();

      if (microsoftError) {
        throw microsoftError;
      }
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setSsoLoading(false);
    }
  }

  async function sendPasswordReset(showAlert = false) {
    clearFeedback();

    if (!isValidInstitutionalEmail(email)) {
      const text =
        'Digite primeiro seu e-mail institucional @edu.fecap.br ou @fecap.br.';

      if (showAlert) {
        Alert.alert('Recuperar senha', text);
      } else {
        setError(text);
      }

      return;
    }

    setLoading(true);

    try {
      const { error: resetError } = await requestPasswordReset(
        normalizeEmail(email),
      );

      if (resetError) {
        throw resetError;
      }

      const text =
        'Se a conta estiver cadastrada, você receberá as instruções de recuperação.';

      if (showAlert) {
        Alert.alert('E-mail enviado', text);
      }

      setMessage(text);
      setMode('login');
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    clearFeedback();

    if (isReset) {
      await sendPasswordReset();
      return;
    }

    const institutionalType = getInstitutionalAccountType(email);

    if (!institutionalType) {
      setError(
        'Use uma conta institucional FECAP: @edu.fecap.br para estudantes ou @fecap.br para contas institucionais.',
      );
      return;
    }

    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    if (isSignup && password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    if (isSignup && !isValidRegistration(registration)) {
      setError('O RA precisa ter exatamente 8 dígitos numéricos.');
      return;
    }

    setLoading(true);

    try {
      if (isSignup) {
        const { data, error: signUpError } = await signUp({
          fullName,
          email: normalizeEmail(email),
          password,
          registrationNumber: registration,
          program,
        });

        if (signUpError) {
          throw signUpError;
        }

        if (!data.session) {
          setMessage(
            'Conta criada. Confira seu e-mail institucional para confirmar o cadastro.',
          );
          setMode('login');
        }

        return;
      }

      const { error: loginError } = await signIn(
        normalizeEmail(email),
        password,
      );

      if (loginError) {
        throw loginError;
      }
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.brandArea}>
            <View style={styles.logosRow}>
              <View style={styles.asaMark}>
                <Text style={styles.asaMarkText}>ASA</Text>
              </View>

              <View style={styles.logoDivider} />

              <View style={styles.fecapMark}>
                <Text style={styles.fecapMarkText}>FECAP</Text>
                <Text style={styles.fecapMarkSubtext}>Conecta</Text>
              </View>
            </View>

            <View style={styles.hero}>
              <View style={styles.badge}>
                <View style={styles.badgeDot} />
                <Text style={styles.badgeText}>ASA CONECTA</Text>
              </View>

              <Text style={styles.heroTitle}>
                Sua jornada acadêmica, mais clara e conectada.
              </Text>

              <Text style={styles.heroText}>
                Acompanhe sua situação acadêmica, receba recomendações
                explicáveis e encontre os próximos passos em um único ambiente.
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.modeSelector}>
              <ModeButton
                label="Entrar"
                active={mode === 'login'}
                onPress={() => navigate('login')}
              />
              <ModeButton
                label="Cadastro"
                active={mode === 'signup'}
                onPress={() => navigate('signup')}
              />
              <ModeButton
                label="Senha"
                active={mode === 'reset'}
                onPress={() => navigate('reset')}
              />
            </View>

            <Text style={styles.title}>
              {isReset
                ? 'Recuperar senha'
                : isSignup
                  ? 'Crie sua conta'
                  : 'Bem-vindo ao ASA'}
            </Text>

            <Text style={styles.subtitle}>
              {isReset
                ? 'Informe seu e-mail institucional para receber as instruções.'
                : isSignup
                  ? 'Cadastre sua conta institucional para acessar o ASA Conecta.'
                  : 'Entre com sua conta institucional FECAP.'}
            </Text>

            {!isReset ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={ssoLoading}
                  onPress={handleMicrosoftLogin}
                  style={({ pressed }) => [
                    styles.microsoftButton,
                    pressed && styles.microsoftButtonPressed,
                    ssoLoading && styles.microsoftButtonDisabled,
                  ]}
                >
                  {ssoLoading ? (
                    <ActivityIndicator size="small" color="#1F2937" />
                  ) : (
                    <MicrosoftMark />
                  )}

                  <Text style={styles.microsoftText}>
                    {isSignup
                      ? 'Cadastrar com Microsoft FECAP'
                      : 'Entrar com Microsoft FECAP'}
                  </Text>
                </Pressable>

                <AccountHint />

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>ou continue com e-mail</Text>
                  <View style={styles.dividerLine} />
                </View>
              </>
            ) : null}

            {isSignup ? (
              <>
                <Field
                  label="Nome completo"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Digite seu nome completo"
                  autoCapitalize="words"
                />

                <Field
                  label="RA"
                  value={registration}
                  onChangeText={(value) =>
                    setRegistration(normalizeRegistration(value))
                  }
                  placeholder="Ex.: 20261234"
                  keyboardType="number-pad"
                  maxLength={RA_LENGTH}
                />

                <CourseSelect
                  courses={courses}
                  loading={coursesLoading}
                  open={courseDropdownOpen}
                  selectedCourseName={program}
                  onOpenChange={setCourseDropdownOpen}
                  onSelect={setProgram}
                />
              </>
            ) : null}

            <Field
              label="E-mail institucional"
              value={email}
              onChangeText={setEmail}
              placeholder="nome@edu.fecap.br"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {email.trim().length > 0 && accountType ? (
              <View style={styles.detectedAccount}>
                <View style={styles.detectedAccountDot} />
                <Text style={styles.detectedAccountText}>
                  {accountType === 'student'
                    ? 'Conta de estudante FECAP identificada'
                    : 'Conta institucional FECAP identificada'}
                </Text>
              </View>
            ) : null}

            {!isReset ? (
              <>
                <Text style={styles.label}>Senha</Text>

                <View style={styles.passwordRow}>
                  <TextInput
                    accessibilityLabel="Senha"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Mínimo de 6 caracteres"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={secure}
                    style={[styles.input, styles.passwordInput]}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={secure ? 'Mostrar senha' : 'Ocultar senha'}
                    onPress={() => setSecure((current) => !current)}
                    style={styles.eyeButton}
                  >
                    <Text style={styles.eyeText}>
                      {secure ? 'Mostrar' : 'Ocultar'}
                    </Text>
                  </Pressable>
                </View>

                {isSignup ? (
                  <Field
                    label="Confirmar senha"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Repita sua senha"
                    secureTextEntry={secure}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                ) : (
                  <Pressable
                    onPress={() => sendPasswordReset(true)}
                    accessibilityRole="button"
                    style={styles.forgotWrap}
                  >
                    <Text style={styles.forgot}>Esqueci minha senha</Text>
                  </Pressable>
                )}
              </>
            ) : null}

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {message ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>{message}</Text>
              </View>
            ) : null}

            <View style={styles.submitWrapper}>
              <PrimaryButton
                label={
                  isReset ? 'Enviar instruções' : isSignup ? 'Criar conta' : 'Entrar'
                }
                onPress={handleSubmit}
                loading={loading}
                disabled={!canSubmit}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchText}>
                {isReset
                  ? 'Lembrou sua senha?'
                  : isSignup
                    ? 'Já possui uma conta?'
                    : 'Ainda não possui conta?'}
              </Text>

              <Pressable
                onPress={() => navigate(isSignup || isReset ? 'login' : 'signup')}
                accessibilityRole="button"
              >
                <Text style={styles.switchAction}>
                  {isSignup || isReset ? ' Entrar' : ' Criar conta'}
                </Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.disclaimer}>
            O ASA Conecta é uma ferramenta de apoio acadêmico. Recomendações e
            alertas não substituem registros, decisões ou procedimentos oficiais
            da FECAP.
          </Text>

          <Text style={styles.footer}>
            ASA - Agentes Inteligentes para o Sucesso do Estudante
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ModeButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.modeButton, active && styles.modeButtonActive]}
    >
      <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field(
  props: React.ComponentProps<typeof TextInput> & {
    label: string;
  },
) {
  const { label, style, ...inputProps } = props;

  return (
    <View>
      <Text style={styles.label}>{label}</Text>

      <TextInput
        {...inputProps}
        accessibilityLabel={label}
        placeholderTextColor="#94A3B8"
        style={[styles.input, style]}
      />
    </View>
  );
}

function CourseSelect({
  courses,
  loading,
  onOpenChange,
  onSelect,
  open,
  selectedCourseName,
}: {
  courses: Course[];
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (courseName: string) => void;
  open: boolean;
  selectedCourseName: string;
}) {
  const selectedCourse = courses.find((course) => course.name === selectedCourseName);

  function handleSelect(course: Course) {
    onSelect(course.name);
    onOpenChange(false);
  }

  return (
    <View>
      <Text style={styles.label}>Curso</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => onOpenChange(!open)}
        style={styles.selectButton}
      >
        <View style={styles.selectButtonTextWrap}>
          <Text style={styles.selectLabel} numberOfLines={1}>
            {selectedCourse?.name ?? selectedCourseName}
          </Text>
          <Text style={styles.selectMeta} numberOfLines={1}>
            {selectedCourse
              ? `${selectedCourse.code} - ${selectedCourse.total_semesters} semestres`
              : loading
                ? 'Carregando cursos...'
                : 'Selecione um curso'}
          </Text>
        </View>

        <Text style={styles.selectArrow}>{open ? 'Fechar' : 'Abrir'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.selectMenu}>
          {courses.map((course) => {
            const selected = course.name === selectedCourseName;

            return (
              <Pressable
                key={course.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => handleSelect(course)}
                style={[
                  styles.selectOption,
                  selected && styles.selectOptionActive,
                ]}
              >
                <View style={styles.selectOptionTextWrap}>
                  <Text
                    style={[
                      styles.selectOptionTitle,
                      selected && styles.selectOptionTitleActive,
                    ]}
                  >
                    {course.name}
                  </Text>

                  <Text style={styles.selectOptionMeta}>
                    {course.code} - {course.total_semesters} semestres -{' '}
                    {course.available_periods.join(', ')}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function MicrosoftMark() {
  return (
    <View style={styles.microsoftLogo}>
      <View style={styles.microsoftRow}>
        <View style={[styles.microsoftSquare, styles.microsoftRed]} />
        <View style={[styles.microsoftSquare, styles.microsoftGreen]} />
      </View>

      <View style={styles.microsoftRow}>
        <View style={[styles.microsoftSquare, styles.microsoftBlue]} />
        <View style={[styles.microsoftSquare, styles.microsoftYellow]} />
      </View>
    </View>
  );
}

function AccountHint() {
  return (
    <View style={styles.accountHint}>
      <View style={styles.accountHintItem}>
        <View style={[styles.accountDot, styles.studentDot]} />

        <View style={styles.accountHintContent}>
          <Text style={styles.accountHintTitle}>Estudantes</Text>
          <Text style={styles.accountHintText}>@edu.fecap.br</Text>
        </View>
      </View>

      <View style={styles.accountHintDivider} />

      <View style={styles.accountHintItem}>
        <View style={[styles.accountDot, styles.staffDot]} />

        <View style={styles.accountHintContent}>
          <Text style={styles.accountHintTitle}>Institucional</Text>
          <Text style={styles.accountHintText}>@fecap.br</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 64 : 42,
    paddingBottom: 40,
  },

  container: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },

  brandArea: {
    marginBottom: 26,
  },

  logosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  asaMark: {
    minWidth: 96,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: palette.navy,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  asaMarkText: {
    color: palette.white,
    fontSize: 22,
    fontWeight: '900',
  },

  fecapMark: {
    minWidth: 110,
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE3EA',
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  fecapMarkText: {
    color: palette.navy,
    fontSize: 17,
    fontWeight: '900',
  },

  fecapMarkSubtext: {
    color: palette.tealDark,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 1,
  },

  logoDivider: {
    width: 1,
    height: 34,
    backgroundColor: '#DCE3EA',
    marginHorizontal: 10,
  },

  hero: {
    alignItems: 'center',
    marginTop: 26,
  },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F8F5',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },

  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: palette.teal,
    marginRight: 7,
  },

  badgeText: {
    color: palette.tealDark,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },

  heroTitle: {
    color: palette.navy,
    fontSize: 28,
    lineHeight: 35,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 16,
    maxWidth: 410,
  },

  heroText: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 390,
  },

  card: {
    backgroundColor: palette.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E6EBF0',
    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 2,
  },

  modeSelector: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    padding: 4,
    borderRadius: 14,
    marginBottom: 24,
  },

  modeButton: {
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 11,
    paddingHorizontal: 4,
  },

  modeButtonActive: {
    backgroundColor: palette.white,
    shadowColor: '#0F172A',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.06,
    shadowRadius: 7,
    elevation: 1,
  },

  modeButtonText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },

  modeButtonTextActive: {
    color: palette.navy,
    fontWeight: '900',
  },

  title: {
    color: palette.text,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '900',
  },

  subtitle: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 20,
  },

  microsoftButton: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D7DEE6',
    backgroundColor: palette.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  microsoftButtonPressed: {
    backgroundColor: '#F8FAFC',
    transform: [{ scale: 0.995 }],
  },

  microsoftButtonDisabled: {
    opacity: 0.65,
  },

  microsoftLogo: {
    width: 21,
    height: 21,
    marginRight: 11,
    justifyContent: 'space-between',
  },

  microsoftRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  microsoftSquare: {
    width: 9.5,
    height: 9.5,
  },

  microsoftRed: {
    backgroundColor: '#F25022',
  },

  microsoftGreen: {
    backgroundColor: '#7FBA00',
  },

  microsoftBlue: {
    backgroundColor: '#00A4EF',
  },

  microsoftYellow: {
    backgroundColor: '#FFB900',
  },

  microsoftText: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '800',
  },

  accountHint: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
  },

  accountHintItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
  },

  accountHintDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 8,
  },

  accountHintContent: {
    marginLeft: 8,
  },

  accountDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  studentDot: {
    backgroundColor: palette.teal,
  },

  staffDot: {
    backgroundColor: palette.navy,
  },

  accountHintTitle: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '800',
  },

  accountHintText: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 1,
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 22,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5EAF0',
  },

  dividerText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 12,
  },

  label: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 7,
    marginTop: 14,
  },

  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#DCE3EA',
    borderRadius: 14,
    paddingHorizontal: 15,
    color: '#0F172A',
    backgroundColor: palette.white,
    fontSize: 15,
  },

  selectButton: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: '#DCE3EA',
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: palette.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  selectButtonTextWrap: {
    flex: 1,
    paddingRight: 12,
  },

  selectLabel: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },

  selectMeta: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },

  selectArrow: {
    color: palette.tealDark,
    fontSize: 11,
    fontWeight: '900',
  },

  selectMenu: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#DCE3EA',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: palette.white,
  },

  selectOption: {
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
    justifyContent: 'center',
  },

  selectOptionActive: {
    backgroundColor: '#E8F8F5',
  },

  selectOptionTextWrap: {
    flex: 1,
  },

  selectOptionTitle: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '800',
  },

  selectOptionTitleActive: {
    color: palette.tealDark,
  },

  selectOptionMeta: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },

  passwordRow: {
    position: 'relative',
  },

  passwordInput: {
    paddingRight: 90,
  },

  eyeButton: {
    position: 'absolute',
    right: 8,
    top: 7,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },

  eyeText: {
    color: palette.tealDark,
    fontSize: 11,
    fontWeight: '900',
  },

  detectedAccount: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },

  detectedAccountDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
    marginRight: 6,
  },

  detectedAccountText: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '700',
  },

  forgotWrap: {
    alignSelf: 'flex-end',
    paddingVertical: 13,
  },

  forgot: {
    color: palette.tealDark,
    fontWeight: '800',
    fontSize: 13,
  },

  submitWrapper: {
    marginTop: 8,
  },

  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 20,
  },

  switchText: {
    color: '#64748B',
    fontSize: 14,
  },

  switchAction: {
    color: palette.tealDark,
    fontSize: 14,
    fontWeight: '900',
  },

  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginVertical: 12,
  },

  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },

  successBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 12,
    marginVertical: 12,
  },

  successText: {
    color: '#15803D',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },

  disclaimer: {
    color: '#7C8A9A',
    textAlign: 'center',
    lineHeight: 17,
    fontSize: 10.5,
    marginTop: 22,
    paddingHorizontal: 14,
  },

  footer: {
    color: '#A0AABA',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 12,
  },
});
