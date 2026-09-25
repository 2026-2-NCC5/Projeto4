import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { InsightCard, ScheduleCard, StatTile, type Insight } from '../components/academic';
import { AssistantOrb } from '../components/assistant/AssistantOrb';
import { Screen } from '../components/Screen';
import { StateView, messageForError, stateKindFromError } from '../components/StateView';
import { AcademicCardSkeleton, AppButton, AppText, Avatar, EmptyState, GradientSurface, IconButton, OfflineBanner, PressableScale, ScheduleSkeleton, SectionHeader } from '../components/ui';
import { useOptionalAssistant } from '../features/assistant/hooks/useAssistant';
import { ATTENDANCE_WARNING_THRESHOLD, useAcademicOverview } from '../hooks/useAcademicOverview';
import { useResponsive } from '../hooks/useResponsive';
import { useSession } from '../hooks/useSession';
import { useOptionalAppNavigation } from '../navigation/AppNavigator';
import type { TabKey } from '../navigation/routes';
import { makeStyles, useTheme } from '../theme';
import { firstName, formatPercent, formatScore, pluralize } from '../utils/format';
import { daysUntil, formatLongDate, greeting } from '../utils/greeting';
import { MESSAGES } from '../utils/messages';

interface HomeScreenProps {
  onNavigate: (tab: TabKey) => void;
  /** Injetável em testes (saudação e datas relativas determinísticas). */
  now?: Date;
}

const useStyles = makeStyles((theme) => ({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg, gap: theme.spacing.md },
  headerText: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  heroText: { flex: 1 },
  heroActions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.lg, flexWrap: 'wrap' },
  heroHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.md },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm + 2, marginTop: theme.spacing.md },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm + 2 },
  shortcut: { flexGrow: 1, flexBasis: 150, backgroundColor: theme.colors.surface.primary, borderRadius: theme.radius.lg, padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.border.subtle, minHeight: 96, ...theme.shadows.sm },
  shortcutIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.colors.brand.primarySoft, alignItems: 'center', justifyContent: 'center' },
}));

