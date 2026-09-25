import React from 'react';
import { View } from 'react-native';

import { makeStyles } from '../../theme';
import { AppText } from '../ui/AppText';

interface AuthSectionProps {
  title: string;
  description?: string;
  /** Primeira seção do card (sem margem superior). */
  first?: boolean;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  section: { marginTop: theme.spacing.xxl },
  first: { marginTop: 0 },
  description: { marginTop: theme.spacing.xxs },
}));

/** Cabeçalho de grupo dentro dos cards de autenticação: organiza os campos em blocos nomeados. */
export function AuthSection({ title, description, first = false, testID }: AuthSectionProps) {
  const styles = useStyles();
  return (
    <View style={[styles.section, first && styles.first]} testID={testID}>
      <AppText variant="h4" accessibilityRole="header">
        {title}
      </AppText>
      {description ? (
        <AppText variant="bodySmall" tone="secondary" style={styles.description}>
          {description}
        </AppText>
      ) : null}
    </View>
  );
}
