import { randomUUID } from 'node:crypto';
import type { AssistantKnowledgeGap, AssistantKnowledgeGapStatus } from '../contracts/mobileApi.v1.js';
import type { DbPool } from '../db/pool.js';
import { brainTokens } from './index.js';

/**
 * Lacunas do cérebro: perguntas que o assistente não conseguiu responder com base oficial. É a "memória de
 * aprendizado": a equipe do ASA lê, escreve a resposta (artigo ou nota do cérebro) e marca como resolvida.
 * Nunca guarda quem perguntou.
 */
export interface GapStore {
  record(question: string, channel: 'text' | 'voice', at: Date): Promise<void>;
  list(filter: { status?: AssistantKnowledgeGapStatus; limit: number }): Promise<{ items: AssistantKnowledgeGap[]; counts: Record<AssistantKnowledgeGapStatus, number> }>;
  setStatus(id: string, input: { status: AssistantKnowledgeGapStatus; resolutionNote: string | null; actorId: string | null; at: Date }): Promise<AssistantKnowledgeGap | null>;
}

/** Mascara o que pode identificar alguém (e-mail, telefone, RA, CPF) e limita o tamanho. */
export function redactQuestion(question: string): string {
  return question
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[e-mail]')
    .replace(/\d[\d.\-/ ]{4,}\d/g, '[número]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

/** Chave que agrupa variações da mesma dúvida ("como tranco a matrícula?" ≈ "trancar matricula"). */
export function gapKey(question: string): string {
  return [...new Set(brainTokens(redactQuestion(question)))].sort().join(' ').slice(0, 300);
}

const emptyCounts = (): Record<AssistantKnowledgeGapStatus, number> => ({ open: 0, resolved: 0, ignored: 0 });

interface GapRow {
  id: string;
  sample_question: string;
  times_asked: number;
  last_channel: 'text' | 'voice';
  status: AssistantKnowledgeGapStatus;
  resolution_note: string | null;
  resolved_at: Date | null;
  first_asked_at: Date;
  last_asked_at: Date;
}

const mapRow = (row: GapRow): AssistantKnowledgeGap => ({
  id: row.id,
  question: row.sample_question,
  timesAsked: row.times_asked,
  lastChannel: row.last_channel,
  status: row.status,
  resolutionNote: row.resolution_note,
  resolvedAt: row.resolved_at?.toISOString() ?? null,
  firstAskedAt: row.first_asked_at.toISOString(),
  lastAskedAt: row.last_asked_at.toISOString(),
});

const COLUMNS = 'id, sample_question, times_asked, last_channel, status, resolution_note, resolved_at, first_asked_at, last_asked_at';

export class PgGapStore implements GapStore {
  constructor(private readonly pool: DbPool) {}

  async record(question: string, channel: 'text' | 'voice', at: Date): Promise<void> {
    const key = gapKey(question);
    if (!key) return;
    // pergunta que volta depois de "resolvida" reabre: a resposta escrita não cobriu essa forma de perguntar
    await this.pool.query(
      `insert into assistant_knowledge_gaps (question_key, sample_question, last_channel, first_asked_at, last_asked_at)
       values ($1, $2, $3, $4, $4)
       on conflict (question_key) do update set
         times_asked = assistant_knowledge_gaps.times_asked + 1,
         sample_question = excluded.sample_question,
         last_channel = excluded.last_channel,
         last_asked_at = excluded.last_asked_at,
         status = case when assistant_knowledge_gaps.status = 'resolved' then 'open' else assistant_knowledge_gaps.status end`,
      [key, redactQuestion(question), channel, at],
    );
  }

  async list(filter: { status?: AssistantKnowledgeGapStatus; limit: number }): Promise<{ items: AssistantKnowledgeGap[]; counts: Record<AssistantKnowledgeGapStatus, number> }> {
    const [rows, counts] = await Promise.all([
      this.pool.query<GapRow>(
        `select ${COLUMNS} from assistant_knowledge_gaps where ($1::text is null or status = $1)
         order by times_asked desc, last_asked_at desc limit $2`,
        [filter.status ?? null, filter.limit],
      ),
      this.pool.query<{ status: AssistantKnowledgeGapStatus; total: string }>('select status, count(*)::text as total from assistant_knowledge_gaps group by status'),
    ]);
    const tally = emptyCounts();
    for (const row of counts.rows) tally[row.status] = Number(row.total);
    return { items: rows.rows.map(mapRow), counts: tally };
  }

  async setStatus(id: string, input: { status: AssistantKnowledgeGapStatus; resolutionNote: string | null; actorId: string | null; at: Date }): Promise<AssistantKnowledgeGap | null> {
    const closed = input.status !== 'open';
    const { rows } = await this.pool.query<GapRow>(
      `update assistant_knowledge_gaps set status = $2, resolution_note = $3, resolved_by = $4, resolved_at = $5
       where id = $1 returning ${COLUMNS}`,
      [id, input.status, input.resolutionNote, closed ? input.actorId : null, closed ? input.at : null],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }
}

/** Sem banco (dev/testes): lacunas só na memória do processo. */
export class MemoryGapStore implements GapStore {
  private readonly gaps = new Map<string, AssistantKnowledgeGap & { key: string }>();

  async record(question: string, channel: 'text' | 'voice', at: Date): Promise<void> {
    const key = gapKey(question);
    if (!key) return;
    const current = [...this.gaps.values()].find((gap) => gap.key === key);
    if (current) {
      Object.assign(current, { timesAsked: current.timesAsked + 1, question: redactQuestion(question), lastChannel: channel, lastAskedAt: at.toISOString(), status: current.status === 'resolved' ? 'open' : current.status });
      return;
    }
    const id = randomUUID();
    this.gaps.set(id, { id, key, question: redactQuestion(question), timesAsked: 1, lastChannel: channel, status: 'open', resolutionNote: null, resolvedAt: null, firstAskedAt: at.toISOString(), lastAskedAt: at.toISOString() });
  }

  async list(filter: { status?: AssistantKnowledgeGapStatus; limit: number }): Promise<{ items: AssistantKnowledgeGap[]; counts: Record<AssistantKnowledgeGapStatus, number> }> {
    const all = [...this.gaps.values()];
    const counts = emptyCounts();
    for (const gap of all) counts[gap.status] += 1;
    const items = all
      .filter((gap) => !filter.status || gap.status === filter.status)
      .sort((a, b) => b.timesAsked - a.timesAsked || b.lastAskedAt.localeCompare(a.lastAskedAt))
      .slice(0, filter.limit)
      .map(({ key: _key, ...gap }) => gap);
    return { items, counts };
  }

  async setStatus(id: string, input: { status: AssistantKnowledgeGapStatus; resolutionNote: string | null; actorId: string | null; at: Date }): Promise<AssistantKnowledgeGap | null> {
    const gap = this.gaps.get(id);
    if (!gap) return null;
    Object.assign(gap, { status: input.status, resolutionNote: input.resolutionNote, resolvedAt: input.status === 'open' ? null : input.at.toISOString() });
    const { key: _key, ...rest } = gap;
    return rest;
  }
}
