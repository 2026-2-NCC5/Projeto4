import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../theme';
import { MESSAGES } from '../utils/messages';

import { AppButton } from './ui/AppButton';
import { AppText } from './ui/AppText';

interface ErrorBannerProps {
  message: string;
  title?: string;
  tone?: 'danger' | 'warning';
  onRetry?: () => void;
  retryLabel?: string;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  banner: { borderRadius: theme.radius.md, padding: theme.spacing.md, marginTop: theme.spacing.md },
  danger: { backgroundColor: theme.colors.status.errorSoft },
  warning: { backgroundColor: theme.colors.status.warningSoft },
  row: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' },
  textWrap: { flex: 1, gap: 2 },
  retry: { alignSelf: 'flex-start', marginTop: theme.spacing.md, marginLeft: 26 },
}));

/** Erro inline (fundo suave do tom, sem borda) com "Tentar novamente" opcional. */
export function ErrorBanner({ message, title, tone = 'danger', onRetry, retryLabel = MESSAGES.retry, testID }: ErrorBannerProps) {
  const theme = useTheme();
  const styles = useStyles();
  const isWarning = tone === 'warning';
  const textTone = isWarning ? 'warning' : 'error';
  return (
    <View style={[styles.banner, isWarning ? styles.warning : styles.danger]} accessibilityRole="alert" accessibilityLiveRegion="assertive" testID={testID}>
      <View style={styles.row}>
        <Ionicons name={isWarning ? 'warning-outline' : 'alert-circle-outline'} size={18} color={isWarning ? theme.colors.status.warningText : theme.colors.status.errorText} style={{ marginTop: 1 }} accessibilityElementsHidden importantForAccessibility="no" />
        <View style={styles.textWrap}>
          {title ? (
            <AppText variant="bodyStrong" tone={textTone}>
              {title}
            </AppText>
          ) : null}
          <AppText variant="bodySmall" tone={textTone}>
            {message}
          </AppText>
        </View>
      </View>
      {onRetry ? <AppButton label={retryLabel} onPress={onRetry} variant="secondary" size="small" icon="refresh" style={styles.retry} /> : null}
    </View>
  );
}
