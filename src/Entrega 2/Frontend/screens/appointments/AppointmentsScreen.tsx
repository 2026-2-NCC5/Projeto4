import React from 'react';
import { View } from 'react-native';

import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppButton, AppText, EmptyState, List, OfflineBanner, ScheduleSkeleton, SectionHeader } from '../../components/ui';
import {
  appointmentLoadErrorMessage,
  AppointmentRow,
  APPOINTMENTS,
  InlineNotice,
  isAppointmentsRouteMissing,
  isAppointmentsUnavailable,
  timezoneLabel,
  useAppointmentCatalog,
  useAppointmentList,
} from '../../features/appointments';
import { appointmentsEnabled, usePlatformInfo } from '../../features/platform';
import type { SupportResource } from '../../features/support/hooks/useSupportResource';
import { isConnectivityError } from '../../features/support/errors';
import { useAppNavigation } from '../../navigation/AppNavigator';
import { useTheme } from '../../theme';
import type { AppointmentList } from '../../types/api';

/** "Meus agendamentos": próximos atendimentos, histórico e o caminho para agendar um novo horário. */
export function AppointmentsScreen() {
  const theme = useTheme();
  const navigation = useAppNavigation();
  const platform = usePlatformInfo();
  const enabled = appointmentsEnabled(platform.info);
  const upcoming = useAppointmentList('upcoming', { enabled });
  const past = useAppointmentList('past', { enabled });
  const catalog = useAppointmentCatalog({ enabled });
  // desligado pela administração, sem banco ou API sem agendamentos (404): "indisponível", nunca erro genérico
  const unavailableError = [upcoming.error, past.error].find((error) => isAppointmentsUnavailable(error) || isAppointmentsRouteMissing(error)) ?? null;
  const unavailable = !enabled || unavailableError !== null;
  const offline = [upcoming, past].some((resource) => resource.data !== null && isConnectivityError(resource.error));

  return (
    <Screen
      testID="appointments-screen"
      refreshing={upcoming.refreshing || past.refreshing}
      onRefresh={() => {
        platform.reload();
        upcoming.refresh();
        past.refresh();
      }}
    >
      <ScreenHeader title="Meus agendamentos" subtitle="Atendimentos marcados com o ASA." onBack={navigation.goBack} />
      <OfflineBanner />

      {unavailable ? (
        <EmptyState
          title="Agendamentos indisponíveis"
          message={unavailableError ? appointmentLoadErrorMessage(unavailableError, 'Os agendamentos com o ASA estão indisponíveis no momento.') : 'Os agendamentos com o ASA estão desativados no momento. Você ainda pode abrir um chamado no Atendimento.'}
          icon="calendar-outline"
          actionLabel="Ir para o Atendimento"
          onAction={navigation.openSupport}
          testID="appointments-unavailable"
        />
      ) : (
        <>
          <AppButton label="Agendar atendimento" icon="add" onPress={navigation.openBookAppointment} fullWidth testID="appointments-book" />
          {offline ? <InlineNotice message="Você está offline. Mostrando a última atualização disponível." tone="warning" icon="cloud-offline-outline" style={{ marginTop: theme.spacing.md }} /> : null}

          <SectionHeader title="Próximos" />
          <AppointmentSection
            resource={upcoming}
            emptyTitle="Nenhum atendimento marcado"
            emptyMessage="Quando você agendar um horário com o ASA, ele aparece aqui."
            onOpen={(id) => navigation.openAppointment(id)}
            testID="appointments-upcoming"
          />

          <SectionHeader title="Histórico" />
          <AppointmentSection
            resource={past}
            emptyTitle="Nada no histórico ainda"
            emptyMessage="Atendimentos realizados, remarcados e cancelados ficam registrados aqui."
            onOpen={(id) => navigation.openAppointment(id)}
            testID="appointments-past"
          />

          <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.xxs }}>
            {catalog.data ? (
              <AppText variant="caption" tone="muted">
                {`Você pode cancelar ou remarcar pelo app até ${catalog.data.policy.cancellationMinHours} h antes do horário.`}
              </AppText>
            ) : null}
            <AppText variant="caption" tone="muted">
              {`Datas e horários no ${timezoneLabel(catalog.data?.policy.timezone ?? APPOINTMENTS.TIMEZONE)}.`}
            </AppText>
          </View>
        </>
      )}
    </Screen>
  );
}

interface AppointmentSectionProps {
  resource: SupportResource<AppointmentList>;
  emptyTitle: string;
  emptyMessage: string;
  onOpen: (id: string) => void;
  testID: string;
}

function AppointmentSection({ resource, emptyTitle, emptyMessage, onOpen, testID }: AppointmentSectionProps) {
  if (resource.status === 'loading') return <ScheduleSkeleton rows={2} testID={`${testID}-skeleton`} />;
  if (resource.status === 'error') {
    return (
      <InlineNotice
        message={appointmentLoadErrorMessage(resource.error, 'Não conseguimos carregar seus agendamentos.')}
        tone="danger"
        actionLabel="Tentar novamente"
        onAction={resource.reload}
        testID={`${testID}-error`}
      />
    );
  }
  const items = resource.data?.items ?? [];
  if (items.length === 0) return <EmptyState title={emptyTitle} message={emptyMessage} icon="calendar-outline" compact testID={`${testID}-empty`} />;
  return (
    <List testID={testID}>
      {items.map((item) => (
        <AppointmentRow key={item.id} appointment={item} onPress={() => onOpen(item.id)} testID={`appointment-row-${item.id}`} />
      ))}
    </List>
  );
}
