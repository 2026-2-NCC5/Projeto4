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
  onBack?: () => void;
  backLabel?: string;
  right?: React.ReactNode;
}

const useStyles = makeStyles((theme) => ({
  wrapper: { marginBottom: theme.spacing.xl },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: theme.minTouchTarget, paddingRight: theme.spacing.md, marginLeft: -theme.spacing.xs, marginBottom: theme.spacing.xxs },
  pressed: { opacity: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.md },
  titles: { flex: 1 },
}));

/** Cabeçalho de tela: título, contexto em uma linha e ação opcional. Ocupa pouco espaço vertical. */
export function ScreenHeader({ title, subtitle, onBack, backLabel = MESSAGES.back, right }: ScreenHeaderProps) {
  const theme = useTheme();
  const styles = useStyles();
  const responsive = useResponsive();
  const titleSize = responsive.fs(responsive.isCompact ? 24 : 26);
  return (
    <View style={styles.wrapper}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel={backLabel} accessibilityHint="Retorna à tela anterior" hitSlop={theme.hitSlop} onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text.link} />
          <AppText variant="bodyStrong" tone="link">
            {backLabel}
          </AppText>
        </Pressable>
      ) : null}
      <View style={styles.row}>
        <View style={styles.titles}>
          <AppText variant="h1" accessibilityRole="header" style={{ fontSize: titleSize, lineHeight: Math.round(titleSize * 1.23) }}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="body" tone="secondary" style={{ marginTop: theme.spacing.xxs }}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {right ? <View>{right}</View> : null}
      </View>
    </View>
  );
}
