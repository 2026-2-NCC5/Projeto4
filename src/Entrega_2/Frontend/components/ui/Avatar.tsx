import React from 'react';
import { View } from 'react-native';

import { useTheme } from '../../theme';
import { initials } from '../../utils/format';

import { AppText } from './AppText';

export interface AvatarProps {
  name: string | null | undefined;
  size?: number;
  accessibilityLabel?: string;
}

/** Avatar circular com iniciais (a API não expõe foto). */
export function Avatar({ name, size = 40, accessibilityLabel }: AvatarProps) {
  const theme = useTheme();
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.colors.brand.primarySoft, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityLabel={accessibilityLabel ?? `Avatar de ${name ?? 'estudante'}`}
    >
      <AppText variant={size >= 64 ? 'h2' : size >= 44 ? 'h4' : 'bodySmallStrong'} tone="brand" style={{ fontWeight: '600' }}>
        {initials(name)}
      </AppText>
    </View>
  );
}
