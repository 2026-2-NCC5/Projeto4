import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnalysisPanel } from '../components/AnalysisPanel';
import { AssistantTranscript } from '../components/assistant/AssistantTranscript';
import { AssistantMessage, TypingIndicator, UserBubble } from '../components/assistant/ChatBubble';
import { ChatEmptyState } from '../components/assistant/ChatEmptyState';
import { ChatInputBar, type ChatInputAction } from '../components/assistant/ChatInputBar';
import { VoiceWaveform } from '../components/assistant/VoiceWaveform';
import { ErrorBanner } from '../components/ErrorBanner';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { AppText, IconButton, PressableScale, Surface } from '../components/ui';
import { AsaVoiceOrb, VoiceResponse, VoiceStatus, type AsaOrbState, type VoiceButtonMode } from '../components/voice';
import { VOICE } from '../config/services';
import { useOptionalAssistant } from '../features/assistant/hooks/useAssistant';
import { groupHistoryByDay } from '../features/assistant/services/conversationHistory';
import { useAnalysis } from '../hooks/useAnalysis';
import { usePreferences } from '../hooks/usePreferences';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useResponsive } from '../hooks/useResponsive';
import { useOptionalSession } from '../hooks/useSession';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';
import { makeStyles, useTheme } from '../theme';
import type { AssistantMode } from '../types/assistant';
import type { AssistantNavigationParams, AssistantNavigationTarget } from '../types/api';
import type { VoicePhase } from '../types/voice';
import { firstName } from '../utils/format';
import { greeting } from '../utils/greeting';
import { MESSAGES } from '../utils/messages';

export { analysisErrorMessage } from '../components/AnalysisPanel';

export type AssistantNavigateHandler = (target: AssistantNavigationTarget, params?: AssistantNavigationParams) => void;

interface AssistantScreenProps {
  onViewSubject: (subjectId: string) => void;
  onOpenRecommendation?: (id: string) => void;
  /** Destinos das próximas ações sugeridas pela API (allow-list do contrato). */
  onNavigate?: AssistantNavigateHandler;
  /** Modo controlado pelo App (ex.: navegação para "assistant.analysis"). */
  mode?: AssistantMode;
  onModeChange?: (mode: AssistantMode) => void;
  initialMode?: AssistantMode;
  /** Padrão: VOICE.ENABLED. false → apenas a análise completa (comportamento anterior). */
  voiceEnabled?: boolean;
}

const MODE_OPTIONS: { key: AssistantMode; label: string }[] = [
  { key: 'conversation', label: 'Conversar' },
  { key: 'analysis', label: 'Análise completa' },
];

/** Espaço reservado para a BottomNav absoluta (inclui o botão central que sobressai). */
const NAV_SPACE = 120;

const PROCESSING_PHASES: readonly VoicePhase[] = ['listening', 'transcribing', 'understanding', 'thinking'];

/** Largura do seletor de modo quando ele divide a linha do cabeçalho (tablets, desktop, paisagem). */
const INLINE_SWITCHER_WIDTH = 300;

/** Abaixo desta altura a barra de mensagem fica em uma linha e o aviso de privacidade vai para o fim do chat. */
const COMPACT_COMPOSER_HEIGHT = 700;

/**
 * Orb do estado vazio: acompanha a altura da tela (o recurso escasso num chat com cabeçalho, barra de mensagem
 * e navegação fixos), limitado pela largura em telas estreitas.
 */
function heroOrbSize(width: number, height: number, isShort: boolean): number {
  if (isShort) return 56;
  return Math.round(Math.min(140, Math.max(80, Math.min(width * 0.3, height * 0.13))));
}

/** A caixa do orb tem 1,5× o tamanho (halo e partículas); recupera parte da margem vazia acima e abaixo. */
function heroOrbInset(size: number): number {
  return -Math.round(size * 0.15);
}

