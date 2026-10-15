import React from 'react';

import { List, SettingRow } from '../../../components/ui';
import type { QueueAlertPreferences, QueuePreferencesRequest } from '../../../types/api';

export interface QueueAlertSettingsProps {
  preferences: QueueAlertPreferences;
  onChange: (changes: QueuePreferencesRequest) => void;
  /** permissão do sistema negada/indisponível: a chave de notificação explica o motivo */
  pushBlocked?: boolean;
}

/** Alertas da fila: o aluno decide notificação, vibração e fala do ASA IA (nada é obrigatório). */
export function QueueAlertSettings({ preferences, onChange, pushBlocked = false }: QueueAlertSettingsProps) {
  return (
    <List inset="icon" testID="queue-alert-settings">
      <SettingRow
        kind="switch"
        icon="notifications-outline"
        label="Notificação"
        description={pushBlocked ? 'Bloqueada no aparelho: os avisos aparecem com o app aberto.' : 'Aviso no celular quando sua vez estiver chegando e quando for chamado.'}
        value={preferences.pushEnabled}
        onChange={(pushEnabled) => onChange({ pushEnabled })}
        testID="queue-pref-push"
      />
      <SettingRow
        kind="switch"
        icon="phone-portrait-outline"
        label="Vibração"
        description="Vibra ao se aproximar e, com dois toques, quando for chamado."
        value={preferences.vibrationEnabled}
        onChange={(vibrationEnabled) => onChange({ vibrationEnabled })}
        testID="queue-pref-vibration"
      />
      <SettingRow
        kind="switch"
        icon="mic-outline"
        label="ASA IA por voz"
        description="O ASA IA fala os alertas da fila com o app aberto."
        value={preferences.voiceEnabled}
        onChange={(voiceEnabled) => onChange({ voiceEnabled })}
        testID="queue-pref-voice"
      />
    </List>
  );
}
