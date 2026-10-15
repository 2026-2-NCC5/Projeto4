import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AttendanceRow, GradeRow, InsightList, MetricStrip, PendingRow, SubjectCard, type Insight } from '../components/academic';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { StateView, messageForError, stateKindFromError } from '../components/StateView';
import { AcademicCardSkeleton, AppText, CardSkeleton, EmptyState, List, OfflineBanner, SectionHeader, Surface } from '../components/ui';
import { ATTENDANCE_WARNING_THRESHOLD, attendanceTone } from '../hooks/useAcademicOverview';
import { useResource } from '../hooks/useResource';
import { studentService } from '../services/studentService';
import { makeStyles, useTheme } from '../theme';
import type { StudentAssessment, StudentAttendance, StudentPendingItem, StudentSubject, StudentSummary } from '../types/api';
import type { AcademicSegment, ResourceState } from '../types/ui';
import { formatPercent, formatScore, pluralize } from '../utils/format';
import { MESSAGES } from '../utils/messages';

const SEGMENTS: { key: AcademicSegment; label: string }[] = [
  { key: 'subjects', label: 'Disciplinas' },
  { key: 'assessments', label: 'Avaliações' },
  { key: 'attendance', label: 'Frequência' },
  { key: 'pending', label: 'Pendências' },
];

interface AcademicScreenProps {
  /** Disciplina a destacar (vinda de "Ver disciplina" no assistente). */
  focusSubjectId?: string | null;
  onClearFocus?: () => void;
  /** Seção inicial (ex.: vinda de uma próxima ação do assistente); mudanças posteriores trocam a seção. */
  initialSegment?: AcademicSegment | null;
}

const useStyles = makeStyles((theme) => ({
  insights: { marginTop: theme.spacing.md },
  // As seções ficam direto no ScrollView (sem contêiner): o onLayout da disciplina em destaque mede o y da rolagem.
  tabs: { marginTop: theme.spacing.xxl, marginBottom: theme.spacing.xl },
  focusMissing: { marginBottom: theme.spacing.md, padding: theme.spacing.md },
}));

export function AcademicScreen({ focusSubjectId = null, onClearFocus, initialSegment = null }: AcademicScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const startSegment: AcademicSegment = focusSubjectId ? 'subjects' : (initialSegment ?? 'subjects');
  const [segment, setSegment] = useState<AcademicSegment>(startSegment);
  const [visited, setVisited] = useState<Record<AcademicSegment, boolean>>(() => ({
    subjects: startSegment === 'subjects',
    assessments: startSegment === 'assessments',
    attendance: startSegment === 'attendance',
    pending: startSegment === 'pending',
  }));
  // Pedido externo de seção (disciplina em destaque ou próxima ação do assistente): ajustado durante a renderização.
  const [lastRequest, setLastRequest] = useState({ focusSubjectId, initialSegment });
  if (lastRequest.focusSubjectId !== focusSubjectId || lastRequest.initialSegment !== initialSegment) {
    const requested: AcademicSegment | null =
      focusSubjectId && focusSubjectId !== lastRequest.focusSubjectId ? 'subjects' : initialSegment && initialSegment !== lastRequest.initialSegment ? initialSegment : null;
    setLastRequest({ focusSubjectId, initialSegment });
    if (requested) {
      setSegment(requested);
      setVisited((current) => (current[requested] ? current : { ...current, [requested]: true }));
    }
  }
  const scrollRef = useRef<ScrollView>(null);

  const summary = useResource<StudentSummary>(studentService.getSummary, { isEmpty: () => false });
  const subjects = useResource<StudentSubject[]>(studentService.getSubjects, { enabled: visited.subjects });
  const assessments = useResource<StudentAssessment[]>(studentService.getAssessments, { enabled: visited.assessments });
  const attendance = useResource<StudentAttendance[]>(studentService.getAttendance, { enabled: visited.attendance });
  const pending = useResource<StudentPendingItem[]>(studentService.getPendingItems, { enabled: visited.pending });

  const changeSegment = useCallback((next: AcademicSegment) => {
    setSegment(next);
    setVisited((current) => (current[next] ? current : { ...current, [next]: true }));
  }, []);

  const scrollToY = useCallback((y: number) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - theme.spacing.lg), animated: true });
  }, [theme.spacing.lg]);

  const lowAttendance = (subjects.data ?? []).filter((subject) => subject.attendanceRate !== null && subject.attendanceRate < ATTENDANCE_WARNING_THRESHOLD);
  const insights: Insight[] = lowAttendance.slice(0, 2).map((subject) => ({
    id: `attendance-${subject.id}`,
    tone: 'warning',
    title: 'Frequência',
    message: `Sua frequência em ${subject.name} está em ${formatPercent(subject.attendanceRate)}.`,
    actionLabel: 'Ver frequência',
    onAction: () => changeSegment('attendance'),
  }));

  const averageAttendance = summary.data ? attendanceTone(summary.data.averageAttendanceRate) : 'default';

  return (
    <Screen scrollRef={scrollRef} testID="academic-screen">
      <ScreenHeader title="Acadêmico" subtitle="Disciplinas, avaliações, frequência e pendências do período." />
      <OfflineBanner />

      {summary.status === 'loading' ? <AcademicCardSkeleton /> : null}
      {summary.data ? (
        <MetricStrip
          items={[
            { key: 'subjects', label: 'Disciplinas', value: String(summary.data.subjectsCount), detail: 'no período', onPress: () => changeSegment('subjects') },
            { key: 'average', label: 'Média', value: formatScore(summary.data.averageScore), detail: 'geral', onPress: () => changeSegment('assessments') },
            {
              key: 'attendance',
              label: 'Frequência',
              value: formatPercent(summary.data.averageAttendanceRate),
              detail: 'média',
              tone: averageAttendance === 'danger' ? 'critical' : averageAttendance === 'warning' ? 'attention' : 'default',
              onPress: () => changeSegment('attendance'),
            },
          ]}
        />
      ) : null}

      {insights.length > 0 && segment !== 'attendance' ? (
        <View style={styles.insights}>
          <InsightList insights={insights} />
        </View>
      ) : null}

      <SegmentedControl options={SEGMENTS} value={segment} onChange={changeSegment} accessibilityLabel="Seções acadêmicas" style={styles.tabs} />

      {segment === 'subjects' ? <SubjectsSection resource={subjects} focusSubjectId={focusSubjectId} onClearFocus={onClearFocus} onFocusLayout={scrollToY} /> : null}
      {segment === 'assessments' ? <AssessmentsSection resource={assessments} /> : null}
      {segment === 'attendance' ? <AttendanceSection resource={attendance} /> : null}
      {segment === 'pending' ? <PendingSection resource={pending} /> : null}
    </Screen>
  );
}

