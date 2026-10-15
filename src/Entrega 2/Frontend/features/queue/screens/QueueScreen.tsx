import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppButton, AppText, CardSkeleton, OfflineBanner, SectionHeader, Surface } from '../../../components/ui';
import { makeStyles, useTheme } from '../../../theme';
import { QueueAlertSettings } from '../components/QueueAlertSettings';
import { QueueCurrentCall } from '../components/QueueCurrentCall';
import { QueueDevPanel } from '../components/QueueDevPanel';
import { QueueHistory } from '../components/QueueHistory';
import { QueueNotificationPrompt } from '../components/QueueNotificationPrompt';
import { QueueRecentCalls } from '../components/QueueRecentCalls';
import { QueueSourceLabel } from '../components/QueueSourceLabel';
import { QueueSyncIndicator } from '../components/QueueSyncIndicator';
import { QueueTicketCard } from '../components/QueueTicketCard';
import { QueueTicketForm } from '../components/QueueTicketForm';
import { QUEUE } from '../config';
import { formatQueueClock, useQueue, useQueueInterest } from '../hooks/useQueue';

const useStyles = makeStyles((theme) => ({
  stack: { gap: theme.spacing.md },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
  noticeBody: { flex: 1 },
  footer: { marginTop: theme.spacing.xxl },
}));

export interface QueueScreenProps {
  onBack?: () => void;
}

/**
 * Atendimento → Fila presencial do ASA. Dados do painel público (presencial.fecap.br) lidos pelo
 * backend; esta tela nunca consulta a fonte diretamente nem a reproduz em WebView.
 */
