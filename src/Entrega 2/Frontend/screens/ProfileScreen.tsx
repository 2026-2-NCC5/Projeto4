import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { View } from 'react-native';

import { AssistantSettingsSection } from '../components/assistant/AssistantSettingsSection';
import { Card } from '../components/Card';
import { Divider, InfoRow } from '../components/InfoRow';
import { Pill } from '../components/Pill';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { StateView, messageForError, stateKindFromError } from '../components/StateView';
import { AppText, Avatar, CardSkeleton, SectionHeader, SettingRow } from '../components/ui';
import { useOptionalAssistant } from '../features/assistant/hooks/useAssistant';
import { useResource } from '../hooks/useResource';
import { useSession } from '../hooks/useSession';
import { studentService } from '../services/studentService';
import { useOptionalAppNavigation } from '../navigation/AppNavigator';
import { makeStyles, useTheme } from '../theme';
import type { StudentProfile } from '../types/api';
import { roleLabel } from '../utils/format';

export { speechLanguageLabel } from '../components/assistant/AssistantSettingsSection';

const useStyles = makeStyles((theme) => ({
  profileCard: { alignItems: 'center', marginTop: theme.spacing.md },
  chips: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.sm + 2, flexWrap: 'wrap', justifyContent: 'center' },
  logout: { marginTop: theme.spacing.xxl + 2 },
  securityLine: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: theme.spacing.sm },
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
      <ScreenHeader eyebrow="Sua conta" title="Perfil" subtitle="Dados, assistente e segurança." />

      {profile.status === 'loading' ? <CardSkeleton lines={2} /> : null}
      {profile.status === 'error' ? <StateView kind={stateKindFromError(profile.error)} message={messageForError(profile.error)} onRetry={profile.reload} /> : null}

      {profile.data ? (
        <>
          <Card style={styles.profileCard}>
            <Avatar name={profile.data.fullName} size={84} accessibilityLabel={`Avatar de ${profile.data.fullName}`} />
            <AppText variant="h2" align="center" style={{ marginTop: theme.spacing.md }}>
              {profile.data.fullName}
            </AppText>
            <AppText variant="bodySmall" tone="muted" style={{ marginTop: 2 }}>
              {profile.data.email}
            </AppText>
            <View style={styles.chips}>
              <Pill label={roleLabel(profile.data.role)} icon="✓" tone="success" />
              {profile.data.program ? <Pill label={profile.data.program} tone="info" /> : null}
            </View>
          </Card>

          <SectionHeader title="Dados acadêmicos" />
          <Card>
            <InfoRow label="Matrícula" value={profile.data.registrationNumber || 'Não informada'} />
            <Divider />
            <InfoRow label="Curso" value={profile.data.program ?? 'Não informado'} />
            <Divider />
            <InfoRow label="Papel" value={roleLabel(profile.data.role)} />
          </Card>
        </>
      ) : null}

      <AssistantSettingsSection />

      <SectionHeader title="Segurança" />
      <Card>
        {biometric?.availability?.status === 'available' ? (
          <>
            <SettingRow kind="switch" icon="finger-print-outline" label={`Entrar com ${biometric.availability.label}`} description="Uma credencial revogável fica no armazenamento seguro; sua senha nunca é guardada." value={biometric.enabled} disabled={biometricBusy} onChange={(value) => void toggleBiometrics(value)} />
            <Divider />
          </>
        ) : null}
        <AppText variant="bodyStrong">Seus dados ficam protegidos</AppText>
        <AppText variant="bodySmall" tone="muted" style={{ marginTop: theme.spacing.xs }}>
          A sessão é guardada no armazenamento seguro do dispositivo e renovada automaticamente. Os dados acadêmicos são somente leitura: este app não altera registros oficiais nem executa ações administrativas.
        </AppText>
        <SecurityLine text="Recomendações são apoio à decisão, não decisões" />
        <SecurityLine text="A identidade vem do seu login; nada é enviado além do necessário" />
        <SecurityLine text="Sua senha nunca é armazenada no dispositivo" />
      </Card>

      <SectionHeader title="Ajuda e sobre" />
      <Card>
        <SettingRow kind="link" icon="help-buoy-outline" label="Com quem falar" description="Coordenação, professores e a equipe do ASA." onPress={assistant ? askHelp : () => navigation?.openAssistant('conversation')} />
        <Divider />
        <SettingRow kind="link" icon="grid-outline" label="Serviços" description="Análises, histórico e orientações." onPress={() => navigation?.changeTab('services')} />
        <Divider />
        <SettingRow kind="info" icon="information-circle-outline" label="Versão" value="ASA Conecta 1.1.0" />
      </Card>

      <View style={styles.logout}>
        <PrimaryButton label="Sair da conta" accessibilityLabel="Sair da conta" accessibilityHint="Encerra sua sessão neste dispositivo" loadingLabel="Saindo da conta" onPress={() => void handleSignOut()} loading={signingOut} variant="danger" testID="sign-out" />
      </View>
      <AppText variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.lg, fontWeight: '400' }}>
        ASA Conecta • {user?.email ?? ''}
      </AppText>
    </Screen>
  );
}

function SecurityLine({ text }: { text: string }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.securityLine}>
      <Ionicons name="checkmark-circle" size={16} color={theme.colors.status.success} />
      <AppText variant="bodySmall" style={{ flex: 1 }}>
        {text}
      </AppText>
    </View>
  );
}

