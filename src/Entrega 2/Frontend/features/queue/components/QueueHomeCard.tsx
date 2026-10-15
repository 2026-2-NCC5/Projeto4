import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { AppButton, AppText, Badge, Surface } from '../../../components/ui';
import { useOptionalAppNavigation } from '../../../navigation/AppNavigator';
import { makeStyles } from '../../../theme';
import { useOptionalQueue } from '../hooks/useQueue';
import { peopleAhead } from '../state/experience';

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md },
  ticket: { fontVariant: ['tabular-nums'], letterSpacing: 1, fontWeight: '700' },
  actions: { marginTop: theme.spacing.md, flexDirection: 'row' },
}));

/**
 * Resumo da fila no Início — só existe enquanto o aluno acompanha uma senha (nada de card vazio).
 * Fundo neutro; o tom aparece só no selo de status.
 */
export function QueueHomeCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const queue = useOptionalQueue();
  const navigation = useOptionalAppNavigation();
  const sub = queue?.status?.subscription;
  if (!queue?.tracking || !sub) return null;

  const called = sub.status === 'called';
  const detail = called
    ? sub.calledDesk
      ? `${sub.ticket} · ${sub.calledDesk}`
      : `${sub.ticket} · confira a mesa no painel`
    : sub.positionKnown && sub.ahead !== null
      ? sub.ahead === 0
        ? 'Sua senha é a próxima'
        : `${peopleAhead(sub.ahead)} à frente`
      : 'Aguardando a sua senha aparecer no painel';
  const badge = called ? { label: 'É sua vez!', tone: 'success' as const } : sub.status === 'waiting' ? { label: 'Aguardando', tone: 'neutral' as const } : { label: 'Chegando', tone: 'warning' as const };

  return (
    <Surface style={style} testID="queue-home-card">
      <View style={styles.row}>
        <View accessible accessibilityLabel={`Fila ASA. ${called ? 'É sua vez!' : 'Sua senha'} ${sub.ticket}. ${detail}`}>
          <AppText variant="label" tone="secondary">
            {called ? 'Fila ASA · É sua vez!' : 'Fila ASA · Sua senha'}
          </AppText>
          <AppText variant="metric" tone={called ? 'success' : 'primary'} style={styles.ticket}>
            {sub.ticket}
          </AppText>
          <AppText variant="bodySmall" tone="secondary">
            {detail}
          </AppText>
        </View>
        <Badge label={badge.label} tone={badge.tone} />
      </View>
      <View style={styles.actions}>
        <AppButton label={called ? 'Ver atendimento' : 'Ver fila'} variant="secondary" size="small" icon="chevron-forward" iconPosition="right" onPress={() => navigation?.openQueue()} testID="queue-home-open" />
      </View>
    </Surface>
  );
}
