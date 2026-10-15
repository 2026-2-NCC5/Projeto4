import { AlertTriangle, ArrowLeft, BookOpen, ChevronRight, SearchX } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { SectionHeader, Surface } from '@/components/ui/Display';
import { EmptyState, LoadingRows } from '@/components/feedback/States';
import { useAssessments, useAttendance, usePendingItems, useSubjects } from '@/features/academic/api';
import { AcademicQueryFailure, AttendanceBadge, AttendanceMeter, attendanceText, Pill } from '@/features/academic/components';
import { ATTENDANCE_MINIMUM_RATE, ENROLLMENT_STATUS_LABELS, pluralize } from '@/features/academic/labels';
import { formatPercent, formatScore } from '@/lib/format';
import type { StudentSubject } from '@/types/api';
import { AssessmentRow, AttendanceRow, PendingRow } from './rows';

const subjectHref = (id: string) => `/aluno/academico?disciplina=${encodeURIComponent(id)}`;

function SubjectMetrics({ subject }: { subject: StudentSubject }) {
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-small">
      <div className="flex gap-1">
        <dt className="text-slate">Média</dt>
        <dd className="tabular-nums text-ink">{formatScore(subject.averageScore)}</dd>
      </div>
      <div className="flex gap-1">
        <dt className="text-slate">Frequência</dt>
        <dd className="tabular-nums text-ink">{attendanceText(subject.attendanceRate)}</dd>
      </div>
      <div className="flex gap-1">
        <dt className="text-slate">Pendências</dt>
        <dd className="tabular-nums text-ink">{subject.pendingCount}</dd>
      </div>
    </dl>
  );
}

