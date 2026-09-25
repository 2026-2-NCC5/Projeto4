import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAssistant } from '../../features/assistant/hooks/useAssistant';
import { ASSISTANT_STATE_LABELS } from '../../features/assistant/state/assistantStateMachine';
import { usePreferences } from '../../hooks/usePreferences';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useResponsive } from '../../hooks/useResponsive';
import { useOptionalAppNavigation } from '../../navigation/AppNavigator';
import { makeStyles, NATIVE_DRIVER, useTheme } from '../../theme';
import type { VoicePhase } from '../../types/voice';
import { MESSAGES } from '../../utils/messages';
import { ErrorBanner } from '../ErrorBanner';
import { AppText } from '../ui/AppText';
import { IconButton } from '../ui/IconButton';
import { PressableScale } from '../ui/PressableScale';
import { type VoiceButtonMode } from '../voice/VoiceButton';
import { VoiceResponse } from '../voice/VoiceResponse';
import { VoiceSuggestions } from '../voice/VoiceSuggestions';

import { AssistantOrb } from './AssistantOrb';
import { AssistantMessage, TypingIndicator, UserBubble } from './ChatBubble';
import { ChatInputBar } from './ChatInputBar';
import { VoiceWaveform } from './VoiceWaveform';

const PROCESSING: readonly VoicePhase[] = ['listening', 'transcribing', 'understanding', 'thinking'];
const OVERLAY_SUGGESTIONS = ['O que tenho hoje?', 'Como estão minhas notas?', 'Tenho alguma pendência?'] as const;

const useStyles = makeStyles((theme) => ({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 300, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.background.backdrop },
  keyboard: { justifyContent: 'flex-end', pointerEvents: 'box-none' },
  sheet: { width: '100%', maxWidth: 680, alignSelf: 'center', backgroundColor: theme.colors.assistant.surface, borderTopLeftRadius: theme.radius.xxxl, borderTopRightRadius: theme.radius.xxxl, paddingTop: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border.subtle, ...theme.shadows.lg },
  // Só o meio rola: cabeçalho e campo de mensagem ficam sempre visíveis, mesmo em telas baixas.
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { paddingBottom: theme.spacing.sm },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: theme.colors.border.default, marginBottom: theme.spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerActions: { flexDirection: 'row', gap: theme.spacing.xs },
  orbArea: { alignItems: 'center', marginTop: -theme.spacing.sm },
  status: { alignItems: 'center', paddingHorizontal: theme.spacing.md },
  micLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: theme.spacing.xs },
  micDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.status.error },
  sideButton: { minHeight: theme.minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border.default, backgroundColor: theme.colors.surface.secondary },
  stopPill: { alignSelf: 'center', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border.default, backgroundColor: theme.colors.surface.secondary, marginTop: theme.spacing.sm },
  footer: { paddingTop: theme.spacing.sm, gap: theme.spacing.sm, alignItems: 'stretch' },
  response: { marginTop: -theme.spacing.xs },
}));

/**
 * Mini assistente sobre a tela atual ("Hey Asa" ou toque longo no botão central).
 * Respostas simples ficam aqui; "Ver detalhes" leva à experiência completa mantendo a conversa.
 */
