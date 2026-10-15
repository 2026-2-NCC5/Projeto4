import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, LoadingRows } from '@/components/feedback/States';
import { adminApi, adminKeys } from '@/features/admin/api';
import { AdminFailure, StateBadge } from '@/features/admin/components';
import { RUN_STATUS_META, TRIGGER_META } from '@/features/admin/labels';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { AutomationRuleView } from '@/types/api';

/** Últimas execuções de uma regra (o servidor devolve até 50, da mais recente para a mais antiga). */
export function AutomationRunsDialog({ rule, onClose }: { rule: AutomationRuleView | null; onClose: () => void }) {
  const query = useQuery({ queryKey: adminKeys.automationRuns(rule?.id ?? ''), queryFn: () => adminApi.automationRuns(rule?.id ?? ''), enabled: Boolean(rule) });
  return (
    <Dialog open={rule !== null} onClose={onClose} side="right" title="Histórico de execuções" description={rule ? `“${rule.name}” · últimas 50 execuções` : undefined}>
      {!rule ? null : query.isPending ? (
        <LoadingRows rows={4} />
      ) : query.data === undefined ? (
        <AdminFailure error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar o histórico" />
      ) : query.data.length === 0 ? (
        <EmptyState icon={History} title="Esta regra ainda não rodou" description="As execuções aparecem aqui quando a regra está ativa, o motor de automações está ligado e um chamado atende às condições." />
      ) : (
        <ul className="divide-y divide-line-soft rounded-lg border border-line" aria-label="Execuções da regra">
          {query.data.map((run) => (
            <li key={run.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-small text-ink">{run.ticketProtocol}</span>
                <StateBadge meta={RUN_STATUS_META[run.status]} />
              </div>
              <p className="text-small text-slate">
                {TRIGGER_META[run.trigger]?.label ?? run.trigger}
                {run.detail ? ` · ${run.detail}` : ''}
              </p>
              <time dateTime={run.createdAt} title={formatDateTime(run.createdAt)} className="text-caption text-mist">
                {formatDateTime(run.createdAt)} ({formatRelative(run.createdAt)})
              </time>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
