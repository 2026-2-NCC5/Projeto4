import { randomUUID } from 'node:crypto';
import type { AdminRepository, AutomationRuleRecord, AutomationRunRecord, SlaPolicyRecord } from '../../src/admin/repository.js';
import type { Repositories } from '../../src/repositories/types.js';

/**
 * Administração em memória para testes unitários: metas de SLA e automações com a mesma idempotência do
 * banco (uma execução por regra × chamado × gatilho). Contagens agregadas ficam nos testes de integração.
 */
export class MemoryAdminRepository implements AdminRepository {
  readonly policies = new Map<string, SlaPolicyRecord>();
  readonly rules: AutomationRuleRecord[] = [];
  readonly runs: Array<AutomationRunRecord & { claimed: boolean }> = [];
  failListPolicies = false;

  constructor(private readonly repos: Pick<Repositories, 'support'>) {}

  async appliedMigrations(): Promise<string[]> {
    return [];
  }

  async userCounts(): Promise<Array<{ role: 'student' | 'institutional_staff' | 'technical_admin'; active: boolean; total: number }>> {
    return [];
  }

  async activeSessionFamilies(): Promise<number> {
    return 0;
  }

  async auditOutcomeCounts(): Promise<{ failedLogins: number; denied: number }> {
    return { failedLogins: 0, denied: 0 };
  }

  async ticketMetadata(): Promise<{ items: never[]; total: number }> {
    return { items: [], total: 0 };
  }

  async listSlaPolicies(): Promise<SlaPolicyRecord[]> {
    if (this.failListPolicies) throw new Error('banco indisponível');
    return [...this.policies.values()];
  }

  async upsertSlaPolicy(input: { categoryId: string; firstResponseHours: number; resolutionBusinessDays: number; updatedBy: string; now: Date }): Promise<void> {
    this.policies.set(input.categoryId, { categoryId: input.categoryId, firstResponseHours: input.firstResponseHours, resolutionBusinessDays: input.resolutionBusinessDays, updatedBy: input.updatedBy, updatedByName: null, updatedAt: input.now });
  }

  async listRules(): Promise<AutomationRuleRecord[]> {
    return this.rules.map((rule) => ({ ...rule }));
  }

  async findRule(id: string): Promise<AutomationRuleRecord | null> {
    const rule = this.rules.find((item) => item.id === id);
    return rule ? { ...rule } : null;
  }

  async createRule(input: Omit<AutomationRuleRecord, 'id' | 'updatedAt'> & { createdBy: string }): Promise<AutomationRuleRecord> {
    const { createdBy: _createdBy, ...rest } = input;
    const rule: AutomationRuleRecord = { ...rest, id: randomUUID(), updatedAt: new Date() };
    this.rules.push(rule);
    return { ...rule };
  }

  async updateRule(id: string, patch: Partial<Omit<AutomationRuleRecord, 'id' | 'updatedAt'>> & { updatedBy: string }): Promise<AutomationRuleRecord | null> {
    const rule = this.rules.find((item) => item.id === id);
    if (!rule) return null;
    const { updatedBy: _updatedBy, ...rest } = patch;
    Object.assign(rule, rest, { updatedAt: new Date() });
    return { ...rule };
  }

  async claimRun(input: { ruleId: string; ticketId: string; trigger: AutomationRuleRecord['trigger'] }): Promise<string | null> {
    if (this.runs.some((run) => run.ruleId === input.ruleId && run.ticketId === input.ticketId && run.trigger === input.trigger)) return null;
    const ticket = await this.repos.support.findTicket(input.ticketId);
    const run = { id: randomUUID(), ruleId: input.ruleId, ticketId: input.ticketId, ticketProtocol: ticket?.protocol ?? '—', trigger: input.trigger, status: 'skipped' as const, detail: null, createdAt: new Date(), claimed: true };
    this.runs.push(run);
    return run.id;
  }

  async finishRun(id: string, status: 'applied' | 'skipped' | 'failed', detail: string | null): Promise<void> {
    const run = this.runs.find((item) => item.id === id);
    if (run) Object.assign(run, { status, detail, claimed: false });
  }

  async listRuns(ruleId: string, limit: number): Promise<AutomationRunRecord[]> {
    return this.runs.filter((run) => run.ruleId === ruleId).slice(-limit).reverse();
  }

  async runStats(): Promise<Map<string, { applied: number; skipped: number; failed: number; lastRunAt: Date | null }>> {
    const stats = new Map<string, { applied: number; skipped: number; failed: number; lastRunAt: Date | null }>();
    for (const run of this.runs) {
      const current = stats.get(run.ruleId) ?? { applied: 0, skipped: 0, failed: 0, lastRunAt: null };
      current[run.status] += 1;
      if (!current.lastRunAt || run.createdAt > current.lastRunAt) current.lastRunAt = run.createdAt;
      stats.set(run.ruleId, current);
    }
    return stats;
  }
}
