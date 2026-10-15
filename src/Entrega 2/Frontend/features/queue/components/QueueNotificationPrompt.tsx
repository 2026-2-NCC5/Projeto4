import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { View } from 'react-native';

import { AppButton, AppText, Surface } from '../../../components/ui';
import { makeStyles, useTheme } from '../../../theme';
import { openNotificationSettings, type PushPermission, type PushUnavailableReason } from '../services/pushNotifications';

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
  body: { flex: 1 },
  actions: { marginTop: theme.spacing.md, flexDirection: 'row' },
}));

export interface QueueNotificationPromptProps {
  permission: PushPermission;
  registered: boolean;
  reason: PushUnavailableReason | null;
  onRequest: () => Promise<PushPermission>;
}

/**
 * Permissão com contexto: só aparece depois que o aluno começa a acompanhar uma senha.
 * Negada → explica que a tela continua funcionando e como reativar nas configurações.
 */
export function QueueNotificationPrompt({ permission, registered, reason, onRequest }: QueueNotificationPromptProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [requesting, setRequesting] = useState(false);

  if (permission === 'granted' && (registered || reason === null)) return null;

  let icon: React.ComponentProps<typeof Ionicons>['name'] = 'notifications-outline';
  let title = 'Receba um aviso quando chegar a sua vez';
  let message = 'Ative as notificações para avisarmos quando sua vez estiver chegando, mesmo com o app fechado.';
  let action: { label: string; onPress: () => void } | null = {
    label: 'Ativar notificações',
    onPress: () => {
      setRequesting(true);
      void onRequest().finally(() => setRequesting(false));
    },
  };

  if (permission === 'denied') {
    icon = 'notifications-off-outline';
    title = 'Notificações desativadas';
    message = 'Você ainda pode acompanhar sua posição pelo aplicativo. Para receber avisos com o app fechado, ative as notificações nas configurações.';
    action = { label: 'Abrir configurações', onPress: openNotificationSettings };
  } else if (permission === 'unavailable' || (permission === 'granted' && reason)) {
    icon = 'information-circle-outline';
    title = 'Avisos com o app fechado indisponíveis aqui';
    message =
      reason === 'no_project_id' || reason === 'token_failed'
        ? 'Este aparelho não conseguiu se registrar para notificações (é preciso o app instalado, não o Expo Go). Com o app aberto, os avisos aparecem na tela.'
        : 'Neste dispositivo os avisos aparecem só com o app aberto.';
    action = null;
  }

  return (
    <Surface tone="secondary" testID="queue-notification-prompt">
      <View style={styles.row}>
        <Ionicons name={icon} size={22} color={theme.colors.text.secondary} />
        <View style={styles.body}>
          <AppText variant="bodyStrong">{title}</AppText>
          <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
            {message}
          </AppText>
          {action ? (
            <View style={styles.actions}>
              <AppButton label={action.label} variant={permission === 'denied' ? 'secondary' : 'primary'} size="small" onPress={action.onPress} loading={requesting} testID="queue-notification-action" />
            </View>
          ) : null}
        </View>
      </View>
    </Surface>
  );
}
