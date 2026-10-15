import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Badge } from '../../components/ui/Badge';

import { DEMO_DATA_LABEL, isDemoMode, usePlatformInfo } from './platformInfo';

export interface DataModeBadgeProps {
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Rótulo discreto e permanente "DEMONSTRAÇÃO — Dados fictícios" (tom de atenção, ícone + texto). Só aparece
 * quando a API informa `dataMode: 'demo'`; sem a informação (falha de rede) nada é exibido.
 */
export function DataModeBadge({ style, testID = 'data-mode-badge' }: DataModeBadgeProps) {
  const { info } = usePlatformInfo();
  if (!isDemoMode(info)) return null;
  return (
    <View style={style}>
      <Badge label={DEMO_DATA_LABEL} tone="warning" icon="ⓘ" accessibilityLabel="Modo demonstração: dados fictícios" testID={testID} />
    </View>
  );
}
