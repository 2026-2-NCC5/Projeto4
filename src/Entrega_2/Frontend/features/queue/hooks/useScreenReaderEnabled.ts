import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Leitor de tela (VoiceOver/TalkBack) ligado, atualizado em tempo real. */
export function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((value) => {
        if (active) setEnabled(Boolean(value));
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (value: boolean) => setEnabled(Boolean(value)));
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  return enabled;
}
