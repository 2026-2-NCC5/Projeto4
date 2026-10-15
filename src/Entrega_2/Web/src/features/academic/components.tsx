import { AlertTriangle, ArrowRight, CheckCircle2, CircleSlash, DatabaseZap, FlaskConical, Info, Lock, ShieldCheck, UserCheck, type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Badge, type Tone } from '@/components/ui/Display';
import { EmptyState, ErrorState } from '@/components/feedback/States';
import { usePlatformInfo } from '@/features/platform/platform';
import { cn } from '@/lib/cn';
import { formatDateTime, formatPercent } from '@/lib/format';
import { isApiError } from '@/services/api/client';
import type { AgentAnalysis, AgentRecommendation, AgentRunStatus } from '@/types/api';
import { isAcademicUnavailable, isForbiddenError } from './api';
import { ATTENDANCE_LEVEL_META, attendanceLevel, formatConfidence, pluralize, recommendationTypeMeta, RUN_STATUS_META } from './labels';

/** Selo com ícone de 16px e texto (situação nunca só por cor). */
export function Pill({ tone = 'neutral', icon: IconGlyph, children, className }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <Badge tone={tone} className={className}>
      {IconGlyph ? <IconGlyph size={16} aria-hidden className="shrink-0" /> : null}
      {children}
    </Badge>
  );
}

const RUN_ICONS: Record<AgentRunStatus, LucideIcon> = { recommendation: AlertTriangle, no_action: CheckCircle2, abstained: Info };

export function RunStatusBadge({ status }: { status: AgentRunStatus }) {
  const meta = RUN_STATUS_META[status];
  return (
    <Pill tone={meta.tone} icon={RUN_ICONS[status]}>
      {meta.label}
    </Pill>
  );
}

export function RecommendationTypeBadge({ type }: { type: string }) {
  const meta = recommendationTypeMeta(type);
  return (
    <Pill tone={meta.tone} icon={meta.tone === 'info' ? Info : AlertTriangle}>
      {meta.label}
    </Pill>
  );
}

/** Selo de frequência só quando merece atenção ("Atenção" / "Abaixo do mínimo"). */
export function AttendanceBadge({ rate }: { rate: number | null }) {
  const level = attendanceLevel(rate);
  if (level === 'ok' || level === 'unknown') return null;
  const meta = ATTENDANCE_LEVEL_META[level];
  return (
    <Pill tone={meta.tone} icon={AlertTriangle}>
      {meta.label}
    </Pill>
  );
}

/** Frequência em dia fica neutra; só atenção e abaixo do mínimo ganham cor (e sempre têm selo em texto). */
const METER_COLORS = { ok: 'bg-slate', attention: 'bg-warning', critical: 'bg-danger', unknown: 'bg-line-strong' } as const;

/** Barra de frequência (decorativa: o percentual sempre aparece em texto ao lado). */
export function AttendanceMeter({ rate, className }: { rate: number | null; className?: string }) {
  const level = attendanceLevel(rate);
  const width = rate === null ? 0 : Math.max(0, Math.min(100, Math.round(rate * 100)));
  return (
    <div aria-hidden className={cn('h-1.5 w-full overflow-hidden rounded-full bg-line-soft', className)}>
      <div className={cn('h-full rounded-full', METER_COLORS[level])} style={{ width: `${width}%` }} />
    </div>
  );
}

export const attendanceText = (rate: number | null): string => (rate === null ? '—' : formatPercent(rate));

/**
 * Fonte acadêmica indisponível (503 `academic_source_unavailable`): mostra a mensagem do servidor como ela é.
 * Nada de dados de exemplo no lugar.
 */
export function AcademicUnavailable({ message, compact }: { message: string | null | undefined; compact?: boolean }) {
  const text = message?.trim() || 'A fonte de dados acadêmicos não está disponível no momento.';
  if (compact) {
    return (
      <div role="status" className="flex items-start gap-2 rounded-md bg-snow px-3 py-2.5 text-small text-slate">
        <DatabaseZap size={20} className="shrink-0" aria-hidden />
        <span>
          <span className="text-ink">Dados acadêmicos indisponíveis.</span> {text}
        </span>
      </div>
    );
  }
  return (
    <EmptyState
      icon={DatabaseZap}
      title="Dados acadêmicos indisponíveis"
      description={
        <>
          {text}
          <span className="mt-1 block">Por segurança, o portal não mostra dados de exemplo no lugar.</span>
        </>
      }
    />
  );
}

