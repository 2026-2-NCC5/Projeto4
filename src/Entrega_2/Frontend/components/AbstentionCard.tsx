import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../theme';
import { MESSAGES } from '../utils/messages';

import { AppButton } from './ui/AppButton';
import { AppText } from './ui/AppText';
import { Badge } from './ui/Badge';
import { Surface } from './ui/Surface';

interface AbstentionCardProps {
  reason: string | null;
  onRequestAgain?: () => void;
  requesting?: boolean;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  card: { marginTop: theme.spacing.md },
  reason: { marginTop: theme.spacing.md, paddingLeft: theme.spacing.md, borderLeftWidth: 2, borderLeftColor: theme.colors.border.default },
  actions: { marginTop: theme.spacing.lg, alignItems: 'flex-start' },
}));

/** Abstenção é um resultado legítimo do agente — nunca é apresentada como erro. */
export function AbstentionCard({ reason, onRequestAgain, requesting = false, testID }: AbstentionCardProps) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Surface style={styles.card} accessibilityRole="alert" accessibilityLiveRegion="polite" testID={testID}>
      <Badge label="Sem recomendação confiável" icon="ⓘ" tone="neutral" />
      <AppText variant="h4" style={{ marginTop: theme.spacing.md }}>
        {MESSAGES.abstained}
      </AppText>
      <View style={styles.reason}>
        <AppText variant="caption" tone="muted">
          Motivo
        </AppText>
        <AppText variant="bodySmallStrong" style={{ marginTop: 2 }}>
          {reason?.trim() || 'O agente não encontrou evidências suficientes para uma orientação segura.'}
        </AppText>
      </View>
      <AppText variant="bodySmall" tone="secondary" style={{ marginTop: theme.spacing.md }}>
        Isso não é uma falha: o agente prefere não recomendar quando os dados disponíveis não sustentam uma orientação confiável. Você pode tentar novamente mais tarde ou procurar a secretaria.
      </AppText>
      {onRequestAgain ? (
        <View style={styles.actions}>
          <AppButton label="Solicitar nova análise" icon="refresh" onPress={onRequestAgain} loading={requesting} variant="secondary" />
        </View>
      ) : null}
    </Surface>
  );
}
