import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readVault, resolveVaultDir } from '../src/brain/readVault.js';
import { boilerplateOf, curatedSources, discoverTargets, parsePage, pause, SITE_FOLDER, siteFetcher, siteNote, siteNoteMarkdown, type SitePage } from '../src/brain/siteSync.js';

/**
 * Recria `cerebro/Site da FECAP/` (vault do Obsidian) a partir do site PÚBLICO da FECAP — a mesma leitura que o
 * job diário `fecap-site-sync` da API faz direto no banco. Use para ver/revisar no Obsidian e para levar o retrato
 * para o deploy: depois rode `npm run brain:build` e `npm test`.
 *
 *   npm run brain:site [-- --limite 20]
 */
const limitArg = process.argv.indexOf('--limite');
const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : 0;
const DELAY_MS = 600;

async function main(): Promise<void> {
  const vault = resolveVaultDir();
  const fetchText = siteFetcher();
  const curated = curatedSources(readVault(vault).notes);
  const targets = await discoverTargets(fetchText, { today: new Date().toISOString().slice(0, 10), newsDays: 365, curated, delayMs: DELAY_MS });
  const chosen = limit > 0 ? targets.slice(0, limit) : targets;
  console.error(`${chosen.length} páginas para ler (${curated.size} já cobertas por notas curadas)`);
  const pages: SitePage[] = [];
  for (const [index, target] of chosen.entries()) {
    try {
      const { title, blocks } = parsePage(await fetchText(target.url));
      pages.push({ url: target.url, folder: target.folder, title, lastmod: target.lastmod, blocks });
    } catch (error) {
      console.error(`  ! ${target.url}: ${error instanceof Error ? error.message : error}`);
    }
    if ((index + 1) % 25 === 0) console.error(`  ${index + 1}/${chosen.length}`);
    await pause(DELAY_MS);
  }
  const boilerplate = boilerplateOf(pages);
  const out = path.join(vault, SITE_FOLDER);
  rmSync(out, { recursive: true, force: true });
  const used = new Set<string>();
  let written = 0;
  for (const page of pages) {
    const note = siteNote(page, boilerplate);
    if (!note) continue;
    let id = note.id;
    if (used.has(id)) id = `${id} (${page.url.replace(/\/+$/, '').split('/').pop()})`.slice(0, 160);
    used.add(id);
    const file = path.join(vault, `${id}.md`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, siteNoteMarkdown(note));
    written += 1;
  }
  console.error(`${written} notas gravadas em ${SITE_FOLDER}/ (${pages.length - written} páginas sem conteúdo útil). Agora: npm run brain:build`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
