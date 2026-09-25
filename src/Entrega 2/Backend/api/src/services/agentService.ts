import { randomUUID } from 'node:crypto';
import type { AgentClient } from '../clients/agentClient.js';
import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import { AGENT_CONTRACT_VERSION, type AgentResponse } from '../contracts/agentContract.js';
import type { AgentAnalysis, AgentHistoryItem, AgentRecommendation, AgentRecommendationDetail } from '../contracts/mobileApi.v1.js';
import { ForbiddenError, NotFoundError } from '../errors/AppError.js';
import type { Repositories } from '../repositories/types.js';
import type { AgentRecommendationRecord, AgentRunRecord, AgentRunWithRecommendations, RequestContext } from '../types/domain.js';
import type { StudentService } from './studentService.js';

export function newRequestId(): string {
  return `req-${randomUUID()}`;
}

export function newCorrelationId(): string {
  return `corr-${randomUUID()}`;
}

function toRecommendation(record: AgentRecommendationRecord): AgentRecommendation {
  return {
    id: record.id,
    type: record.type,
    message: record.message,
    evidence: record.evidence.map((item) => item.description),
    nextAction: record.nextAction,
    confidence: record.confidence,
    requiresHumanValidation: record.requiresHumanValidation,
    priority: record.priority,
    subjectId: record.subjectId,
  };
}

/** Transformação explícita snake_case (contrato interno) → camelCase (contrato mobile). */
export function toAnalysis(run: AgentRunWithRecommendations): AgentAnalysis {
  return {
    runId: run.runId,
    agent: 'student_agent',
    version: run.agentVersion,
    configVersion: run.configVersion,
    status: run.status,
    summary: run.summary,
    recommendations: run.recommendations.map(toRecommendation),
    confidence: run.confidence,
    requiresHumanValidation: run.requiresHumanValidation,
    abstained: run.abstained,
    abstentionReason: run.abstentionReason,
    correlationId: run.correlationId,
    createdAt: run.createdAt.toISOString(),
  };
}

function toHistoryItem(run: AgentRunRecord & { recommendationsCount: number }): AgentHistoryItem {
  return {
    runId: run.runId,
    status: run.status,
    summary: run.summary,
    recommendationsCount: run.recommendationsCount,
    requiresHumanValidation: run.requiresHumanValidation,
    abstained: run.abstained,
    confidence: run.confidence,
    correlationId: run.correlationId,
    createdAt: run.createdAt.toISOString(),
  };
}

export function toRunRecord(response: AgentResponse, studentId: string, durationMs: number, now: Date = new Date()): AgentRunWithRecommendations {
  return {
    runId: response.run_id,
    studentId,
    agentName: response.agent,
    agentVersion: response.agent_version,
    configVersion: response.config_version,
    contractVersion: response.contract_version,
    requestId: response.request_id,
    correlationId: response.correlation_id,
    status: response.status,
    summary: response.summary,
    confidence: response.confidence,
    abstained: response.abstained,
    abstentionReason: response.abstention_reason,
    requiresHumanValidation: response.requires_human_validation,
    durationMs,
    evaluatedAt: new Date(response.evaluated_at),
    createdAt: now,
    recommendations: response.recommendations.map((rec) => ({
      id: rec.id,
      runId: response.run_id,
      type: rec.type,
      message: rec.message,
      nextAction: rec.next_action,
      confidence: rec.confidence,
      requiresHumanValidation: rec.requires_human_validation,
      priority: rec.priority,
      subjectId: rec.subject_id,
      evidence: rec.evidence.map((item, index) => ({
        position: index + 1,
        evidenceType: item.type,
        description: item.description,
        sourceReference: item.source_reference,
      })),
    })),
  };
}

export class AgentService {
  constructor(
    private readonly repos: Repositories,
    private readonly students: StudentService,
    private readonly client: AgentClient,
    private readonly config: AppConfig,
  ) {}

  /**
   * Fluxo oficial (TASK-004 §40, §65): monta contexto → chama o Agent Service com
   * o mesmo correlation_id → valida contrato → persiste run/recomendações/evidências.
   */
  async analyze(studentId: string, ctx: RequestContext, logger: Logger): Promise<AgentAnalysis> {
    const academicContext = await this.students.buildAcademicContext(studentId);
    const agentRequestId = newRequestId();
    const startedAt = Date.now();
    const response = await this.client.evaluate(
      {
        contract_version: AGENT_CONTRACT_VERSION,
        request_id: agentRequestId,
        correlation_id: ctx.correlationId,
        student_id: studentId,
        reference_date: new Date().toISOString().slice(0, 10),
        academic_context: academicContext,
      },
      logger,
    );
    const durationMs = Date.now() - startedAt;
    const run = toRunRecord(response, studentId, durationMs);
    await this.repos.agentRuns.save(run);
    logger.info(
      { correlation_id: ctx.correlationId, request_id: ctx.requestId, agent_request_id: agentRequestId, run_id: run.runId, status: run.status, duration_ms: durationMs, recommendations: run.recommendations.length },
      'agent run persisted',
    );
    return toAnalysis(run);
  }

  async getLatest(studentId: string): Promise<AgentAnalysis | null> {
    const run = await this.repos.agentRuns.findLatestByStudent(studentId);
    return run ? toAnalysis(run) : null;
  }

  async getRecommendation(studentId: string, recommendationId: string): Promise<AgentRecommendationDetail> {
    const found = await this.repos.agentRuns.findRecommendation(recommendationId);
    if (!found) throw new NotFoundError('Recomendação não encontrada.');
    if (found.run.studentId !== studentId) throw new ForbiddenError('Esta recomendação pertence a outro estudante.');
    return {
      ...toRecommendation(found.recommendation),
      runId: found.run.runId,
      runStatus: found.run.status,
      createdAt: found.run.createdAt.toISOString(),
    };
  }

  async listHistory(studentId: string, limit = 20): Promise<AgentHistoryItem[]> {
    const runs = await this.repos.agentRuns.listByStudent(studentId, Math.min(Math.max(limit, 1), 100));
    return runs.map(toHistoryItem);
  }

  async getRun(studentId: string, runId: string): Promise<AgentAnalysis> {
    const run = await this.repos.agentRuns.findByRunId(runId);
    if (!run) throw new NotFoundError('Análise não encontrada.');
    if (run.studentId !== studentId) throw new ForbiddenError('Esta análise pertence a outro estudante.');
    return toAnalysis(run);
  }

  get contractVersion(): string {
    return this.config.agentService.contractVersion;
  }
}
