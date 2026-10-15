import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { Pressable, Share, TextInput, View } from 'react-native';

import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton, AppText, List, ListItem, OfflineBanner, ScheduleSkeleton, SectionHeader, Skeleton } from '../../components/ui';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  appointmentErrorMessage,
  appointmentShareText,
  appointmentStatusMeta,
  APPOINTMENTS,
  AppointmentStatusBadge,
  ConfirmDialog,
  formatAppointmentDate,
  formatAppointmentShort,
  formatDateTime,
  formatDeadline,
  formatTimeRange,
  InlineNotice,
  modeLabel,
  timezoneLabel,
  useAppointment,
  useAppointmentActions,
  type NoticeTone,
} from '../../features/appointments';
import { isConnectivityError } from '../../features/support/errors';
import { useAppNavigation } from '../../navigation/AppNavigator';
import { haptics } from '../../services/haptics';
import { makeStyles, useTheme } from '../../theme';
import type { Appointment } from '../../types/api';

const useStyles = makeStyles((theme) => ({
  head: { gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  protocolRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: theme.spacing.xs },
  actions: { gap: theme.spacing.sm, marginTop: theme.spacing.xl },
  danger: { marginTop: theme.spacing.xxl },
  input: { ...theme.typography.input, color: theme.colors.text.primary, borderWidth: 1, borderColor: theme.colors.control.inputBorder, borderRadius: theme.radius.md, padding: theme.spacing.md, minHeight: 96, textAlignVertical: 'top', backgroundColor: theme.colors.control.inputBackground },
}));

const TIMEZONE = APPOINTMENTS.TIMEZONE;

