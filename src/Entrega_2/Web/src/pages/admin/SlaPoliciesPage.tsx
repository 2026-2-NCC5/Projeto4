import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Badge, PageHeader } from '@/components/ui/Display';
import { TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { DataTable, type Column } from '@/components/data/DataTable';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { adminApi, adminKeys, capitalize, fieldErrors, isNotFound } from '@/features/admin/api';
import { AdminFailure, LastChange, Notice } from '@/features/admin/components';
import { plural } from '@/features/appointments/dates';
import { useSession } from '@/features/auth/session';
import { messageForError } from '@/services/api/client';
import type { SlaPolicyView } from '@/types/api';

export const SLA_LIMITS = {
  firstResponseHours: { min: 1, max: 240 },
  resolutionBusinessDays: { min: 1, max: 30 },
} as const;

type SlaField = keyof typeof SLA_LIMITS;
type SlaForm = Record<SlaField, string>;
type SlaErrors = Partial<Record<SlaField, string>>;

/** Mesmas regras do servidor (slaPolicyUpdateSchema): inteiros dentro dos limites. */
export function validateSla(form: SlaForm): SlaErrors {
  const errors: SlaErrors = {};
  for (const field of Object.keys(SLA_LIMITS) as SlaField[]) {
    const { min, max } = SLA_LIMITS[field];
    const text = form[field].trim();
    const value = Number(text);
    if (!text || !Number.isInteger(value) || value < min || value > max) {
      errors[field] = `Use um número inteiro de ${min} a ${max}.`;
    }
  }
  return errors;
}

function SlaDialog({ policy, onClose }: { policy: SlaPolicyView | null; onClose: () => void }) {
  const formId = useId();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<SlaForm>({ firstResponseHours: '', resolutionBusinessDays: '' });
  const [errors, setErrors] = useState<SlaErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [shownFor, setShownFor] = useState<string | null>(null);
  // cada abertura começa dos valores atuais da categoria
  if ((policy?.categoryId ?? null) !== shownFor) {
    setShownFor(policy?.categoryId ?? null);
    if (policy) {
      setForm({ firstResponseHours: String(policy.firstResponseHours), resolutionBusinessDays: String(policy.resolutionBusinessDays) });
      setErrors({});
      setFormError(null);
    }
  }

  const save = useMutation({
    mutationFn: (state: SlaForm) =>
      adminApi.updateSlaPolicy(policy?.categoryId ?? '', { firstResponseHours: Number(state.firstResponseHours), resolutionBusinessDays: Number(state.resolutionBusinessDays) }),
    onMutate: () => setFormError(null),
    onSuccess: (policies) => {
      queryClient.setQueryData(adminKeys.sla, policies);
      toast.show(`Meta de ${policy?.categoryLabel ?? 'categoria'} salva. Vale para os chamados abertos a partir de agora.`);
      onClose();
    },
    onError: (error) => {
      const details = fieldErrors(error);
      const found: SlaErrors = {};
      for (const field of Object.keys(SLA_LIMITS) as SlaField[]) if (details[field]) found[field] = capitalize(details[field]);
      setErrors(found);
      const message = isNotFound(error) ? 'Categoria não encontrada no catálogo do servidor.' : messageForError(error, 'Não foi possível salvar a meta.');
      setFormError(message);
      toast.show(`Meta não salva: ${message}`, 'error');
    },
  });

  const set = (field: SlaField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = () => {
    const found = validateSla(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(form);
  };

  return (
    <Dialog
      open={policy !== null}
      onClose={() => {
        if (!save.isPending) onClose();
      }}
      title={policy ? `Meta de ${policy.categoryLabel}` : 'Meta de SLA'}
      description="Vale só para chamados abertos depois de salvar. Os prazos dos chamados já abertos não mudam."
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={save.isPending}>
            Salvar meta
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {formError ? (
          <Notice tone="danger" alert>
            {formError}
          </Notice>
        ) : null}
        <TextInput
          label="Primeira resposta (horas)"
          type="number"
          inputMode="numeric"
          min={SLA_LIMITS.firstResponseHours.min}
          max={SLA_LIMITS.firstResponseHours.max}
          step={1}
          required
          value={form.firstResponseHours}
          onChange={(event) => set('firstResponseHours', event.target.value)}
          hint="De 1 a 240 horas. Fica registrada como referência: hoje o prazo dos chamados usa só os dias úteis para solução."
          error={errors.firstResponseHours}
        />
        <TextInput
          label="Solução (dias úteis)"
          type="number"
          inputMode="numeric"
          min={SLA_LIMITS.resolutionBusinessDays.min}
          max={SLA_LIMITS.resolutionBusinessDays.max}
          step={1}
          required
          value={form.resolutionBusinessDays}
          onChange={(event) => set('resolutionBusinessDays', event.target.value)}
          hint={policy ? `De 1 a 30 dias úteis. Padrão do catálogo: ${plural(policy.defaultResolutionBusinessDays, 'dia útil', 'dias úteis')}.` : 'De 1 a 30 dias úteis.'}
          error={errors.resolutionBusinessDays}
        />
      </form>
    </Dialog>
  );
}

/** Metas de SLA por categoria: padrão do catálogo × meta personalizada, com quem e quando alterou. */
export default function SlaPoliciesPage() {
  const { can } = useSession();
  const allowed = can('sla:manage');
  const query = useQuery({ queryKey: adminKeys.sla, queryFn: adminApi.slaPolicies, enabled: allowed });
  const [editing, setEditing] = useState<SlaPolicyView | null>(null);

  if (!allowed) return <AccessDenied />;

  const columns: Column<SlaPolicyView>[] = [
    {
      key: 'category',
      header: 'Categoria',
      // o nome abre a edição (fica visível mesmo quando a tabela rola no celular)
      render: (row) => (
        <button
          type="button"
          onClick={() => setEditing(row)}
          aria-label={`Editar meta de ${row.categoryLabel}`}
          className="inline-flex items-center gap-1.5 rounded-sm text-left font-medium text-ink hover:text-action hover:underline"
        >
          {row.categoryLabel}
          <Pencil size={20} aria-hidden className="shrink-0 text-slate" />
        </button>
      ),
    },
    { key: 'first', header: 'Primeira resposta', render: (row) => <span className="whitespace-nowrap tabular-nums text-small text-ink">{row.firstResponseHours} h</span> },
    {
      key: 'resolution',
      header: 'Solução',
      render: (row) => (
        <div className="min-w-0">
          <p className="whitespace-nowrap tabular-nums text-small text-ink">{plural(row.resolutionBusinessDays, 'dia útil', 'dias úteis')}</p>
          {!row.isDefault && row.resolutionBusinessDays !== row.defaultResolutionBusinessDays ? (
            <p className="whitespace-nowrap text-caption text-mist">padrão: {plural(row.defaultResolutionBusinessDays, 'dia útil', 'dias úteis')}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'origin',
      header: 'Origem',
      render: (row) => (row.isDefault ? <Badge tone="neutral">Padrão do catálogo</Badge> : <Badge tone="info">Personalizada</Badge>),
    },
    {
      key: 'changed',
      header: 'Última alteração',
      className: 'min-w-[12rem]',
      render: (row) => <LastChange updatedAt={row.updatedAt} updatedBy={row.updatedBy} defaultText="Nunca alterada" />,
    },
  ];

  return (
    <>
      <PageHeader title="SLA e categorias" description="Metas de atendimento por categoria de chamado: primeira resposta e prazo de solução em dias úteis." />
      <div className="mb-4 flex flex-col gap-3">
        <Notice tone="info" title="Mudanças valem só para chamados abertos depois de salvar">
          Os prazos dos chamados que já estão abertos não mudam. Não há como excluir uma meta personalizada: para voltar ao padrão, grave de novo os valores padrão.
        </Notice>
        <Notice tone="neutral">
          A primeira resposta conta em horas corridas desde a abertura e termina na primeira ação pública da equipe (mensagem, assumir, encaminhar ou resolver). A equipe vê a situação em cada chamado e o índice de respostas no prazo em SLA e Métricas.
        </Notice>
      </div>
      {query.isPending ? (
        <LoadingRows rows={6} />
      ) : query.data === undefined ? (
        <AdminFailure error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar as metas" />
      ) : query.data.length === 0 ? (
        <EmptyState title="Nenhuma categoria" description="O catálogo de atendimento não tem categorias." />
      ) : (
        <DataTable caption="Metas de SLA por categoria" columns={columns} rows={query.data} rowKey={(row) => row.categoryId} />
      )}
      <SlaDialog policy={editing} onClose={() => setEditing(null)} />
    </>
  );
}
