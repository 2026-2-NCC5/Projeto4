import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import type { AssistantTurn } from '../../types/assistant';
import type { AssistantDisplayItem, AssistantNavigationParams, AssistantNavigationTarget, AssistantNextAction } from '../../types/api';
import { assistantItemIcon, assistantItemTone, assistantItemToneLabel, assistantStatusIcon, assistantStatusLabel, assistantStatusTone } from '../../utils/format';
import { AbstentionCard } from '../AbstentionCard';
import { Card } from '../Card';
import { HumanValidationBanner } from '../HumanValidationBanner';
import { Pill } from '../Pill';
import { RecommendationCard } from '../RecommendationCard';
import { TechnicalDetails } from '../TechnicalDetails';
import { AppText } from '../ui/AppText';
import { PressableScale } from '../ui/PressableScale';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Pergunta enviada quando a API sugere uma nova análise (a API interpreta; o app só envia texto). */
export const RUN_ANALYSIS_PROMPT = 'Analise minha situação acadêmica';

export interface VoiceResponseProps {
  turn: AssistantTurn;
  onNavigate: (target: AssistantNavigationTarget, params?: AssistantNavigationParams) => void;
  onAsk: (text: string) => void;
  /** Mostra "Repetir resposta" (TTS ligado e há texto para falar). */
  canRepeat?: boolean;
  onRepeat?: () => void;
  /** Bloqueia ações que enviam novas perguntas enquanto outra está em andamento. */
  actionsDisabled?: boolean;
  /** Versão resumida (overlay): mensagem + até N itens + ações. */
  compact?: boolean;
  maxItems?: number;
  /** Oculta detalhes técnicos (overlay). */
  hideTechnicalDetails?: boolean;
  /** Oculta a mensagem principal (quando ela já foi exibida como texto corrido/streaming no chat). */
  hideMessage?: boolean;
}

function actionIcon(action: AssistantNextAction): IconName {
  if (action.type === 'ask') return 'chatbubble-ellipses-outline';
  if (action.type === 'run_analysis') return 'sparkles-outline';
  return 'arrow-forward-circle-outline';
}

const useStyles = makeStyles((theme) => ({
  card: { marginTop: theme.spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm, flexWrap: 'wrap' },
  items: { marginTop: theme.spacing.md, gap: theme.spacing.sm },
  item: { backgroundColor: theme.colors.surface.secondary, borderRadius: theme.radius.md, padding: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border.subtle },
  itemLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: theme.minTouchTarget, marginTop: theme.spacing.xxs },
  repeat: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: theme.minTouchTarget, paddingHorizontal: theme.spacing.sm },
  recommendations: { marginTop: theme.spacing.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  actionButton: { minHeight: theme.minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border.default, backgroundColor: theme.colors.surface.primary },
  pressed: { opacity: 0.7 },
}));

