import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { makeStyles, useTheme } from '../../theme';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';

import { Appear } from './Appear';

export interface TicketEmptyStateProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

const useStyles = makeStyles((theme) => ({
  container: { alignItems: 'center', paddingVertical: theme.spacing.xxxl, paddingHorizontal: theme.spacing.xl },
  action: { marginTop: theme.spacing.xl },
}));

/** Ilustração simples em tons neutros: um balão de conversa com linhas e um pequeno check verde. */
function Illustration() {
  const theme = useTheme();
  const { colors } = theme;
  return (
    <Svg width={120} height={96} viewBox="0 0 120 96" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x={14} y={14} width={78} height={54} rx={12} fill={colors.surface.muted} />
      <Path d="M34 68 L30 82 L46 68 Z" fill={colors.surface.muted} />
      <Rect x={28} y={30} width={44} height={6} rx={3} fill={colors.border.strong} />
      <Rect x={28} y={44} width={30} height={6} rx={3} fill={colors.border.default} />
      <Circle cx={92} cy={62} r={16} fill={colors.brand.primarySoft} />
      <Path d="M85 62 L90 67 L99 57" stroke={colors.brand.primaryStrong} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** "Nenhum chamado por aqui" — com convite para abrir o primeiro. */
export function TicketEmptyState({
  title = 'Nenhum chamado por aqui',
  message = 'Quando você entrar em contato com o ASA, suas solicitações aparecerão aqui.',
  actionLabel,
  onAction,
  testID = 'tickets-empty',
}: TicketEmptyStateProps) {
  const styles = useStyles();
  return (
    <View style={styles.container} accessibilityLiveRegion="polite" testID={testID}>
      <Appear offset={6}>
        <Illustration />
      </Appear>
      <Appear index={1}>
        <AppText variant="h4" align="center" style={{ marginTop: 16 }}>
          {title}
        </AppText>
        <AppText variant="bodySmall" tone="secondary" align="center" style={{ marginTop: 6, maxWidth: 300 }}>
          {message}
        </AppText>
      </Appear>
      {actionLabel && onAction ? (
        <Appear index={2} style={styles.action}>
          <AppButton label={actionLabel} icon="add" onPress={onAction} testID={`${testID}-action`} />
        </Appear>
      ) : null}
    </View>
  );
}
