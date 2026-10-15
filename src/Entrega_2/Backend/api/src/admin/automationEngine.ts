import type { AutomationTrigger, SupportTicketPriority } from '../contracts/mobileApi.v1.js';
import type { Logger } from '../config/logger.js';
import type { InboxService } from '../platform/inboxService.js';
import type { PlatformService } from '../platform/platformService.js';
import type { Repositories } from '../repositories/types.js';
import { findCategory } from '../support/catalog.js';
import { ALL_STATUSES, isActiveStatus, STATUS_LABELS } from '../support/statuses.js';
import { event, type SupportCore } from '../support/supportService.js';
import type { SupportTicketRecord } from '../support/types.js';
import type { AdminRepository, AutomationRuleRecord } from './repository.js';

const PRIORITY_RANK: Record<SupportTicketPriority, number> = { normal: 0, high: 1, urgent: 2 };
const PRIORITY_LABELS: Record<SupportTicketPriority, string> = { normal: 'Normal', high: 'Alta', urgent: 'Urgente' };
const ACTIVE = ALL_STATUSES.filter(isActiveStatus);
const SCAN_PAGE_SIZE = 200;
const SCAN_MAX_PAGES = 25;

const TRIGGER_TITLES: Record<AutomationTrigger, string> = {
  ticket_created: 'Novo chamado',
  sla_near_deadline: 'Prazo próximo',
  sla_overdue: 'Prazo excedido',
};

export interface AutomationEngineOptions {
  repo: AdminRepository;
  repos: Repositories;
  core: SupportCore;
  inbox: InboxService;
  platform: PlatformService;
  logger: Logger;
  excludeDemo: boolean;
  now: () => Date;
}

/**
 * Motor de automações seguro: só gatilhos aprovados (abertura, prazo próximo, prazo excedido), só ações
 * internas (avisar a equipe; elevar prioridade como evento interno do sistema). Nunca escreve para o
 * aluno nem muda a situação do chamado. Idempotente: cada regra roda uma vez por chamado e gatilho.
 */
export class AutomationEngine {
  private scanning = false;

  constructor(private readonly options: AutomationEngineOptions) {}

  private async enabledRules(trigger: AutomationTrigger): Promise<AutomationRuleRecord[]> {
    if (!(await this.options.platform.isEnabled('automations'))) return [];
    return (await this.options.repo.listRules()).filter((rule) => rule.enabled && rule.trigger === trigger);
  }

  private matches(rule: AutomationRuleRecord, ticket: SupportTicketRecord): boolean {
    const { categoryIds, priorities } = rule.conditions;
    if (categoryIds && categoryIds.length > 0 && !categoryIds.includes(ticket.categoryId)) return false;
    if (priorities && priorities.length > 0 && !priorities.includes(ticket.priority)) return false;
    return true;
  }

  /** Chamado aberto (chamado após a transação de abertura). Falhas nunca afetam o aluno. */
  async onTicketCreated(ticket: SupportTicketRecord): Promise<void> {
    try {
      for (const rule of await this.enabledRules('ticket_created')) await this.execute(rule, ticket, 'ticket_created');
    } catch (error) {
      this.options.logger.error({ ticket_id: ticket.id, error_type: error instanceof Error ? error.name : typeof error }, 'automation on ticket_created failed');
    }
  }

  /** Varredura periódica dos prazos (prazo próximo e excedido). Devolve quantas execuções foram feitas. */
  async scanSla(): Promise<number> {
    if (this.scanning) return 0;
    this.scanning = true;
    let executed = 0;
    try {
      for (const trigger of ['sla_overdue', 'sla_near_deadline'] as const) {
        const rules = await this.enabledRules(trigger);
        if (rules.length === 0) continue;
        const now = this.options.now();
        let cursor: { updatedAt: Date; id: string } | null = null;
        // páginas pelo prazo (cursor = prazo + id) até esgotar os chamados em risco ou o teto da varredura
        for (let page = 0; page < SCAN_MAX_PAGES; page += 1) {
          const rows = await this.options.repos.support.listTickets({
            statuses: [...ACTIVE],
            slaRisk: trigger === 'sla_overdue' ? 'overdue' : 'near_deadline',
            limit: SCAN_PAGE_SIZE,
            cursor,
            perspective: 'staff',
            excludeDemo: this.options.excludeDemo,
            now,
            orderBy: 'due',
          });
          // "prazo próximo" não inclui chamado que já passou do prazo (esse é o outro gatilho)
          for (const ticket of rows) {
            for (const rule of rules) if (await this.execute(rule, ticket, trigger)) executed += 1;
          }
          const last = rows[rows.length - 1];
          if (rows.length < SCAN_PAGE_SIZE || !last) break;
          cursor = { updatedAt: last.sla.dueAt, id: last.id };
        }
      }
    } catch (error) {
      this.options.logger.error({ error_type: error instanceof Error ? error.name : typeof error }, 'automation sla scan failed');
    } finally {
      this.scanning = false;
    }
    return executed;
  }

