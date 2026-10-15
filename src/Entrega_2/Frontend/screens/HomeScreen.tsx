import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { InsightList, MetricStrip, UpcomingList, type Insight, type UpcomingItem } from '../components/academic';
import { AssistantOrb } from '../components/assistant/AssistantOrb';
import { Screen } from '../components/Screen';
import { StateView, messageForError, stateKindFromError } from '../components/StateView';
import { AcademicCardSkeleton, AppButton, AppText, Avatar, EmptyState, IconButton, List, ListItem, OfflineBanner, PressableScale, ScheduleSkeleton, SectionHeader } from '../components/ui';
import { useOptionalAssistant } from '../features/assistant/hooks/useAssistant';
import { attendanceTone, useAcademicOverview, type AcademicOverview } from '../hooks/useAcademicOverview';
import { useSession } from '../hooks/useSession';
import { useOptionalAppNavigation, type AppNavigation } from '../navigation/AppNavigator';
import type { TabKey } from '../navigation/routes';
import { makeStyles, useTheme } from '../theme';
import { firstName, formatPercent, formatScore, pluralize } from '../utils/format';
import { daysUntil, formatLongDate, greeting } from '../utils/greeting';
import { MESSAGES } from '../utils/messages';
// ---- support (Atendimento)
import { SupportHomeSection } from './support/SupportHomeSection';
// ---- queue (Fila presencial do ASA)
import { QueueHomeCard } from '../features/queue';
// ---- platform (rótulo DEMONSTRAÇÃO, fonte acadêmica) · notifications (sino) · appointments (próximo atendimento)
import { appointmentDay, formatClock, modeLabel, useNextAppointment } from '../features/appointments';
import { useInbox } from '../features/notifications/useInbox';
import { academicUnavailableMessage, appointmentsEnabled, DataModeBadge, usePlatformInfo } from '../features/platform';
import type { Appointment } from '../types/api';

interface HomeScreenProps {
  onNavigate: (tab: TabKey) => void;
  /** Injetável em testes (saudação e datas relativas determinísticas). */
  now?: Date;
}

const useStyles = makeStyles((theme) => ({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.xl, gap: theme.spacing.md },
  headerText: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  bell: { position: 'relative' },
  bellDot: { position: 'absolute', top: 11, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.status.error, borderWidth: 1.5, borderColor: theme.colors.background.primary },
  // ---- notifications: contagem de não lidos do servidor
  bellCount: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.status.error, borderWidth: 1.5, borderColor: theme.colors.background.primary },
  assistant: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, backgroundColor: theme.colors.surface.primary, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border.default, paddingLeft: theme.spacing.xs, paddingRight: theme.spacing.md, paddingVertical: theme.spacing.xs },
  assistantOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, minHeight: 56, borderRadius: theme.radius.md },
  assistantText: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.7 },
  talk: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.brand.primaryStrong },
  wake: { alignSelf: 'flex-start', marginTop: theme.spacing.xs },
}));

