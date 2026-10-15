import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { View } from 'react-native';

import { AssistantSettingsSection } from '../components/assistant/AssistantSettingsSection';
import { InfoRow } from '../components/InfoRow';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateView, messageForError, stateKindFromError } from '../components/StateView';
import { AppButton, AppText, Avatar, CardSkeleton, List, SectionHeader, SettingRow } from '../components/ui';
import { useOptionalAssistant } from '../features/assistant/hooks/useAssistant';
// ---- platform (rótulo DEMONSTRAÇÃO)
import { DataModeBadge } from '../features/platform';
import { useResource } from '../hooks/useResource';
import { useSession } from '../hooks/useSession';
import { studentService } from '../services/studentService';
import { useOptionalAppNavigation } from '../navigation/AppNavigator';
import { makeStyles, useTheme } from '../theme';
import type { StudentProfile } from '../types/api';
import { roleLabel } from '../utils/format';

export { speechLanguageLabel } from '../components/assistant/AssistantSettingsSection';

const useStyles = makeStyles((theme) => ({
  identity: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg },
  identityText: { flex: 1, minWidth: 0 },
  security: { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg, gap: theme.spacing.xs },
  securityLine: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  logout: { marginTop: theme.spacing.xxxl },
}));

export function ProfileScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const { signOut, user, biometric, enableBiometrics, disableBiometrics } = useSession();
  const assistant = useOptionalAssistant();
  const navigation = useOptionalAppNavigation();
  const [signingOut, setSigningOut] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const profile = useResource<StudentProfile>(studentService.getMe, { isEmpty: () => false });

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  async function toggleBiometrics(value: boolean) {
    if (biometricBusy) return;
    setBiometricBusy(true);
    try {
      if (value) await enableBiometrics();
      else await disableBiometrics();
    } catch {
      // erros de biometria são comunicados pelo prompt do sistema; o switch volta ao estado real
    } finally {
      setBiometricBusy(false);
    }
  }

  const askHelp = () => {
    if (!assistant) return;
    assistant.openOverlay('button');
    void assistant.voice.submitText('Com quem eu falo?');
  };

  return (
    <Screen testID="profile-screen">
      <ScreenHeader title="Perfil" />
      {/* ---- platform: conta e dados de demonstração ficam sempre identificados */}
      <DataModeBadge style={{ marginTop: -theme.spacing.md, marginBottom: theme.spacing.lg }} />

      {profile.status === 'loading' ? <CardSkeleton lines={2} /> : null}
      {profile.status === 'error' ? <StateView kind={stateKindFromError(profile.error)} message={messageForError(profile.error)} onRetry={profile.reload} /> : null}

      {profile.data ? (
        <>
          <View style={styles.identity}>
            <Avatar name={profile.data.fullName} size={56} accessibilityLabel={`Avatar de ${profile.data.fullName}`} />
            <View style={styles.identityText}>
              <AppText variant="h3">{profile.data.fullName}</AppText>
              <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
                {[roleLabel(profile.data.role), profile.data.program].filter(Boolean).join(' · ')}
              </AppText>
              <AppText variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
                {profile.data.email}
              </AppText>
            </View>
          </View>

          <SectionHeader title="Dados acadêmicos" />
          <List inset="text">
            <InfoRow label="Matrícula" value={profile.data.registrationNumber || 'Não informada'} />
            <InfoRow label="Curso" value={profile.data.program ?? 'Não informado'} />
            <InfoRow label="Papel" value={roleLabel(profile.data.role)} />
          </List>
        </>
      ) : null}

      <AssistantSettingsSection />

      <SectionHeader title="Segurança" />
      <List inset="text">
        {biometric?.availability?.status === 'available' ? (
          <SettingRow kind="switch" icon="finger-print-outline" label={`Entrar com ${biometric.availability.label}`} description="Uma credencial revogável fica no armazenamento seguro; sua senha nunca é guardada." value={biometric.enabled} disabled={biometricBusy} onChange={(value) => void toggleBiometrics(value)} />
        ) : null}
        <View style={styles.security}>
          <AppText variant="bodyStrong">Seus dados ficam protegidos</AppText>
          <AppText variant="bodySmall" tone="secondary">
            A sessão é guardada no armazenamento seguro do dispositivo e renovada automaticamente. Os dados acadêmicos são somente leitura: este app não altera registros oficiais nem executa ações administrativas.
          </AppText>
          <SecurityLine text="Recomendações são apoio à decisão, não decisões" />
          <SecurityLine text="A identidade vem do seu login; nada é enviado além do necessário" />
          <SecurityLine text="Sua senha nunca é armazenada no dispositivo" />
        </View>
      </List>

      <SectionHeader title="Ajuda e sobre" />
      <List inset="icon">
        <SettingRow kind="link" icon="help-buoy-outline" label="Com quem falar" description="Coordenação, professores e a equipe do ASA." onPress={assistant ? askHelp : () => navigation?.openAssistant('conversation')} />
        <SettingRow kind="link" icon="grid-outline" label="Serviços" description="Análises, histórico e orientações." onPress={() => navigation?.changeTab('services')} />
        <SettingRow kind="info" icon="information-circle-outline" label="Versão" value="ASA Conecta 1.1.0" />
      </List>

      <View style={styles.logout}>
        <AppButton label="Sair da conta" icon="log-out-outline" size="large" fullWidth accessibilityLabel="Sair da conta" accessibilityHint="Encerra sua sessão neste dispositivo" loadingLabel="Saindo da conta" onPress={() => void handleSignOut()} loading={signingOut} variant="danger" testID="sign-out" />
      </View>
      <AppText variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.lg }}>
        ASA Conecta · {user?.email ?? ''}
      </AppText>
    </Screen>
  );
}

function SecurityLine({ text }: { text: string }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.securityLine}>
      <Ionicons name="checkmark" size={16} color={theme.colors.status.success} style={{ marginTop: 1 }} />
      <AppText variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

