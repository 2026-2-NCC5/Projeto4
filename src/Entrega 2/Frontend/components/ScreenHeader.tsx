import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { useResponsive } from '../hooks/useResponsive';
import { makeStyles, useTheme } from '../theme';
import { MESSAGES } from '../utils/messages';

import { AppText } from './ui/AppText';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  onBack?: () => void;
  backLabel?: string;
  right?: React.ReactNode;
}

const useStyles = makeStyles((theme) => ({
  wrapper: { marginBottom: theme.spacing.sm },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: theme.minTouchTarget, paddingRight: theme.spacing.md, marginLeft: -theme.spacing.xs, marginBottom: theme.spacing.xs, borderRadius: theme.radius.md },
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md },
  titles: { flex: 1 },
}));

export function ScreenHeader({ title, subtitle, eyebrow, onBack, backLabel = MESSAGES.back, right }: ScreenHeaderProps) {
  const theme = useTheme();
  const styles = useStyles();
  const responsive = useResponsive();
  const titleSize = responsive.fs(responsive.isCompact ? 24 : 26);
  return (
    <View style={styles.wrapper}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel={backLabel} accessibilityHint="Retorna à tela anterior" hitSlop={theme.hitSlop} onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text.primary} />
          <AppText variant="bodyStrong">{backLabel}</AppText>
        </Pressable>
      ) : null}
      <View style={styles.row}>
        <View style={styles.titles}>
          {eyebrow ? (
            <AppText variant="label" tone="brand" uppercase style={{ marginBottom: theme.spacing.xxs }}>
              {eyebrow}
            </AppText>
          ) : null}
          <AppText variant="h1" accessibilityRole="header" style={{ fontSize: titleSize, lineHeight: Math.round(titleSize * 1.23) }}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="body" tone="muted" style={{ marginTop: theme.spacing.xxs }}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {right ? <View>{right}</View> : null}
      </View>
    </View>
  );
}