  /** Reserva a execução (idempotência) e aplica a ação; registra o resultado no histórico. */
  private async execute(rule: AutomationRuleRecord, ticket: SupportTicketRecord, trigger: AutomationTrigger): Promise<boolean> {
    if (!this.matches(rule, ticket)) return false;
    const runId = await this.options.repo.claimRun({ ruleId: rule.id, ticketId: ticket.id, trigger });
    if (!runId) return false;
    try {
      const result = rule.action === 'notify_staff' ? await this.notifyStaff(rule, ticket, trigger) : await this.raisePriority(rule, ticket);
      await this.options.repo.finishRun(runId, result.status, result.detail);
      return result.status === 'applied';
    } catch (error) {
      await this.options.repo.finishRun(runId, 'failed', error instanceof Error ? error.message : 'falha').catch(() => undefined);
      this.options.logger.warn({ rule_id: rule.id, ticket_id: ticket.id, error_type: error instanceof Error ? error.name : typeof error }, 'automation action failed');
      return false;
    }
  }

  private async notifyStaff(rule: AutomationRuleRecord, ticket: SupportTicketRecord, trigger: AutomationTrigger): Promise<{ status: 'applied' | 'skipped'; detail: string }> {
    const audience = rule.actionParams.audience ?? 'team';
    const recipients =
      audience === 'assigned'
        ? ticket.assignedAgentId
          ? [ticket.assignedAgentId]
          : []
        : await this.options.repos.users.listActiveIdsByRole('institutional_staff', !this.options.excludeDemo);
    if (recipients.length === 0) return { status: 'skipped', detail: audience === 'assigned' ? 'Chamado sem atendente responsável.' : 'Nenhuma pessoa ativa na equipe.' };
    const category = findCategory(ticket.categoryId)?.label ?? ticket.categoryId;
    await this.options.inbox.notify(
      recipients.map((userId) => ({
        userId,
        category: 'support' as const,
        kind: `automation_${trigger}`,
        title: `${TRIGGER_TITLES[trigger]} · ${category}`,
        body: `${ticket.protocol} · ${STATUS_LABELS[ticket.status]} · regra "${rule.name}"`,
        resourceType: 'ticket' as const,
        resourceId: ticket.id,
        dedupeKey: `automation:${rule.id}:${ticket.id}:${trigger}`,
      })),
    );
    return { status: 'applied', detail: `Aviso para ${recipients.length} pessoa(s) da equipe.` };
  }

  private async raisePriority(rule: AutomationRuleRecord, ticket: SupportTicketRecord): Promise<{ status: 'applied' | 'skipped'; detail: string }> {
    const target = rule.actionParams.priority ?? 'high';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = attempt === 0 ? ticket : await this.options.core.findTicketOrThrow(ticket.id);
      if (!isActiveStatus(current.status)) return { status: 'skipped', detail: 'Chamado já finalizado.' };
      if (PRIORITY_RANK[current.priority] >= PRIORITY_RANK[target]) return { status: 'skipped', detail: `Prioridade já era ${PRIORITY_LABELS[current.priority]}.` };
      try {
        await this.options.core.apply({
          ticketId: current.id,
          expectedVersion: current.version,
          patch: { priority: target },
          events: [
            event({
              type: 'priority_changed',
              visibility: 'internal',
              title: 'Prioridade elevada pela automação',
              actorType: 'system',
              actorName: 'Automação',
              details: [
                { label: 'Regra', value: rule.name },
                { label: 'Antes', value: PRIORITY_LABELS[current.priority] },
                { label: 'Agora', value: PRIORITY_LABELS[target] },
              ],
            }),
          ],
          messages: [],
          attachments: [],
          notifications: [],
        });
        return { status: 'applied', detail: `Prioridade ${PRIORITY_LABELS[current.priority]} → ${PRIORITY_LABELS[target]}.` };
      } catch (error) {
        if ((error as { reason?: string }).reason !== 'ticket_changed' || attempt === 1) throw error;
      }
    }
    return { status: 'skipped', detail: 'Chamado alterado durante a execução.' };
  }
}
