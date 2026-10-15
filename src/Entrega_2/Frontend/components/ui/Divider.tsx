import React from 'react';
import { View } from 'react-native';

import { useTheme } from '../../theme';

export interface DividerProps {
  /** Recuo à esquerda (alinha o divisor ao texto de linhas com ícone). */
  inset?: number;
  /** Espaço vertical acima e abaixo. */
  spacing?: number;
}

/** Linha divisória de 1 px — separa itens de uma lista sem transformar cada um em card. */
export function Divider({ inset = 0, spacing = 0 }: DividerProps) {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.colors.border.subtle, marginLeft: inset, marginVertical: spacing }} />;
}
