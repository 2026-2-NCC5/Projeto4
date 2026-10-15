import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import React, { useEffect, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VOICE, WAKE_WORD } from '../../config/services';
import { useOptionalAssistant } from '../../features/assistant/hooks/useAssistant';
import { usePreferences } from '../../hooks/usePreferences';
import { makeStyles, useTheme } from '../../theme';
import { MESSAGES } from '../../utils/messages';
import { List } from '../ui/ListItem';
import { SectionHeader } from '../ui/SectionHeader';
import { SettingRow } from '../ui/SettingRow';
import { AppText } from '../ui/AppText';
import { AppButton } from '../ui/AppButton';

/** Nome legível do idioma configurado para voz. */
export function speechLanguageLabel(language: string): string {
  switch (language.toLowerCase()) {
    case 'pt-br':
      return 'Português (Brasil)';
    case 'pt-pt':
      return 'Português (Portugal)';
    case 'en-us':
      return 'Inglês (Estados Unidos)';
    case 'es-es':
      return 'Espanhol (Espanha)';
    default:
      return language;
  }
}

const useStyles = makeStyles((theme) => ({
  privacy: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start', marginTop: theme.spacing.md, paddingHorizontal: theme.spacing.xxs },
  privacyText: { flex: 1, gap: 2 },
  backdrop: { flex: 1, backgroundColor: theme.colors.background.backdrop, justifyContent: 'flex-end' },
  sheet: { width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: theme.colors.background.elevated, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, padding: theme.spacing.xl, maxHeight: '70%' },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.border.strong, marginBottom: theme.spacing.lg, marginTop: -theme.spacing.sm },
  voiceRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border.subtle },
}));

function permissionLabel(state: 'granted' | 'denied' | 'undetermined' | null): string {
  if (state === 'granted') return 'Permitido';
  if (state === 'denied') return 'Negado';
  if (state === 'undetermined') return 'Ainda não solicitado';
  return 'Verificando...';
}

function openSystemSettings(): void {
  Linking.openSettings().catch(() => undefined);
}

/** Perfil → "Assistente ASA": Hey Asa, resposta falada, feedback tátil, animações, histórico, voz, privacidade e permissões. */
export function AssistantSettingsSection() {
  const theme = useTheme();
  const styles = useStyles();
  const assistant = useOptionalAssistant();
  const { preferences, updatePreferences } = usePreferences();
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);

  const wake = assistant?.wakeWord;
  const wakeSupported = Boolean(wake?.supported && WAKE_WORD.FEATURE_ENABLED);
  const wakeUnavailableReason = wake?.availability?.available === false ? wake.availability.reason : null;
  const micDenied = assistant?.microphonePermission === 'denied';
  const micCapturing = assistant ? assistant.state === 'listening' || assistant.state === 'interrupted' || wake?.status === 'listening' : false;

  let wakeDescription = 'Diga “Hey Asa” com o app aberto para conversar. O microfone é usado apenas em primeiro plano e um indicador fica visível.';
  if (!assistant || !wakeSupported) wakeDescription = 'Indisponível neste aplicativo. Use o botão do assistente ou digite sua pergunta.';
  else if (wakeUnavailableReason === 'expo_go') wakeDescription = `${MESSAGES.voiceUnavailableExpoGo} Até lá, use o botão do assistente.`;
  else if (wakeUnavailableReason) wakeDescription = 'O serviço de voz do sistema não está disponível neste aparelho.';
  else if (micDenied) wakeDescription = 'Permissão do microfone negada. Libere nas configurações do sistema para usar o “Hey Asa”.';
  else if (wake?.status === 'error') wakeDescription = 'A detecção falhou várias vezes seguidas e foi pausada. Desligue e ligue de novo para tentar novamente.';

  const toggleWake = async (value: boolean) => {
    if (!assistant) return;
    if (!value) {
      assistant.disableWakeWord();
      return;
    }
    await assistant.enableWakeWord();
  };

  return (
    <>
      <SectionHeader title="Assistente ASA" subtitle="Voz, privacidade e permissões" />
      <List inset="icon" testID="voice-preferences">
        <SettingRow
          kind="switch"
          icon="mic-outline"
          label="Ativação “Hey Asa”"
          description={wakeDescription}
          value={preferences.wakeWordEnabled && wakeSupported}
          disabled={!assistant || !wakeSupported || Boolean(wakeUnavailableReason)}
          onChange={(value) => void toggleWake(value)}
          testID="setting-wake-word"
        />
        {wakeSupported && WAKE_WORD.BARGE_IN_FEATURE_ENABLED ? (
          <SettingRow
              kind="switch"
              icon="hand-left-outline"
              label="Interromper por voz (experimental)"
              description="Enquanto o ASA fala, dizer “Hey Asa” interrompe a resposta. Depende do cancelamento de eco do aparelho."
              value={preferences.bargeInEnabled}
              disabled={!preferences.wakeWordEnabled}
            onChange={(bargeInEnabled) => updatePreferences({ bargeInEnabled })}
          />
        ) : null}
        <SettingRow kind="switch" icon="volume-high-outline" label="Resposta por voz" description="O ASA lê as respostas em voz alta. O texto continua sempre na tela." value={preferences.ttsEnabled} onChange={(ttsEnabled) => updatePreferences({ ttsEnabled })} />
        <SettingRow kind="link" icon="person-circle-outline" label="Voz" value={preferences.ttsVoiceId ? 'Personalizada' : 'Padrão do sistema'} onPress={() => setVoicePickerOpen(true)} accessibilityHint="Escolhe a voz usada nas respostas faladas" />
        <SettingRow kind="info" icon="language-outline" label="Idioma" value={speechLanguageLabel(VOICE.LANGUAGE)} />
        <SettingRow kind="switch" icon="phone-portrait-outline" label="Feedback tátil" description="Vibração sutil ao ativar o assistente e em ações principais." value={preferences.hapticsEnabled} onChange={(hapticsEnabled) => updatePreferences({ hapticsEnabled })} />
        <SettingRow kind="switch" icon="sparkles-outline" label="Animações" description="Desligue para reduzir o movimento do assistente. O estado continua descrito em texto." value={preferences.reduceMotion !== 'always'} onChange={(enabled) => updatePreferences({ reduceMotion: enabled ? 'system' : 'always' })} testID="setting-animations" />
        <SettingRow kind="switch" icon="chatbox-ellipses-outline" label="Transcrição visível" description="Mostra o que o ASA entendeu da sua fala antes da resposta." value={preferences.transcriptVisible} onChange={(transcriptVisible) => updatePreferences({ transcriptVisible })} />
        <SettingRow kind="switch" icon="time-outline" label="Salvar histórico" description="Guarda perguntas e respostas (só texto e horário) neste aparelho. Desligar apaga o histórico." value={preferences.historyEnabled} onChange={(historyEnabled) => updatePreferences({ historyEnabled })} testID="setting-history" />
        {assistant && assistant.history.length > 0 ? <SettingRow kind="link" icon="trash-outline" label="Limpar histórico" value={`${assistant.history.length}`} onPress={() => void assistant.clearHistory()} destructive /> : null}
      </List>

      <SectionHeader title="Microfone e privacidade" />
      <List inset="icon">
        <SettingRow kind="info" icon="mic-circle-outline" label="Microfone agora" value={micCapturing ? 'Ativo' : 'Inativo'} testID="mic-status" />
        <SettingRow kind="info" icon="key-outline" label="Permissão do microfone" value={assistant ? permissionLabel(assistant.microphonePermission) : 'Indisponível'} />
        {Platform.OS !== 'web' ? <SettingRow kind="link" icon="settings-outline" label="Permissões do sistema" onPress={openSystemSettings} accessibilityHint="Abre as configurações do aplicativo no sistema" /> : null}
      </List>
      <View style={styles.privacy} accessible accessibilityLabel={`Privacidade: ${MESSAGES.voicePrivacy}`}>
        <Ionicons name="lock-closed-outline" size={16} color={theme.colors.text.muted} style={{ marginTop: 1 }} />
        <View style={styles.privacyText}>
          <AppText variant="bodySmallStrong" tone="secondary">
            {MESSAGES.voicePrivacy}
          </AppText>
          <AppText variant="caption" tone="muted">
            A detecção de “Hey Asa” funciona somente com o app em primeiro plano. Em segundo plano o microfone é sempre desligado.
          </AppText>
        </View>
      </View>

      <VoicePicker visible={voicePickerOpen} onClose={() => setVoicePickerOpen(false)} />
    </>
  );
}

