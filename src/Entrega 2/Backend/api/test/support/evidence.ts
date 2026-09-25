import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const EVIDENCE_DIR = path.resolve(here, '../../../../../../documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/evidence/e2e');

export interface ScenarioEvidence {
  scenario: string;
  title: string;
  student: string;
  correlationId: string;
  requestId: string | null;
  runId: string | null;
  httpStatus: number;
  outcome: string;
  expected: string;
  passed: boolean;
  details: Record<string, unknown>;
}

const collected: ScenarioEvidence[] = [];

export function recordEvidence(item: ScenarioEvidence): void {
  collected.push(item);
}

/** Escreve documentos/Entrega 2/Projeto Interdisciplinar - Inteligência Artificial/evidence/e2e/<baseName>.{json,md} quando E2E_WRITE_EVIDENCE=1. */
export function flushEvidence(
  meta: { agentServiceUrl: string; apiVersion: string },
  options: { baseName?: string; title?: string } = {},
): void {
  if (process.env.E2E_WRITE_EVIDENCE !== '1' || collected.length === 0) return;
  const baseName = options.baseName ?? 'last-run';
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  writeFileSync(path.join(EVIDENCE_DIR, `${baseName}.json`), JSON.stringify({ generatedAt, ...meta, scenarios: collected }, null, 2));
  const lines = [
    `# ${options.title ?? 'Evidência de execução E2E — ASA Conecta'}`,
    '',
    `Gerado automaticamente por \`npm run test:e2e\` (src/Entrega 2/Backend/api) em ${generatedAt}.`,
    `API ${meta.apiVersion} · Agent Service: ${meta.agentServiceUrl}`,
    '',
    'Todos os dados são sintéticos (student-demo-*). Nenhum dado pessoal real.',
    '',
    '| Cenário | Estudante | HTTP | Resultado | Esperado | correlation_id | run_id | OK |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...collected.map(
      (item) =>
        `| ${item.scenario} — ${item.title} | ${item.student} | ${item.httpStatus} | ${item.outcome} | ${item.expected} | \`${item.correlationId}\` | ${item.runId ? `\`${item.runId}\`` : '—'} | ${item.passed ? '✅' : '❌'} |`,
    ),
    '',
    '## Detalhes',
    '',
    ...collected.flatMap((item) => [`### ${item.scenario} — ${item.title}`, '', '```json', JSON.stringify(item.details, null, 2), '```', '']),
  ];
  writeFileSync(path.join(EVIDENCE_DIR, `${baseName}.md`), lines.join('\n'));
}
