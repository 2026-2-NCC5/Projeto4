import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { PressableScale } from '../ui/PressableScale';

export type VoiceButtonMode = 'idle' | 'listening' | 'answering' | 'busy' | 'unavailable';

export const VOICE_BUTTON_LABELS: Record<VoiceButtonMode, string> = {
  idle: 'Falar com o assistente ASA',
  listening: 'Parar e enviar',
  answering: 'Parar resposta e falar novamente',
  busy: 'Aguarde, o assistente está processando sua pergunta',
  unavailable: 'Entrada por voz indisponível. Use o campo de texto para perguntar',
};

const CAPTIONS: Record<VoiceButtonMode, string> = {
  idle: 'Falar',
  listening: 'Enviar',
  answering: 'Falar',
  busy: 'Aguarde',
  unavailable: 'Voz indisponível',
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<VoiceButtonMode, IconName> = {
  idle: 'mic',
  listening: 'stop',
  answering: 'mic',
  busy: 'ellipsis-horizontal',
  unavailable: 'mic-off',
};

interface VoiceButtonProps {
  mode: VoiceButtonMode;
  onPress: () => void;
  size?: number;
  /** Sobre fundo escuro (experiência imersiva). */
  onDark?: boolean;
  showCaption?: boolean;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  wrapper: { alignItems: 'center' },
  button: { alignItems: 'center', justifyContent: 'center', ...theme.shadows.assistantGlow },
}));

/** Botão principal do microfone. O rótulo acessível descreve a ação atual (nunca só o ícone/cor). */
export function VoiceButton({ mode, onPress, size = 76, onDark = false, showCaption = true, testID = 'voice-button' }: VoiceButtonProps) {
  const theme = useTheme();
  const styles = useStyles();
  const disabled = mode === 'busy' || mode === 'unavailable';
  const diameter = Math.max(size, theme.minTouchTarget);
  const background = disabled ? theme.colors.control.disabled : mode === 'listening' ? theme.colors.status.error : theme.colors.brand.primaryStrong;
  const iconColor = disabled ? theme.colors.control.disabledText : theme.colors.text.onPrimary;

  return (
    <View style={styles.wrapper}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={VOICE_BUTTON_LABELS[mode]}
        accessibilityHint={mode === 'idle' ? 'Ativa o microfone para você fazer uma pergunta' : undefined}
        accessibilityState={{ disabled, busy: mode === 'busy' }}
        disabled={disabled}
        onPress={onPress}
        haptic
        pressedScale={theme.motion.scale.pressedStrong}
        testID={testID}
        style={[styles.button, { width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: background }, disabled ? theme.shadows.none : null]}
      >
        <Ionicons name={ICONS[mode]} size={Math.round(diameter * 0.4)} color={iconColor} />
      </PressableScale>
      {showCaption ? (
        <AppText variant="caption" tone={disabled ? 'muted' : onDark ? 'inverseMuted' : 'secondary'} style={{ marginTop: theme.spacing.xs }} importantForAccessibility="no" accessibilityElementsHidden>
          {CAPTIONS[mode]}
        </AppText>
      ) : null}
    </View>
  );
}
