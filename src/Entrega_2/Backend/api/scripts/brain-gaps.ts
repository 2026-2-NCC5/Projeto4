import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PgGapStore } from '../src/brain/gaps.js';
import { resolveVaultDir } from '../src/brain/readVault.js';
import { loadConfig } from '../src/config/env.js';
import { createPool, databaseHost } from '../src/db/pool.js';

/**
 * Traz as perguntas sem resposta do banco para o vault (Backend/cerebro/00 Entrada), para a equipe ver no
 * Obsidian o que o assistente ainda não sabe. Depois de escrever a nota que responde, rode `npm run brain:build`
 * e marque a pergunta como resolvida no painel. Só leitura no banco.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error('DATABASE_URL não configurada');
  const pool = createPool(config.databaseUrl, config.databaseSsl);
  try {
    const { items, counts } = await new PgGapStore(pool).list({ status: 'open', limit: 200 });
    const dir = path.join(resolveVaultDir(), '00 Entrada');
    mkdirSync(dir, { recursive: true });
    const lines = [
      '---',
      'title: Perguntas sem resposta',
      'tags: [entrada, lacunas]',
      `updated: ${new Date().toISOString().slice(0, 10)}`,
      '---',
      '# Perguntas sem resposta',
      '',
      `Dúvidas que o assistente não conseguiu responder com a base oficial (${counts.open} abertas). Esta pasta não entra no cérebro.`,
      'Para ensinar: crie ou complete uma nota na pasta certa (use [[Modelos/Nota do cérebro]]), rode `npm run brain:build` e marque como resolvida no painel.',
      '',
      ...items.map((gap) => `- [ ] ${gap.question} — ${gap.timesAsked}× (última: ${gap.lastAskedAt.slice(0, 10)}, ${gap.lastChannel === 'voice' ? 'voz' : 'texto'})`),
      '',
    ];
    writeFileSync(path.join(dir, 'Perguntas sem resposta.md'), lines.join('\n'));
    console.log(`${items.length} perguntas abertas de ${databaseHost(config.databaseUrl) ?? 'banco'} gravadas em 00 Entrada/Perguntas sem resposta.md`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