/** Erro de uma consulta acadêmica: fonte indisponível, acesso negado ou falha comum (com nova tentativa). */
export function AcademicQueryFailure({ error, onRetry, title, compact }: { error: unknown; onRetry: () => void; title?: string; compact?: boolean }) {
  if (isAcademicUnavailable(error)) return <AcademicUnavailable message={isApiError(error) ? error.message : null} compact={compact} />;
  if (isForbiddenError(error)) {
    return <EmptyState icon={Lock} title="Acesso não permitido" description={isApiError(error) && error.message ? error.message : 'Seu perfil não tem acesso a estes dados.'} />;
  }
  return <ErrorState error={error} onRetry={onRetry} title={title} />;
}

/** Origem dos dados acadêmicos (DEMONSTRAÇÃO × INSTITUCIONAL), vinda de /api/platform/info. */
export function AcademicSourceNote({ className }: { className?: string }) {
  const platform = usePlatformInfo();
  const info = platform.data;
  if (!info) return null;
  const demo = info.academicSource.provider === 'demo' || info.dataMode === 'demo';
  return (
    <div role="note" aria-label="Origem dos dados acadêmicos" className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-slate', className)}>
      <Pill tone={demo ? 'warning' : 'neutral'} icon={demo ? FlaskConical : ShieldCheck}>
        {info.dataModeLabel}
      </Pill>
      <span className="min-w-0">{info.academicSource.message}</span>
    </div>
  );
}

/** Abstenção é um resultado legítimo do agente — nunca é apresentada como erro. */
export function AbstentionNotice({ reason }: { reason: string | null }) {
  return (
    <div role="status" className="rounded-lg border border-line bg-white p-4">
      <Pill icon={CircleSlash}>Sem recomendação confiável</Pill>
      <p className="mt-2 text-h4 font-semibold text-ink">Não foi possível gerar uma recomendação confiável.</p>
      <p className="mt-2 text-small text-slate">
        <span className="text-ink">Motivo:</span> {reason?.trim() || 'O agente não encontrou evidências suficientes para uma orientação segura.'}
      </p>
      <p className="mt-2 text-small text-slate">Isso não é uma falha: o agente prefere não recomendar quando os dados disponíveis não sustentam uma orientação confiável.</p>
    </div>
  );
}

/** A recomendação depende de uma pessoa da instituição: aviso informativo, nunca erro. */
export function HumanValidationNotice({ nextAction, compact }: { nextAction?: string | null; compact?: boolean }) {
  return (
    <div role="status" className={cn('rounded-lg bg-info-soft text-info-text', compact ? 'px-3 py-2' : 'p-4')}>
      <p className="flex items-center gap-2 text-small">
        <UserCheck size={16} aria-hidden className="shrink-0" />
        Esta situação precisa ser confirmada por uma pessoa responsável.
      </p>
      {nextAction ? (
        <p className="mt-1 pl-6 text-small text-ink">
          <span className="text-info-text">Próxima ação:</span> {nextAction}
        </p>
      ) : null}
    </div>
  );
}

