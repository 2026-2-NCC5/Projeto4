import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import AsaLogo from './assets/branding/Asa_Logo.svg';
import { BottomNav } from './components/BottomNav';
import { AssistantOverlay } from './components/assistant/AssistantOverlay';
import { HeyAsaOnboarding } from './components/assistant/HeyAsaOnboarding';
import { MicrophoneIndicator } from './components/assistant/MicrophoneIndicator';
import { AppText } from './components/ui/AppText';
import { AssistantProvider, useAssistant } from './features/assistant/hooks/useAssistant';
import { PreferencesProvider, usePreferences } from './hooks/usePreferences';
import { SessionProvider, useSession } from './hooks/useSession';
import { NavigationProvider, useAppNavigation } from './navigation/AppNavigator';
import { AcademicScreen } from './screens/AcademicScreen';
import { AssistantScreen } from './screens/AssistantScreen';
import { AuthFlow } from './screens/auth/AuthFlow';
import { HistoryScreen } from './screens/HistoryScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { RecommendationDetailScreen } from './screens/RecommendationDetailScreen';
import { RunDetailScreen } from './screens/RunDetailScreen';
import { ServicesScreen } from './screens/ServicesScreen';
// ---- support (Atendimento)
import { isSupportRoute } from './navigation/navigationReducer';
import { SupportPushRouter } from './screens/support/SupportPushRouter';
import { SupportRouter } from './screens/support/SupportRouter';
// ---- queue (Fila presencial do ASA)
import { QueueAlertLayer, QueueProvider, QueueScreen } from './features/queue';
// ---- appointments (Agendamentos com o ASA) · notifications (Central de avisos)
import { isAppointmentRoute } from './navigation';
import { AppointmentsRouter } from './screens/appointments/AppointmentsRouter';
import { NotificationsPushRouter } from './screens/NotificationsPushRouter';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { setPreferredVoice } from './services/voice/speechSynthesis';
import { ThemeProvider, useTheme } from './theme';
import { MESSAGES } from './utils/messages';

export default function App() {
  return (
    <SafeAreaProvider>
      <PreferencesProvider>
        <ThemeProvider>
          <SessionProvider>
            <AppShell />
          </SessionProvider>
        </ThemeProvider>
      </PreferencesProvider>
    </SafeAreaProvider>
  );
}

/** Orquestra booting → login → área autenticada. Telas protegidas nunca renderizam sem sessão válida. */
export function AppShell() {
  const { status } = useSession();
  const theme = useTheme();

  return (
    <View style={[styles.app, { backgroundColor: theme.colors.background.primary }]}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      {status === 'booting' ? <Splash /> : null}
      {status === 'unauthenticated' ? <AuthFlow /> : null}
      {status === 'authenticated' ? <AuthenticatedArea /> : null}
    </View>
  );
}

function Splash() {
  const theme = useTheme();
  return (
    <View style={[styles.splash, { backgroundColor: theme.colors.background.primary }]} testID="splash" accessibilityLiveRegion="polite">
      <View style={[styles.logo, { backgroundColor: theme.colors.brand.secondary, borderRadius: theme.radius.lg }]}>
        <AsaLogo width={96} height={38} />
      </View>
      <AppText variant="h3" style={{ marginTop: theme.spacing.xl }}>
        ASA Conecta
      </AppText>
      <AppText variant="bodySmall" tone="secondary" style={{ marginTop: theme.spacing.xxs }}>
        Preparando sua jornada acadêmica
      </AppText>
      <ActivityIndicator color={theme.colors.brand.primaryStrong} style={styles.loader} accessibilityLabel={MESSAGES.loadingSession} />
    </View>
  );
}

function AuthenticatedArea() {
  return (
    <NavigationProvider>
      <AuthenticatedAssistant />
    </NavigationProvider>
  );
}

