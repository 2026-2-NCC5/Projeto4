import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../theme';
import type { AgentRecommendation } from '../types/api';
import { formatConfidence, recommendationTypeIcon, recommendationTypeLabel, recommendationTypeTone } from '../utils/format';

import { HumanValidationBanner } from './HumanValidationBanner';
import { AppButton } from './ui/AppButton';
import { AppText } from './ui/AppText';
import { Badge } from './ui/Badge';
import { Surface } from './ui/Surface';

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
  why: { marginTop: theme.spacing.lg, gap: theme.spacing.xs },
  evidenceRow: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' },
  bullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.text.muted, marginTop: 8 },
  next: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start', marginTop: theme.spacing.lg, paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border.subtle },
  nextText: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.lg },
}));

/** Recomendação explicável: o que fazer, por quê (evidências) e a próxima ação. */
export function RecommendationCard({ recommendation, onViewSubject, onOpenDetail, hideValidationBanner = false, testID }: RecommendationCardProps) {
  const theme = useTheme();
  const styles = useStyles();
  const confidence = formatConfidence(recommendation.confidence);
  const evidence = recommendation.evidence ?? [];
  const subjectId = recommendation.subjectId;

  return (
    <Surface style={styles.card} testID={testID}>
      <View style={styles.top}>
        <Badge label={recommendationTypeLabel(recommendation.type)} icon={recommendationTypeIcon(recommendation.type)} tone={recommendationTypeTone(recommendation.type)} />
        {confidence ? (
          <AppText variant="caption" tone="muted" accessibilityLabel={confidence}>
            {confidence}
          </AppText>
        ) : null}
      </View>

      <AppText variant="h4" accessibilityRole="header" style={{ marginTop: theme.spacing.md }}>
        {recommendation.message}
      </AppText>

      <View style={styles.why}>
        <AppText variant="bodySmallStrong" tone="secondary">
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
          <AppText variant="bodySmall" tone="muted">
            Sem evidências adicionais registradas.
          </AppText>
        )}
      </View>

      {recommendation.nextAction ? (
        <View style={styles.next}>
          <Ionicons name="arrow-forward" size={16} color={theme.colors.brand.primaryStrong} style={{ marginTop: 1 }} />
          <View style={styles.nextText}>
            <AppText variant="caption" tone="muted">
              Próxima ação
            </AppText>
            <AppText variant="bodySmallStrong">{recommendation.nextAction}</AppText>
          </View>
        </View>
      ) : null}

      {recommendation.requiresHumanValidation && !hideValidationBanner ? <HumanValidationBanner compact /> : null}

      {(subjectId && onViewSubject) || onOpenDetail ? (
        <View style={styles.actions}>
          {subjectId && onViewSubject ? (
            <AppButton label="Ver disciplina" icon="school-outline" variant="secondary" size="small" accessibilityHint="Abre a aba Acadêmico com a disciplina em destaque" onPress={() => onViewSubject(subjectId)} />
          ) : null}
          {onOpenDetail ? <AppButton label="Ver detalhes" accessibilityLabel="Ver detalhes da recomendação" icon="open-outline" variant="secondary" size="small" onPress={() => onOpenDetail(recommendation.id)} /> : null}
        </View>
      ) : null}
    </Surface>
  );
}
