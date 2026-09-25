import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '../theme';
import type { AgentRecommendation } from '../types/api';
import { formatConfidence, recommendationTypeIcon, recommendationTypeLabel, recommendationTypeTone } from '../utils/format';

import { Card } from './Card';
import { HumanValidationBanner } from './HumanValidationBanner';
import { Pill } from './Pill';
import { AppText } from './ui/AppText';

interface RecommendationCardProps {
  recommendation: AgentRecommendation;
  onViewSubject?: (subjectId: string) => void;
  onOpenDetail?: (recommendationId: string) => void;
  /** Oculta o banner de validação humana (quando já exibido no nível da análise). */
  hideValidationBanner?: boolean;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  card: { marginBottom: theme.spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm },
  details: { borderTopWidth: 1, borderTopColor: theme.colors.border.subtle, marginTop: theme.spacing.lg - 1, paddingTop: theme.spacing.lg - 1 },
  evidenceRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginBottom: theme.spacing.sm },
  bullet: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.brand.primary, marginTop: 6 },
  nextBox: { backgroundColor: theme.colors.brand.primarySoft, borderRadius: theme.radius.md, padding: theme.spacing.md + 1, marginTop: theme.spacing.sm + 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  actionButton: { minHeight: theme.minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, paddingHorizontal: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border.default, backgroundColor: theme.colors.surface.primary },
  pressed: { opacity: 0.7 },
}));

export function RecommendationCard({ recommendation, onViewSubject, onOpenDetail, hideValidationBanner = false, testID }: RecommendationCardProps) {
  const theme = useTheme();
  const styles = useStyles();
  const typeLabel = recommendationTypeLabel(recommendation.type);
  const confidence = formatConfidence(recommendation.confidence);
  const evidence = recommendation.evidence ?? [];

  return (
    <Card style={styles.card} testID={testID}>
      <View style={styles.top}>
        <Pill label={typeLabel} icon={recommendationTypeIcon(recommendation.type)} tone={recommendationTypeTone(recommendation.type)} />
        {confidence ? (
          <AppText variant="caption" tone="muted" accessibilityLabel={confidence}>
            {confidence}
          </AppText>
        ) : null}
      </View>

      <AppText variant="h4" accessibilityRole="header" style={{ marginTop: theme.spacing.md + 1 }}>
        {recommendation.message}
      </AppText>

      <View style={styles.details}>
        <AppText variant="label" tone="brand" style={{ marginBottom: 2 }}>
          POR QUE ESTOU VENDO ISSO?
        </AppText>
        <AppText variant="bodySmall" tone="muted" style={{ marginBottom: theme.spacing.sm + 2 }}>
          Por que estou vendo isso?
        </AppText>
        {evidence.length > 0 ? (
          evidence.map((item, index) => (
            <View key={`${index}-${item}`} style={styles.evidenceRow} accessible accessibilityLabel={`Evidência ${index + 1}: ${item}`}>
              <View style={styles.bullet} />
              <AppText variant="bodySmall" style={{ flex: 1 }}>
                {item}
              </AppText>
            </View>
          ))
        ) : (
          <AppText variant="bodySmall" tone="muted" style={{ fontStyle: 'italic' }}>
            Sem evidências adicionais registradas.
          </AppText>
        )}

        {recommendation.nextAction ? (
          <View style={styles.nextBox}>
            <AppText variant="label" tone="brand" uppercase>
              Próxima ação
            </AppText>
            <AppText variant="bodySmallStrong" style={{ marginTop: 5 }}>
              {recommendation.nextAction}
            </AppText>
          </View>
        ) : null}
      </View>

      {recommendation.requiresHumanValidation && !hideValidationBanner ? <HumanValidationBanner compact /> : null}

      {(recommendation.subjectId && onViewSubject) || onOpenDetail ? (
        <View style={styles.actions}>
          {recommendation.subjectId && onViewSubject ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Ver disciplina" accessibilityHint="Abre a aba Acadêmico com a disciplina em destaque" onPress={() => onViewSubject(recommendation.subjectId as string)} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
              <Ionicons name="school-outline" size={16} color={theme.colors.brand.primaryStrong} />
              <AppText variant="bodySmallStrong" tone="brand">
                Ver disciplina
              </AppText>
            </Pressable>
          ) : null}
          {onOpenDetail ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Ver detalhes da recomendação" onPress={() => onOpenDetail(recommendation.id)} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
              <Ionicons name="open-outline" size={16} color={theme.colors.brand.primaryStrong} />
              <AppText variant="bodySmallStrong" tone="brand">
                Ver detalhes
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
