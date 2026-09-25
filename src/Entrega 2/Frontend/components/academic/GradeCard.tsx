import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import type { StudentAssessment } from '../../types/api';
import { assessmentTypeLabel, formatDate, formatNumber } from '../../utils/format';
import { Pill } from '../Pill';
import { ProgressBar } from '../ProgressBar';
import { Surface } from '../ui/Surface';
import { AppText } from '../ui/AppText';

const useStyles = makeStyles((theme) => ({
  card: { marginBottom: theme.spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: theme.spacing.md, gap: theme.spacing.sm },
}));

/** Avaliação com nota em barra (0–max) — "GradeCard" do design system. */
export function GradeCard({ assessment, testID }: { assessment: StudentAssessment; testID?: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const graded = assessment.score !== null;
  const ratio = graded && assessment.maxScore > 0 ? ((assessment.score as number) / assessment.maxScore) * 100 : 0;
  const low = graded && ratio < 60;
  return (
    <Surface
      style={styles.card}
      testID={testID}
      accessible
      accessibilityLabel={`${assessment.title}, ${assessmentTypeLabel(assessment.type)} de ${assessment.subjectName}. ${graded ? `Nota ${formatNumber(assessment.score)} de ${formatNumber(assessment.maxScore, 0)}` : 'Sem nota registrada'}. ${assessment.appliedAt ? `Data ${formatDate(assessment.appliedAt)}` : ''}`}
    >
      <View style={styles.rowBetween}>
        <Pill label={assessmentTypeLabel(assessment.type)} tone="info" />
        <AppText variant="caption" tone="muted">
          {assessment.appliedAt ? formatDate(assessment.appliedAt) : 'Sem data'}
        </AppText>
      </View>
      <AppText variant="h4" style={{ marginTop: theme.spacing.md }}>
        {assessment.title}
      </AppText>
      <AppText variant="bodySmallStrong" tone="brand" style={{ marginTop: 2 }}>
        {assessment.subjectName}
      </AppText>
      <View style={styles.scoreRow}>
        <AppText variant={graded ? 'metric' : 'body'} tone={graded ? (low ? 'warning' : 'primary') : 'muted'}>
          {graded ? `${formatNumber(assessment.score)} / ${formatNumber(assessment.maxScore, 0)}` : 'Sem nota'}
        </AppText>
        {!graded ? <Pill label="Aguardando nota" icon="◷" tone="neutral" /> : null}
      </View>
      {graded ? (
        <View style={{ marginTop: theme.spacing.sm }}>
          <ProgressBar value={ratio} warning={low} accessibilityLabel={`Nota de ${assessment.title}: ${Math.round(ratio)}% do máximo`} />
        </View>
      ) : null}
    </Surface>
  );
}
