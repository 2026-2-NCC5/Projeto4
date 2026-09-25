import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { useAuthMotion } from '../../components/auth';
import { ThemeProvider } from '../../theme';
import { ForgotPasswordScreen } from '../ForgotPasswordScreen';
import { LoginScreen } from '../LoginScreen';
import { SignUpScreen } from '../SignUpScreen';

export type AuthRoute = 'login' | 'signup' | 'forgot';

/**
 * Navegação local da área pública (login, cadastro e redefinição de senha). A sessão decide quando
 * sair daqui. As telas públicas são sempre exibidas no tema claro (fundo aurora), independentemente
 * da preferência de aparência do aluno, que volta a valer na área autenticada.
 */
export function AuthFlow({ initialRoute = 'login' }: { initialRoute?: AuthRoute }) {
  return (
    <ThemeProvider scheme="light">
      <StatusBar style="dark" />
      <AuthRouter initialRoute={initialRoute} />
    </ThemeProvider>
  );
}

function AuthRouter({ initialRoute }: { initialRoute: AuthRoute }) {
  const [route, setRoute] = useState<AuthRoute>(initialRoute);
  const motion = useAuthMotion();
  const goLogin = useCallback(() => setRoute('login'), []);
  const goSignUp = useCallback(() => setRoute('signup'), []);
  const goForgot = useCallback(() => setRoute('forgot'), []);

  let screen: React.ReactNode;
  if (route === 'signup') screen = <SignUpScreen onBack={goLogin} />;
  else if (route === 'forgot') screen = <ForgotPasswordScreen onBack={goLogin} onDone={goLogin} />;
  else screen = <LoginScreen onCreateAccount={goSignUp} onForgotPassword={goForgot} />;

  return (
    <Animated.View key={route} entering={motion.fade()} style={styles.fill}>
      {screen}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
