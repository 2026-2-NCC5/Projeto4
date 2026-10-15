import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { STATUS_META } from '../../features/support/labels';
import { makeStyles, useTheme } from '../../theme';
import type { SupportTicketStatus } from '../../types/api';
import { AppText } from '../ui/AppText';

import { toneColors } from './tone';

const useStyles = makeStyles((theme) => ({
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs, paddingHorizontal: theme.spacing.sm, paddingVertical: 3, borderRadius: theme.radius.sm },
}));

export interface TicketStatusBadgeProps {
  status: SupportTicketStatus;
  /** texto completo em vez do curto (cabeçalho do detalhe) */
  full?: boolean;
  testID?: string;
}

/** Situação com cor + ícone + texto (nunca só cor). */
export function TicketStatusBadge({ status, full = false, testID }: TicketStatusBadgeProps) {
  const theme = useTheme();
  const styles = useStyles();
  const meta = STATUS_META[status];
  const colors = toneColors(theme, meta.tone);
  const label = full ? meta.label : meta.short;
  return (
    <View style={[styles.badge, { backgroundColor: colors.background }]} accessible accessibilityRole="text" accessibilityLabel={`Situação: ${meta.label}`} testID={testID}>
      <Ionicons name={meta.icon} size={13} color={colors.foreground} />
      <AppText variant="caption" style={{ color: colors.foreground, fontWeight: '600' }} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}
