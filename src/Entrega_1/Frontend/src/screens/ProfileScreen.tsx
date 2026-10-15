import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { User } from '@supabase/supabase-js';
import { Card, Pill, PrimaryButton, Screen, SectionTitle, palette } from '../components/UI';
import { signOut } from '../services/authService';

export function ProfileScreen({ user }: { user: User }) {
  const [loading, setLoading] = useState(false);
  const fullName = String(user.user_metadata?.full_name || 'Estudante ASA');
  const registration = String(user.user_metadata?.registration_number || 'Não informado');
  const program = String(user.user_metadata?.program || 'Ciência da Computação');

  async function handleSignOut() {
    setLoading(true);
    const { error } = await signOut();
    setLoading(false);
    if (error) Alert.alert('Erro ao sair', error.message);
  }

  return (
    <Screen>
      <Text style={styles.title}>Perfil</Text>
      <Text style={styles.subtitle}>Sua conta no ASA Conecta.</Text>

      <Card style={styles.profileCard}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{fullName.slice(0, 1).toUpperCase()}</Text></View>
        <Text style={styles.name}>{fullName}</Text>
        <Text style={styles.email}>{user.email}</Text>
        <Pill label="Estudante" tone="success" />
      </Card>

      <SectionTitle title="Dados acadêmicos" />
      <Card>
        <InfoRow label="Matrícula" value={registration} />
        <View style={styles.separator} />
        <InfoRow label="Curso" value={program} />
        <View style={styles.separator} />
        <InfoRow label="Ambiente" value="Demonstração acadêmica" />
      </Card>

      <SectionTitle title="Segurança e privacidade" />
      <Card>
        <Text style={styles.infoTitle}>Sessão protegida pelo Supabase Auth</Text>
        <Text style={styles.infoText}>A sessão é persistida no dispositivo usando AsyncStorage e renovada automaticamente pelo cliente Supabase.</Text>
        <View style={styles.securityLine}><Text style={styles.securityIcon}>✓</Text><Text style={styles.securityText}>Login e cadastro reais</Text></View>
        <View style={styles.securityLine}><Text style={styles.securityIcon}>✓</Text><Text style={styles.securityText}>Dados acadêmicos do protótipo são fictícios</Text></View>
        <View style={styles.securityLine}><Text style={styles.securityIcon}>✓</Text><Text style={styles.securityText}>Assistente não altera registros oficiais</Text></View>
      </Card>

      <View style={styles.logout}><PrimaryButton label="Sair da conta" onPress={handleSignOut} loading={loading} variant="danger" /></View>
      <Text style={styles.version}>ASA Conecta • MVP 1.0.0 • Expo</Text>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: palette.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: palette.muted, fontSize: 14, marginTop: 4 },
  profileCard: { alignItems: 'center', marginTop: 20 },
  avatar: { width: 78, height: 78, borderRadius: 26, backgroundColor: palette.navy, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: palette.teal, fontSize: 32, fontWeight: '900' },
  name: { color: palette.text, fontSize: 20, fontWeight: '900' },
  email: { color: palette.muted, fontSize: 12, marginTop: 4, marginBottom: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowLabel: { color: palette.muted, fontSize: 12 },
  rowValue: { color: palette.text, fontSize: 12, fontWeight: '800', flex: 1, textAlign: 'right' },
  separator: { height: 1, backgroundColor: palette.line, marginVertical: 14 },
  infoTitle: { color: palette.text, fontSize: 14, fontWeight: '900' },
  infoText: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 13 },
  securityLine: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 8 },
  securityIcon: { color: palette.success, fontSize: 14, fontWeight: '900' },
  securityText: { color: palette.text, fontSize: 12, flex: 1 },
  logout: { marginTop: 26 },
  version: { color: '#95A3AC', textAlign: 'center', fontSize: 10, marginTop: 16 },
});
