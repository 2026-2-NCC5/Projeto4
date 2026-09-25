import React from 'react';

import type { PillTone } from '../types/ui';

import { Badge } from './ui/Badge';

interface PillProps {
  label: string;
  tone?: PillTone;
  /** Ícone textual (ex.: "⚠", "✓", "ⓘ") — status nunca é comunicado só por cor. */
  icon?: string;
  accessibilityLabel?: string;
  testID?: string;
}

/** Alias tematizado de `Badge` (API legada). */
export function Pill({ label, tone = 'neutral', icon, accessibilityLabel, testID }: PillProps) {
  return <Badge label={label} tone={tone} icon={icon} accessibilityLabel={accessibilityLabel} testID={testID} />;
}
