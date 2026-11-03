import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  text: { flex: 1 },
}));

/** Chamado aberto pelo WhatsApp: deixa claro o que as atualizações no app significam (e o que não significam). */
export function TicketWhatsAppNote() {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.row} testID="ticket-whatsapp-note">
      <Ionicons name="logo-whatsapp" size={20} color={theme.colors.text.secondary} />
      <AppText variant="bodySmall" tone="secondary" style={styles.text}>
        Este atendimento começou pelo WhatsApp. As atualizações aqui são da equipe do ASA e não significam que uma mensagem chegou ao seu WhatsApp.
      </AppText>
    </View>
  );
}
