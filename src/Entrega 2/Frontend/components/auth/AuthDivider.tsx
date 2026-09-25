import React from 'react';
import { View } from 'react-native';

import { makeStyles } from '../../theme';
import { AppText } from '../ui/AppText';

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginVertical: theme.spacing.xl },
  line: { flex: 1, height: 1, backgroundColor: theme.colors.border.default },
}));

/** Divisor "OU" entre o formulário e as alternativas de acesso (largura das linhas calculada por flex). */
export function AuthDivider({ label = 'OU' }: { label?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.line} />
      <AppText variant="label" tone="muted" uppercase>
        {label}
      </AppText>
      <View style={styles.line} />
    </View>
  );
}
