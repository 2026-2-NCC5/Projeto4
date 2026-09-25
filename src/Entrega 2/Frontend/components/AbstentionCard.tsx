import React from 'react';
import { View } from 'react-native';

import { makeStyles } from '../theme';
import { MESSAGES } from '../utils/messages';

import { Card } from './Card';
import { Pill } from './Pill';
import { PrimaryButton } from './PrimaryButton';
import { AppText } from './ui/AppText';

interface AbstentionCardProps {
  reason: string | null;
  onRequestAgain?: () => void;
  requesting?: boolean;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  card: { marginTop: theme.spacing.md },
  reasonBox: { backgroundColor: theme.colors.surface.muted, borderRadius: theme.radius.md, padding: theme.spacing.md, marginTop: theme.spacing.md },
  actions: { marginTop: theme.spacing.lg },
}));

/** Abstenção é um resultado legítimo do agente — nunca é apresentada como erro. */
export function AbstentionCard({ reason, onRequestAgain, requesting = false, testID }: AbstentionCardProps) {
  const styles = useStyles();
  return (
    <Card style={styles.card} accessibilityRole="alert" accessibilityLiveRegion="polite" testID={testID}>
      <Pill label="Sem recomendação confiável" icon="ⓘ" tone="neutral" />
      <AppText variant="h4" style={{ marginTop: 12 }}>
        {MESSAGES.abstained}
      </AppText>
      <View style={styles.reasonBox}>
        <AppText variant="label" tone="muted" uppercase>
          Motivo
        </AppText>
        <AppText variant="bodySmallStrong" style={{ marginTop: 4 }}>
          {reason?.trim() || 'O agente não encontrou evidências suficientes para uma orientação segura.'}
        </AppText>
      </View>
      <AppText variant="bodySmall" tone="muted" style={{ marginTop: 12 }}>
        Isso não é uma falha: o agente prefere não recomendar quando os dados disponíveis não sustentam uma orientação confiável. Você pode tentar novamente mais tarde ou procurar a secretaria.
      </AppText>
      {onRequestAgain ? (
        <View style={styles.actions}>
          <PrimaryButton label="Solicitar nova análise" onPress={onRequestAgain} loading={requesting} variant="secondary" />
        </View>
      ) : null}
    </Card>
  );
}
