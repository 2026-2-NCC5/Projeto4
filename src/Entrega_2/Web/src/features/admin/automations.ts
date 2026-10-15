import type { AutomationAction, AutomationRuleInput, AutomationRuleView, AutomationTrigger, SupportTicketPriority } from '@/types/api';
import { capitalize, fieldErrors } from './api';
import { PRIORITY_LABELS, RAISE_PRIORITY_LABELS } from './labels';

export interface RuleForm {
  name: string;
  description: string;
  trigger: AutomationTrigger;
  categoryIds: string[];
  priorities: SupportTicketPriority[];
  action: AutomationAction;
  audience: 'team' | 'assigned';
  priority: 'high' | 'urgent';
}

export type RuleField = 'name' | 'description' | 'trigger' | 'categoryIds' | 'priorities' | 'action' | 'audience' | 'priority';
export type RuleErrors = Partial<Record<RuleField, string>>;

export const RULE_LIMITS = { nameMin: 3, nameMax: 120, descriptionMax: 300, categoriesMax: 20 } as const;

export function formFromRule(rule: AutomationRuleView | null): RuleForm {
  if (!rule) {
    return { name: '', description: '', trigger: 'ticket_created', categoryIds: [], priorities: [], action: 'notify_staff', audience: 'team', priority: 'high' };
  }
  return {
    name: rule.name,
    description: rule.description ?? '',
    trigger: rule.trigger,
    categoryIds: [...(rule.conditions.categoryIds ?? [])],
    priorities: [...(rule.conditions.priorities ?? [])],
    action: rule.action,
    audience: rule.actionParams.audience ?? 'team',
    priority: rule.actionParams.priority ?? 'high',
  };
}

/** Mesmas regras do servidor (automationCreateSchema). */
export function validateRule(form: RuleForm): RuleErrors {
  const errors: RuleErrors = {};
  const name = form.name.trim();
  if (name.length < RULE_LIMITS.nameMin) errors.name = `Dê um nome com pelo menos ${RULE_LIMITS.nameMin} caracteres.`;
  else if (name.length > RULE_LIMITS.nameMax) errors.name = `Use até ${RULE_LIMITS.nameMax} caracteres.`;
  if (form.description.trim().length > RULE_LIMITS.descriptionMax) errors.description = `Use até ${RULE_LIMITS.descriptionMax} caracteres.`;
  if (form.categoryIds.length > RULE_LIMITS.categoriesMax) errors.categoryIds = `Escolha até ${RULE_LIMITS.categoriesMax} categorias.`;
  return errors;
}

/** Corpo da API. Os parâmetros da ação sempre combinam com a ação (o servidor grava o que receber na edição). */
export function ruleInput(form: RuleForm): Omit<AutomationRuleInput, 'enabled'> {
  const conditions: NonNullable<AutomationRuleInput['conditions']> = {};
  if (form.categoryIds.length > 0) conditions.categoryIds = form.categoryIds;
  if (form.priorities.length > 0) conditions.priorities = form.priorities;
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    trigger: form.trigger,
    conditions,
    action: form.action,
    actionParams: form.action === 'raise_priority' ? { priority: form.priority } : { audience: form.audience },
  };
}

/** Erros de campo da API ("conditions.categoryIds", "actionParams.priority"…) mapeados para o formulário. */
export function ruleErrorsFrom(error: unknown): RuleErrors {
  const details = fieldErrors(error);
  const map: Record<string, RuleField> = {
    name: 'name',
    description: 'description',
    trigger: 'trigger',
    action: 'action',
    'conditions.categoryIds': 'categoryIds',
    'conditions.priorities': 'priorities',
    'actionParams.audience': 'audience',
    'actionParams.priority': 'priority',
  };
  const errors: RuleErrors = {};
  for (const [path, message] of Object.entries(details)) {
    const key = Object.keys(map).find((prefix) => path === prefix || path.startsWith(`${prefix}.`));
    const field = key ? map[key] : undefined;
    if (field && !errors[field]) errors[field] = capitalize(message);
  }
  return errors;
}

/** "A", "A ou B", "A, B ou C". */
export function joinOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ou ${items[items.length - 1]}`;
}

export function describeConditions(conditions: AutomationRuleView['conditions'], categoryLabel: (id: string) => string): string {
  const parts: string[] = [];
  if (conditions.categoryIds && conditions.categoryIds.length > 0) parts.push(`categoria ${joinOr(conditions.categoryIds.map(categoryLabel))}`);
  if (conditions.priorities && conditions.priorities.length > 0) parts.push(`prioridade ${joinOr(conditions.priorities.map((item) => PRIORITY_LABELS[item].toLowerCase()))}`);
  return parts.length > 0 ? capitalize(parts.join(' e ')) : 'Qualquer chamado';
}

export function describeAction(rule: Pick<AutomationRuleView, 'action' | 'actionParams'>): string {
  if (rule.action === 'raise_priority') return `Elevar a prioridade para ${RAISE_PRIORITY_LABELS[rule.actionParams.priority ?? 'high']}`;
  return rule.actionParams.audience === 'assigned' ? 'Avisar o atendente responsável' : 'Avisar toda a equipe ASA';
}

/** Combinação que nunca faz nada: chamado recém-aberto ainda não tem atendente responsável. */
export const isAlwaysSkipped = (form: Pick<RuleForm, 'trigger' | 'action' | 'audience'>): boolean =>
  form.trigger === 'ticket_created' && form.action === 'notify_staff' && form.audience === 'assigned';