/** Detalhe do agendamento: situação, quando e onde, protocolo, histórico e as ações que o servidor permitir. */
export function AppointmentDetailScreen({ appointmentId }: { appointmentId: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const navigation = useAppNavigation();
  const resource = useAppointment(appointmentId);
  const actions = useAppointmentActions(resource);
  const [notice, setNotice] = useState<{ message: string; tone: NoticeTone } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const appointment = resource.data;

  if (!appointment) {
    return (
      <Screen testID="appointment-detail">
        <ScreenHeader title="Agendamento" onBack={navigation.goBack} />
        {resource.status === 'error' ? (
          <InlineNotice
            message={appointmentErrorMessage(resource.error, 'Não conseguimos carregar este agendamento.')}
            tone="danger"
            actionLabel="Tentar novamente"
            onAction={resource.reload}
            testID="appointment-error"
          />
        ) : (
          <DetailSkeleton />
        )}
      </Screen>
    );
  }

  const status = appointmentStatusMeta(appointment);
  const active = ACTIVE_APPOINTMENT_STATUSES.includes(appointment.status);
  const offline = Boolean(resource.error && isConnectivityError(resource.error));

  const copyProtocol = () => {
    Clipboard.setStringAsync(appointment.protocol)
      .then(() => {
        haptics.selection();
        setNotice({ message: 'Protocolo copiado', tone: 'success' });
      })
      .catch(() => setNotice({ message: 'Não foi possível copiar o protocolo.', tone: 'danger' }));
  };

  const share = () => {
    Share.share({ title: 'Atendimento com o ASA', message: appointmentShareText(appointment, TIMEZONE) }).catch(() => setNotice({ message: 'Não foi possível compartilhar agora.', tone: 'danger' }));
  };

  const closeDialog = () => {
    if (actions.cancelling) return;
    setConfirming(false);
    setReason('');
    setDialogError(null);
  };

  const confirmCancel = () => {
    actions
      .cancel(reason)
      .then((problem) => {
        if (problem) {
          setDialogError(problem);
          return;
        }
        setConfirming(false);
        setReason('');
        setDialogError(null);
        setNotice({ message: 'Agendamento cancelado. O horário foi liberado.', tone: 'success' });
      })
      .catch(() => undefined);
  };

  return (
    <Screen testID="appointment-detail" refreshing={resource.refreshing} onRefresh={resource.refresh}>
      <ScreenHeader title="Agendamento" onBack={navigation.goBack} />
      <OfflineBanner />

      <View style={styles.head}>
        <View style={styles.protocolRow}>
          <AppText variant="bodySmallStrong" tone="secondary" selectable testID="appointment-protocol">
            {appointment.protocol}
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Copiar protocolo" onPress={copyProtocol} hitSlop={theme.hitSlop} style={styles.copy} testID="appointment-copy-protocol">
            <Ionicons name="copy-outline" size={16} color={theme.colors.text.link} />
            <AppText variant="caption" tone="link" style={{ fontWeight: '600' }}>
              Copiar
            </AppText>
          </Pressable>
        </View>
        <AppText variant="h2" accessibilityRole="header">
          {appointment.topicLabel}
        </AppText>
        <AppointmentStatusBadge appointment={appointment} testID="appointment-status" />
        <AppText variant="bodySmall" tone="secondary">
          {status.description}
        </AppText>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <InlineNotice message={notice?.message ?? null} tone={notice?.tone ?? 'neutral'} autoHideMs={3200} onHide={() => setNotice(null)} testID="appointment-notice" />
        {offline ? <InlineNotice message="Você está offline. Mostrando a última atualização disponível." tone="warning" icon="cloud-offline-outline" testID="appointment-offline" /> : null}
      </View>

      <SectionHeader title="Quando e onde" />
      <List testID="appointment-when">
        <ListItem title="Data" value={formatAppointmentDate(appointment.startsAt, TIMEZONE)} />
        <ListItem title="Horário" value={`${formatTimeRange(appointment.startsAt, appointment.endsAt, TIMEZONE)} (${timezoneLabel(TIMEZONE)})`} />
        <ListItem title="Modalidade" value={modeLabel(appointment.mode)} />
        {appointment.mode === 'presencial' ? <ListItem title="Local" value={appointment.location ?? 'Informado pelo ASA na confirmação'} /> : <ListItem title="Link" value="Combinado pela equipe do ASA na confirmação" />}
        <ListItem title="Atendimento" value={appointment.attendantLabel} />
      </List>

      {active ? <ChangeWindow appointment={appointment} /> : null}

      {appointment.studentNotes || appointment.cancelReason || appointment.ticketId || appointment.rescheduledFromId || appointment.rescheduledToId ? (
        <>
          <SectionHeader title="Detalhes" />
          <List inset="icon" testID="appointment-extra">
            {/* v1.8: o horário antigo leva ao novo (o motivo "Remarcado pelo aluno" fica implícito) */}
            {appointment.rescheduledToId ? <RescheduledToRow id={appointment.rescheduledToId} onOpen={() => navigation.openAppointment(appointment.rescheduledToId as string)} /> : null}
            {appointment.studentNotes ? <ListItem icon="document-text-outline" title="Suas observações" description={appointment.studentNotes} /> : null}
            {appointment.status === 'cancelled' && appointment.cancelReason && !appointment.rescheduledToId ? (
              <ListItem icon="close-circle-outline" title={appointment.cancelledBy === 'staff' ? 'Motivo informado pelo ASA' : 'Motivo do cancelamento'} description={appointment.cancelReason} />
            ) : null}
            {appointment.ticketId ? <ListItem icon="chatbubbles-outline" title="Chamado relacionado" description="Abrir o chamado deste atendimento" onPress={() => navigation.openTicket(appointment.ticketId as string)} /> : null}
            {appointment.rescheduledFromId ? (
              <ListItem icon="swap-horizontal-outline" title="Remarcado de outro horário" description="Ver o agendamento anterior" onPress={() => navigation.openAppointment(appointment.rescheduledFromId as string)} />
            ) : null}
          </List>
        </>
      ) : null}

      <View style={styles.actions}>
        {appointment.canReschedule ? (
          <AppButton label="Remarcar" variant="secondary" icon="calendar-outline" onPress={() => navigation.openRescheduleAppointment(appointment.id)} fullWidth testID="appointment-reschedule" />
        ) : null}
        <AppButton label="Compartilhar" variant="secondary" icon="share-outline" onPress={share} fullWidth accessibilityHint="Envia um resumo em texto do agendamento" testID="appointment-share" />
      </View>

      {appointment.events.length > 0 ? (
        <>
          <SectionHeader title="Histórico" subtitle="Do mais recente ao mais antigo." />
          <List testID="appointment-events">
            {[...appointment.events]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((event) => (
                <ListItem key={event.id} title={event.title} description={event.description} meta={formatDateTime(event.createdAt, TIMEZONE)} />
              ))}
          </List>
        </>
      ) : null}

      {appointment.canCancel ? (
        <View style={styles.danger}>
          <AppButton label="Cancelar agendamento" variant="danger" icon="close-circle-outline" onPress={() => setConfirming(true)} fullWidth testID="appointment-cancel" />
        </View>
      ) : null}

      <ConfirmDialog
        visible={confirming}
        title="Cancelar este agendamento?"
        description="O horário fica livre para outra pessoa. O histórico continua disponível e você pode agendar de novo depois."
        confirmLabel="Sim, cancelar"
        cancelLabel="Manter agendamento"
        destructive
        loading={actions.cancelling}
        error={dialogError}
        onConfirm={confirmCancel}
        onClose={closeDialog}
        testID="appointment-cancel-dialog"
      >
        <TextInput
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={APPOINTMENTS.CANCEL_REASON_MAX_LENGTH}
          placeholder="Motivo (opcional)"
          placeholderTextColor={theme.colors.text.placeholder}
          style={styles.input}
          accessibilityLabel="Motivo do cancelamento (opcional)"
          testID="appointment-cancel-reason"
        />
      </ConfirmDialog>
    </Screen>
  );
}

/** "Remarcado para qui, 22 out · 10:30" — abre o agendamento que substituiu este (a data aparece quando carrega). */
function RescheduledToRow({ id, onOpen }: { id: string; onOpen: () => void }) {
  const replacement = useAppointment(id, { poll: false }).data;
  return (
    <ListItem
      icon="swap-horizontal-outline"
      title={replacement ? `Remarcado para ${formatAppointmentShort(replacement.startsAt, TIMEZONE)}` : 'Remarcado para outro horário'}
      description="Ver o novo agendamento"
      onPress={onOpen}
      testID="appointment-rescheduled-to"
    />
  );
}

/** Até quando dá para mudar pelo app (decidido pelo servidor). */
function ChangeWindow({ appointment }: { appointment: Appointment }) {
  const theme = useTheme();
  const canChange = appointment.canCancel || appointment.canReschedule;
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start', marginTop: theme.spacing.md }} testID="appointment-deadline">
      <Ionicons name={canChange ? 'time-outline' : 'lock-closed-outline'} size={20} color={theme.colors.text.secondary} />
      <AppText variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
        {canChange
          ? appointment.changeDeadline
            ? `Você pode cancelar ou remarcar pelo app até ${formatDeadline(appointment.changeDeadline, TIMEZONE)}.`
            : 'Você pode cancelar ou remarcar pelo app.'
          : 'O prazo para cancelar ou remarcar pelo app terminou. Se precisar, fale com o ASA.'}
      </AppText>
    </View>
  );
}

function DetailSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }} testID="appointment-skeleton" accessibilityLabel="Carregando agendamento" accessibilityLiveRegion="polite">
      <Skeleton width={120} height={12} />
      <Skeleton width="70%" height={22} />
      <Skeleton width={110} height={20} radius={6} />
      <ScheduleSkeleton rows={3} />
    </View>
  );
}