/** Todas as disciplinas numa lista: média, frequência e pendências de relance; cada linha abre a disciplina. */
function SubjectList() {
  const subjects = useSubjects();
  const headingId = useId();
  if (subjects.isPending) return <LoadingRows rows={3} />;
  if (subjects.error) return <AcademicQueryFailure error={subjects.error} onRetry={() => void subjects.refetch()} title="Não foi possível carregar suas disciplinas" />;
  if (subjects.data.length === 0) return <EmptyState icon={BookOpen} title="Nenhuma disciplina encontrada" description="Nenhuma disciplina encontrada para o período atual." />;
  return (
    <Surface padded={false} aria-labelledby={headingId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft px-4 py-3 sm:px-5">
        <h2 id={headingId} className="text-h3 font-semibold text-ink">
          Minhas disciplinas
        </h2>
        <span className="text-small text-slate">{pluralize(subjects.data.length, 'disciplina', 'disciplinas')}</span>
      </div>
      <ul className="divide-y divide-line-soft">
        {subjects.data.map((subject) => (
          <li key={subject.id}>
            <Link to={subjectHref(subject.id)} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-paper focus-visible:bg-paper sm:px-5">
              <BookOpen size={20} aria-hidden className="mt-0.5 shrink-0 text-slate" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="wrap-break-word text-body font-medium text-ink">{subject.name}</span>
                  {subject.attention ? (
                    <Pill tone="warning" icon={AlertTriangle}>
                      Atenção
                    </Pill>
                  ) : null}
                </div>
                <p className="text-caption text-mist">
                  {subject.code} · {ENROLLMENT_STATUS_LABELS[subject.enrollmentStatus]}
                </p>
                <div className="mt-2">
                  <SubjectMetrics subject={subject} />
                </div>
                <AttendanceMeter rate={subject.attendanceRate} className="mt-2 max-w-sm" />
              </div>
              <ChevronRight size={20} aria-hidden className="mt-0.5 shrink-0 text-slate" />
            </Link>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

function BackToList() {
  return (
    <Link to="/aluno/academico" className="inline-flex w-fit items-center gap-1 rounded-sm text-small text-slate hover:text-ink">
      <ArrowLeft size={16} aria-hidden />
      Todas as disciplinas
    </Link>
  );
}

/** Uma disciplina: números, avaliações, frequência e pendências só dela (as mesmas consultas da página). */
function SubjectDetail({ subjectId }: { subjectId: string }) {
  const subjects = useSubjects();
  const assessments = useAssessments();
  const attendance = useAttendance();
  const pending = usePendingItems();
  const titleId = useId();
  const now = new Date();

  if (subjects.isPending) return <LoadingRows rows={4} />;
  if (subjects.error) return <AcademicQueryFailure error={subjects.error} onRetry={() => void subjects.refetch()} title="Não foi possível carregar a disciplina" />;
  const subject = subjects.data.find((item) => item.id === subjectId);
  if (!subject) {
    return (
      <div className="flex flex-col gap-3">
        <BackToList />
        <EmptyState icon={SearchX} title="Disciplina não encontrada" description="Esta disciplina não está na sua lista atual." action={<ButtonLink to="/aluno/academico">Ver minhas disciplinas</ButtonLink>} />
      </div>
    );
  }
  const subjectAssessments = assessments.data?.filter((item) => item.subjectId === subject.id) ?? [];
  const subjectAttendance = attendance.data?.find((item) => item.subjectId === subject.id) ?? null;
  const subjectPending = pending.data?.filter((item) => item.subjectId === subject.id) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <BackToList />
      <Surface aria-labelledby={titleId}>
        <p className="text-caption text-mist">
          {subject.code} · {ENROLLMENT_STATUS_LABELS[subject.enrollmentStatus]}
        </p>
        <h2 id={titleId} className="mt-0.5 wrap-break-word text-h2 font-semibold text-ink">
          {subject.name}
        </h2>
        <div className="mt-3">
          <SubjectMetrics subject={subject} />
        </div>
        <AttendanceMeter rate={subject.attendanceRate} className="mt-3 max-w-md" />
        {subject.attention ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-small text-warning-text">
            <AlertTriangle size={16} aria-hidden className="shrink-0" />
            <span className="min-w-0 flex-1">A última análise do Agente para o Estudante trouxe uma recomendação para esta disciplina.</span>
            <Link to="/aluno/academico?aba=analise" className="text-action underline underline-offset-2 hover:no-underline">
              Ver análise
            </Link>
          </div>
        ) : null}
      </Surface>

      <Surface padded={false} aria-label={`Avaliações de ${subject.name}`}>
        <div className="px-4 pt-4 sm:px-5">
          <SectionHeader title="Avaliações e notas" description={assessments.data ? pluralize(subjectAssessments.length, 'registro', 'registros') : undefined} />
        </div>
        {assessments.isPending ? (
          <div className="px-4 pb-4 sm:px-5">
            <LoadingRows rows={2} />
          </div>
        ) : assessments.error ? (
          <div className="px-4 pb-4 sm:px-5">
            <AcademicQueryFailure compact error={assessments.error} onRetry={() => void assessments.refetch()} title="Avaliações indisponíveis" />
          </div>
        ) : subjectAssessments.length === 0 ? (
          <p className="px-4 pb-4 text-small text-slate sm:px-5">Nenhuma avaliação registrada até o momento.</p>
        ) : (
          <ul className="divide-y divide-line-soft border-t border-line-soft">
            {subjectAssessments.map((assessment) => (
              <AssessmentRow key={assessment.id} assessment={assessment} showSubject={false} />
            ))}
          </ul>
        )}
      </Surface>

      <Surface padded={false} aria-label={`Frequência em ${subject.name}`}>
        <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4 sm:px-5">
          <SectionHeader title="Frequência" description={`Mínimo exigido: ${formatPercent(ATTENDANCE_MINIMUM_RATE)}`} />
          <AttendanceBadge rate={subject.attendanceRate} />
        </div>
        {attendance.isPending ? (
          <div className="px-4 pb-4 sm:px-5">
            <LoadingRows rows={1} />
          </div>
        ) : attendance.error ? (
          <div className="px-4 pb-4 sm:px-5">
            <AcademicQueryFailure compact error={attendance.error} onRetry={() => void attendance.refetch()} title="Frequência indisponível" />
          </div>
        ) : subjectAttendance ? (
          <ul className="border-t border-line-soft">
            <AttendanceRow item={subjectAttendance} title="Aulas registradas" />
          </ul>
        ) : (
          <p className="px-4 pb-4 text-small text-slate sm:px-5">Nenhum registro de frequência disponível.</p>
        )}
      </Surface>

      <Surface padded={false} aria-label={`Pendências de ${subject.name}`}>
        <div className="px-4 pt-4 sm:px-5">
          <SectionHeader title="Pendências" action={<ButtonLink to="/aluno/pendencias" variant="ghost" size="sm">Ver todas</ButtonLink>} />
        </div>
        {pending.isPending ? (
          <div className="px-4 pb-4 sm:px-5">
            <LoadingRows rows={1} />
          </div>
        ) : pending.error ? (
          <div className="px-4 pb-4 sm:px-5">
            <AcademicQueryFailure compact error={pending.error} onRetry={() => void pending.refetch()} title="Pendências indisponíveis" />
          </div>
        ) : subjectPending.length === 0 ? (
          <p className="px-4 pb-4 text-small text-slate sm:px-5">Nenhuma pendência nesta disciplina.</p>
        ) : (
          <ul className="divide-y divide-line-soft border-t border-line-soft">
            {subjectPending.map((item) => (
              <PendingRow key={item.id} item={item} now={now} href={null} />
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}

/** Aba "Disciplinas": a lista ou, com ?disciplina=<id>, o detalhe de uma disciplina. */
export function SubjectsPanel({ subjectId }: { subjectId: string | null }) {
  return subjectId ? <SubjectDetail subjectId={subjectId} /> : <SubjectList />;
}
