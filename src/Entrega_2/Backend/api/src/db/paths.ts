import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Localiza database/migrations e database/seeds tanto no repositório
 * (Backend/api/src/db → ../../../database) quanto no container
 * (DATABASE_DIR=/srv/database).
 */
export function resolveDatabaseDir(): string {
  const fromEnv = process.env.DATABASE_DIR;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../../database'), // src/db ou dist/db → Backend/database (ou /srv/database)
    path.resolve(process.cwd(), '../database'),
    path.resolve(process.cwd(), 'database'),
  ];
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'migrations'))) return candidate;
  }
  throw new Error('Diretório database/ não encontrado. Defina DATABASE_DIR.');
}
