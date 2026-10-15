import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface AuthLinkRowProps {
  /** Texto de apoio antes do link (ex.: "Ainda não tem conta?"). */
  text: string;
  linkLabel: string;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  icon?: IconName;
  disabled?: boolean;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: theme.spacing.xxs },
  link: { minHeight: theme.minTouchTarget, justifyContent: 'center', paddingHorizontal: theme.spacing.xxs },
  pressed: { opacity: 0.7 },
}));

/** Linha "texto + link" usada nos rodapés das telas de autenticação (criar conta, entrar, voltar). */
export function AuthLinkRow({ text, linkLabel, onPress, accessibilityLabel, accessibilityHint, icon, disabled = false, testID }: AuthLinkRowProps) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      {icon ? <Ionicons name={icon} size={16} color={theme.colors.text.muted} accessibilityElementsHidden importantForAccessibility="no" /> : null}
      <AppText variant="bodySmall" tone="secondary">
        {text}
      </AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? linkLabel} accessibilityHint={accessibilityHint} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.link, pressed && styles.pressed]} testID={testID}>
        <AppText variant="bodySmallStrong" tone={disabled ? 'muted' : 'link'}>
          {linkLabel}
        </AppText>
      </Pressable>
    </View>
  );
}
