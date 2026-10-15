import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../theme';
import { MESSAGES } from '../utils/messages';

import { AppText } from './ui/AppText';
import { Badge } from './ui/Badge';

interface HumanValidationBannerProps {
  nextAction?: string | null;
  compact?: boolean;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  banner: { backgroundColor: theme.colors.status.infoSoft, borderRadius: theme.radius.md, padding: theme.spacing.lg, marginTop: theme.spacing.md, gap: theme.spacing.sm },
  compact: { padding: theme.spacing.md },
  next: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start', marginTop: theme.spacing.xxs },
  nextText: { flex: 1 },
}));

/** A recomendação depende de uma pessoa da instituição: aviso informativo (azul), nunca erro. */
export function HumanValidationBanner({ nextAction, compact = false, testID }: HumanValidationBannerProps) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.banner, compact && styles.compact]} accessibilityRole="alert" accessibilityLiveRegion="polite" testID={testID}>
      <Badge label="Validação humana" icon="ⓘ" tone="info" accessibilityLabel="Requer validação humana" />
      <AppText variant="bodyStrong" tone="info">
        {MESSAGES.humanValidation}
      </AppText>
      {nextAction ? (
        <View style={styles.next}>
          <Ionicons name="arrow-forward" size={16} color={theme.colors.status.infoText} style={{ marginTop: 1 }} />
          <View style={styles.nextText}>
            <AppText variant="caption" tone="info">
              Próxima ação
            </AppText>
            <AppText variant="bodySmallStrong">{nextAction}</AppText>
          </View>
        </View>
      ) : null}
    </View>
  );
}
