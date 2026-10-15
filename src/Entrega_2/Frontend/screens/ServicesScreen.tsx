import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { InsightList, type Insight } from '../components/academic';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { AppText, EmptyState, List, ListItem, OfflineBanner, ScheduleSkeleton, SectionHeader } from '../components/ui';
import { useOptionalAssistant } from '../features/assistant/hooks/useAssistant';
import { useAcademicOverview } from '../hooks/useAcademicOverview';
import { useOptionalAppNavigation } from '../navigation/AppNavigator';
import { makeStyles, useTheme } from '../theme';
import { formatDateTime, formatPercent, pluralize } from '../utils/format';
// ---- support (Atendimento)
import { useSupportInsights } from './support/SupportHomeSection';
// ---- queue (Fila presencial do ASA)
import { useOptionalQueue } from '../features/queue';
// ---- appointments (Agendamentos com o ASA)
import { formatAppointmentShort, useNextAppointment } from '../features/appointments';
import { appointmentsEnabled, usePlatformInfo } from '../features/platform';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface ServiceItem {
  id: string;
  icon: IconName;
  title: string;
  description: string;
  onPress: () => void;
}

const useStyles = makeStyles((theme) => ({
  note: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start', marginTop: theme.spacing.xxl, paddingHorizontal: theme.spacing.xxs },
  noteText: { flex: 1 },
}));

/**
 * Serviços: análise do agente, histórico, contato com o ASA e orientações. Solicitações administrativas
 * nunca são executadas pelo app — o assistente orienta e a decisão continua humana.
 */
