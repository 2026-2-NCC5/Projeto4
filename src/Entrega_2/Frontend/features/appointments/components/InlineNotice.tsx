import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '../../../components/ui/AppText';
import { makeStyles, useTheme, type Theme } from '../../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type NoticeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface InlineNoticeProps {
  /** null não renderiza nada */
  message: string | null;
  tone?: NoticeTone;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  /** some sozinho depois deste tempo (ms) — chama onHide */
  autoHideMs?: number;
  onHide?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function toneColors(theme: Theme, tone: NoticeTone): { background: string; foreground: string } {
  const { colors } = theme;
  switch (tone) {
    case 'info':
      return { background: colors.status.infoSoft, foreground: colors.status.infoText };
    case 'success':
      return { background: colors.status.successSoft, foreground: colors.status.successText };
    case 'warning':
      return { background: colors.status.warningSoft, foreground: colors.status.warningText };
    case 'danger':
      return { background: colors.status.errorSoft, foreground: colors.status.errorText };
    default:
      return { background: colors.surface.muted, foreground: colors.text.secondary };
  }
}

const DEFAULT_ICONS: Record<NoticeTone, IconName> = {
  neutral: 'information-circle-outline',
  info: 'information-circle-outline',
  success: 'checkmark-circle-outline',
  warning: 'alert-circle-outline',
  danger: 'alert-circle-outline',
};

const useStyles = makeStyles((theme) => ({
  notice: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.md, minHeight: 44 },
  text: { flex: 1 },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: theme.spacing.xs },
}));

/**
 * Aviso em linha, sem animação e sem bloquear a tela ("Protocolo copiado", "Esse horário acabou de ser reservado").
 * Anunciado pelo leitor de tela; erros como alerta. Cor sempre acompanhada de ícone e texto.
 */
export function InlineNotice({ message, tone = 'neutral', icon, actionLabel, onAction, autoHideMs, onHide, style, testID }: InlineNoticeProps) {
  const theme = useTheme();
  const styles = useStyles();
  const colors = toneColors(theme, tone);

  useEffect(() => {
    if (!message || !autoHideMs || !onHide) return undefined;
    const timer = setTimeout(onHide, autoHideMs);
    return () => clearTimeout(timer);
  }, [autoHideMs, message, onHide]);

  if (!message) return null;
  return (
    <View
      style={[styles.notice, { backgroundColor: colors.background }, style]}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      accessibilityLiveRegion={tone === 'danger' ? 'assertive' : 'polite'}
      testID={testID}
    >
      <Ionicons name={icon ?? DEFAULT_ICONS[tone]} size={20} color={colors.foreground} />
      <AppText variant="bodySmall" style={[styles.text, { color: colors.foreground }]}>
        {message}
      </AppText>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} hitSlop={theme.hitSlop} style={styles.action}>
          <AppText variant="bodySmallStrong" style={{ color: colors.foreground }}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
