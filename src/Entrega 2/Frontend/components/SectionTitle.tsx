import React from 'react';

import { SectionHeader } from './ui/SectionHeader';

interface SectionTitleProps {
  title: string;
  action?: string;
  onAction?: () => void;
  actionAccessibilityLabel?: string;
}

/** Alias legado de `SectionHeader`. */
export function SectionTitle(props: SectionTitleProps) {
  return <SectionHeader {...props} />;
}