export function HomeScreen({ onNavigate, now }: HomeScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { user } = useSession();
  const assistant = useOptionalAssistant();
  const navigation = useOptionalAppNavigation();
  const overview = useAcademicOverview({ today: now });
  const [refreshing, setRefreshing] = useState(false);
  const today = useMemo(() => now ?? new Date(), [now]);
  const name = firstName(user?.fullName);
  const summary = overview.summary;
  // ---- platform: sem fonte acadêmica a Home explica o motivo em vez de mostrar erro genérico
  const platform = usePlatformInfo();
  const academicUnavailable = academicUnavailableMessage(platform.info) ?? (summary.error?.reason === 'academic_source_unavailable' ? summary.error.message || 'Dados acadêmicos indisponíveis no momento.' : null);
  /** Pull-to-refresh: remonta o sino e a agenda (cada um busca de novo, mostrando o cache enquanto isso). */
  const [refreshKey, setRefreshKey] = useState(0);

  const insights = useMemo<Insight[]>(() => {
    const list: Insight[] = [];
    const data = summary.data;
    for (const subject of overview.lowAttendance.slice(0, 2)) {
      list.push({
        id: `attendance-${subject.id}`,
        tone: 'warning',
        title: 'Frequência',
        message: `Sua frequência em ${subject.name} está em ${formatPercent(subject.attendanceRate)}.`,
        icon: 'calendar-outline',
        actionLabel: 'Ver frequência',
        onAction: () => navigation?.openAcademicSegment('attendance'),
      });
    }
    if (overview.overdueCount > 0) {
      list.push({
        id: 'overdue',
        tone: 'danger',
        title: 'Pendências vencidas',
        message: `Você tem ${pluralize(overview.overdueCount, 'pendência vencida', 'pendências vencidas')}.`,
        actionLabel: 'Ver pendências',
        onAction: () => navigation?.openAcademicSegment('pending'),
      });
    }
    const nextExam = overview.upcoming.find((item) => item.kind === 'exam' && !item.overdue);
    if (nextExam) {
      const days = daysUntil(nextExam.date, today);
      if (days !== null && days >= 0 && days <= 7) {
        list.push({
          id: `exam-${nextExam.id}`,
          tone: 'info',
          title: 'Prova em breve',
          message: days === 0 ? `Você tem uma prova hoje: ${nextExam.title}.` : `Você tem uma prova em ${pluralize(days, 'dia', 'dias')}: ${nextExam.title}.`,
          icon: 'school-outline',
          actionLabel: 'Ver avaliações',
          onAction: () => navigation?.openAcademicSegment('assessments'),
        });
      }
    }
    if (data?.lastAnalysis && data.lastAnalysis.recommendationsCount > 0) {
      list.push({
        id: 'analysis',
        tone: 'brand',
        title: 'Recomendação do ASA',
        message: data.lastAnalysis.summary,
        actionLabel: 'Ver recomendações',
        onAction: () => navigation?.openAssistant('analysis') ?? onNavigate('assistant'),
      });
    }
    if (list.length === 0 && summary.status !== 'loading' && data && data.subjectsCount > 0) {
      list.push({ id: 'ok', tone: 'success', title: 'Tudo certo', message: 'Você não possui pendências acadêmicas em atenção no momento.' });
    }
    return list;
  }, [summary.data, summary.status, overview.lowAttendance, overview.overdueCount, overview.upcoming, navigation, onNavigate, today]);

  const onRefresh = () => {
    setRefreshing(true);
    overview.reloadAll();
    platform.reload();
    setRefreshKey((value) => value + 1);
    setTimeout(() => setRefreshing(false), 600);
  };

  const talk = () => {
    if (assistant) void assistant.activate('home');
    else onNavigate('assistant');
  };
  const type = () => {
    if (assistant) assistant.openOverlay('home');
    else onNavigate('assistant');
  };

  const wakeSupported = Boolean(assistant?.wakeWord.supported && assistant.wakeWord.availability?.available !== false);
  const wakeEnabled = Boolean(assistant?.wakeWord.enabled);
  const assistantHint = wakeSupported && wakeEnabled ? 'Diga “Hey Asa” ou toque aqui' : 'Notas, frequência, prazos e mais';
  const alertsCount = insights.filter((item) => item.tone !== 'success').length;
  const attendance = summary.data ? attendanceTone(summary.data.averageAttendanceRate) : 'default';

  return (
    <Screen testID="home-screen" refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="h2" accessibilityRole="header" numberOfLines={2} testID="home-greeting">
            {greeting(today)}, {name}
          </AppText>
          <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
            {formatLongDate(today)}
          </AppText>
          {/* ---- platform: rótulo permanente quando os dados são fictícios */}
          <DataModeBadge style={{ marginTop: theme.spacing.xs }} />
        </View>
        <View style={styles.headerActions}>
          {navigation ? (
            // ---- notifications: o sino abre a central de avisos com a contagem do servidor
            <InboxBell key={refreshKey} fallbackCount={alertsCount} onOpen={navigation.openNotifications} />
          ) : (
            <View style={styles.bell}>
              <IconButton
                icon="notifications-outline"
                accessibilityLabel={alertsCount > 0 ? `Avisos, ${pluralize(alertsCount, 'aviso', 'avisos')}` : 'Avisos'}
                accessibilityHint="Abre a área de serviços e avisos"
                onPress={() => onNavigate('services')}
              />
              {alertsCount > 0 ? <View style={[styles.bellDot, { pointerEvents: 'none' }]} /> : null}
            </View>
          )}
          <PressableScale accessibilityRole="button" accessibilityLabel="Abrir perfil" onPress={() => onNavigate('profile')}>
            <Avatar name={user?.fullName} size={40} />
          </PressableScale>
        </View>
      </View>

      <OfflineBanner />

      <View style={styles.assistant} testID="assistant-hero">
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir o assistente" accessibilityHint="Abre o assistente para digitar sua pergunta" onPress={type} style={({ pressed }) => [styles.assistantOpen, pressed && styles.pressed]} testID="home-type">
          <AssistantOrb state={assistant?.state ?? 'idle'} audioLevel={assistant?.voice.audioLevel} size={32} testID="home-orb" />
          <View style={styles.assistantText}>
            <AppText variant="bodyStrong">Como posso ajudar hoje?</AppText>
            <AppText variant="caption" tone="secondary" numberOfLines={1}>
              {assistantHint}
            </AppText>
          </View>
        </Pressable>
        <PressableScale accessibilityRole="button" accessibilityLabel="Falar com o assistente" accessibilityHint="Abre o assistente e ativa o microfone" onPress={talk} haptic pressedScale={theme.motion.scale.pressedStrong} style={styles.talk} testID="home-talk">
          <Ionicons name="mic" size={20} color={theme.colors.text.onPrimary} />
        </PressableScale>
      </View>
      {wakeSupported && !wakeEnabled && assistant ? <AppButton label="Ativar “Hey Asa”" variant="ghost" size="small" icon="mic-outline" onPress={() => void assistant.enableWakeWord()} style={styles.wake} testID="home-enable-wake" /> : null}

      {/* ---- queue (Fila presencial do ASA): só aparece enquanto o aluno acompanha uma senha */}
      <QueueHomeCard style={{ marginTop: theme.spacing.lg }} />

      <SectionHeader title="Resumo acadêmico" action={summary.data && !academicUnavailable ? 'Ver tudo' : undefined} onAction={() => onNavigate('academic')} />
      {/* ---- platform: fonte acadêmica indisponível → a mensagem da plataforma no lugar do resumo */}
      {academicUnavailable ? <EmptyState title="Dados acadêmicos indisponíveis" message={academicUnavailable} icon="cloud-offline-outline" testID="academic-unavailable" /> : null}
      {!academicUnavailable && summary.status === 'loading' ? <AcademicCardSkeleton testID="summary-skeleton" /> : null}
      {!academicUnavailable && summary.status === 'error' ? <StateView kind={stateKindFromError(summary.error)} message={messageForError(summary.error)} onRetry={summary.reload} /> : null}
      {!academicUnavailable && summary.data && summary.status !== 'loading' && summary.status !== 'error' ? (
        summary.status === 'empty' ? (
          <EmptyState title="Nenhuma disciplina no período atual" message="Quando suas disciplinas forem vinculadas pela instituição, os indicadores acadêmicos aparecerão aqui." icon="school-outline" />
        ) : (
          <MetricStrip
            items={[
              {
                key: 'attendance',
                label: 'Frequência',
                value: formatPercent(summary.data.averageAttendanceRate),
                detail: 'média',
                tone: attendance === 'danger' ? 'critical' : attendance === 'warning' ? 'attention' : 'default',
                onPress: () => navigation?.openAcademicSegment('attendance') ?? onNavigate('academic'),
                testID: 'stat-attendance',
              },
              { key: 'average', label: 'Média geral', value: formatScore(summary.data.averageScore), detail: 'escala 0 a 10', onPress: () => navigation?.openAcademicSegment('assessments') ?? onNavigate('academic'), testID: 'stat-average' },
              {
                key: 'pending',
                label: 'Pendências',
                value: String(summary.data.pendingCount),
                detail: summary.data.pendingCount > 0 ? 'para revisar' : 'tudo em dia',
                tone: summary.data.pendingCount > 0 ? 'attention' : 'default',
                onPress: () => navigation?.openAcademicSegment('pending') ?? onNavigate('academic'),
                testID: 'stat-pending',
              },
            ]}
          />
        )
      ) : null}

      <SectionHeader title="Próximos compromissos" action={overview.upcoming.length > 0 && !academicUnavailable ? 'Agenda' : undefined} onAction={() => navigation?.openAcademicSegment('pending') ?? onNavigate('academic')} />
      {/* ---- appointments: o próximo atendimento com o ASA entra na agenda (só com navegação e recurso ativo) */}
      {navigation && appointmentsEnabled(platform.info) ? (
        <HomeAgendaWithAppointment key={refreshKey} navigation={navigation} overview={overview} today={today} academicUnavailable={academicUnavailable} />
      ) : (
        <HomeAgenda overview={overview} today={today} academicUnavailable={academicUnavailable} onViewSubject={(subjectId) => navigation?.viewSubject(subjectId)} appointment={null} />
      )}

      <SectionHeader title="Para você" />
      {summary.status === 'loading' && insights.length === 0 && !academicUnavailable ? <ScheduleSkeleton rows={1} /> : null}
      {insights.length > 0 ? <InsightList insights={insights} /> : null}
      {summary.status === 'empty' && insights.length === 0 ? (
        <AppText variant="bodySmall" tone="secondary">
          {MESSAGES.noAnalysisYet}. As recomendações aparecem quando houver dados acadêmicos.
        </AppText>
      ) : null}

      {/* ---- support (Atendimento): só aparece com um chamado relevante */}
      <SupportHomeSection now={now} />

      <SectionHeader title="Atalhos" />
      <List inset="icon">
        <ListItem icon="sparkles-outline" title="Análise completa" description="Solicitar análise e ver recomendações" accessibilityLabel="Ir para Análise completa" accessibilityHint="Solicitar análise e ver recomendações" onPress={() => navigation?.openAssistant('analysis') ?? onNavigate('assistant')} />
        <ListItem icon="grid-outline" title="Serviços" description="Histórico, atendimento ASA e documentos" accessibilityLabel="Ir para Serviços" accessibilityHint="Histórico, atendimento ASA e documentos" onPress={() => onNavigate('services')} />
      </List>
    </Screen>
  );
}

