import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Session } from '@supabase/supabase-js';

import { supabase } from './utils/supabase';

import { AuthScreen } from './src/screens/AuthScreens';
import { HomeScreen } from './src/screens/HomeScreen';
import { AcademicScreen } from './src/screens/AcademicScreen';
import { AssistantScreen } from './src/screens/AssistantScreen';
import { RecommendationsScreen } from './src/screens/RecommendationsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';

import { BottomNav } from './src/components/BottomNav';
import { palette } from './src/components/UI';

import { TabKey } from './src/types';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('home');

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (mounted) {
        setSession(data.session);
        setBooting(false);
      }
    };

    loadSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);

        if (!nextSession) {
          setActiveTab('home');
        }
      },
    );

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  if (booting) {
    return (
      <View style={styles.splash}>
        <StatusBar
          style="dark"
          backgroundColor={palette.background}
        />

        <View style={styles.splashLogo}>
          <Text style={styles.splashLogoText}>A</Text>
        </View>

        <Text style={styles.splashTitle}>
          ASA Conecta
        </Text>

        <Text style={styles.splashSubtitle}>
          Preparando sua jornada acadêmica
        </Text>

        <ActivityIndicator
          color={palette.teal}
          style={styles.loader}
        />
      </View>
    );
  }

  if (!session?.user) {
    return (
      <View style={styles.app}>
        <StatusBar
          style="dark"
          backgroundColor={palette.background}
        />

        <AuthScreen />
      </View>
    );
  }

  return (
    <View style={styles.app}>
      <StatusBar
        style="dark"
        backgroundColor={palette.background}
      />

      {activeTab === 'home' && (
        <HomeScreen
          user={session.user}
          onNavigate={setActiveTab}
        />
      )}

      {activeTab === 'academic' && (
        <AcademicScreen />
      )}

      {activeTab === 'assistant' && (
        <AssistantScreen user={session.user} />
      )}

      {activeTab === 'recommendations' && (
        <RecommendationsScreen />
      )}

      {activeTab === 'profile' && (
        <ProfileScreen user={session.user} />
      )}

      <BottomNav
        active={activeTab}
        onChange={setActiveTab}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: palette.background,
  },

  splash: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  splashLogo: {
    width: 76,
    height: 76,
    borderRadius: 25,
    backgroundColor: palette.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },

  splashLogoText: {
    color: palette.white,
    fontSize: 38,
    fontWeight: '900',
  },

  splashTitle: {
    color: palette.navy,
    fontSize: 27,
    fontWeight: '900',
    marginTop: 18,
  },

  splashSubtitle: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 6,
  },

  loader: {
    marginTop: 24,
  },
});