export function HomeScreen({ onNavigate, now }: HomeScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { user } = useSession();
  const assistant = useOptionalAssistant();
  const navigation = useOptionalAppNavigation();
  const overview = useAcademicOverview({ today: now });
  const responsive = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const today = useMemo(() => now ?? new Date(), [now]);
  const name = firstName(user?.fullName);
  const summary = overview.summary;

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
        icon: 'alert-circle-outline',
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
        icon: 'sparkles-outline',
        actionLabel: 'Ver recomendações',
        onAction: () => navigation?.openAssistant('analysis') ?? onNavigate('assistant'),
      });
    }
    if (list.length === 0 && summary.status !== 'loading' && data && data.subjectsCount > 0) {
      list.push({ id: 'ok', tone: 'success', title: 'Tudo certo', message: 'Você não possui pendências acadêmicas em atenção no momento.', icon: 'checkmark-circle-outline' });
    }
    return list;
  }, [summary.data, summary.status, overview.lowAttendance, overview.overdueCount, overview.upcoming, navigation, onNavigate, today]);

  const onRefresh = () => {
    setRefreshing(true);
    overview.reloadAll();
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
  const heroHint = wakeSupported && wakeEnabled ? 'Diga “Hey Asa” para conversar' : wakeSupported ? 'Toque para falar ou ative o “Hey Asa”' : 'Toque para falar ou digite sua pergunta';
  const alertsCount = insights.filter((item) => item.tone !== 'success').length;

  return (
    <Screen testID="home-screen" refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="bodySmall" tone="muted">
            {formatLongDate(today)}
          </AppText>
          <AppText variant="h1" accessibilityRole="header" testID="home-greeting">
            {greeting(today)}, {name}
          </AppText>
        </View>
        <View style={styles.headerActions}>
          <IconButton icon={alertsCount > 0 ? 'notifications' : 'notifications-outline'} accessibilityLabel={alertsCount > 0 ? `Avisos, ${pluralize(alertsCount, 'aviso', 'avisos')}` : 'Avisos'} accessibilityHint="Abre a área de serviços e avisos" onPress={() => onNavigate('services')} tone={alertsCount > 0 ? 'brand' : 'default'} />
          <PressableScale accessibilityRole="button" accessibilityLabel="Abrir perfil" onPress={() => onNavigate('profile')}>
            <Avatar name={user?.fullName} size={44} />
          </PressableScale>
        </View>
      </View>

      <OfflineBanner />

      <GradientSurface testID="assistant-hero">
        <View style={styles.heroRow}>
          <View style={styles.heroText}>
            <AppText variant="label" tone="brand" uppercase>
              Assistente ASA
            </AppText>
            <AppText variant="h2" style={{ marginTop: 4, fontSize: responsive.fs(22), lineHeight: responsive.fs(28) }}>
              Como posso ajudar hoje?
            </AppText>
            <View style={styles.heroHint}>
              <Ionicons name={wakeEnabled ? 'mic' : 'sparkles-outline'} size={14} color={theme.colors.brand.primaryStrong} />
              <AppText variant="bodySmall" tone="secondary">
                {heroHint}
              </AppText>
            </View>
          </View>
          <AssistantOrb state={assistant?.state ?? 'idle'} audioLevel={assistant?.voice.audioLevel} size={responsive.sp(74)} testID="home-orb" />
        </View>
        <View style={styles.heroActions}>
          <AppButton label="Falar agora" icon="mic" variant="assistant" onPress={talk} accessibilityLabel="Falar com o assistente" accessibilityHint="Abre o assistente e ativa o microfone" testID="home-talk" />
          <AppButton label="Digitar" icon="chatbubble-ellipses-outline" variant="secondary" onPress={type} accessibilityLabel="Abrir o assistente" accessibilityHint="Abre o assistente para digitar sua pergunta" testID="home-type" />
          {wakeSupported && !wakeEnabled && assistant ? <AppButton label="Ativar Hey Asa" variant="ghost" size="small" onPress={() => void assistant.enableWakeWord()} style={{ alignSelf: 'center' }} testID="home-enable-wake" /> : null}
        </View>
      </GradientSurface>

      <SectionHeader title="Resumo acadêmico" action={summary.data ? 'Ver tudo' : undefined} onAction={() => onNavigate('academic')} />
      {summary.status === 'loading' ? <AcademicCardSkeleton testID="summary-skeleton" /> : null}
      {summary.status === 'error' ? <StateView kind={stateKindFromError(summary.error)} message={messageForError(summary.error)} onRetry={summary.reload} /> : null}
      {summary.data && summary.status !== 'loading' && summary.status !== 'error' ? (
        summary.status === 'empty' ? (
          <EmptyState title="Nenhuma disciplina no período atual" message="Quando suas disciplinas forem vinculadas pela instituição, os indicadores acadêmicos aparecerão aqui." icon="school-outline" />
        ) : (
          <View style={styles.stats} accessible={false}>
            <StatTile
              label="Frequência"
              value={formatPercent(summary.data.averageAttendanceRate)}
              detail="média"
              icon="calendar-outline"
              tone={summary.data.averageAttendanceRate !== null && summary.data.averageAttendanceRate < ATTENDANCE_WARNING_THRESHOLD ? 'attention' : 'default'}
              onPress={() => navigation?.openAcademicSegment('attendance') ?? onNavigate('academic')}
              testID="stat-attendance"
            />
            <StatTile label="Média geral" value={formatScore(summary.data.averageScore)} detail="escala 0 a 10" icon="ribbon-outline" onPress={() => navigation?.openAcademicSegment('assessments') ?? onNavigate('academic')} testID="stat-average" />
            <StatTile label="Pendências" value={String(summary.data.pendingCount)} detail={summary.data.pendingCount > 0 ? 'para revisar' : 'tudo em dia'} icon="checkmark-done-outline" tone={summary.data.pendingCount > 0 ? 'attention' : 'success'} onPress={() => navigation?.openAcademicSegment('pending') ?? onNavigate('academic')} testID="stat-pending" />
          </View>
        )
      ) : null}

      <SectionHeader title="Próximos compromissos" action={overview.upcoming.length > 0 ? 'Agenda' : undefined} onAction={() => navigation?.openAcademicSegment('pending') ?? onNavigate('academic')} />
      {overview.pending.status === 'loading' || overview.assessments.status === 'loading' ? (
        <ScheduleSkeleton testID="upcoming-skeleton" />
      ) : overview.upcoming.length > 0 ? (
        <ScheduleCard items={overview.upcoming.slice(0, 3).map((item) => ({ ...item, onPress: item.subjectId ? () => navigation?.viewSubject(item.subjectId as string) : undefined }))} today={today} testID="upcoming" />
      ) : overview.pending.status === 'error' && overview.assessments.status === 'error' ? (
        <StateView kind={stateKindFromError(overview.pending.error)} message={messageForError(overview.pending.error)} onRetry={overview.reloadAll} compact />
      ) : (
        <EmptyState title="Nada agendado nos próximos dias" message="Tudo certo por aqui. ✓" tone="positive" compact testID="upcoming-empty" />
      )}

      <SectionHeader title="Para você" subtitle="Alertas e recomendações a partir dos seus dados" />
      {summary.status === 'loading' && insights.length === 0 ? <ScheduleSkeleton rows={1} /> : null}
      {insights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} testID={`insight-${insight.id}`} />
      ))}
      {summary.status === 'empty' && insights.length === 0 ? (
        <AppText variant="bodySmall" tone="muted">
          {MESSAGES.noAnalysisYet}. As recomendações aparecem quando houver dados acadêmicos.
        </AppText>
      ) : null}

      <SectionHeader title="Atalhos" />
      <View style={styles.shortcuts}>
        <Shortcut icon="sparkles-outline" label="Análise completa" hint="Solicitar análise e ver recomendações" onPress={() => navigation?.openAssistant('analysis') ?? onNavigate('assistant')} />
        <Shortcut icon="grid-outline" label="Serviços" hint="Histórico, atendimento ASA e documentos" onPress={() => onNavigate('services')} />
      </View>
    </Screen>
  );
}

function Shortcut({ icon, label, hint, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; hint: string; onPress: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={`Ir para ${label}`} accessibilityHint={hint} onPress={onPress} style={styles.shortcut}>
      <View style={styles.shortcutIcon}>
        <Ionicons name={icon} size={20} color={theme.colors.brand.primaryStrong} />
      </View>
      <AppText variant="bodyStrong" style={{ marginTop: theme.spacing.sm + 2 }}>
        {label}
      </AppText>
      <AppText variant="caption" tone="muted" style={{ marginTop: 2, fontWeight: '400' }}>
        {hint}
      </AppText>
    </PressableScale>
  );
}

