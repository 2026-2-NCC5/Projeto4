import { CheckCircle2, GraduationCap } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/Display';
import { EmptyState, LoadingRows } from '@/components/feedback/States';
import { usePendingItems } from '@/features/academic/api';
import { AcademicQueryFailure, AcademicSourceNote } from '@/features/academic/components';
import { PENDING_STATUS_META } from '@/features/academic/labels';
import { groupPendingItems } from '@/features/academic/pending';
import type { PendingItemStatus } from '@/types/api';
import { PendingRow } from './academic/rows';

const GROUP_HINTS: Record<PendingItemStatus, string> = {
  overdue: 'O prazo já passou. Se precisar de ajuda, fale com o professor da disciplina ou com o ASA.',
  pending: 'Do prazo mais próximo para o mais distante.',
  completed: 'Entregas já registradas como concluídas.',
};

/** "1 item precisa de atenção" — conta só o que não foi concluído (mesmas palavras do app). */
function attentionText(open: number): string {
  if (open === 0) return 'Tudo concluído';
  return open === 1 ? '1 item precisa de atenção' : `${open} itens precisam de atenção`;
}

/**
 * Pendências do aluno (GET /api/student/pending-items) agrupadas por situação — atrasadas, pendentes e
 * concluídas — mantendo em cada grupo a ordem da API (prazo mais próximo primeiro).
 */
export default function PendingItemsPage() {
  const pending = usePendingItems();
  const now = new Date();
  const header = (
    <PageHeader
      title="Pendências"
      description="Atividades e entregas das suas disciplinas, das mais urgentes para as concluídas."
      actions={
        <ButtonLink to="/aluno/academico" icon={GraduationCap}>
          Vida acadêmica
        </ButtonLink>
      }
    />
  );

  if (pending.isPending) {
    return (
      <>
        {header}
        <LoadingRows rows={4} />
      </>
    );
  }
  if (pending.error) {
    return (
      <>
        {header}
        <AcademicQueryFailure error={pending.error} onRetry={() => void pending.refetch()} title="Não foi possível carregar suas pendências" />
      </>
    );
  }

  const groups = groupPendingItems(pending.data, now);
  const open = groups.filter((group) => group.status !== 'completed').reduce((sum, group) => sum + group.items.length, 0);

  return (
    <>
      {header}
      <AcademicSourceNote className="-mt-2 mb-6" />
      {groups.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nenhuma pendência encontrada" description="Tudo certo por aqui. Quando novas pendências forem identificadas, elas aparecem nesta página." />
      ) : (
        <div className="flex flex-col gap-6">
          <p role="status" className="text-body text-slate">
            {attentionText(open)}
          </p>
          {groups.map((group) => {
            const meta = PENDING_STATUS_META[group.status];
            const headingId = `pendencias-${group.status}`;
            return (
              <section key={group.status} aria-labelledby={headingId}>
                <div className="mb-2">
                  <h2 id={headingId} className="text-h3 font-semibold text-ink">
                    {meta.group} <span className="text-body font-normal text-slate">({group.items.length})</span>
                  </h2>
                  <p className="text-small text-slate">{GROUP_HINTS[group.status]}</p>
                </div>
                <ul aria-label={`Pendências: ${meta.group.toLowerCase()}`} className="divide-y divide-line-soft overflow-hidden rounded-lg border border-line bg-white">
                  {group.items.map((item) => (
                    <PendingRow key={item.id} item={item} now={now} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