const useStyles = makeStyles((theme) => ({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1, minWidth: 0 },
  screenContent: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 },
  header: { paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.sm, gap: theme.spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border.subtle },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: theme.minTouchTarget },
  sideSlot: { minWidth: theme.minTouchTarget, alignItems: 'center' },
  title: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm },
  titleStart: { justifyContent: 'flex-start' },
  inlineSwitcher: { width: INLINE_SWITCHER_WIDTH, flexShrink: 1 },
  scrollContent: { paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg },
  scrollFill: { flexGrow: 1 },
  scrollCentered: { justifyContent: 'center' },
  orbArea: { alignItems: 'center' },
  infoBox: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start', backgroundColor: theme.colors.status.warningSoft, borderColor: theme.colors.status.warning, borderWidth: 1, borderRadius: theme.radius.lg, padding: theme.spacing.md, marginTop: theme.spacing.md },
  notice: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center', backgroundColor: theme.colors.status.infoSoft, borderRadius: theme.radius.md, padding: theme.spacing.md, marginTop: theme.spacing.md },
  composer: { paddingTop: theme.spacing.xs, gap: theme.spacing.xs },
  statusLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, minHeight: 24 },
  stopPill: { alignSelf: 'center', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border.default, backgroundColor: theme.colors.surface.primary },
  history: { marginTop: theme.spacing.xl },
  historyItem: { paddingVertical: theme.spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: theme.colors.border.subtle },
  privacy: { paddingHorizontal: theme.spacing.md, fontWeight: '400' },
  privacyInline: { marginTop: theme.spacing.lg },
}));

export function AssistantScreen({ onViewSubject, onOpenRecommendation, onNavigate, mode, onModeChange, initialMode = 'conversation', voiceEnabled = VOICE.ENABLED }: AssistantScreenProps) {
  // A última análise é carregada ao abrir a aba em qualquer modo (e sobrevive à troca de modo).
  const analysis = useAnalysis();
  const [internalMode, setInternalMode] = useState<AssistantMode>(initialMode);
  const currentMode: AssistantMode = voiceEnabled ? (mode ?? internalMode) : 'analysis';

  const changeMode = useCallback(
    (next: AssistantMode) => {
      setInternalMode(next);
      onModeChange?.(next);
    },
    [onModeChange],
  );

  const navigate = useCallback<AssistantNavigateHandler>(
    (target, params) => {
      if (onNavigate) {
        onNavigate(target, params);
        return;
      }
      if (target === 'assistant.analysis') changeMode('analysis');
      else if (target === 'subject' && params?.subjectId) onViewSubject(params.subjectId);
      else if (target === 'recommendation' && params?.recommendationId) onOpenRecommendation?.(params.recommendationId);
    },
    [onNavigate, changeMode, onViewSubject, onOpenRecommendation],
  );

  if (!voiceEnabled) {
    return (
      <Screen testID="assistant-screen">
        <AnalysisPanel analysis={analysis} onViewSubject={onViewSubject} onOpenRecommendation={onOpenRecommendation} />
      </Screen>
    );
  }

  const modeSwitcher = <SegmentedControl options={MODE_OPTIONS} value={currentMode} onChange={changeMode} accessibilityLabel="Modo do assistente" />;

  if (currentMode === 'analysis') {
    return <AnalysisMode analysis={analysis} modeSwitcher={modeSwitcher} onViewSubject={onViewSubject} onOpenRecommendation={onOpenRecommendation} />;
  }

  return <VoiceConversation onNavigate={navigate} modeSwitcher={modeSwitcher} />;
}

interface AssistantTopBarProps {
  modeSwitcher: React.ReactNode;
  /** Ação à esquerda do título (ex.: "Nova conversa"). */
  leading?: React.ReactNode;
  /** Ação à direita (ex.: resposta por voz). */
  trailing?: React.ReactNode;
  /** Orb pequeno ao lado do título (durante a conversa). */
  orb?: React.ReactNode;
}