interface VoiceOption {
  identifier: string;
  name: string;
  language: string;
}

function VoicePicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { preferences, updatePreferences } = usePreferences();
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    const prefix = VOICE.LANGUAGE.slice(0, 2).toLowerCase();
    Speech.getAvailableVoicesAsync()
      .then((list) => {
        if (!active) return;
        const filtered = list.filter((voice) => voice.language.toLowerCase().startsWith(prefix)).map((voice) => ({ identifier: voice.identifier, name: voice.name, language: voice.language }));
        setVoices(filtered);
      })
      .catch(() => {
        if (active) setVoices([]);
      });
    return () => {
      active = false;
    };
  }, [visible]);

  const choose = (identifier: string | null) => {
    updatePreferences({ ttsVoiceId: identifier });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar">
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + theme.spacing.lg }]} onPress={() => undefined} accessibilityRole="none">
          <View style={styles.handle} />
          <AppText variant="h3" accessibilityRole="header">
            Voz do assistente
          </AppText>
          <AppText variant="bodySmall" tone="secondary" style={{ marginTop: theme.spacing.xxs }}>
            Vozes instaladas no seu aparelho para {speechLanguageLabel(VOICE.LANGUAGE)}.
          </AppText>
          <ScrollView style={{ marginTop: theme.spacing.md }}>
            <VoiceRow label="Padrão do sistema" selected={preferences.ttsVoiceId === null} onPress={() => choose(null)} />
            {voices === null ? (
              <AppText variant="bodySmall" tone="muted" style={{ marginTop: theme.spacing.sm }}>
                Carregando vozes...
              </AppText>
            ) : voices.length === 0 ? (
              <AppText variant="bodySmall" tone="muted" style={{ marginTop: theme.spacing.sm }}>
                Nenhuma voz adicional encontrada. O sistema usará a voz padrão do idioma.
              </AppText>
            ) : (
              voices.map((voice) => <VoiceRow key={voice.identifier} label={voice.name} detail={voice.language} selected={preferences.ttsVoiceId === voice.identifier} onPress={() => choose(voice.identifier)} />)
            )}
          </ScrollView>
          <AppButton label="Fechar" onPress={onClose} variant="secondary" style={{ marginTop: theme.spacing.md }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function VoiceRow({ label, detail, selected, onPress }: { label: string; detail?: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected, checked: selected }} accessibilityLabel={label} onPress={onPress} style={styles.voiceRow}>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">{label}</AppText>
        {detail ? (
          <AppText variant="caption" tone="muted">
            {detail}
          </AppText>
        ) : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={20} color={theme.colors.brand.primaryStrong} /> : null}
    </Pressable>
  );
}