function AuthenticatedAssistant() {
  const navigation = useAppNavigation();
  const { preferences } = usePreferences();

  // Voz preferida do TTS (Perfil → Assistente ASA → Voz).
  useEffect(() => {
    setPreferredVoice(preferences.ttsVoiceId);
  }, [preferences.ttsVoiceId]);

  return (
    // A conversa com o assistente sobrevive à troca de abas e é descartada no logout (desmontagem).
    <AssistantProvider onGoBack={navigation.goHome}>
      {/* ---- queue (Fila presencial do ASA): dentro do assistente para falar pelo mesmo TTS */}
      <QueueProvider onOpenQueue={navigation.openQueue}>
        <AppContent />
      </QueueProvider>
    </AssistantProvider>
  );
}

function AppContent() {
  const navigation = useAppNavigation();
  const assistant = useAssistant();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { tab, detail, focusSubjectId, academicSegment, assistantMode } = navigation;

  let content: React.ReactNode;
  if (detail?.screen === 'recommendation') {
    content = <RecommendationDetailScreen id={detail.id} onBack={navigation.goBack} onViewSubject={navigation.viewSubject} />;
  } else if (detail?.screen === 'run') {
    content = <RunDetailScreen runId={detail.runId} onBack={navigation.goBack} onViewSubject={navigation.viewSubject} onOpenRecommendation={navigation.openRecommendation} />;
  } else if (detail?.screen === 'history') {
    content = <HistoryScreen onOpenRun={navigation.openRun} onBack={navigation.goBack} />;
  } else if (isSupportRoute(detail)) {
    // ---- support (Atendimento): hub, "Meus chamados", abertura e detalhe do chamado
    content = <SupportRouter route={detail} />;
  } else if (detail?.screen === 'queue') {
    // ---- queue (Fila presencial do ASA)
    content = <QueueScreen onBack={navigation.goBack} />;
  } else if (isAppointmentRoute(detail)) {
    // ---- appointments (Agendamentos com o ASA): "Meus agendamentos", agendar/remarcar e detalhe
    content = <AppointmentsRouter route={detail} />;
  } else if (detail?.screen === 'notifications') {
    // ---- notifications (Central de avisos)
    content = <NotificationsScreen />;
  } else {
    switch (tab) {
      case 'home':
        content = <HomeScreen onNavigate={navigation.changeTab} />;
        break;
      case 'academic':
        content = <AcademicScreen focusSubjectId={focusSubjectId} onClearFocus={navigation.clearFocus} initialSegment={academicSegment} />;
        break;
      case 'assistant':
        content = (
          <AssistantScreen
            onViewSubject={navigation.viewSubject}
            onOpenRecommendation={navigation.openRecommendation}
            onNavigate={(target, params) => void navigation.navigateTo(target, params)}
            mode={assistantMode}
            onModeChange={navigation.setAssistantMode}
          />
        );
        break;
      case 'services':
        content = <ServicesScreen />;
        break;
      case 'profile':
        content = <ProfileScreen />;
        break;
      default:
        content = <HomeScreen onNavigate={navigation.changeTab} />;
    }
  }

  return (
    <View style={[styles.app, { backgroundColor: theme.colors.background.primary }]} testID="authenticated-area">
      {content}
      <View style={[styles.indicator, { top: insets.top + 6, pointerEvents: 'box-none' }]}>
        <MicrophoneIndicator state={assistant.state} wakeWordStatus={assistant.wakeWord.status} onPress={() => assistant.openOverlay('indicator')} />
      </View>
      <BottomNav active={tab} onChange={navigation.changeTab} onAssistantLongPress={() => void assistant.activate('gesture')} />
      <AssistantOverlay />
      {/* ---- queue (Fila presencial do ASA): aviso de proximidade e "É a sua vez!" sobre qualquer tela */}
      <QueueAlertLayer />
      {/* ---- support (Atendimento): toque em notificação de chamado abre o detalhe */}
      <SupportPushRouter />
      {/* ---- notifications (Central de avisos): toque em push de agendamento/aviso abre o registro */}
      <NotificationsPushRouter />
      <HeyAsaOnboarding visible={assistant.onboardingVisible} onComplete={(accept) => void assistant.completeOnboarding(accept)} voiceUnavailableReason={assistant.wakeWord.availability?.available === false ? assistant.wakeWord.availability.reason ?? 'not_supported' : null} />
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { paddingHorizontal: 20, paddingVertical: 14 },
  loader: { marginTop: 24 },
  indicator: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 150 },
});
