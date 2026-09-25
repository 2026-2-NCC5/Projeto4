import React from 'react';
import { View } from 'react-native';

import { useTheme } from '../../theme';
import { initials } from '../../utils/format';

import { AppText } from './AppText';

export interface AvatarProps {
  name: string | null | undefined;
  size?: number;
  tone?: 'brand' | 'inverse';
  accessibilityLabel?: string;
}

/** Avatar com iniciais sobre gradiente de marca (sem foto: a API não expõe imagem). */
export function Avatar({ name, size = 46, tone = 'brand', accessibilityLabel }: AvatarProps) {
  const theme = useTheme();
  const background = tone === 'brand' ? theme.colors.brand.secondary : theme.colors.surface.onInverse;
  const color = tone === 'brand' ? theme.colors.brand.highlight : theme.colors.text.inverse;
  return (
    <View
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.36), backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityLabel={accessibilityLabel ?? `Avatar de ${name ?? 'estudante'}`}
    >
      <AppText variant={size >= 64 ? 'h2' : 'h4'} style={{ color, fontWeight: '800' }}>
        {initials(name)}
      </AppText>
    </View>
  );
}