function RecommendationItem({ recommendation, onOpen, hideValidation }: { recommendation: AgentRecommendation; onOpen?: (id: string) => void; hideValidation: boolean }) {
  const headingId = useId();
  const confidence = formatConfidence(recommendation.confidence);
  return (
    <li className="px-4 py-4" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RecommendationTypeBadge type={recommendation.type} />
        {confidence ? <span className="text-caption text-mist">{confidence}</span> : null}
      </div>
      <h4 id={headingId} className="mt-2 text-h4 font-semibold text-ink">
        {recommendation.message}
      </h4>
      <p className="mt-3 text-small text-slate">Por que estou vendo isso?</p>
      {recommendation.evidence.length > 0 ? (
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-small text-ink">
          {recommendation.evidence.map((item, index) => (
            <li key={`${index}-${item}`} className="wrap-break-word">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-small text-slate">Sem evidências adicionais registradas.</p>
      )}
      {recommendation.nextAction ? (
        <p className="mt-3 flex items-start gap-2 text-small">
          <ArrowRight size={16} aria-hidden className="mt-0.5 shrink-0 text-slate" />
          <span className="min-w-0">
            <span className="text-slate">Próxima ação:</span> <span className="text-ink">{recommendation.nextAction}</span>
          </span>
        </p>
      ) : null}
      {recommendation.requiresHumanValidation && !hideValidation ? <HumanValidationNotice compact /> : null}
      {recommendation.subjectId || onOpen ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {recommendation.subjectId ? (
            <ButtonLink size="sm" to={`/aluno/academico?disciplina=${encodeURIComponent(recommendation.subjectId)}`}>
              Ver disciplina
            </ButtonLink>
          ) : null}
          {onOpen ? (
            <Button size="sm" onClick={() => onOpen(recommendation.id)} aria-label={`Ver detalhes e avaliar: ${recommendation.message}`}>
              Ver detalhes e avaliar
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Análise completa: situação, resumo, abstenção, validação humana e recomendações explicáveis (com evidências). */
export function AnalysisView({ analysis, onOpenRecommendation }: { analysis: AgentAnalysis; onOpenRecommendation?: (id: string) => void }) {
  const headingId = useId();
  const recommendations = [...analysis.recommendations].sort((a, b) => a.priority - b.priority);
  const abstained = analysis.abstained || analysis.status === 'abstained';
  const confidence = formatConfidence(analysis.confidence);
  const validationNext = recommendations.find((item) => item.requiresHumanValidation)?.nextAction ?? recommendations[0]?.nextAction ?? null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RunStatusBadge status={analysis.status} />
        {confidence ? <span className="text-caption text-mist">{confidence}</span> : null}
        <span className="text-caption text-mist">{formatDateTime(analysis.createdAt)}</span>
      </div>
      <div>
        <p className="text-caption text-mist">Resumo da análise</p>
        <p className="mt-0.5 text-body text-ink">{analysis.summary}</p>
        <p className="mt-1 text-caption text-mist">{pluralize(recommendations.length, 'recomendação', 'recomendações')}</p>
      </div>
      {abstained ? <AbstentionNotice reason={analysis.abstentionReason} /> : null}
      {!abstained && analysis.requiresHumanValidation ? <HumanValidationNotice nextAction={validationNext} /> : null}
      {!abstained && analysis.status === 'no_action' && recommendations.length === 0 ? (
        <div role="status" className="rounded-lg border border-line bg-white p-4">
          <Pill tone="success" icon={CheckCircle2}>
            Em dia
          </Pill>
          <p className="mt-2 text-h4 font-semibold text-ink">Nenhuma situação que mereça atenção foi identificada</p>
          <p className="mt-1 text-small text-slate">Continue acompanhando suas disciplinas. Você pode pedir uma nova análise quando quiser.</p>
        </div>
      ) : null}
      {recommendations.length > 0 ? (
        <section aria-labelledby={headingId}>
          <h3 id={headingId} className="mb-2 text-h4 font-semibold text-ink">
            Recomendações
          </h3>
          <ul className="divide-y divide-line-soft rounded-lg border border-line bg-white">
            {recommendations.map((recommendation) => (
              <RecommendationItem key={recommendation.id} recommendation={recommendation} onOpen={onOpenRecommendation} hideValidation={analysis.requiresHumanValidation} />
            ))}
          </ul>
        </section>
      ) : null}
      <details className="text-caption text-mist">
        <summary className="w-fit cursor-pointer rounded-sm text-small text-slate hover:text-ink">Detalhes técnicos</summary>
        <dl className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
          <dt>Execução</dt>
          <dd className="break-all font-mono text-slate">{analysis.runId}</dd>
          <dt>Versão do agente</dt>
          <dd className="text-slate">
            {analysis.version} · configuração {analysis.configVersion}
          </dd>
          <dt>Correlação</dt>
          <dd className="break-all font-mono text-slate">{analysis.correlationId}</dd>
        </dl>
      </details>
    </div>
  );
}
