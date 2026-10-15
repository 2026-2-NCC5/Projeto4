import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import type { StudentAssessment } from '../../types/api';
import { assessmentTypeLabel, formatDate, formatNumber } from '../../utils/format';
import { AppText } from '../ui/AppText';

/** Abaixo desta fração da nota máxima a nota é destacada (apenas visual). */
const LOW_SCORE_RATIO = 0.6;

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, minHeight: 56, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  body: { flex: 1, minWidth: 0 },
  score: { alignItems: 'flex-end' },
  scoreValue: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs },
}));

/** Avaliação como linha de tabela: título e contexto à esquerda, nota à direita. Use dentro de um `List`. */
export function GradeRow({ assessment, testID }: { assessment: StudentAssessment; testID?: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const graded = assessment.score !== null;
  const low = graded && assessment.maxScore > 0 && (assessment.score as number) / assessment.maxScore < LOW_SCORE_RATIO;
  const meta = [assessmentTypeLabel(assessment.type), assessment.subjectName, assessment.appliedAt ? formatDate(assessment.appliedAt) : 'Sem data'].join(' · ');
  return (
    <View
      style={styles.row}
      testID={testID}
      accessible
      accessibilityLabel={`${assessment.title}, ${assessmentTypeLabel(assessment.type)} de ${assessment.subjectName}. ${graded ? `Nota ${formatNumber(assessment.score)} de ${formatNumber(assessment.maxScore, 0)}` : 'Sem nota registrada'}. ${assessment.appliedAt ? `Data ${formatDate(assessment.appliedAt)}` : ''}${low ? ' Nota abaixo do esperado.' : ''}`}
    >
      <View style={styles.body}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {assessment.title}
        </AppText>
        <AppText variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
          {meta}
        </AppText>
      </View>
      <View style={styles.score}>
        {graded ? (
          <>
            <View style={styles.scoreValue}>
              {low ? <Ionicons name="alert-circle" size={14} color={theme.colors.status.warningText} /> : null}
              <AppText variant="h4" tone={low ? 'warning' : 'primary'}>
                {formatNumber(assessment.score)}
              </AppText>
            </View>
            <AppText variant="caption" tone="muted">
              de {formatNumber(assessment.maxScore, 0)}
            </AppText>
          </>
        ) : (
          <AppText variant="bodySmall" tone="muted">
            Aguardando nota
          </AppText>
        )}
      </View>
    </View>
  );
}
