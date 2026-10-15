import { CalendarCheck, NotebookPen } from 'lucide-react';
import { useId, useState } from 'react';
import { Surface } from '@/components/ui/Display';
import { Select } from '@/components/ui/Form';
import { EmptyState, LoadingRows } from '@/components/feedback/States';
import { useAssessments, useAttendance } from '@/features/academic/api';
import { AcademicQueryFailure } from '@/features/academic/components';
import { ATTENDANCE_MINIMUM_RATE, pluralize } from '@/features/academic/labels';
import { formatPercent } from '@/lib/format';
import { AssessmentRow, AttendanceRow } from './rows';

/** Aba "Avaliações": todas as notas lançadas (ordem da API: data de aplicação), com filtro por disciplina. */
export function AssessmentsPanel() {
  const assessments = useAssessments();
  const [subjectId, setSubjectId] = useState('');
  const headingId = useId();
  if (assessments.isPending) return <LoadingRows rows={4} />;
  if (assessments.error) return <AcademicQueryFailure error={assessments.error} onRetry={() => void assessments.refetch()} title="Não foi possível carregar suas avaliações" />;
  if (assessments.data.length === 0) return <EmptyState icon={NotebookPen} title="Nenhuma avaliação registrada" description="Nenhuma avaliação registrada até o momento." />;

  const subjects = [...new Map(assessments.data.map((item) => [item.subjectId, item.subjectName])).entries()].map(([value, label]) => ({ value, label }));
  const known = subjects.some((item) => item.value === subjectId);
  const shown = known ? assessments.data.filter((item) => item.subjectId === subjectId) : assessments.data;

  return (
    <Surface padded={false} aria-labelledby={headingId}>
      <div className="flex flex-col gap-3 border-b border-line-soft px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h2 id={headingId} className="text-h3 font-semibold text-ink">
            Avaliações e notas
          </h2>
          <p role="status" className="text-small text-slate">
            {pluralize(shown.length, 'registro', 'registros')}
          </p>
        </div>
        {subjects.length > 1 ? (
          <Select label="Disciplina" value={known ? subjectId : ''} onChange={(event) => setSubjectId(event.target.value)} placeholder="Todas as disciplinas" options={subjects} containerClassName="w-full sm:w-64" />
        ) : null}
      </div>
      <ul className="divide-y divide-line-soft">
        {shown.map((assessment) => (
          <AssessmentRow key={assessment.id} assessment={assessment} showSubject={!known} />
        ))}
      </ul>
    </Surface>
  );
}

/** Aba "Frequência": presenças por disciplina, com o mínimo exigido e selo quando merece atenção. */
export function AttendancePanel() {
  const attendance = useAttendance();
  const headingId = useId();
  if (attendance.isPending) return <LoadingRows rows={3} />;
  if (attendance.error) return <AcademicQueryFailure error={attendance.error} onRetry={() => void attendance.refetch()} title="Não foi possível carregar sua frequência" />;
  if (attendance.data.length === 0) return <EmptyState icon={CalendarCheck} title="Sem registros de frequência" description="Nenhum registro de frequência disponível." />;
  return (
    <Surface padded={false} aria-labelledby={headingId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft px-4 py-3 sm:px-5">
        <h2 id={headingId} className="text-h3 font-semibold text-ink">
          Frequência por disciplina
        </h2>
        <span className="text-small text-slate">Mínimo exigido: {formatPercent(ATTENDANCE_MINIMUM_RATE)}</span>
      </div>
      <ul className="divide-y divide-line-soft">
        {attendance.data.map((item) => (
          <AttendanceRow key={item.subjectId} item={item} />
        ))}
      </ul>
    </Surface>
  );
}
