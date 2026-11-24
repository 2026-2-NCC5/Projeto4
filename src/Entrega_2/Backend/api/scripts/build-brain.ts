import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrainIndex } from '../src/brain/index.js';
import { readVault, resolveVaultDir } from '../src/brain/readVault.js';

/**
 * Compila o cérebro (Backend/cerebro, vault do Obsidian) em src/brain/vault.generated.ts.
 * Rode depois de editar notas: `npm run brain:build`. O teste brain.test.ts falha se o arquivo gerado
 * estiver desatualizado em relação ao vault.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, '../src/brain/vault.generated.ts');
const snapshot = readVault(resolveVaultDir());
const header = `// GERADO por \`npm run brain:build\` a partir de Backend/cerebro — não edite à mão.\nimport type { BrainSnapshot } from './vault.js';\n\n`;
writeFileSync(target, `${header}export const BRAIN_SNAPSHOT: BrainSnapshot = ${JSON.stringify(snapshot, null, 1)};\n`);
const stats = new BrainIndex(snapshot).stats();
console.log(`cérebro compilado: ${stats.notes} notas, ${stats.sections} seções, ${stats.links} links (hash ${stats.hash})`);
if (stats.danglingLinks.length) console.log(`links sem nota (${stats.danglingLinks.length}): ${stats.danglingLinks.join(', ')}`);
