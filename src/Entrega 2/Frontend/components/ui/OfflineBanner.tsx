import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { makeStyles, useTheme } from '../../theme';

import { AppText } from './AppText';

const useStyles = makeStyles((theme) => ({
  banner: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.colors.status.warningSoft, borderColor: theme.colors.status.warning, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, marginBottom: theme.spacing.md },
  text: { flex: 1 },
}));

/** "Você está offline. Algumas informações podem estar desatualizadas." */
export function OfflineBanner() {
  const theme = useTheme();
  const styles = useStyles();
  const { isOffline } = useNetworkStatus();
  if (!isOffline) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="offline-banner">
      <Ionicons name="cloud-offline-outline" size={18} color={theme.colors.status.warningText} />
      <View style={styles.text}>
        <AppText variant="bodySmallStrong" tone="warning">
          Você está offline.
        </AppText>
        <AppText variant="caption" tone="warning" style={{ fontWeight: '400' }}>
          Algumas informações podem estar desatualizadas.
        </AppText>
      </View>
    </View>
  );
}
