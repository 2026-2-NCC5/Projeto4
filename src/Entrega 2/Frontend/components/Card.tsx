import React, { type PropsWithChildren } from 'react';
import type { ViewProps } from 'react-native';

import { Surface, type SurfaceTone } from './ui/Surface';

export type CardTone = 'default' | 'navy' | 'warning' | 'info' | 'mint' | 'danger';

interface CardProps extends ViewProps {
  tone?: CardTone;
}

const TONE_MAP: Record<CardTone, SurfaceTone> = {
  default: 'default',
  navy: 'inverse',
  warning: 'warning',
  info: 'info',
  mint: 'brand',
  danger: 'error',
};

/** Card legado — agora um alias tematizado de `Surface` (mantém a API usada pelas telas). */
export function Card({ children, style, tone = 'default', ...rest }: PropsWithChildren<CardProps>) {
  return (
    <Surface tone={TONE_MAP[tone]} style={style} {...rest}>
      {children}
    </Surface>
  );
}
