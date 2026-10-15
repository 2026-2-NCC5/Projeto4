import { ArrowRight, CheckCircle2, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { KeyValueList } from '@/components/ui/Display';
import { TextArea } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { ErrorState, LoadingRows } from '@/components/feedback/States';
import { isNotFoundError, isForbiddenError, useAgentRun, useRecommendation, useRecommendationFeedback } from '@/features/academic/api';
import { AnalysisView, HumanValidationNotice, Pill, RecommendationTypeBadge } from '@/features/academic/components';
import { formatConfidence, recommendationTypeMeta, RUN_STATUS_META } from '@/features/academic/labels';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { isApiError, messageForError } from '@/services/api/client';
import type { AgentRecommendationDetail } from '@/types/api';

const COMMENT_MAX = 500;

/** Falha ao abrir um registro do agente: inexistente, de outra pessoa ou erro comum (com nova tentativa). */
function RecordFailure({ error, onRetry, notFound }: { error: unknown; onRetry: () => void; notFound: string }) {
  if (isNotFoundError(error)) return <p className="rounded-md bg-snow px-3 py-2.5 text-small text-slate">{notFound}</p>;
  if (isForbiddenError(error)) {
    return <p className="rounded-md bg-snow px-3 py-2.5 text-small text-slate">{isApiError(error) && error.message ? error.message : 'Você não tem acesso a este registro.'}</p>;
  }
  return <ErrorState error={error} onRetry={onRetry} />;
}

/** "Esta recomendação ajudou você?" — uma avaliação por recomendação; não muda nada na situação acadêmica. */
function FeedbackForm({ recommendationId }: { recommendationId: string }) {
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [missing, setMissing] = useState(false);
  const feedback = useRecommendationFeedback(recommendationId);
  const toast = useToast();
  const name = useId();
  const options = [
    { value: true, label: 'Sim, ajudou', icon: ThumbsUp },
    { value: false, label: 'Não ajudou', icon: ThumbsDown },
  ] as const;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (helpful === null) {
      setMissing(true);
      return;
    }
    const text = comment.trim();
    feedback.mutate({ helpful, ...(text ? { comment: text } : {}) }, { onSuccess: () => toast.show('Obrigado! Sua avaliação foi registrada.') });
  };

  const conflict = isApiError(feedback.error) && feedback.error.kind === 'conflict';
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <fieldset>
        <legend className="text-h4 font-semibold text-ink">Esta recomendação ajudou você?</legend>
        <p className="mt-0.5 text-small text-slate">Sua resposta ajuda a melhorar o agente. Ela não muda nada na sua situação acadêmica.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {options.map((option) => {
            const selected = helpful === option.value;
            return (
              <label
                key={option.label}
                className={cn(
                  'inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border px-4 text-body transition-colors',
                  'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-action',
                  selected ? 'border-action bg-action-soft text-action' : 'border-line bg-white text-ink hover:border-line-strong',
                )}
              >
                <input
                  type="radio"
                  name={name}
                  className="sr-only"
                  checked={selected}
                  onChange={() => {
                    setHelpful(option.value);
                    setMissing(false);
                  }}
                />
                <option.icon size={20} aria-hidden />
                {option.label}
              </label>
            );
          })}
        </div>
        {missing ? (
          <p role="alert" className="mt-1.5 text-caption text-danger-text">
            Escolha “Sim, ajudou” ou “Não ajudou”.
          </p>
        ) : null}
      </fieldset>
      <TextArea
        label="Comentário (opcional)"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={COMMENT_MAX}
        rows={3}
        hint={`Opcional · ${comment.length}/${COMMENT_MAX} caracteres. Não escreva dados pessoais.`}
      />
      {feedback.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-small text-danger-text">
          {conflict ? 'Você já avaliou esta recomendação.' : messageForError(feedback.error, 'Não foi possível enviar sua avaliação. Tente novamente.')}
        </p>
      ) : null}
      <Button type="submit" variant="primary" loading={feedback.isPending} className="self-start">
        Enviar avaliação
      </Button>
    </form>
  );
}

