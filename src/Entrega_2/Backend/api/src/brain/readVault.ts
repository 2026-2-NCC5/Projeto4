import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIgnoredPath, parseNote, type BrainNote, type BrainSnapshot } from './vault.js';

/** Backend/cerebro (o vault do Obsidian), a partir de src/brain ou de scripts/. */
export function resolveVaultDir(): string {
  const fromEnv = process.env.BRAIN_VAULT_DIR;
  if (fromEnv) return fromEnv;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../../cerebro');
}

function walk(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, base);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.md') ? [path.relative(base, full).split(path.sep).join('/')] : [];
  });
}

/** Lê todas as notas do vault (ordem estável) e calcula o hash do conteúdo. */
export function readVault(dir = resolveVaultDir()): BrainSnapshot {
  if (!existsSync(dir)) return { hash: 'vazio', notes: [] };
  const files = walk(dir).filter((file) => !isIgnoredPath(file)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const hash = createHash('sha256');
  const notes: BrainNote[] = [];
  for (const file of files) {
    const content = readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n');
    hash.update(file).update('\0').update(content).update('\0');
    const note = parseNote(file, content);
    if (note) notes.push(note);
  }
  return { hash: files.length ? hash.digest('hex').slice(0, 16) : 'vazio', notes };
}
