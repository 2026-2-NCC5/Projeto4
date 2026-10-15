import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Pencil, Plus, Workflow } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { PageHeader } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { adminApi, adminKeys } from '@/features/admin/api';
import { describeAction, describeConditions } from '@/features/admin/automations';
import { AdminFailure, Notice, TextLink } from '@/features/admin/components';
import { TRIGGER_META } from '@/features/admin/labels';
import { useSession } from '@/features/auth/session';
import { Freshness } from '@/features/support/staff/components';
import { useSupportCatalog } from '@/features/support/staff/hooks';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { messageForError } from '@/services/api/client';
import type { AutomationRuleView } from '@/types/api';
import { AutomationFormDialog } from './AutomationFormDialog';
import { AutomationRunsDialog } from './AutomationRunsDialog';

/** Endereço da seção "Recursos ativos" (features.toggles) em Configurações. */
export const FEATURE_TOGGLES_LINK = '/admin/configuracoes#recursos-ativos';

/** Interruptor da regra: só pede a mudança; quem aplica é a confirmação. */
function RuleSwitch({ rule, onRequest, busy }: { rule: AutomationRuleView; onRequest: () => void; busy: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-small text-slate" aria-hidden>
        {rule.enabled ? 'Ativa' : 'Desativada'}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={rule.enabled}
        aria-label={`Regra “${rule.name}” ativa`}
        disabled={busy}
        onClick={onRequest}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 disabled:opacity-50',
          rule.enabled ? 'bg-action' : 'bg-fog',
        )}
      >
        <span className={cn('inline-block h-5 w-5 rounded-full bg-white transition-transform duration-150', rule.enabled ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

function RuleRow({
  rule,
  categoryLabel,
  busy,
  onToggle,
  onEdit,
  onRuns,
}: {
  rule: AutomationRuleView;
  categoryLabel: (id: string) => string;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRuns: () => void;
}) {
  const { runs } = rule;
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-h4 font-semibold text-ink">{rule.name}</h3>
          {rule.description ? <p className="mt-0.5 text-small text-slate">{rule.description}</p> : null}
        </div>
        <RuleSwitch rule={rule} busy={busy} onRequest={onToggle} />
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-caption text-mist">Quando</dt>
          <dd className="text-small text-ink">{TRIGGER_META[rule.trigger]?.label ?? rule.trigger}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-caption text-mist">Se</dt>
          <dd className="text-small text-ink">{describeConditions(rule.conditions, categoryLabel)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-caption text-mist">Então</dt>
          <dd className="text-small text-ink">{describeAction(rule)}</dd>
        </div>
      </dl>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-caption text-mist">
          Execuções: {runs.applied} aplicadas · {runs.skipped} ignoradas · {runs.failed} com falha · última{' '}
          {runs.lastRunAt ? (
            <time dateTime={runs.lastRunAt} title={formatDateTime(runs.lastRunAt)}>
              {formatRelative(runs.lastRunAt)}
            </time>
          ) : (
            'nunca'
          )}
          {' · '}alterada {formatRelative(rule.updatedAt)}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={Pencil} onClick={onEdit} aria-label={`Editar regra “${rule.name}”`}>
            Editar
          </Button>
          <Button size="sm" icon={History} onClick={onRuns} aria-label={`Histórico da regra “${rule.name}”`}>
            Histórico
          </Button>
        </div>
      </div>
    </li>
  );
}

const lowerFirst = (text: string): string => (text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : text);

function toggleCopy(rule: AutomationRuleView, engineEnabled: boolean, categoryLabel: (id: string) => string) {
  if (rule.enabled) {
    return {
      title: 'Desativar regra?',
      description: `“${rule.name}” para de rodar agora. O histórico de execuções continua guardado.`,
      confirmLabel: 'Desativar',
    };
  }
  const when = TRIGGER_META[rule.trigger]?.sentence ?? rule.trigger;
  const scope = lowerFirst(describeConditions(rule.conditions, categoryLabel));
  return {
    title: 'Ativar regra?',
    description: `A partir de agora, ${when} (${scope}), a regra vai ${lowerFirst(describeAction(rule))}. Cada chamado é tratado uma única vez por esta regra e gatilho.${
      engineEnabled ? '' : ' Atenção: o motor de automações está desligado em Configurações; a regra só roda quando ele for religado.'
    }`,
    confirmLabel: 'Ativar',
  };
}

/** Automações: regras internas (avisar a equipe, elevar prioridade) com histórico e interruptor confirmado. */
export default function AutomationsPage() {
  const { can } = useSession();
  const allowed = can('automations:manage');
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: adminKeys.automations, queryFn: adminApi.automations, enabled: allowed });
  const catalog = useSupportCatalog();
  const [form, setForm] = useState<{ open: boolean; rule: AutomationRuleView | null }>({ open: false, rule: null });
  const [runsFor, setRunsFor] = useState<AutomationRuleView | null>(null);
  const [toggling, setToggling] = useState<AutomationRuleView | null>(null);

  const toggle = useMutation({
    mutationFn: (rule: AutomationRuleView) => adminApi.updateAutomation(rule.id, { enabled: !rule.enabled }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.automations });
      setToggling(null);
      toast.show(saved.enabled ? `Regra “${saved.name}” ativada.` : `Regra “${saved.name}” desativada.`);
    },
    onError: (error) => toast.show(messageForError(error, 'Não foi possível mudar a regra.'), 'error'),
  });

  if (!allowed) return <AccessDenied />;

  const categories = (catalog.data?.categories ?? []).map((category) => ({ value: category.id, label: category.label }));
  const categoryLabel = (id: string) => categories.find((option) => option.value === id)?.label ?? id;
  const engineEnabled = query.data?.engineEnabled ?? true;
  const copy = toggling ? toggleCopy(toggling, engineEnabled, categoryLabel) : null;

  return (
    <>
      <PageHeader
        title="Automações"
        description="Regras que avisam a equipe ou elevam a prioridade quando um chamado é aberto ou o prazo aperta."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, rule: null })}>
            Nova regra
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3">
        {query.data && !query.data.engineEnabled ? (
          <Notice tone="warning" title="O motor de automações está desligado">
            Nenhuma regra roda, mesmo as ativadas. Para religar, vá em <TextLink to={FEATURE_TOGGLES_LINK}>Configurações → Recursos ativos</TextLink>.
          </Notice>
        ) : null}
        <Notice tone="info" title="Só ações internas">
          Automações avisam a equipe na central do portal ou elevam a prioridade como registro interno. Nunca enviam mensagens a alunos e nunca mudam a situação de um chamado.
        </Notice>
        {catalog.error ? <p className="text-caption text-danger-text">Não foi possível carregar o catálogo de categorias: as categorias aparecem pelo código.</p> : null}
      </div>
      <div className="mb-3 flex justify-end">
        <Freshness updatedAt={query.dataUpdatedAt} fetching={query.isFetching} failed={query.isRefetchError} onRefresh={() => void query.refetch()} />
      </div>
      {query.isPending ? (
        <LoadingRows rows={4} />
      ) : query.data === undefined ? (
        <AdminFailure error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar as automações" />
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={Workflow} title="Nenhuma regra ainda" description="Crie uma regra para avisar a equipe ou elevar a prioridade automaticamente. Ela nasce desativada." />
      ) : (
        <ul aria-label="Regras de automação" className="divide-y divide-line-soft rounded-lg border border-line bg-white">
          {query.data.items.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              categoryLabel={categoryLabel}
              busy={toggle.isPending && toggle.variables?.id === rule.id}
              onToggle={() => {
                toggle.reset();
                setToggling(rule);
              }}
              onEdit={() => setForm({ open: true, rule })}
              onRuns={() => setRunsFor(rule)}
            />
          ))}
        </ul>
      )}
      {copy && toggling ? (
        <ConfirmDialog
          open
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.confirmLabel}
          tone={toggling.enabled ? 'danger' : 'primary'}
          loading={toggle.isPending}
          error={toggle.error ? messageForError(toggle.error, 'Não foi possível mudar a regra.') : null}
          onClose={() => {
            if (!toggle.isPending) setToggling(null);
          }}
          onConfirm={() => toggle.mutate(toggling)}
        />
      ) : null}
      <AutomationFormDialog
        open={form.open}
        rule={form.rule}
        categories={categories}
        categoriesUnavailable={Boolean(catalog.error)}
        onClose={() => setForm((current) => ({ ...current, open: false }))}
      />
      <AutomationRunsDialog rule={runsFor} onClose={() => setRunsFor(null)} />
    </>
  );
}
