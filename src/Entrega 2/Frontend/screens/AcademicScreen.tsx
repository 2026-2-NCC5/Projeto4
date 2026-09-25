import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AttendanceCard, GradeCard, InsightCard, PendingCard, StatTile, SubjectCard, type Insight } from '../components/academic';
import { Screen } from '../components/Screen';
import { ScreenHeader } from '../components/ScreenHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { StateView, messageForError, stateKindFromError } from '../components/StateView';
import { AcademicCardSkeleton, AppText, CardSkeleton, EmptyState, OfflineBanner, SectionHeader, Surface } from '../components/ui';
import { ATTENDANCE_WARNING_THRESHOLD } from '../hooks/useAcademicOverview';
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
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm + 2, marginTop: theme.spacing.md },
  focusMissing: { marginBottom: theme.spacing.md },
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

  return (
    <Screen scrollRef={scrollRef} testID="academic-screen">
      <ScreenHeader eyebrow="Área acadêmica" title="Acadêmico" subtitle="Disciplinas, avaliações, frequência e pendências do período." />
      <OfflineBanner />

      {summary.status === 'loading' ? <AcademicCardSkeleton /> : null}
      {summary.data ? (
        <View style={styles.stats} accessible={false}>
          <StatTile label="Disciplinas" value={String(summary.data.subjectsCount)} detail="no período" onPress={() => changeSegment('subjects')} />
          <StatTile label="Média" value={formatScore(summary.data.averageScore)} detail="geral" onPress={() => changeSegment('assessments')} />
          <StatTile label="Frequência" value={formatPercent(summary.data.averageAttendanceRate)} detail="média" tone={summary.data.averageAttendanceRate !== null && summary.data.averageAttendanceRate < ATTENDANCE_WARNING_THRESHOLD ? 'attention' : 'default'} onPress={() => changeSegment('attendance')} />
        </View>
      ) : null}

      {insights.length > 0 && segment !== 'attendance' ? (
        <View style={{ marginTop: theme.spacing.md }}>
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </View>
      ) : null}

      <SegmentedControl options={SEGMENTS} value={segment} onChange={changeSegment} accessibilityLabel="Seções acadêmicas" />

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
          <SectionHeader title="Suas disciplinas" action={pluralize(data.length, 'disciplina', 'disciplinas')} />
          {focusSubjectId && !data.some((subject) => subject.id === focusSubjectId) ? (
            <Surface tone="info" style={styles.focusMissing} accessibilityLiveRegion="polite">
              <AppText variant="bodySmallStrong" tone="info">
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
          <SectionHeader title="Avaliações e notas" action={pluralize(data.length, 'registro', 'registros')} />
          {data.map((assessment) => (
            <GradeCard key={assessment.id} assessment={assessment} />
          ))}
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
          <SectionHeader title="Frequência por disciplina" />
          {data.map((item) => (
            <AttendanceCard key={item.subjectId} item={item} warningThreshold={ATTENDANCE_WARNING_THRESHOLD} />
          ))}
        </>
      )}
    </ResourceStates>
  );
}

function PendingSection({ resource }: { resource: ResourceState<StudentPendingItem[]> }) {
  return (
    <ResourceStates resource={resource} empty={<EmptyState title="Nenhuma pendência encontrada" message="Tudo certo por aqui. ✓" tone="positive" testID="pending-empty" />}>
      {(data) => (
        <>
          <SectionHeader title="Pendências" action={pluralize(data.length, 'item', 'itens')} />
          {data.map((item) => (
            <PendingCard key={item.id} item={item} />
          ))}
        </>
      )}
    </ResourceStates>
  );
}