function FeedbackSection({ detail }: { detail: AgentRecommendationDetail }) {
  if (detail.feedback) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <Pill tone="success" icon={CheckCircle2} className="self-start">
          Avaliação enviada
        </Pill>
        <p className="text-small text-ink">
          Você marcou esta recomendação como {detail.feedback.helpful ? 'útil' : 'não útil'} em {formatDateTime(detail.feedback.createdAt)}.
        </p>
        {detail.feedback.comment ? <p className="wrap-break-word text-small text-slate">Seu comentário: “{detail.feedback.comment}”</p> : null}
      </div>
    );
  }
  // uma instância por recomendação: escolha, comentário e erro não passam de uma para outra
  return <FeedbackForm key={detail.id} recommendationId={detail.id} />;
}

function RecommendationDetailView({ detail }: { detail: AgentRecommendationDetail }) {
  const confidence = formatConfidence(detail.confidence);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <RecommendationTypeBadge type={detail.type} />
          {confidence ? <span className="text-caption text-mist">{confidence}</span> : null}
        </div>
        <h3 className="text-h3 font-semibold text-ink">{detail.message}</h3>
      </div>
      <section>
        <p className="text-small text-slate">Por que estou vendo isso?</p>
        {detail.evidence.length > 0 ? (
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-small text-ink">
            {detail.evidence.map((item, index) => (
              <li key={`${index}-${item}`} className="wrap-break-word">
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-small text-slate">Sem evidências adicionais registradas.</p>
        )}
        {detail.nextAction ? (
          <p className="mt-3 flex items-start gap-2 text-small">
            <ArrowRight size={16} aria-hidden className="mt-0.5 shrink-0 text-slate" />
            <span className="min-w-0">
              <span className="text-slate">Próxima ação:</span> <span className="text-ink">{detail.nextAction}</span>
            </span>
          </p>
        ) : null}
      </section>
      {detail.requiresHumanValidation ? <HumanValidationNotice /> : null}
      <KeyValueList
        columns={2}
        items={[
          { label: 'Análise', value: RUN_STATUS_META[detail.runStatus].label },
          { label: 'Data', value: formatDateTime(detail.createdAt) },
          { label: 'Prioridade', value: String(detail.priority) },
        ]}
      />
      {detail.subjectId ? (
        <ButtonLink to={`/aluno/academico?disciplina=${encodeURIComponent(detail.subjectId)}`} size="sm" className="self-start">
          Ver disciplina
        </ButtonLink>
      ) : null}
      <div className="border-t border-line-soft pt-4">
        <FeedbackSection detail={detail} />
      </div>
    </div>
  );
}

/** Detalhe de uma recomendação (?recomendacao=<id>, também o destino dos avisos) com a avaliação do aluno. */
export function RecommendationDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useRecommendation(id);
  return (
    <Dialog open={Boolean(id)} onClose={onClose} side="right" title="Recomendação" description={detail.data ? recommendationTypeMeta(detail.data.type).label : undefined}>
      {detail.isPending ? (
        <LoadingRows rows={3} />
      ) : detail.error ? (
        <RecordFailure error={detail.error} onRetry={() => void detail.refetch()} notFound="Recomendação não encontrada. Ela pode ter sido substituída por uma análise mais recente." />
      ) : (
        <RecommendationDetailView detail={detail.data} />
      )}
    </Dialog>
  );
}

/** Uma análise anterior do histórico (?analise=<runId>). */
export function RunDialog({ runId, onClose, onOpenRecommendation }: { runId: string | null; onClose: () => void; onOpenRecommendation: (id: string) => void }) {
  const run = useAgentRun(runId);
  return (
    <Dialog open={Boolean(runId)} onClose={onClose} side="right" title="Análise do agente" description={run.data ? formatDateTime(run.data.createdAt) : undefined}>
      {run.isPending ? (
        <LoadingRows rows={3} />
      ) : run.error ? (
        <RecordFailure error={run.error} onRetry={() => void run.refetch()} notFound="Análise não encontrada." />
      ) : (
        <AnalysisView analysis={run.data} onOpenRecommendation={onOpenRecommendation} />
      )}
    </Dialog>
  );
}
