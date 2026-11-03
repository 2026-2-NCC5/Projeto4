import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * O app só fala com a API do ASA: credenciais e endereços do gateway de WhatsApp não podem entrar no bundle
 * (variáveis EXPO_PUBLIC_* e qualquer texto no código vão junto com o aplicativo).
 */
const ROOT = join(__dirname, '..');
const SCANNED_DIRECTORIES = ['features', 'screens', 'components', 'services', 'config', 'hooks', 'navigation'];
const SCANNED_FILES = ['App.tsx', 'index.ts'];
const SOURCE = /\.(ts|tsx|js|jsx|json)$/;

const FORBIDDEN: [string, RegExp][] = [
  ['x-api-key', /x-api-key/i],
  ['WA_AKG', /WA_AKG/i],
  ['ASA_META', /ASA_META/i],
  ['graph.facebook.com', /graph\.facebook\.com/i],
  ['variável pública de WhatsApp', /EXPO_PUBLIC_[A-Z0-9_]*(WHATSAPP|WA_|GATEWAY|META)/i],
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return SOURCE.test(name) ? [path] : [];
  });
}

describe('credenciais do gateway fora do bundle', () => {
  const files = [...SCANNED_DIRECTORIES.flatMap((directory) => sourceFiles(join(ROOT, directory))), ...SCANNED_FILES.map((name) => join(ROOT, name))];

  it('a varredura realmente passa pelo código do app', () => {
    const scanned = files.map((path) => relative(ROOT, path).replace(/\\/g, '/'));
    expect(scanned.length).toBeGreaterThan(100);
    expect(scanned).toEqual(expect.arrayContaining(['features/support/api/httpSupportApi.ts', 'screens/support/WhatsAppLinkScreen.tsx', 'services/apiClient.ts', 'config/env.ts', 'components/tickets/TicketMessages.tsx']));
  });

  it.each(FORBIDDEN)('nenhum arquivo contém %s', (_label, pattern) => {
    const hits = files.filter((path) => pattern.test(readFileSync(path, 'utf8'))).map((path) => relative(ROOT, path));
    expect(hits).toEqual([]);
  });
});
