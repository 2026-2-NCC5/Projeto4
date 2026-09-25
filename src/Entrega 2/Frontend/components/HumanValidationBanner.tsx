import React from 'react';
import { View } from 'react-native';

import { makeStyles } from '../theme';
import { MESSAGES } from '../utils/messages';

import { Pill } from './Pill';
import { AppText } from './ui/AppText';

interface HumanValidationBannerProps {
  nextAction?: string | null;
  compact?: boolean;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  banner: { backgroundColor: theme.colors.status.infoSoft, borderRadius: theme.radius.lg, padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.status.info, marginTop: theme.spacing.md, gap: theme.spacing.sm + 2 },
  compact: { padding: theme.spacing.md },
  nextBox: { backgroundColor: theme.colors.surface.primary, borderRadius: theme.radius.md, padding: theme.spacing.md },
}));

export function HumanValidationBanner({ nextAction, compact = false, testID }: HumanValidationBannerProps) {
  const styles = useStyles();
  return (
    <View style={[styles.banner, compact && styles.compact]} accessibilityRole="alert" accessibilityLiveRegion="polite" testID={testID}>
      <Pill label="Validação humana" icon="ⓘ" tone="info" accessibilityLabel="Requer validação humana" />
      <AppText variant="bodyStrong" tone="info">
        {MESSAGES.humanValidation}
      </AppText>
      {nextAction ? (
        <View style={styles.nextBox}>
          <AppText variant="label" tone="info" uppercase>
            Próxima ação
          </AppText>
          <AppText variant="bodySmallStrong" style={{ marginTop: 4 }}>
            {nextAction}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
