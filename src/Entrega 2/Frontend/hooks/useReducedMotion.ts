import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { usePreferences } from './usePreferences';

/** Configuração "Reduzir movimento" do sistema (iOS/Android/web), atualizada em tempo real. */
export function useSystemReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setEnabled(Boolean(value));
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value: boolean) => setEnabled(Boolean(value)));
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  return enabled;
}

/** true quando o sistema pede menos movimento ou o aluno escolheu "Reduzir animações: Sempre". */
export function useReducedMotion(): boolean {
  const { preferences } = usePreferences();
  const system = useSystemReduceMotion();
  return preferences.reduceMotion === 'always' || system;
}