// ---- notifications (Central de avisos)
/**
 * Sino do Início: abre a central de avisos e mostra os não lidos informados pelo servidor. Sem resposta (falha de
 * rede, sem cache), volta ao comportamento anterior: um ponto quando há alertas acadêmicos.
 */
function InboxBell({ fallbackCount, onOpen }: { fallbackCount: number; onOpen: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  const { unreadCount } = useInbox();
  const label =
    unreadCount !== null
      ? unreadCount > 0
        ? `Avisos, ${pluralize(unreadCount, 'aviso não lido', 'avisos não lidos')}`
        : 'Avisos, nenhum aviso não lido'
      : fallbackCount > 0
        ? `Avisos, ${pluralize(fallbackCount, 'aviso', 'avisos')}`
        : 'Avisos';
  return (
    <View style={styles.bell}>
      <IconButton icon="notifications-outline" accessibilityLabel={label} accessibilityHint="Abre a central de avisos" onPress={onOpen} testID="home-bell" />
      {unreadCount !== null && unreadCount > 0 ? (
        <View style={[styles.bellCount, { pointerEvents: 'none' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="home-bell-count">
          <AppText variant="tab" style={{ color: theme.colors.text.onPrimary, fontWeight: '600' }}>
            {unreadCount > 9 ? '9+' : String(unreadCount)}
          </AppText>
        </View>
      ) : unreadCount === null && fallbackCount > 0 ? (
        <View style={[styles.bellDot, { pointerEvents: 'none' }]} />
      ) : null}
    </View>
  );
}
// ---- end notifications

// ---- appointments (Agendamentos com o ASA)
interface HomeAgendaProps {
  overview: AcademicOverview;
  today: Date;
  /** fonte acadêmica indisponível: prazos acadêmicos não são exibidos (nem o erro repetido) */
  academicUnavailable: string | null;
  onViewSubject: (subjectId: string) => void;
  appointment: Appointment | null;
  onOpenAppointment?: (id: string) => void;
}

/** Atendimento com o ASA como item da agenda: dia no fuso da instituição, horário e modalidade. */
function appointmentItem(appointment: Appointment, onOpen?: (id: string) => void): UpcomingItem {
  return {
    id: `appointment-${appointment.id}`,
    kind: 'appointment',
    title: appointment.topicLabel,
    subtitle: `${formatClock(appointment.startsAt)} · ${modeLabel(appointment.mode)}`,
    date: appointmentDay(appointment.startsAt) ?? appointment.startsAt,
    onPress: onOpen ? () => onOpen(appointment.id) : undefined,
  };
}

/** "Próximos compromissos": provas, entregas e pendências reais e, quando houver, o próximo atendimento com o ASA. */
function HomeAgenda({ overview, today, academicUnavailable, onViewSubject, appointment, onOpenAppointment }: HomeAgendaProps) {
  const academicLoading = !academicUnavailable && (overview.pending.status === 'loading' || overview.assessments.status === 'loading');
  const academic: UpcomingItem[] = academicUnavailable
    ? []
    : overview.upcoming.slice(0, 3).map((item) => ({ ...item, onPress: item.subjectId ? () => onViewSubject(item.subjectId as string) : undefined }));
  const items = appointment ? [appointmentItem(appointment, onOpenAppointment), ...academic].sort((a, b) => a.date.localeCompare(b.date)) : academic;

  if (academicLoading) return <ScheduleSkeleton testID="upcoming-skeleton" />;
  if (items.length > 0) return <UpcomingList items={items} today={today} testID="upcoming" />;
  if (!academicUnavailable && overview.pending.status === 'error' && overview.assessments.status === 'error') {
    return <StateView kind={stateKindFromError(overview.pending.error)} message={messageForError(overview.pending.error)} onRetry={overview.reloadAll} compact />;
  }
  if (academicUnavailable) {
    return <EmptyState title="Nenhum compromisso para mostrar" message="Prazos acadêmicos voltam a aparecer aqui quando a fonte de dados estiver disponível." compact testID="upcoming-empty" />;
  }
  return <EmptyState title="Nada agendado nos próximos dias" message="Provas e entregas com data aparecem aqui." tone="positive" compact testID="upcoming-empty" />;
}

function HomeAgendaWithAppointment({ navigation, ...props }: Omit<HomeAgendaProps, 'appointment' | 'onOpenAppointment' | 'onViewSubject'> & { navigation: AppNavigation }) {
  const { appointment } = useNextAppointment();
  return <HomeAgenda {...props} onViewSubject={navigation.viewSubject} appointment={appointment} onOpenAppointment={(id) => navigation.openAppointment(id)} />;
}
// ---- end appointments
