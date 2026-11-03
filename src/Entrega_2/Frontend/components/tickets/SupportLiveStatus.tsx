import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { formatFriendlyDateTime } from '../../features/support/format';
import { useSupportRealtime, type SupportRealtimeState } from '../../features/support/realtime';
import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const LABELS: Record<SupportRealtimeState, string> = {
  connecting: 'Conectando para receber atualizações',
  live: 'Atualizações automáticas ativas',
  reconnecting: 'Reconectando',
  offline: 'Sem conexão',
};

const ICONS: Record<SupportRealtimeState, IconName> = {
  connecting: 'sync-outline',
  live: 'sync-outline',
  reconnecting: 'refresh-outline',
  offline: 'cloud-offline-outline',
};

/** "Reconectando · Última atualização: Hoje, 18:42". Sem o horário quando está recebendo normalmente. */
export function realtimeStatusLine(state: SupportRealtimeState, lastSyncAt: number | null, now?: Date): string {
  if (state === 'live' || lastSyncAt === null) return LABELS[state];
  return `${LABELS[state]} · Última atualização: ${formatFriendlyDateTime(new Date(lastSyncAt).toISOString(), now)}`;
}

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  text: { flex: 1 },
}));

/**
 * Linha discreta com o estado das atualizações automáticas. Fala só da ligação do app com o ASA e nunca promete tempo
 * real. Desligada (modo de demonstração, fora do provider), não mostra nada.
 */
export function SupportLiveStatus({ updatedAt }: { updatedAt: number | null }) {
  const theme = useTheme();
  const styles = useStyles();
  const realtime = useSupportRealtime();
  if (!realtime.enabled) return null;
  // Os dados na tela também podem ter vindo de uma recarga mais recente que a última resposta do feed.
  const known = [realtime.lastSyncAt, updatedAt].filter((value): value is number => value !== null);
  const text = realtimeStatusLine(realtime.state, known.length > 0 ? Math.max(...known) : null);
  return (
    <View style={styles.row} accessible accessibilityRole="text" accessibilityLabel={text} accessibilityLiveRegion={realtime.state === 'live' ? 'none' : 'polite'} testID="ticket-live-status">
      <Ionicons name={ICONS[realtime.state]} size={14} color={theme.colors.text.muted} />
      <AppText variant="caption" tone="muted" style={styles.text}>
        {text}
      </AppText>
    </View>
  );
}
