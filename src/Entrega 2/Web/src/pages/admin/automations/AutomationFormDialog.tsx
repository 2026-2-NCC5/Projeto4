import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextArea, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { adminApi, adminKeys } from '@/features/admin/api';
import { formFromRule, isAlwaysSkipped, ruleErrorsFrom, ruleInput, RULE_LIMITS, validateRule, type RuleErrors, type RuleForm } from '@/features/admin/automations';
import { CheckGroup, ChoiceGroup, Notice } from '@/features/admin/components';
import { ACTION_META, ACTIONS, AUDIENCE_META, PRIORITIES, PRIORITY_LABELS, RAISE_PRIORITY_LABELS, TRIGGER_META, TRIGGERS } from '@/features/admin/labels';
import { messageForError } from '@/services/api/client';
import type { AutomationRuleView } from '@/types/api';

export interface CategoryOption {
  value: string;
  label: string;
}

/**
 * Criar ou editar uma regra. Regras novas nascem desativadas: quem ativa é o interruptor da lista, com
 * confirmação. As ações são sempre internas (nunca escrevem para o aluno nem mudam a situação do chamado).
 */
export function AutomationFormDialog({
  open,
  rule,
  categories,
  categoriesUnavailable,
  onClose,
}: {
  open: boolean;
  rule: AutomationRuleView | null;
  categories: CategoryOption[];
  categoriesUnavailable: boolean;
  onClose: () => void;
}) {
  const formId = useId();
  const queryClient = useQueryClient();
  const toast = useToast();
  const editing = rule !== null;
  const [form, setForm] = useState<RuleForm>(() => formFromRule(rule));
  const [errors, setErrors] = useState<RuleErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [shownFor, setShownFor] = useState<{ open: boolean; ruleId: string | null }>({ open, ruleId: rule?.id ?? null });
  // cada abertura começa do zero (ou dos dados da regra em edição)
  if (shownFor.open !== open || shownFor.ruleId !== (rule?.id ?? null)) {
    setShownFor({ open, ruleId: rule?.id ?? null });
    if (open) {
      setForm(formFromRule(rule));
      setErrors({});
      setFormError(null);
    }
  }

  const save = useMutation({
    mutationFn: (state: RuleForm) => (rule ? adminApi.updateAutomation(rule.id, ruleInput(state)) : adminApi.createAutomation({ ...ruleInput(state), enabled: false })),
    onMutate: () => setFormError(null),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.automations });
      toast.show(rule ? `Regra “${saved.name}” atualizada.` : `Regra “${saved.name}” criada desativada. Revise e ative quando estiver pronta.`);
      onClose();
    },
    onError: (error) => {
      const found = ruleErrorsFrom(error);
      setErrors(found);
      const message = Object.keys(found).length > 0 ? 'Confira os campos destacados.' : messageForError(error, 'Não foi possível salvar a regra.');
      setFormError(message);
      toast.show(`Regra não salva: ${message}`, 'error');
    },
  });

  const set = <K extends keyof RuleForm>(field: K, value: RuleForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = () => {
    const found = validateRule(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(form);
  };

  // categorias que a regra já usa continuam visíveis mesmo sem o catálogo (aparecem pelo código)
  const categoryOptions = [...categories, ...form.categoryIds.filter((id) => !categories.some((option) => option.value === id)).map((id) => ({ value: id, label: id }))];

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!save.isPending) onClose();
      }}
      title={editing ? 'Editar regra' : 'Nova regra de automação'}
      description="Automações só fazem ações internas: nunca enviam mensagens a alunos e nunca mudam a situação de um chamado."
      size="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={save.isPending}>
            {editing ? 'Salvar alterações' : 'Criar regra desativada'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-5"
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
        <TextInput label="Nome" required maxLength={RULE_LIMITS.nameMax} value={form.name} onChange={(event) => set('name', event.target.value)} error={errors.name} />
        <TextArea
          label="Descrição"
          rows={2}
          maxLength={RULE_LIMITS.descriptionMax}
          value={form.description}
          onChange={(event) => set('description', event.target.value)}
          hint={`Opcional · ${form.description.length}/${RULE_LIMITS.descriptionMax}. Explique para a equipe por que a regra existe.`}
          error={errors.description}
        />
        <ChoiceGroup
          legend="Quando"
          value={form.trigger}
          onChange={(trigger) => set('trigger', trigger)}
          options={TRIGGERS.map((trigger) => ({ value: trigger, label: TRIGGER_META[trigger].label, description: TRIGGER_META[trigger].description }))}
          error={errors.trigger}
        />
        <div className="flex flex-col gap-4 rounded-md border border-line px-4 py-3">
          <p className="text-small text-slate">Condições (opcionais). Sem marcar nada, a regra vale para qualquer chamado.</p>
          {categoriesUnavailable ? (
            <Notice tone="warning">Não foi possível carregar o catálogo de categorias. As categorias já usadas pela regra aparecem pelo código.</Notice>
          ) : null}
          {categoryOptions.length > 0 ? (
            <CheckGroup legend="Categorias" values={form.categoryIds} onChange={(values) => set('categoryIds', values)} options={categoryOptions} error={errors.categoryIds} />
          ) : null}
          <CheckGroup
            legend="Prioridades"
            values={form.priorities}
            onChange={(values) => set('priorities', values)}
            options={PRIORITIES.map((priority) => ({ value: priority, label: PRIORITY_LABELS[priority] }))}
            error={errors.priorities}
          />
        </div>
        <ChoiceGroup
          legend="Então"
          value={form.action}
          onChange={(action) => set('action', action)}
          options={ACTIONS.map((action) => ({ value: action, label: ACTION_META[action].label, description: ACTION_META[action].description }))}
          error={errors.action}
        />
        {form.action === 'notify_staff' ? (
          <ChoiceGroup
            legend="Quem recebe o aviso"
            value={form.audience}
            onChange={(audience) => set('audience', audience)}
            options={(['team', 'assigned'] as const).map((audience) => ({ value: audience, label: AUDIENCE_META[audience].label, description: AUDIENCE_META[audience].description }))}
            error={errors.audience}
          />
        ) : (
          <ChoiceGroup
            legend="Nova prioridade"
            layout="inline"
            value={form.priority}
            onChange={(priority) => set('priority', priority)}
            options={(['high', 'urgent'] as const).map((priority) => ({ value: priority, label: RAISE_PRIORITY_LABELS[priority] }))}
            hint="O aluno não é avisado; a mudança fica registrada como evento interno do chamado."
            error={errors.priority}
          />
        )}
        {isAlwaysSkipped(form) ? (
          <Notice tone="warning">Chamados recém-abertos ainda não têm atendente responsável: com este gatilho, o aviso ao responsável será sempre ignorado.</Notice>
        ) : null}
        {editing ? null : <Notice tone="info">A regra é criada desativada. Depois de revisar, ative pelo interruptor da lista.</Notice>}
      </form>
    </Dialog>
  );
}
