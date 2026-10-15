import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';

import { AppText } from '../../../components/ui';
import { makeStyles, NATIVE_DRIVER, useTheme } from '../../../theme';
import type { QueueSyncInfo } from '../../../types/api';
import { useNow } from '../hooks/useNow';
import { queueMotion } from '../motion';
import type { QueueConnection } from '../state/queueController';

export type QueueSyncLabel = 'Conectado' | 'Atualizando' | 'Sem conexão' | 'Fonte indisponível';

export function syncLabel(connection: QueueConnection, sync: QueueSyncInfo | null | undefined): QueueSyncLabel {
  if (connection === 'offline') return 'Sem conexão';
  if (sync?.status === 'unavailable') return 'Fonte indisponível';
  if (connection === 'live' && (sync?.status === 'live' || !sync)) return 'Conectado';
  return 'Atualizando';
}

/** "Atualizado agora" · "Atualizado há 20 s" · "Atualizado há 3 min". */
export function relativeUpdate(lastSuccessfulSyncAt: string | null | undefined, now: number): string | null {
  if (!lastSuccessfulSyncAt) return null;
  const seconds = Math.max(0, Math.round((now - Date.parse(lastSuccessfulSyncAt)) / 1000));
  if (!Number.isFinite(seconds)) return null;
  if (seconds < 10) return 'Atualizado agora';
  if (seconds < 60) return `Atualizado há ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Atualizado há ${minutes} min`;
  return 'Atualizado há mais de 1 h';
}

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  dot: { width: 8, height: 8, borderRadius: theme.radius.pill },
}));

export interface QueueSyncIndicatorProps {
  connection: QueueConnection;
  sync: QueueSyncInfo | null | undefined;
}

/** Indicador discreto (sem spinner de tela cheia): ponto colorido + texto, com um leve fade a cada atualização. */
export function QueueSyncIndicator({ connection, sync }: QueueSyncIndicatorProps) {
  const theme = useTheme();
  const styles = useStyles();
  const now = useNow(10_000);
  const [opacity] = useState(() => new Animated.Value(1));
  const lastSync = useRef(sync?.lastSuccessfulSyncAt ?? null);
  const label = syncLabel(connection, sync);

  useEffect(() => {
    const current = sync?.lastSuccessfulSyncAt ?? null;
    if (current === lastSync.current) return;
    lastSync.current = current;
    opacity.setValue(0.4);
    Animated.timing(opacity, { toValue: 1, duration: queueMotion.normal, useNativeDriver: NATIVE_DRIVER }).start();
  }, [sync?.lastSuccessfulSyncAt, opacity]);

  const color =
    label === 'Conectado' ? theme.colors.status.success : label === 'Atualizando' ? theme.colors.status.info : label === 'Fonte indisponível' ? theme.colors.status.warning : theme.colors.text.muted;
  // `now` avança a cada 10 s; leituras mais novas que ele contam como "agora" (diferença negativa → 0)
  const relative = relativeUpdate(sync?.lastSuccessfulSyncAt, now);
  const text = relative && label !== 'Sem conexão' ? `${label} · ${relative}` : label;
  return (
    <Animated.View style={[styles.row, { opacity }]} accessible accessibilityRole="text" accessibilityLabel={text} testID="queue-sync-indicator">
      <View style={[styles.dot, { backgroundColor: color }]} />
      <AppText variant="caption" tone="secondary">
        {text}
      </AppText>
    </Animated.View>
  );
}