export function QueueScreen({ onBack }: QueueScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const queue = useQueue();
  useQueueInterest();
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const { status, experience } = queue;
  const sub = status?.subscription ?? null;
  const showTicket = sub !== null && (queue.tracking || sub.status === 'completed');
  const overview = status?.queue ?? null;
  const sync = overview?.sync ?? null;

  const subscribe = async (ticket: string) => {
    const result = await queue.subscribe(ticket);
    if (result.ok) {
      setConfirmation(ticket);
      setActionError(null);
    }
    return result;
  };

  const cancel = async () => {
    setCancelling(true);
    const result = await queue.cancel();
    setCancelling(false);
    setConfirmation(null);
    setActionError(result.ok ? null : result.message);
  };

  const updatePreferences = (changes: Parameters<typeof queue.updatePreferences>[0]) => {
    void queue.updatePreferences(changes).then((result) => setActionError(result.ok ? null : result.message));
  };

  return (
    <Screen testID="queue-screen" refreshing={false} onRefresh={() => void queue.refresh()}>
      <ScreenHeader title="Fila presencial do ASA" subtitle="Pode continuar fazendo outra coisa: avisamos quando estiver chegando a sua vez." onBack={onBack} />
      <OfflineBanner />

      <View style={{ marginBottom: theme.spacing.lg, gap: theme.spacing.xs }}>
        <QueueSyncIndicator connection={queue.connection} sync={sync} />
        {/* ---- platform: origem dos dados (simulação de demonstração / painel público sem autorização) */}
        <QueueSourceLabel source={sync?.source} />
      </View>

      {sync?.status === 'unavailable' ? (
        <Surface tone="warning" style={{ marginBottom: theme.spacing.lg }} testID="queue-source-unavailable">
          <View style={styles.notice}>
            <Ionicons name="cloud-offline-outline" size={20} color={theme.colors.status.warningText} />
            <View style={styles.noticeBody}>
              <AppText variant="bodyStrong" tone="warning">
                Não conseguimos atualizar a fila agora.
              </AppText>
              <AppText variant="bodySmall" tone="warning">
                {sync.lastSuccessfulSyncAt ? `Última atualização: ${formatQueueClock(sync.lastSuccessfulSyncAt)}. ` : ''}Seguimos tentando e avisamos assim que houver novidade.
              </AppText>
            </View>
          </View>
        </Surface>
      ) : null}

      {confirmation && queue.tracking && sub ? (
        <Surface tone="success" style={{ marginBottom: theme.spacing.lg }} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="queue-confirmation">
          <AppText variant="bodyStrong" tone="success">
            Senha adicionada
          </AppText>
          <AppText variant="bodySmall" tone="success" style={{ marginTop: 2 }}>
            Estamos acompanhando a senha {sub.ticket}. Você será avisado quando sua vez estiver próxima.
          </AppText>
        </Surface>
      ) : null}

      <View style={styles.stack}>
        {queue.loading && !status ? (
          <CardSkeleton />
        ) : showTicket && sub ? (
          <QueueTicketCard subscription={sub} experience={experience} />
        ) : (
          <>
            {experience.state === 'offline' || experience.state === 'sync_error' ? (
              <Surface testID="queue-load-error">
                <AppText variant="bodyStrong">{experience.title}</AppText>
                <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
                  {queue.error ?? experience.message}
                </AppText>
                <View style={{ marginTop: theme.spacing.md, flexDirection: 'row' }}>
                  <AppButton label="Tentar novamente" variant="secondary" size="small" onPress={() => void queue.refresh()} />
                </View>
              </Surface>
            ) : null}
            <QueueTicketForm onSubmit={subscribe} disabled={queue.isOffline || status?.queue.sync.status === 'disabled'} intro={experience.state === 'queue_empty' ? experience.message : undefined} />
          </>
        )}

        {queue.tracking ? (
          <QueueNotificationPrompt permission={queue.push.permission} registered={queue.push.registered} reason={queue.push.reason} onRequest={queue.requestNotifications} />
        ) : null}

        {actionError ? (
          <AppText variant="bodySmall" tone="error" accessibilityRole="alert" testID="queue-action-error">
            {actionError}
          </AppText>
        ) : null}
      </View>

      {overview ? (
        <>
          <SectionHeader title="Painel do ASA" subtitle="Várias mesas atendem ao mesmo tempo." />
          <QueueCurrentCall overview={overview} />
          {overview.recentCalls.length > 0 ? (
            <>
              <SectionHeader title="Últimas chamadas" />
              <QueueRecentCalls calls={overview.recentCalls} highlightTicket={sub?.ticket ?? null} />
            </>
          ) : null}
        </>
      ) : null}

      {queue.tracking && sub ? (
        <>
          <SectionHeader title="Alertas da fila" subtitle="Escolha como quer ser avisado." />
          <QueueAlertSettings preferences={sub.preferences} onChange={updatePreferences} pushBlocked={queue.push.permission === 'denied' || queue.push.permission === 'unavailable'} />
        </>
      ) : null}

      {sub && sub.timeline.length > 0 ? (
        <>
          <SectionHeader title="Seu acompanhamento" />
          <QueueHistory ticket={sub.ticket} timeline={sub.timeline} />
        </>
      ) : null}

      {queue.tracking ? (
        <View style={styles.footer}>
          <AppButton label="Parar de acompanhar esta senha" variant="danger" onPress={() => void cancel()} loading={cancelling} fullWidth testID="queue-cancel" />
        </View>
      ) : sub?.status === 'completed' ? (
        <View style={styles.footer}>
          <AppButton label="Acompanhar outra senha" variant="secondary" onPress={() => void cancel()} loading={cancelling} fullWidth testID="queue-new-ticket" />
        </View>
      ) : null}

      {queue.simulationAvailable ? (
        <View style={styles.footer}>
          <QueueDevPanel local={QUEUE.USE_MOCK} onSimulate={queue.simulate} />
        </View>
      ) : null}

      <AppText variant="caption" tone="muted" style={{ marginTop: theme.spacing.xxl }}>
        {sync?.source?.kind === 'demo'
          ? 'Simulação do painel do ASA com senhas fictícias, para demonstração. A estimativa é aproximada.'
          : 'Dados do painel público presencial.fecap.br, lidos pelo ASA Conecta a cada poucos segundos. Posição e mesa vêm do painel; a estimativa é aproximada.'}
      </AppText>
    </Screen>
  );
}
