import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { AppButton, AppText, Surface } from '../../components/ui';
import { makeStyles, useTheme } from '../../theme';
import { dismissOptIn, openNotificationSettings, usePushRegistration, wasOptInDismissed } from './pushRegistration';

const useStyles = makeStyles((theme) => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
  body: { flex: 1, minWidth: 0, gap: theme.spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
}));

export interface PushOptInCardProps {
  /** Home: some quando o aluno dispensa (volta em 14 dias). Avisos: sempre visível enquanto não estiver ativo. */
  dismissible?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Convite para ativar as notificações do app. Some sozinho quando o aparelho já está registrado ou quando o
 * ambiente não tem push (web, Expo Go).
 */
export function PushOptInCard({ dismissible = false, style, testID = 'push-opt-in' }: PushOptInCardProps) {
  const theme = useTheme();
  const styles = useStyles();
  const push = usePushRegistration();
  const [dismissed, setDismissed] = useState<boolean | null>(dismissible ? null : false);
  const [justEnabled, setJustEnabled] = useState(false);

  useEffect(() => {
    if (!dismissible) return;
    let active = true;
    void wasOptInDismissed().then((value) => {
      if (active) setDismissed(value);
    });
    return () => {
      active = false;
    };
  }, [dismissible]);

  if (justEnabled && push.status === 'registered') {
    return (
      <Surface tone="success" style={style} testID={`${testID}-done`}>
        <View style={styles.row}>
          <Ionicons name="checkmark-circle-outline" size={20} color={theme.colors.status.success} />
          <AppText variant="bodySmall" style={{ flex: 1 }} accessibilityLiveRegion="polite">
            Notificações ativadas. Enviamos uma notificação de teste para este aparelho.
          </AppText>
        </View>
      </Surface>
    );
  }
  if (dismissed !== false || (push.status !== 'needs_permission' && push.status !== 'denied')) return null;

  const denied = push.status === 'denied';
  return (
    <Surface style={style} testID={testID}>
      <View style={styles.row}>
        <Ionicons name="notifications-outline" size={20} color={theme.colors.text.secondary} />
        <View style={styles.body}>
          <AppText variant="bodyStrong">{denied ? 'Notificações bloqueadas' : 'Ative as notificações'}</AppText>
          <AppText variant="bodySmall" tone="secondary">
            {denied
              ? 'Para receber respostas dos seus chamados, lembretes e avisos do ASA, permita as notificações do ASA Conecta nas configurações do aparelho.'
              : 'Receba na hora as respostas dos seus chamados, lembretes de agendamento e os avisos do ASA.'}
          </AppText>
          <View style={styles.actions}>
            {denied ? (
              <AppButton label="Abrir configurações" size="small" icon="settings-outline" onPress={openNotificationSettings} testID={`${testID}-settings`} />
            ) : (
              <AppButton
                label="Ativar notificações"
                size="small"
                icon="notifications-outline"
                loading={push.busy}
                onPress={() => {
                  void push.enable().then((status) => setJustEnabled(status === 'registered'));
                }}
                testID={`${testID}-enable`}
              />
            )}
            {dismissible ? (
              <AppButton
                label="Agora não"
                size="small"
                variant="ghost"
                onPress={() => {
                  setDismissed(true);
                  void dismissOptIn();
                }}
                testID={`${testID}-dismiss`}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Surface>
  );
}
