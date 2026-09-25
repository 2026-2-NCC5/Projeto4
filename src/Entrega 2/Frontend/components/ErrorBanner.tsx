import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '../theme';
import { MESSAGES } from '../utils/messages';

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
  banner: { borderRadius: theme.radius.lg, padding: theme.spacing.lg, borderWidth: 1, marginTop: theme.spacing.md },
  danger: { backgroundColor: theme.colors.status.errorSoft, borderColor: theme.colors.status.error },
  warning: { backgroundColor: theme.colors.status.warningSoft, borderColor: theme.colors.status.warning },
  row: { flexDirection: 'row', gap: theme.spacing.sm + 2, alignItems: 'flex-start' },
  textWrap: { flex: 1 },
  retry: { marginTop: theme.spacing.md, minHeight: theme.minTouchTarget, borderRadius: theme.radius.md, backgroundColor: theme.colors.brand.secondary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg },
  pressed: { opacity: 0.75 },
}));

export function ErrorBanner({ message, title, tone = 'danger', onRetry, retryLabel = MESSAGES.retry, testID }: ErrorBannerProps) {
  const theme = useTheme();
  const styles = useStyles();
  const isWarning = tone === 'warning';
  const textTone = isWarning ? 'warning' : 'error';
  return (
    <View style={[styles.banner, isWarning ? styles.warning : styles.danger]} accessibilityRole="alert" accessibilityLiveRegion="assertive" testID={testID}>
      <View style={styles.row}>
        <Ionicons name={isWarning ? 'warning-outline' : 'alert-circle-outline'} size={20} color={isWarning ? theme.colors.status.warningText : theme.colors.status.errorText} accessibilityElementsHidden importantForAccessibility="no" />
        <View style={styles.textWrap}>
          {title ? (
            <AppText variant="bodyStrong" tone={textTone}>
              {title}
            </AppText>
          ) : null}
          <AppText variant="body" tone={textTone}>
            {message}
          </AppText>
        </View>
      </View>
      {onRetry ? (
        <Pressable accessibilityRole="button" accessibilityLabel={retryLabel} onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
          <Ionicons name="refresh-outline" size={16} color="#FFFFFF" />
          <AppText variant="bodySmallStrong" style={{ color: '#FFFFFF' }}>
            {retryLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
