import { useCallback, useMemo } from 'react';

import { studentService } from '../services/studentService';
import type { StudentAssessment, StudentPendingItem, StudentSubject, StudentSummary } from '../types/api';
import type { ResourceState } from '../types/ui';
import { daysUntil } from '../utils/greeting';

import { useResource } from './useResource';

/** Frequência abaixo deste valor é destacada como atenção (apenas visual; a regra oficial é do agente). */
export const ATTENDANCE_WARNING_THRESHOLD = 0.75;

export interface UpcomingEntry {
  id: string;
  kind: 'exam' | 'assignment' | 'project' | 'pending' | 'other';
  title: string;
  subtitle: string | null;
  date: string;
  overdue: boolean;
  subjectId: string | null;
}

export interface AcademicOverview {
  summary: ResourceState<StudentSummary>;
  subjects: ResourceState<StudentSubject[]>;
  pending: ResourceState<StudentPendingItem[]>;
  assessments: ResourceState<StudentAssessment[]>;
  /** Próximos compromissos (pendências abertas + avaliações futuras), do mais próximo ao mais distante. */
  upcoming: UpcomingEntry[];
  /** Disciplinas com frequência abaixo do limite visual. */
  lowAttendance: StudentSubject[];
  overdueCount: number;
  loading: boolean;
  reloadAll: () => void;
}

/** Deriva compromissos futuros de pendências e avaliações reais (sem inventar nada). */
export function buildUpcoming(pending: StudentPendingItem[] | null, assessments: StudentAssessment[] | null, today: Date = new Date(), limit = 5): UpcomingEntry[] {
  const entries: UpcomingEntry[] = [];
  for (const item of pending ?? []) {
    if (item.status === 'completed' || !item.dueDate) continue;
    const days = daysUntil(item.dueDate, today);
    entries.push({
      id: `pending-${item.id}`,
      kind: item.type === 'exam' ? 'exam' : item.type === 'assignment' || item.type === 'activity' ? 'assignment' : 'pending',
      title: item.description,
      subtitle: item.subjectName,
      date: item.dueDate,
      overdue: item.status === 'overdue' || (days !== null && days < 0),
      subjectId: item.subjectId,
    });
  }
  for (const assessment of assessments ?? []) {
    if (!assessment.appliedAt || assessment.score !== null) continue;
    const days = daysUntil(assessment.appliedAt, today);
    if (days === null || days < 0) continue;
    entries.push({
      id: `assessment-${assessment.id}`,
      kind: assessment.type === 'exam' ? 'exam' : assessment.type === 'project' ? 'project' : assessment.type === 'assignment' ? 'assignment' : 'other',
      title: assessment.title,
      subtitle: assessment.subjectName,
      date: assessment.appliedAt,
      overdue: false,
      subjectId: assessment.subjectId,
    });
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}

/** Carrega e combina os dados acadêmicos usados pela Home e pelo dashboard. */
export function useAcademicOverview(options: { enabled?: boolean; today?: Date } = {}): AcademicOverview {
  const { enabled = true, today } = options;
  const summary = useResource<StudentSummary>(studentService.getSummary, { enabled, isEmpty: (data) => data.subjectsCount === 0 });
  const subjects = useResource<StudentSubject[]>(studentService.getSubjects, { enabled });
  const pending = useResource<StudentPendingItem[]>(studentService.getPendingItems, { enabled });
  const assessments = useResource<StudentAssessment[]>(studentService.getAssessments, { enabled });

  const upcoming = useMemo(() => buildUpcoming(pending.data, assessments.data, today), [pending.data, assessments.data, today]);
  const lowAttendance = useMemo(() => (subjects.data ?? []).filter((subject) => subject.attendanceRate !== null && subject.attendanceRate < ATTENDANCE_WARNING_THRESHOLD), [subjects.data]);
  const overdueCount = useMemo(() => (pending.data ?? []).filter((item) => item.status === 'overdue' || (item.dueDate !== null && item.status !== 'completed' && (daysUntil(item.dueDate, today) ?? 0) < 0)).length, [pending.data, today]);

  const reloadSummary = summary.reload;
  const reloadSubjects = subjects.reload;
  const reloadPending = pending.reload;
  const reloadAssessments = assessments.reload;
  const reloadAll = useCallback(() => {
    reloadSummary();
    reloadSubjects();
    reloadPending();
    reloadAssessments();
  }, [reloadSummary, reloadSubjects, reloadPending, reloadAssessments]);

  return {
    summary,
    subjects,
    pending,
    assessments,
    upcoming,
    lowAttendance,
    overdueCount,
    loading: summary.status === 'loading' || subjects.status === 'loading' || pending.status === 'loading' || assessments.status === 'loading',
    reloadAll,
  };
}