export function ServicesScreen() {
  const theme = useTheme();
  const styles = useStyles();
  const navigation = useOptionalAppNavigation();
  const assistant = useOptionalAssistant();
  const overview = useAcademicOverview();

  const ask = (text: string) => {
    if (!assistant) {
      navigation?.openAssistant('conversation');
      return;
    }
    assistant.openOverlay('button');
    void assistant.voice.submitText(text);
  };

  // ---- support (Atendimento): avisos não lidos dos chamados entram em "Avisos"
  const supportInsights = useSupportInsights(navigation);
  // ---- queue (Fila presencial do ASA)
  const queue = useOptionalQueue();
  const trackedTicket = queue?.tracking ? queue.status?.subscription?.ticket : null;
  // ---- appointments (Agendamentos com o ASA): some quando a plataforma desliga o recurso
  const platform = usePlatformInfo();
  const showAppointments = appointmentsEnabled(platform.info);
  const nextAppointment = useNextAppointment({ enabled: showAppointments && Boolean(navigation) }).appointment;
  const appointmentsService: ServiceItem = {
    id: 'appointments',
    icon: 'calendar-outline',
    title: nextAppointment ? 'Meus agendamentos' : 'Agendar atendimento',
    description: nextAppointment
      ? `Próximo: ${formatAppointmentShort(nextAppointment.startsAt)} · ${nextAppointment.topicLabel}.`
      : 'Marque um horário com o ASA, presencial ou online, e acompanhe seus agendamentos.',
    onPress: () => navigation?.openAppointments(),
  };

  const services: ServiceItem[] = [
    // ---- support (Atendimento)
    { id: 'support', icon: 'chatbubbles-outline', title: 'Atendimento', description: 'Abra chamados e acompanhe suas solicitações ao ASA.', onPress: () => navigation?.openSupport() },
    // ---- appointments (Agendamentos com o ASA)
    ...(showAppointments ? [appointmentsService] : []),
    { id: 'analysis', icon: 'sparkles-outline', title: 'Análise da situação acadêmica', description: 'Disciplinas, avaliações, frequência e pendências analisadas com evidências.', onPress: () => navigation?.openAssistant('analysis') },
    { id: 'history', icon: 'time-outline', title: 'Histórico de análises', description: 'Análises anteriores, da mais recente para a mais antiga.', onPress: () => navigation?.openHistory() },
    { id: 'asa', icon: 'people-outline', title: 'Falar com o ASA', description: 'Contato da Área do Sucesso Alvarista, coordenação e professores.', onPress: () => ask('Como entro em contato com o ASA?') },
    { id: 'documents', icon: 'document-text-outline', title: 'Documentos e secretaria', description: 'Como solicitar documentos e corrigir registros (validação humana).', onPress: () => ask('Com quem eu falo para solicitar um documento?') },
    { id: 'finance', icon: 'card-outline', title: 'Financeiro', description: 'O app não executa pagamentos; o assistente indica com quem falar.', onPress: () => ask('Preciso falar com o financeiro. Com quem eu falo?') },
    { id: 'settings', icon: 'options-outline', title: 'Configurações do assistente', description: 'Hey Asa, resposta por voz, histórico e privacidade.', onPress: () => navigation?.changeTab('profile') },
    // ---- queue (Fila presencial do ASA)
    {
      id: 'queue',
      icon: 'people-circle-outline',
      title: 'Fila presencial',
      description: trackedTicket ? `Acompanhando a senha ${trackedTicket}.` : 'Acompanhe sua senha do atendimento presencial e seja avisado quando chegar a sua vez.',
      onPress: () => navigation?.openQueue(),
    },
  ];

  const alerts: Insight[] = [...supportInsights];
  for (const subject of overview.lowAttendance.slice(0, 3)) {
    alerts.push({ id: `att-${subject.id}`, tone: 'warning', title: 'Frequência', message: `${subject.name} está com ${formatPercent(subject.attendanceRate)} de frequência.`, actionLabel: 'Ver frequência', onAction: () => navigation?.openAcademicSegment('attendance') });
  }
  if (overview.overdueCount > 0) {
    alerts.push({ id: 'overdue', tone: 'danger', title: 'Pendências', message: `${pluralize(overview.overdueCount, 'pendência vencida', 'pendências vencidas')}.`, actionLabel: 'Ver pendências', onAction: () => navigation?.openAcademicSegment('pending') });
  }
  const last = overview.summary.data?.lastAnalysis;
  if (last) {
    alerts.push({ id: 'analysis', tone: 'brand', title: 'Última análise', message: `${last.summary} (${formatDateTime(last.createdAt)})`, actionLabel: 'Ver no assistente', onAction: () => navigation?.openAssistant('analysis') });
  }

  return (
    <Screen testID="services-screen">
      <ScreenHeader title="Serviços" subtitle="Atendimento, análises e orientações." />
      <OfflineBanner />

      <SectionHeader title="Avisos" flush />
      {overview.loading && alerts.length === 0 ? <ScheduleSkeleton rows={2} /> : null}
      {!overview.loading && alerts.length === 0 ? <EmptyState title="Nenhum aviso no momento" message="Alertas acadêmicos e do assistente aparecem aqui." tone="positive" compact /> : null}
      {alerts.length > 0 ? <InsightList insights={alerts} /> : null}

      <SectionHeader title="Serviços" />
      <List inset="icon">
        {services.map((service) => (
          <ListItem key={service.id} icon={service.icon} title={service.title} description={service.description} accessibilityLabel={service.title} accessibilityHint={service.description} onPress={service.onPress} testID={`service-${service.id}`} />
        ))}
      </List>

      <View style={styles.note} accessible accessibilityLabel="Decisão humana. O assistente recomenda e orienta, mas nunca altera matrícula, notas, frequência ou pagamentos.">
        <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.text.muted} style={{ marginTop: 1 }} />
        <View style={styles.noteText}>
          <AppText variant="bodySmallStrong" tone="secondary">
            Decisão humana
          </AppText>
          <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
            O assistente recomenda e orienta, mas nunca altera matrícula, notas, frequência ou pagamentos. Ações institucionais passam sempre por uma pessoa responsável.
          </AppText>
        </View>
      </View>
    </Screen>
  );
}
