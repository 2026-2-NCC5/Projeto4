/**
 * Gera a tabela "Permissões por papel" de plataforma/ROLE_PERMISSION_MATRIX.md a partir de auth/permissions.ts.
 *   npm run docs:permissions
 * Cole a saída no documento sempre que a matriz mudar (a fonte da verdade continua sendo o código).
 */
import { PERMISSION_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS } from '../src/auth/permissions.js';

const roles = Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>;
const lines = [
  `| Grupo | Permissão | Descrição | ${roles.map((role) => ROLE_LABELS[role]).join(' | ')} |`,
  `|---|---|---|${roles.map(() => ':-:').join('|')}|`,
  ...Object.entries(PERMISSION_DESCRIPTIONS).map(
    ([key, meta]) => `| ${meta.group} | \`${key}\` | ${meta.label} | ${roles.map((role) => ((ROLE_PERMISSIONS[role] as readonly string[]).includes(key) ? '✅' : '—')).join(' | ')} |`,
  ),
];
process.stdout.write(`${lines.join('\n')}\n`);
