import { ChevronRight, History, RefreshCw, Sparkles } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/Button';
import { SectionHeader, Surface } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { EmptyState, LoadingRows } from '@/components/feedback/States';
import { analysisFailure, useAgentHistory, useAnalyze, useLatestAnalysis } from '@/features/academic/api';
import { AcademicQueryFailure, AnalysisView, RunStatusBadge } from '@/features/academic/components';
import { pluralize } from '@/features/academic/labels';
import { formatDateTime } from '@/lib/format';
import type { AgentHistoryItem } from '@/types/api';

/** O que o agente faz e o que não faz, em linguagem simples (ao lado do botão que pede a análise). */
function AgentIntro() {
  const headingId = useId();
  const analyze = useAnalyze();
  const toast = useToast();
  const failure = analyze.error ? analysisFailure(analyze.error) : null;
  const run = () => analyze.mutate(undefined, { onSuccess: () => toast.show('Análise concluída. Veja o resultado abaixo.') });
  return (
    <Surface aria-labelledby={headingId}>
      <h2 id={headingId} className="text-h3 font-semibold text-ink">
        Agente para o Estudante
      </h2>
      <p className="mt-1 max-w-3xl text-body text-slate">
        O agente olha suas disciplinas, notas, frequência e pendências e aponta o que merece atenção, mostrando a evidência de cada ponto.
      </p>
      <ul className="mt-3 flex max-w-3xl list-disc flex-col gap-1 pl-5 text-small text-slate">
        <li>Ele segue regras explicáveis e sempre diz o porquê (“Por que estou vendo isso?”).</li>
        <li>Não é uma nota nem uma avaliação sua, e não altera nenhum registro acadêmico.</li>
        <li>Quando algo precisa de confirmação, ele indica uma pessoa responsável. Decisões acadêmicas são sempre humanas.</li>
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          icon={Sparkles}
          loading={analyze.isPending}
          onClick={run}
        >
          Solicitar análise
        </Button>
        {analyze.isPending ? (
          <p role="status" className="text-small text-slate">
            Analisando sua situação acadêmica... Isso pode levar alguns segundos.
          </p>
        ) : null}
      </div>
      {failure ? (
        <div role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2.5 text-small text-danger-text">
          <p className="text-ink">{failure.title}</p>
          <p className="mt-0.5">{failure.message}</p>
          <Button size="sm" icon={RefreshCw} className="mt-2" onClick={run} disabled={analyze.isPending}>
            Tentar novamente
          </Button>
        </div>
      ) : null}
    </Surface>
  );
}

function LatestAnalysis({ onOpenRecommendation }: { onOpenRecommendation: (id: string) => void }) {
  const latest = useLatestAnalysis();
  const headingId = useId();
  return (
    <Surface aria-labelledby={headingId}>
      <SectionHeader id={headingId} title="Análise mais recente" />
      {latest.isPending ? (
        <LoadingRows rows={3} />
      ) : latest.error ? (
        <AcademicQueryFailure error={latest.error} onRetry={() => void latest.refetch()} title="Não foi possível carregar a análise" />
      ) : latest.data === null ? (
        <EmptyState icon={Sparkles} title="Nenhuma análise realizada ainda" description="Peça uma análise para ver o que merece atenção, com a evidência de cada recomendação." />
      ) : (
        <AnalysisView analysis={latest.data} onOpenRecommendation={onOpenRecommendation} />
      )}
    </Surface>
  );
}

function HistoryRow({ item, onOpen }: { item: AgentHistoryItem; onOpen: (runId: string) => void }) {
  const meta = [pluralize(item.recommendationsCount, 'recomendação', 'recomendações'), item.requiresHumanValidation ? 'Validação humana' : null, item.abstained ? 'Abstenção' : null].filter(Boolean).join(' · ');
  return (
    <li>
      <button type="button" onClick={() => onOpen(item.runId)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-paper focus-visible:bg-paper sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <RunStatusBadge status={item.status} />
            <span className="text-caption text-mist">{formatDateTime(item.createdAt)}</span>
          </div>
          <p className="mt-1.5 wrap-break-word text-body text-ink">{item.summary}</p>
          <p className="mt-0.5 text-caption text-mist">{meta}</p>
        </div>
        <ChevronRight size={20} aria-hidden className="mt-0.5 shrink-0 text-slate" />
      </button>
    </li>
  );
}

function AnalysisHistory({ onOpenRun }: { onOpenRun: (runId: string) => void }) {
  const history = useAgentHistory();
  const headingId = useId();
  return (
    <Surface padded={false} aria-labelledby={headingId}>
      <div className="px-4 pt-4 sm:px-5">
        <SectionHeader id={headingId} title="Histórico de análises" description="Da mais recente para a mais antiga." />
      </div>
      {history.isPending ? (
        <div className="px-4 pb-4 sm:px-5">
          <LoadingRows rows={2} />
        </div>
      ) : history.error ? (
        <div className="px-4 pb-4 sm:px-5">
          <AcademicQueryFailure error={history.error} onRetry={() => void history.refetch()} title="Não foi possível carregar o histórico" />
        </div>
      ) : history.data.length === 0 ? (
        <div className="px-4 pb-4 sm:px-5">
          <EmptyState icon={History} title="Nenhuma análise" description="Nenhuma análise registrada ainda." />
        </div>
      ) : (
        <ul aria-label="Análises anteriores" className="divide-y divide-line-soft border-t border-line-soft">
          {history.data.map((item) => (
            <HistoryRow key={item.runId} item={item} onOpen={onOpenRun} />
          ))}
        </ul>
      )}
    </Surface>
  );
}

/** Aba "Agente para o Estudante": explicação, nova análise, análise mais recente e histórico. */
export function AgentPanel({ onOpenRecommendation, onOpenRun }: { onOpenRecommendation: (id: string) => void; onOpenRun: (runId: string) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <AgentIntro />
      <LatestAnalysis onOpenRecommendation={onOpenRecommendation} />
      <AnalysisHistory onOpenRun={onOpenRun} />
    </div>
  );
}
