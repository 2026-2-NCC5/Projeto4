import { ListChecks } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { MetricCard, PageHeader, Tabs } from '@/components/ui/Display';
import { LoadingRows } from '@/components/feedback/States';
import { isAcademicUnavailable, useStudentProfile, useStudentSummary } from '@/features/academic/api';
import { useMe } from '@/features/auth/session';
import { AcademicQueryFailure, AcademicSourceNote, AcademicUnavailable } from '@/features/academic/components';
import { formatPercent, formatScore } from '@/lib/format';
import { isApiError } from '@/services/api/client';
import { AgentPanel } from './AgentPanel';
import { RecommendationDialog, RunDialog } from './AgentDialogs';
import { AssessmentsPanel, AttendancePanel } from './GradesPanels';
import { SubjectsPanel } from './SubjectsPanel';

const TABS = [
  { value: 'disciplinas', label: 'Disciplinas' },
  { value: 'avaliacoes', label: 'Avaliações' },
  { value: 'frequencia', label: 'Frequência' },
  { value: 'analise', label: 'Agente para o Estudante' },
] as const;

type TabKey = (typeof TABS)[number]['value'];

const isTab = (value: string | null): value is TabKey => TABS.some((tab) => tab.value === value);

function SummaryStrip() {
  const summary = useStudentSummary();
  if (summary.isPending) {
    return (
      <div className="mb-6">
        <LoadingRows rows={1} />
      </div>
    );
  }
  if (summary.error) {
    return (
      <div className="mb-6">
        <AcademicQueryFailure error={summary.error} onRetry={() => void summary.refetch()} title="Resumo acadêmico indisponível" />
      </div>
    );
  }
  const data = summary.data;
  return (
    <section aria-label="Resumo acadêmico" className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <MetricCard label="Disciplinas ativas" value={data.subjectsCount} hint={data.attentionCount > 0 ? `${data.attentionCount} em atenção na última análise` : 'no período'} />
      <MetricCard label="Média geral" value={formatScore(data.averageScore)} hint="Avaliações com nota, de 0 a 10" to="/aluno/academico?aba=avaliacoes" />
      <MetricCard label="Frequência média" value={formatPercent(data.averageAttendanceRate)} hint="Presenças sobre aulas registradas" to="/aluno/academico?aba=frequencia" />
      <MetricCard label="Pendências em aberto" value={data.pendingCount} hint="Pendentes e atrasadas" to="/aluno/pendencias" />
    </section>
  );
}

/**
 * Vida acadêmica: resumo, disciplinas (lista e detalhe), avaliações, frequência e o Agente para o Estudante.
 * Estado no endereço: ?aba=avaliacoes|frequencia|analise, ?disciplina=<id>, ?recomendacao=<id> (destino dos
 * avisos) e ?analise=<runId>.
 */
export default function AcademicPage() {
  const [params, setParams] = useSearchParams();
  const me = useMe();
  const profile = useStudentProfile();
  const summary = useStudentSummary();
  const requested = params.get('aba');
  const subjectId = params.get('disciplina');
  const recommendationId = params.get('recomendacao');
  const runId = params.get('analise');
  const tab: TabKey = isTab(requested) ? requested : (recommendationId || runId) && !subjectId ? 'analise' : 'disciplinas';

  const change = (patch: Record<string, string | null>, replace = false) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace },
    );

  const keepTab = tab === 'disciplinas' ? null : tab;
  const unavailable = isAcademicUnavailable(summary.error);
  // RA e curso de /api/student/me; se a consulta falhar, os mesmos dados da sessão (nunca um texto inventado)
  const student = profile.data ?? me.student;

  return (
    <>
      <PageHeader
        eyebrow={student ? `RA ${student.registrationNumber}${student.program ? ` · ${student.program}` : ''}` : undefined}
        title="Vida acadêmica"
        description="Disciplinas, avaliações, frequência e pendências do período, com o Agente para o Estudante."
        actions={
          <ButtonLink to="/aluno/pendencias" icon={ListChecks}>
            Ver pendências
          </ButtonLink>
        }
      />
      <AcademicSourceNote className="-mt-2 mb-6" />
      {unavailable ? (
        <AcademicUnavailable message={isApiError(summary.error) ? summary.error.message : null} />
      ) : (
        <>
          <SummaryStrip />
          <Tabs label="Seções da vida acadêmica" value={tab} items={[...TABS]} onChange={(value) => change({ aba: value === 'disciplinas' ? null : value, disciplina: null }, true)} />
          <div role="tabpanel" aria-label={TABS.find((item) => item.value === tab)?.label}>
            {tab === 'disciplinas' ? <SubjectsPanel subjectId={subjectId} /> : null}
            {tab === 'avaliacoes' ? <AssessmentsPanel /> : null}
            {tab === 'frequencia' ? <AttendancePanel /> : null}
            {tab === 'analise' ? <AgentPanel onOpenRecommendation={(id) => change({ recomendacao: id, aba: 'analise' })} onOpenRun={(id) => change({ analise: id, aba: 'analise' })} /> : null}
          </div>
        </>
      )}
      {/* ao fechar, a aba em que a pessoa estava fica explícita (o link de um aviso abre direto o detalhe) */}
      <RecommendationDialog id={recommendationId} onClose={() => change({ recomendacao: null, aba: keepTab }, true)} />
      <RunDialog runId={runId} onClose={() => change({ analise: null, aba: keepTab }, true)} onOpenRecommendation={(id) => change({ analise: null, recomendacao: id, aba: keepTab }, true)} />
    </>
  );
}