/** Resposta estruturada do assistente: texto, itens (cards inteligentes), recomendações explicáveis e próximas ações. */
export function VoiceResponse({ turn, onNavigate, onAsk, canRepeat = false, onRepeat, actionsDisabled = false, compact = false, maxItems, hideTechnicalDetails = false, hideMessage = false }: VoiceResponseProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { response } = turn;
  const { display } = response;
  const recommendations = useMemo(() => [...(display.recommendations ?? [])].sort((a, b) => a.priority - b.priority), [display.recommendations]);
  const isAbstained = response.abstained || response.status === 'abstained';
  const needsValidation = !isAbstained && (response.requiresHumanValidation || response.status === 'human_validation');
  const validationNextAction = recommendations.find((item) => item.requiresHumanValidation)?.nextAction ?? recommendations[0]?.nextAction ?? null;
  const items = maxItems ? display.items.slice(0, maxItems) : display.items;
  const hiddenItems = display.items.length - items.length;

  const runAction = (action: AssistantNextAction) => {
    if (action.type === 'navigate') onNavigate(action.target, action.params);
    else if (action.type === 'ask') onAsk(action.text);
    else onAsk(RUN_ANALYSIS_PROMPT);
  };

  return (
    <View testID="voice-response">
      <Card style={styles.card}>
        <View style={styles.top}>
          <Pill label={assistantStatusLabel(response.status)} icon={assistantStatusIcon(response.status)} tone={assistantStatusTone(response.status)} />
          {canRepeat && onRepeat ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Repetir resposta" onPress={onRepeat} style={({ pressed }) => [styles.repeat, pressed && styles.pressed]}>
              <Ionicons name="volume-high-outline" size={16} color={theme.colors.brand.primaryStrong} />
              <AppText variant="bodySmallStrong" tone="brand">
                Repetir resposta
              </AppText>
            </Pressable>
          ) : null}
        </View>
        {display.title ? (
          <AppText variant="h3" accessibilityRole="header" style={{ marginTop: theme.spacing.md }}>
            {display.title}
          </AppText>
        ) : null}
        {display.message && !hideMessage ? (
          <AppText variant="body" accessibilityLiveRegion="polite" style={{ marginTop: theme.spacing.xs }}>
            {display.message}
          </AppText>
        ) : null}

        {items.length > 0 ? (
          <View style={styles.items} accessibilityRole="list">
            {items.map((item) => (
              <ResponseItem key={item.id} item={item} onViewSubject={(subjectId) => onNavigate('subject', { subjectId })} />
            ))}
            {hiddenItems > 0 ? (
              <AppText variant="caption" tone="muted">
                {`+ ${hiddenItems} ${hiddenItems === 1 ? 'item' : 'itens'}. Toque em “Ver detalhes”.`}
              </AppText>
            ) : null}
          </View>
        ) : null}
      </Card>

      {isAbstained ? <AbstentionCard reason={response.abstentionReason} /> : null}
      {needsValidation ? <HumanValidationBanner nextAction={validationNextAction} compact={compact} /> : null}

      {!compact && recommendations.length > 0 ? (
        <View style={styles.recommendations}>
          <AppText variant="h3" accessibilityRole="header" style={{ marginBottom: theme.spacing.md }}>
            Recomendações
          </AppText>
          {recommendations.map((recommendation) => (
            <RecommendationCard
              key={recommendation.id}
              recommendation={recommendation}
              onViewSubject={(subjectId) => onNavigate('subject', { subjectId })}
              onOpenDetail={(recommendationId) => onNavigate('recommendation', { recommendationId })}
              hideValidationBanner={needsValidation}
              testID={`voice-recommendation-${recommendation.id}`}
            />
          ))}
        </View>
      ) : null}

      {response.nextActions.length > 0 ? (
        <View style={styles.actions}>
          {(compact ? response.nextActions.slice(0, 3) : response.nextActions).map((action, index) => {
            const disabled = actionsDisabled && action.type !== 'navigate';
            return (
              <PressableScale
                key={`${action.type}-${index}-${action.label}`}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => runAction(action)}
                style={styles.actionButton}
              >
                <Ionicons name={actionIcon(action)} size={18} color={theme.colors.brand.primaryStrong} />
                <AppText variant="bodySmallStrong" tone="brand">
                  {action.label}
                </AppText>
              </PressableScale>
            );
          })}
        </View>
      ) : null}

      {!hideTechnicalDetails ? <TechnicalDetails interactionId={response.interactionId} correlationId={response.correlationId} runId={response.runId} /> : null}
    </View>
  );
}

function ResponseItem({ item, onViewSubject }: { item: AssistantDisplayItem; onViewSubject: (subjectId: string) => void }) {
  const theme = useTheme();
  const styles = useStyles();
  const badge = item.badge?.trim() || assistantItemToneLabel(item.tone);
  return (
    <View style={styles.item}>
      <Pill label={badge} icon={assistantItemIcon(item.tone)} tone={assistantItemTone(item.tone)} />
      <AppText variant="bodyStrong" style={{ marginTop: theme.spacing.sm }}>
        {item.title}
      </AppText>
      {item.description ? (
        <AppText variant="bodySmall" style={{ marginTop: 2 }}>
          {item.description}
        </AppText>
      ) : null}
      {item.meta ? (
        <AppText variant="bodySmall" tone="muted" style={{ marginTop: 2 }}>
          {item.meta}
        </AppText>
      ) : null}
      {item.subjectId ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver disciplina: ${item.title}`} onPress={() => onViewSubject(item.subjectId as string)} style={({ pressed }) => [styles.itemLink, pressed && styles.pressed]}>
          <Ionicons name="school-outline" size={15} color={theme.colors.brand.primaryStrong} />
          <AppText variant="bodySmallStrong" tone="brand">
            Ver disciplina
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
