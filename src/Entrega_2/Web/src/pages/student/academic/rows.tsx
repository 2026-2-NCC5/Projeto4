import { AlertTriangle, CheckCircle2, ClipboardList, Clock, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { AttendanceBadge, AttendanceMeter, attendanceText, Pill } from '@/features/academic/components';
import { ASSESSMENT_TYPE_LABELS, isLowScore, PENDING_STATUS_META, pendingTypeLabel } from '@/features/academic/labels';
import { displayPendingStatus, dueLabel } from '@/features/academic/pending';
import { cn } from '@/lib/cn';
import { formatCalendarDate, formatNumber } from '@/lib/format';
import type { PendingItemStatus, StudentAssessment, StudentAttendance, StudentPendingItem } from '@/types/api';

const PENDING_ICONS: Record<PendingItemStatus, LucideIcon> = { overdue: AlertTriangle, pending: Clock, completed: CheckCircle2 };

/** Avaliação como linha: título e contexto à esquerda, nota à direita (nota baixa com ícone e texto, não só cor). */
export function AssessmentRow({ assessment, showSubject = true }: { assessment: StudentAssessment; showSubject?: boolean }) {
  const graded = assessment.score !== null;
  const low = isLowScore(assessment.score, assessment.maxScore);
  const meta = [ASSESSMENT_TYPE_LABELS[assessment.type] ?? 'Avaliação', showSubject ? assessment.subjectName : null, assessment.appliedAt ? formatCalendarDate(assessment.appliedAt) : 'Sem data'].filter(Boolean).join(' · ');
  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="wrap-break-word text-body font-medium text-ink">{assessment.title}</p>
        <p className="mt-0.5 text-caption text-mist">{meta}</p>
      </div>
      <div className="shrink-0 text-right">
        {graded ? (
          <>
            <p className={cn('flex items-center justify-end gap-1 text-h4 tabular-nums', low ? 'text-warning-text' : 'text-ink')}>
              {low ? <AlertTriangle size={16} aria-hidden /> : null}
              {formatNumber(assessment.score)}
              {low ? <span className="sr-only"> (abaixo de 60% da nota máxima)</span> : null}
            </p>
            <p className="text-caption text-mist">de {formatNumber(assessment.maxScore)}</p>
          </>
        ) : (
          <p className="text-small text-slate">Aguardando nota</p>
        )}
      </div>
    </li>
  );
}

/** Frequência de uma disciplina: aulas, percentual, selo de atenção e barra. */
export function AttendanceRow({ item, title }: { item: StudentAttendance; title?: string }) {
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="wrap-break-word text-body font-medium text-ink">{title ?? item.subjectName}</p>
          <p className="mt-0.5 text-caption text-mist">{item.totalClasses > 0 ? `${item.attendedClasses} de ${item.totalClasses} aulas` : 'Nenhuma aula registrada ainda'}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="text-h4 tabular-nums text-ink">{attendanceText(item.attendanceRate)}</p>
          <AttendanceBadge rate={item.attendanceRate} />
        </div>
      </div>
      <AttendanceMeter rate={item.attendanceRate} className="mt-2" />
    </li>
  );
}

/**
 * Pendência: o que fazer, tipo e disciplina, prazo e situação. Por padrão leva à disciplina (quando há uma);
 * `href` troca o destino e `null` tira o link.
 */
export function PendingRow({ item, now, href }: { item: StudentPendingItem; now: Date; href?: string | null }) {
  const target = href === undefined ? (item.subjectId ? `/aluno/academico?disciplina=${encodeURIComponent(item.subjectId)}` : null) : href;
  const status = displayPendingStatus(item, now);
  const meta = PENDING_STATUS_META[status];
  const context = [pendingTypeLabel(item.type), item.subjectName].filter(Boolean).join(' · ');
  const body = (
    <div className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 sm:px-5">
      <ClipboardList size={20} aria-hidden className="mt-0.5 shrink-0 text-slate" />
      <div className="min-w-0 flex-1">
        <p className="wrap-break-word text-body font-medium text-ink">{item.description}</p>
        <p className="mt-0.5 text-small text-slate">{context || 'Sem disciplina'}</p>
        <p className={cn('mt-1 text-caption', status === 'overdue' ? 'text-danger-text' : 'text-mist')}>{dueLabel(item.dueDate, now)}</p>
      </div>
    </div>
  );
  return (
    <li className="flex items-start">
      {target ? (
        <Link to={target} className="block min-w-0 flex-1 transition-colors hover:bg-paper focus-visible:bg-paper">
          {body}
        </Link>
      ) : (
        body
      )}
      <div className="shrink-0 py-3 pr-4 sm:pr-5">
        <Pill tone={meta.tone} icon={PENDING_ICONS[status]}>
          {meta.label}
        </Pill>
      </div>
    </li>
  );
}
