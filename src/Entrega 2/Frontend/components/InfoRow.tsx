import React from 'react';
import { View } from 'react-native';

import { makeStyles } from '../theme';

import { AppText } from './ui/AppText';

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md },
  value: { flex: 1, textAlign: 'right' },
  divider: { height: 1, backgroundColor: theme.colors.border.subtle, marginVertical: theme.spacing.md + 2 },
}));

export function InfoRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="bodySmall" tone="muted">
        {label}
      </AppText>
      <AppText variant="bodySmallStrong" style={styles.value}>
        {value}
      </AppText>
    </View>
  );
}

export function Divider() {
  const styles = useStyles();
  return <View style={styles.divider} />;
}