/**
 * Cabeçalho fixo dos dois modos. Telefones: título centralizado entre as ações e o seletor de modo embaixo,
 * na largura toda. Telas largas: título à esquerda e o seletor na mesma linha (economiza altura).
 */
function AssistantTopBar({ modeSwitcher, leading, trailing, orb }: AssistantTopBarProps) {
  const styles = useStyles();
  const responsive = useResponsive();
  const inline = responsive.isWide;
  const sideSlots = !inline || leading || trailing;
  return (
    <View style={[styles.header, { paddingHorizontal: responsive.gutter }]}>
      <View style={styles.topBar}>
        {sideSlots ? <View style={styles.sideSlot}>{leading}</View> : null}
        <View style={[styles.title, inline && styles.titleStart]}>
          {orb}
          <View style={styles.flexShrink}>
            <AppText variant="h4" align={inline ? 'left' : 'center'} accessibilityRole="header" numberOfLines={1}>
              Assistente ASA
            </AppText>
            <AppText variant="caption" tone="muted" align={inline ? 'left' : 'center'} style={{ fontWeight: '500' }} numberOfLines={1}>
              ASA Conecta
            </AppText>
          </View>
        </View>
        {inline ? <View style={styles.inlineSwitcher}>{modeSwitcher}</View> : null}
        {sideSlots ? <View style={styles.sideSlot}>{trailing}</View> : null}
      </View>
      {inline ? null : modeSwitcher}
    </View>
  );
}

interface AnalysisModeProps {
  analysis: ReturnType<typeof useAnalysis>;
  modeSwitcher: React.ReactNode;
  onViewSubject: (subjectId: string) => void;
  onOpenRecommendation?: (id: string) => void;
}

