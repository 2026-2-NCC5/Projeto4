import React from 'react';
import { View } from 'react-native';

import { makeStyles } from '../theme';

import { AppText } from './ui/AppText';

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md, minHeight: 48, paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
  value: { flex: 1, textAlign: 'right' },
}));

/** Par rótulo/valor para usar dentro de um `List` (dados cadastrais, origem de uma análise). */
export function InfoRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="body" tone="secondary">
        {label}
      </AppText>
      <AppText variant="bodyStrong" style={styles.value}>
        {value}
      </AppText>
    </View>
  );
}