function ResourceStates<T>({ resource, empty, children }: { resource: ResourceState<T>; empty: React.ReactNode; children: (data: T) => React.ReactNode }) {
  if (resource.status === 'loading') {
    return (
      <View accessibilityLiveRegion="polite" accessibilityLabel={MESSAGES.loadingData}>
        <CardSkeleton />
        <CardSkeleton lines={1} />
      </View>
    );
  }
  if (resource.status === 'error') {
    return <StateView kind={stateKindFromError(resource.error)} message={messageForError(resource.error)} onRetry={resource.reload} />;
  }
  if (resource.status === 'empty' || resource.data === null) return <>{empty}</>;
  return <>{children(resource.data)}</>;
}

function SubjectsSection({ resource, focusSubjectId, onClearFocus, onFocusLayout }: { resource: ResourceState<StudentSubject[]>; focusSubjectId: string | null; onClearFocus?: (() => void) | undefined; onFocusLayout: (y: number) => void }) {
  const styles = useStyles();
  return (
    <ResourceStates resource={resource} empty={<EmptyState title="Nenhuma disciplina encontrada" message={MESSAGES.emptySubjects} icon="school-outline" />}>
      {(data) => (
        <>
          <SectionHeader title="Minhas disciplinas" action={pluralize(data.length, 'disciplina', 'disciplinas')} flush />
          {focusSubjectId && !data.some((subject) => subject.id === focusSubjectId) ? (
            <Surface tone="info" style={styles.focusMissing} accessibilityLiveRegion="polite">
              <AppText variant="bodySmall" tone="info">
                A disciplina indicada pela recomendação não está na sua lista atual.
              </AppText>
            </Surface>
          ) : null}
          {data.map((subject) => {
            const focused = subject.id === focusSubjectId;
            return (
              <SubjectCard
                key={subject.id}
                subject={subject}
                focused={focused}
                onClearFocus={onClearFocus}
                onLayout={focused ? (event) => onFocusLayout(event.nativeEvent.layout.y) : undefined}
                attendanceWarningThreshold={ATTENDANCE_WARNING_THRESHOLD}
                testID={`subject-${subject.id}`}
              />
            );
          })}
        </>
      )}
    </ResourceStates>
  );
}

function AssessmentsSection({ resource }: { resource: ResourceState<StudentAssessment[]> }) {
  return (
    <ResourceStates resource={resource} empty={<EmptyState title="Nenhuma avaliação registrada" message={MESSAGES.emptyAssessments} icon="ribbon-outline" />}>
      {(data) => (
        <>
          <SectionHeader title="Avaliações e notas" action={pluralize(data.length, 'registro', 'registros')} flush />
          <List>
            {data.map((assessment) => (
              <GradeRow key={assessment.id} assessment={assessment} />
            ))}
          </List>
        </>
      )}
    </ResourceStates>
  );
}

function AttendanceSection({ resource }: { resource: ResourceState<StudentAttendance[]> }) {
  return (
    <ResourceStates resource={resource} empty={<EmptyState title="Sem registros de frequência" message={MESSAGES.emptyAttendance} icon="calendar-outline" />}>
      {(data) => (
        <>
          <SectionHeader title="Frequência por disciplina" subtitle={`Mínimo exigido: ${formatPercent(ATTENDANCE_WARNING_THRESHOLD)}`} flush />
          <List>
            {data.map((item) => (
              <AttendanceRow key={item.subjectId} item={item} warningThreshold={ATTENDANCE_WARNING_THRESHOLD} />
            ))}
          </List>
        </>
      )}
    </ResourceStates>
  );
}

function PendingSection({ resource }: { resource: ResourceState<StudentPendingItem[]> }) {
  return (
    <ResourceStates resource={resource} empty={<EmptyState title="Nenhuma pendência encontrada" message="Tudo certo por aqui." tone="positive" testID="pending-empty" />}>
      {(data) => (
        <>
          <SectionHeader title="Pendências" subtitle={pendingSummary(data)} flush />
          <List>
            {data.map((item) => (
              <PendingRow key={item.id} item={item} />
            ))}
          </List>
        </>
      )}
    </ResourceStates>
  );
}

/** "2 itens precisam de atenção" — conta só o que não foi concluído. */
function pendingSummary(items: StudentPendingItem[]): string {
  const open = items.filter((item) => item.status !== 'completed').length;
  if (open === 0) return 'Tudo concluído';
  return open === 1 ? '1 item precisa de atenção' : `${open} itens precisam de atenção`;
}