/** "Análise completa": cabeçalho fixo e só a análise rola (como no modo conversa). */
function AnalysisMode({ analysis, modeSwitcher, onViewSubject, onOpenRecommendation }: AnalysisModeProps) {
  const theme = useTheme();
  const styles = useStyles();
  const responsive = useResponsive();
  return (
    <Screen scroll={false} withNavSpace={false} contentStyle={styles.screenContent} testID="assistant-screen">
      <AssistantTopBar modeSwitcher={modeSwitcher} />
      <ScrollView style={styles.flex} contentContainerStyle={[styles.scrollContent, { paddingHorizontal: responsive.gutter, paddingBottom: theme.spacing.navSpace }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <AnalysisPanel analysis={analysis} onViewSubject={onViewSubject} onOpenRecommendation={onOpenRecommendation} showHeader={false} />
      </ScrollView>
    </Screen>
  );
}

function orbStateFor(phase: VoicePhase): AsaOrbState {
  switch (phase) {
    case 'listening':
      return 'listening';
    case 'transcribing':
    case 'understanding':
      return 'transcribing';
    case 'thinking':
      return 'thinking';
    case 'answering':
      return 'answering';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

function useIosKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const show = Keyboard.addListener('keyboardWillShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

interface VoiceConversationProps {
  onNavigate: AssistantNavigateHandler;
  modeSwitcher: React.ReactNode;
}

function VoiceConversation({ onNavigate, modeSwitcher }: VoiceConversationProps) {
  const theme = useTheme();
  const styles = useStyles();
  const assistant = useVoiceAssistant();
  const global = useOptionalAssistant();
  const session = useOptionalSession();
  const { state, availability, audioLevel, ttsEnabled } = assistant;
  const { preferences, updatePreferences } = usePreferences();
  const reduceMotion = useReducedMotion();
  const responsive = useResponsive();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useIosKeyboardVisible();
  const [draft, setDraft] = useState('');
  // A resposta já existente ao abrir a tela aparece completa; só respostas novas são reveladas em streaming.
  const [streamedTurnId, setStreamedTurnId] = useState<string | null>(() => assistant.state.turn?.id ?? null);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  const { releaseMedia, stopSpeaking } = assistant;
  // Sair da tela libera microfone, TTS e timers de voz.
  useEffect(() => () => releaseMedia(), [releaseMedia]);

  const { phase, turn, error, thread } = state;
  const voiceKnownUnavailable = availability?.available === false;
  const isProcessing = PROCESSING_PHASES.includes(phase);

  // Nova resposta ou nova pergunta: rola até o fim para manter a conversa visível.
  useEffect(() => {
    if (turn || isProcessing) scrollRef.current?.scrollToEnd({ animated: !reduceMotion });
  }, [turn, isProcessing, reduceMotion]);

  let voiceMode: VoiceButtonMode = 'idle';
  if (voiceKnownUnavailable) voiceMode = 'unavailable';
  else if (phase === 'listening') voiceMode = 'listening';
  else if (phase === 'answering') voiceMode = 'answering';
  else if (isProcessing) voiceMode = 'busy';

  const onVoicePress = () => {
    if (phase === 'listening') void assistant.stopListening();
    else void assistant.startListening();
  };

  const submit = (text: string) => {
    void assistant.submitText(text);
    setDraft('');
  };

  const editTranscript = (text: string) => {
    setDraft(text);
    inputRef.current?.focus();
  };

  const toggleTts = () => {
    const next = !ttsEnabled;
    updatePreferences({ ttsEnabled: next });
    if (!next && phase === 'answering') stopSpeaking();
  };

  const resetConversation = () => {
    assistant.resetConversation();
    setDraft('');
  };

  const canReset = Boolean(turn || state.transcript || error || state.notice) || phase !== 'idle';
  const canRetryByVoice = !voiceKnownUnavailable && error !== null && error.kind !== 'permission_denied' && error.kind !== 'unavailable';
  const canRepeat = ttsEnabled && Boolean(turn?.response.speech?.text?.trim()) && phase !== 'answering';
  const navSpace = keyboardVisible ? theme.spacing.md : NAV_SPACE + insets.bottom;
  const tone = phase === 'abstained' || phase === 'human_validation' ? 'attention' : 'default';
  const previousTurns = turn ? thread.filter((item) => item.id !== turn.id) : thread;
  const historyGroups = global && preferences.historyEnabled && !turn && !isProcessing ? groupHistoryByDay(global.history).slice(0, 2) : [];
  const wakeHint = global?.wakeWord.enabled && global.wakeWord.status === 'listening' ? 'Diga “Hey Asa” ou toque no microfone' : undefined;

  // Pergunta em andamento (ainda sem resposta) ou que falhou: aparece como balão editável.
  const pendingTranscript = preferences.transcriptVisible && state.transcript && (isProcessing || phase === 'error') && phase !== 'listening' ? state.transcript : null;
  const pendingCaption = state.inputType === 'voice' ? 'Você disse:' : undefined;
  const hasConversation = Boolean(turn) || previousTurns.length > 0 || Boolean(pendingTranscript) || (isProcessing && phase !== 'listening');
  const showStatusLine = hasConversation && (phase !== 'idle' || Boolean(wakeHint));
  const streamTurn = Boolean(turn) && turn?.id !== streamedTurnId;
  const orbState = orbStateFor(phase);

  // Ações secundárias da barra (o "Nova conversa" fica no cabeçalho para não duplicar o controle).
  const inputActions: ChatInputAction[] = [
    { key: 'analysis', icon: 'analytics-outline', label: 'Análise completa da situação acadêmica', hint: 'Pede ao assistente uma análise completa', onPress: () => submit('Analise minha situação acadêmica'), disabled: isProcessing, testID: 'quick-analysis' },
    { key: 'transcript', icon: preferences.transcriptVisible ? 'text-outline' : 'eye-off-outline', label: 'Mostrar transcrição', hint: 'Mostra ou oculta o texto reconhecido da sua fala', onPress: () => updatePreferences({ transcriptVisible: !preferences.transcriptVisible }), role: 'switch', checked: preferences.transcriptVisible, testID: 'transcript-toggle' },
  ];

  const { gutter, isShort } = responsive;
  // Telas baixas: barra de mensagem em uma linha e o aviso de privacidade no fim da conversa (sobra altura para o chat).
  const compactComposer = responsive.height < COMPACT_COMPOSER_HEIGHT;
  const orbSize = heroOrbSize(responsive.width, responsive.height, isShort);
  const privacyNotice = (
    <AppText variant="caption" tone="muted" align="center" style={[styles.privacy, compactComposer && styles.privacyInline]}>
      O ASA responde apenas com seus dados acadêmicos. O áudio não é gravado.
    </AppText>
  );

  const status = <VoiceStatus phase={phase} voiceAvailable={!voiceKnownUnavailable} partialTranscript={state.partialTranscript} showPartial={preferences.transcriptVisible} overrideText={phase === 'idle' ? wakeHint : undefined} />;

  return (
    <Screen scroll={false} withNavSpace={false} keyboardAvoiding contentStyle={styles.screenContent} testID="assistant-screen">
      <AssistantTopBar
        modeSwitcher={modeSwitcher}
        orb={hasConversation ? <AsaVoiceOrb state={orbState} audioLevel={audioLevel} reduceMotion={reduceMotion} size={32} tone={tone} /> : null}
        leading={<IconButton icon="add-circle-outline" accessibilityLabel="Nova conversa" accessibilityHint="Limpa a conversa atual com o assistente" onPress={resetConversation} disabled={!canReset} tone={canReset ? 'brand' : 'muted'} testID="new-conversation" />}
        trailing={
          <IconButton
            icon={ttsEnabled ? 'volume-high' : 'volume-mute'}
            accessibilityRole="switch"
            checked={ttsEnabled}
            accessibilityLabel={ttsEnabled ? 'Resposta por voz ativada' : 'Resposta por voz desativada'}
            accessibilityHint="Liga ou desliga a leitura das respostas em voz alta"
            onPress={toggleTts}
            tone={ttsEnabled ? 'brand' : 'muted'}
            testID="tts-toggle"
          />
        }
      />

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        // Sem conversa, a saudação fica centralizada na altura disponível; com conversa, o chat começa no topo.
        contentContainerStyle={[styles.scrollContent, styles.scrollFill, !hasConversation && styles.scrollCentered, { paddingHorizontal: gutter }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!hasConversation ? (
          <ChatEmptyState
            name={firstName(session?.user?.fullName)}
            greeting={greeting(new Date())}
            hero={
              <View style={[styles.orbArea, { marginVertical: heroOrbInset(orbSize) }]}>
                <AsaVoiceOrb state={orbState} audioLevel={audioLevel} reduceMotion={reduceMotion} size={orbSize} tone={tone} />
                {phase === 'listening' || phase === 'answering' ? <VoiceWaveform level={audioLevel} mode={phase === 'listening' ? 'live' : 'procedural'} height={24} /> : null}
              </View>
            }
            status={status}
            columns={responsive.isCompact ? 1 : 2}
            split={isShort && responsive.isLandscape}
            onSelect={submit}
            disabled={isProcessing}
          />
        ) : null}

        {voiceKnownUnavailable && error?.kind !== 'unavailable' ? (
          <View style={styles.infoBox} testID="voice-unavailable-notice" accessibilityLiveRegion="polite">
            <Ionicons name="mic-off-outline" size={18} color={theme.colors.status.warningText} accessibilityElementsHidden importantForAccessibility="no" />
            <View style={styles.flex}>
              <AppText variant="bodySmallStrong" tone="warning">
                {MESSAGES.voiceUnavailable}
              </AppText>
              {availability?.reason === 'expo_go' ? (
                <AppText variant="caption" tone="warning" style={{ fontWeight: '400', marginTop: 2 }}>
                  {MESSAGES.voiceUnavailableExpoGo}
                </AppText>
              ) : null}
            </View>
          </View>
        ) : null}

        {previousTurns.length > 0 ? <AssistantTranscript turns={previousTurns} /> : null}

        {turn ? (
          <>
            {turn.transcript ? <UserBubble text={turn.transcript} caption={turn.inputType === 'voice' ? 'Você disse:' : undefined} onEdit={pendingTranscript ? undefined : editTranscript} testID="chat-user-current" /> : null}
            <AssistantMessage key={turn.id} text={turn.response.display.message} animate={streamTurn} onComplete={() => setStreamedTurnId(turn.id)} testID="chat-assistant-current">
              <VoiceResponse turn={turn} onNavigate={onNavigate} onAsk={(text) => void assistant.submitText(text)} canRepeat={canRepeat} onRepeat={assistant.repeatLast} actionsDisabled={isProcessing} hideMessage={Boolean(turn.response.display.message)} />
            </AssistantMessage>
          </>
        ) : null}

        {pendingTranscript ? <UserBubble text={pendingTranscript} caption={pendingCaption} onEdit={editTranscript} testID="voice-transcript" /> : null}
        {isProcessing && phase !== 'listening' ? <TypingIndicator /> : null}

        {phase === 'error' && error ? (
          <View>
            <ErrorBanner message={error.message} onRetry={canRetryByVoice ? () => void assistant.startListening() : undefined} testID="voice-error" />
            {error.detail ? (
              <AppText variant="caption" tone="muted" style={{ fontWeight: '400', marginTop: theme.spacing.xs, paddingHorizontal: theme.spacing.xxs }}>
                {error.detail}
              </AppText>
            ) : null}
          </View>
        ) : null}

        {state.notice ? (
          <View style={styles.notice} accessibilityLiveRegion="polite" testID="voice-notice">
            <AppText variant="bodyStrong" tone="info" importantForAccessibility="no">
              ⓘ
            </AppText>
            <AppText variant="bodySmallStrong" tone="info" style={{ flex: 1 }}>
              {state.notice}
            </AppText>
          </View>
        ) : null}

        {historyGroups.length > 0 ? (
          <Surface style={styles.history} testID="conversation-history">
            <AppText variant="h4" accessibilityRole="header">
              Conversas recentes
            </AppText>
            {historyGroups.map((group) => (
              <View key={group.label} style={{ marginTop: theme.spacing.sm }}>
                <AppText variant="label" tone="muted" uppercase>
                  {group.label}
                </AppText>
                {group.entries.slice(0, 4).map((entry) => (
                  <PressableScale key={entry.id} accessibilityRole="button" accessibilityLabel={`Perguntar de novo: ${entry.question}`} onPress={() => submit(entry.question)} style={styles.historyItem}>
                    <AppText variant="bodySmallStrong" numberOfLines={1}>
                      {entry.question}
                    </AppText>
                    <AppText variant="caption" tone="muted" numberOfLines={1} style={{ fontWeight: '400' }}>
                      {entry.answer}
                    </AppText>
                  </PressableScale>
                ))}
              </View>
            ))}
          </Surface>
        ) : null}

        {compactComposer ? privacyNotice : null}
      </ScrollView>

      <View style={[styles.composer, { paddingHorizontal: Math.max(theme.spacing.md, gutter - theme.spacing.sm) }]}>
        {showStatusLine ? <View style={styles.statusLine}>{status}</View> : null}
        {phase === 'answering' ? (
          <PressableScale accessibilityRole="button" accessibilityLabel="Parar resposta" onPress={stopSpeaking} style={styles.stopPill}>
            <Ionicons name="stop-circle-outline" size={18} color={theme.colors.text.primary} />
            <AppText variant="caption">Parar resposta</AppText>
          </PressableScale>
        ) : null}
        <ChatInputBar value={draft} onChangeText={setDraft} onSubmit={submit} voiceMode={voiceMode} onVoicePress={onVoicePress} onCancel={assistant.cancel} actions={inputActions} inputRef={inputRef} placeholder="Pergunte ao ASA..." inline={compactComposer} />
        {compactComposer ? null : privacyNotice}
      </View>
      <View style={{ height: navSpace }} />
    </Screen>
  );
}
