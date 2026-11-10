import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppButton, AppText, CardSkeleton, OfflineBanner, SectionHeader, Surface } from '../../../components/ui';
import { makeStyles, useTheme } from '../../../theme';
import { QueueAlertSettings } from '../components/QueueAlertSettings';
import { QueueCurrentCall } from '../components/QueueCurrentCall';
import { QueueHistory } from '../components/QueueHistory';
import { QueueNotificationPrompt } from '../components/QueueNotificationPrompt';
import { QueueRecentCalls } from '../components/QueueRecentCalls';
import { QueueSourceLabel } from '../components/QueueSourceLabel';
import { QueueSyncIndicator } from '../components/QueueSyncIndicator';
import { QueueTicketCard } from '../components/QueueTicketCard';
import { QueueTicketForm } from '../components/QueueTicketForm';
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
  const rawOverview = status?.queue ?? null;
  const sync = rawOverview?.sync ?? null;
  const demoSource = sync?.source?.kind === 'demo';
  // Não expor snapshot simulado mesmo que um backend antigo/mal configurado o retorne.
  const sub = demoSource ? null : status?.subscription ?? null;
  const showTicket = sub !== null && (queue.tracking || sub.status === 'completed');
  const overview = demoSource ? null : rawOverview;

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
        <Surface tone="warning" style={{ marginBottom: theme.spacing.md }} testID="queue-ownership-disclosure">
          <View style={styles.notice}>
            <Ionicons name="shield-outline" size={20} color={theme.colors.status.warningText} />
            <View style={styles.noticeBody}>
              <AppText variant="bodyStrong" tone="warning">Acompanhamento por senha informada</AppText>
              <AppText variant="bodySmall" tone="warning">O número do comprovante permite acompanhar dados públicos e receber alertas nesta conta ASA. Ele não verifica se você é o titular do atendimento. Não informe CPF no app.</AppText>
            </View>
          </View>
        </Surface>
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
            <QueueTicketForm onSubmit={subscribe} disabled={demoSource || queue.isOffline || status?.queue.sync.status === 'disabled'} intro={experience.state === 'queue_empty' ? experience.message : undefined} />
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

      <AppText variant="caption" tone="muted" style={{ marginTop: theme.spacing.xxl }}>
        {demoSource
          ? 'Dados de demonstração não são exibidos no app. Conecte uma fonte institucional real e autorizada para habilitar a fila.'
          : sync?.status === 'live'
            ? 'Dados lidos da fonte oficial presencial.fecap.br. A disponibilidade, posição, mesa e horários dependem das informações publicadas pela FECAP.'
            : 'O ASA Conecta não apresenta dados simulados. A fila será exibida quando a fonte oficial estiver acessível e autorizada.'}
      </AppText>
    </Screen>
  );
}