export function AssistantOverlay() {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const assistant = useAssistant();
  const navigation = useOptionalAppNavigation();
  const { preferences } = usePreferences();
  const responsive = useResponsive();
  const { voice, state, overlayVisible } = assistant;
  const { phase, turn, error } = voice.state;

  const [mounted, setMounted] = useState(overlayVisible);
  const [draft, setDraft] = useState('');
  // A resposta já existente ao abrir o overlay aparece completa; só respostas novas são reveladas em streaming.
  const [streamedTurnId, setStreamedTurnId] = useState<string | null>(() => voice.state.turn?.id ?? null);
  const [progress] = useState(() => new Animated.Value(overlayVisible ? 1 : 0));
  // Abrir: monta imediatamente (ajuste de estado durante a renderização); fechar: desmonta após a animação.
  if (overlayVisible && !mounted) setMounted(true);

  useEffect(() => {
    if (overlayVisible) {
      if (reduceMotion) {
        progress.setValue(1);
        return undefined;
      }
      const animation = Animated.spring(progress, { toValue: 1, useNativeDriver: NATIVE_DRIVER, ...theme.motion.spring.sheet });
      animation.start();
      return () => animation.stop();
    }
    if (!mounted) return undefined;
    const animation = Animated.timing(progress, { toValue: 0, duration: reduceMotion ? theme.motion.duration.reduced : theme.motion.duration.base, easing: theme.motion.easing.accelerate, useNativeDriver: NATIVE_DRIVER });
    animation.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => animation.stop();
  }, [overlayVisible, mounted, progress, reduceMotion, theme.motion]);

  if (!mounted) return null;

  const voiceUnavailable = voice.availability?.available === false;
  const isProcessing = PROCESSING.includes(phase);
  let buttonMode: VoiceButtonMode = 'idle';
  if (voiceUnavailable) buttonMode = 'unavailable';
  else if (phase === 'listening') buttonMode = 'listening';
  else if (phase === 'answering') buttonMode = 'answering';
  else if (isProcessing || state === 'activating') buttonMode = 'busy';

  const onVoicePress = () => {
    if (phase === 'listening') void voice.stopListening();
    else void voice.startListening();
  };
  const submit = (text: string) => {
    void voice.submitText(text);
    setDraft('');
  };
  const navigate = (target: Parameters<NonNullable<typeof navigation>['navigateTo']>[0], params?: Parameters<NonNullable<typeof navigation>['navigateTo']>[1]) => {
    if (navigation?.navigateTo(target, params)) assistant.closeOverlay();
  };

  const statusText = state === 'listening' && voice.state.partialTranscript.trim() ? `“${voice.state.partialTranscript.trim()}”` : phase === 'idle' && !turn && voiceUnavailable ? 'Digite sua pergunta abaixo' : ASSISTANT_STATE_LABELS[state];
  const micActive = state === 'listening' || state === 'interrupted';
  const waveformMode = state === 'listening' || state === 'interrupted' ? 'live' : state === 'speaking' ? 'procedural' : 'idle';
  const tone = phase === 'abstained' || phase === 'human_validation' ? 'attention' : 'default';
  // Altura em números (não "%"): o contêiner da folha mede o próprio conteúdo, então um percentual deixaria
  // um vão sob a folha quando a resposta é longa.
  const sheetMaxHeight = responsive.height - insets.top - (responsive.isShort ? theme.spacing.sm : theme.spacing.xxxxl);
  const orbSize = responsive.isShort ? (turn ? 48 : 64) : turn ? 84 : 112;
  const sheetGutter = responsive.isCompact ? theme.spacing.lg : theme.spacing.xl;
  const footnote = (
    <AppText variant="caption" tone="muted" align="center" style={responsive.isShort ? { marginTop: theme.spacing.md } : null}>
      {preferences.wakeWordEnabled ? 'Diga “Hey Asa” a qualquer momento com o app aberto.' : 'O áudio não é gravado; só o texto é enviado.'}
    </AppText>
  );

  return (
    <View style={[styles.root, { pointerEvents: 'box-none' }]} testID="assistant-overlay">
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Fechar assistente" onPress={assistant.closeOverlay} />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { maxHeight: sheetMaxHeight, paddingHorizontal: sheetGutter, paddingBottom: Math.max(insets.bottom, theme.spacing.md) + theme.spacing.sm, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }] },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.brand}>
              <Ionicons name="sparkles" size={14} color={theme.colors.brand.accent} />
              <AppText variant="label" tone="brand" uppercase>
                Assistente ASA
              </AppText>
            </View>
            <View style={styles.headerActions}>
              <IconButton icon="expand-outline" accessibilityLabel="Ver detalhes" accessibilityHint="Abre a conversa completa" onPress={assistant.expand} size={40} testID="overlay-expand" />
              <IconButton icon="close" accessibilityLabel="Fechar" onPress={assistant.closeOverlay} size={40} testID="overlay-close" />
            </View>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.orbArea}>
              <AssistantOrb state={state} audioLevel={voice.audioLevel} size={orbSize} tone={tone} testID="overlay-orb" />
              <VoiceWaveform level={voice.audioLevel} mode={waveformMode} height={responsive.isShort ? 18 : 26} color={theme.colors.assistant.primary} />
            </View>
            <View style={styles.status}>
              <AppText variant="h4" align="center" accessibilityLiveRegion="polite" testID="overlay-status">
                {statusText}
              </AppText>
              {micActive ? (
                <View style={styles.micLine} accessible accessibilityLabel="Microfone ativo">
                  <View style={styles.micDot} />
                  <AppText variant="caption" tone="secondary">
                    Microfone ativo
                  </AppText>
                </View>
              ) : null}
            </View>

            {phase === 'error' && error ? <ErrorBanner message={error.message} onRetry={!voiceUnavailable && error.kind !== 'permission_denied' && error.kind !== 'unavailable' ? () => void voice.startListening() : undefined} testID="overlay-error" /> : null}
            {voiceUnavailable && !turn && phase === 'idle' ? (
              <AppText variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.sm }}>
                {voice.availability?.reason === 'expo_go' ? MESSAGES.voiceUnavailableExpoGo : MESSAGES.voiceUnavailable}
              </AppText>
            ) : null}

            {turn ? (
              <View style={styles.response}>
                {turn.transcript ? <UserBubble text={turn.transcript} caption={turn.inputType === 'voice' ? 'Você disse:' : undefined} testID="overlay-user-bubble" /> : null}
                <AssistantMessage key={turn.id} text={turn.response.display.message} animate={turn.id !== streamedTurnId} onComplete={() => setStreamedTurnId(turn.id)} testID="overlay-assistant-message">
                  <VoiceResponse turn={turn} onNavigate={navigate} onAsk={(text) => void voice.submitText(text)} actionsDisabled={isProcessing} compact maxItems={2} hideTechnicalDetails hideMessage={Boolean(turn.response.display.message)} />
                </AssistantMessage>
                <PressableScale accessibilityRole="button" accessibilityLabel="Ver detalhes da resposta" onPress={assistant.expand} style={[styles.sideButton, { alignSelf: 'center', marginTop: theme.spacing.md }]}>
                  <Ionicons name="open-outline" size={16} color={theme.colors.brand.primaryStrong} />
                  <AppText variant="bodySmallStrong" tone="brand">
                    Ver detalhes
                  </AppText>
                </PressableScale>
              </View>
            ) : null}

            {isProcessing && phase !== 'listening' ? <TypingIndicator /> : null}

            {!turn && !isProcessing && phase !== 'answering' && state !== 'activating' ? <VoiceSuggestions suggestions={OVERLAY_SUGGESTIONS} onSelect={submit} title={null} /> : null}

            {phase === 'answering' ? (
              <PressableScale accessibilityRole="button" accessibilityLabel="Parar resposta" onPress={voice.stopSpeaking} style={styles.stopPill}>
                <Ionicons name="stop-circle-outline" size={16} color={theme.colors.text.primary} />
                <AppText variant="bodySmallStrong">
                  Parar
                </AppText>
              </PressableScale>
            ) : null}
            {/* Telas baixas: a nota vai para o fim da rolagem e a barra fixa fica só com o campo. */}
            {responsive.isShort ? footnote : null}
          </ScrollView>

          <View style={styles.footer}>
            <ChatInputBar value={draft} onChangeText={setDraft} onSubmit={submit} voiceMode={buttonMode} onVoicePress={onVoicePress} onCancel={voice.cancel} placeholder="Digite uma mensagem" inline={responsive.isShort} testID="overlay-input-bar" />
            {responsive.isShort ? null : footnote}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}
