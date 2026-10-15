import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import type { AssistantTurn } from '../../types/assistant';
import type { AssistantDisplayItem, AssistantNavigationParams, AssistantNavigationTarget, AssistantNextAction } from '../../types/api';
import { assistantItemIcon, assistantItemTone, assistantItemToneLabel, assistantStatusIcon, assistantStatusLabel, assistantStatusTone } from '../../utils/format';
import { AbstentionCard } from '../AbstentionCard';
import { HumanValidationBanner } from '../HumanValidationBanner';
import { RecommendationCard } from '../RecommendationCard';
import { TechnicalDetails } from '../TechnicalDetails';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';
import { Badge } from '../ui/Badge';
import { List } from '../ui/ListItem';

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
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm, flexWrap: 'wrap', marginTop: theme.spacing.md },
  items: { marginTop: theme.spacing.md },
  item: { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing.sm },
  itemTitle: { flex: 1 },
  itemLink: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs, alignSelf: 'flex-start', minHeight: 36, marginTop: theme.spacing.xxs },
  recommendations: { marginTop: theme.spacing.xl },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  pressed: { opacity: 0.6 },
}));

/** Resposta estruturada do assistente: título, itens em lista, recomendações explicáveis e próximas ações. */
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
  // Resposta normal não precisa de etiqueta; o status só aparece quando muda a leitura da resposta.
  const showStatus = response.status !== 'success';

  const runAction = (action: AssistantNextAction) => {
    if (action.type === 'navigate') onNavigate(action.target, action.params);
    else if (action.type === 'ask') onAsk(action.text);
    else onAsk(RUN_ANALYSIS_PROMPT);
  };

  return (
    <View testID="voice-response">
      {showStatus || (canRepeat && onRepeat) ? (
        <View style={styles.top}>
          {showStatus ? <Badge label={assistantStatusLabel(response.status)} icon={assistantStatusIcon(response.status)} tone={assistantStatusTone(response.status)} /> : <View />}
          {canRepeat && onRepeat ? <AppButton label="Repetir resposta" icon="volume-high-outline" variant="ghost" size="small" onPress={onRepeat} /> : null}
        </View>
      ) : null}
      {display.title ? (
        <AppText variant="h4" accessibilityRole="header" style={{ marginTop: theme.spacing.md }}>
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
          <List>
            {items.map((item) => (
              <ResponseItem key={item.id} item={item} onViewSubject={(subjectId) => onNavigate('subject', { subjectId })} />
            ))}
          </List>
          {hiddenItems > 0 ? (
            <AppText variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
              {`+ ${hiddenItems} ${hiddenItems === 1 ? 'item' : 'itens'}. Toque em “Ver detalhes”.`}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {isAbstained ? <AbstentionCard reason={response.abstentionReason} /> : null}
      {needsValidation ? <HumanValidationBanner nextAction={validationNextAction} compact={compact} /> : null}

      {!compact && recommendations.length > 0 ? (
        <View style={styles.recommendations}>
          <AppText variant="h4" accessibilityRole="header" style={{ marginBottom: theme.spacing.md }}>
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
          {(compact ? response.nextActions.slice(0, 3) : response.nextActions).map((action, index) => (
            <AppButton
              key={`${action.type}-${index}-${action.label}`}
              label={action.label}
              icon={actionIcon(action)}
              variant="secondary"
              size="small"
              disabled={actionsDisabled && action.type !== 'navigate'}
              onPress={() => runAction(action)}
            />
          ))}
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
  const subjectId = item.subjectId;
  return (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <AppText variant="bodyStrong" style={styles.itemTitle}>
          {item.title}
        </AppText>
        <Badge label={badge} icon={assistantItemIcon(item.tone)} tone={assistantItemTone(item.tone)} />
      </View>
      {item.description ? (
        <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
          {item.description}
        </AppText>
      ) : null}
      {item.meta ? (
        <AppText variant="caption" tone="muted" style={{ marginTop: 2 }}>
          {item.meta}
        </AppText>
      ) : null}
      {subjectId ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver disciplina: ${item.title}`} onPress={() => onViewSubject(subjectId)} style={({ pressed }) => [styles.itemLink, pressed && styles.pressed]}>
          <AppText variant="bodySmallStrong" tone="link">
            Ver disciplina
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.text.link} />
        </Pressable>
      ) : null}
    </View>
  );
}
