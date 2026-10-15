import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type APIRequestContext } from '@playwright/test';

/** Contas FICTÍCIAS do seed de demonstração (domínio @demo.asa). */
export const ACCOUNTS = {
  student: { email: 'estudante.exemplo@demo.asa', home: '/aluno' },
  staff: { email: 'atendente.asa@demo.asa', home: '/asa' },
  admin: { email: 'admin.plataforma@demo.asa', home: '/admin' },
} as const;

export type Role = keyof typeof ACCOUNTS;

const here = path.dirname(fileURLToPath(import.meta.url));

/** Arquivo de sessão (cookies) de cada perfil, gerado pelo projeto `setup` e fora do Git. */
export const authFile = (role: Role): string => path.join(here, '..', '.auth', `${role}.json`);

/**
 * Senha das contas fictícias: E2E_DEMO_PASSWORD ou a mesma constante dos testes da API (uma fonte só,
 * sem copiar o valor para cá).
 */
export function demoPassword(): string {
  if (process.env.E2E_DEMO_PASSWORD) return process.env.E2E_DEMO_PASSWORD;
  const fixtures = readFileSync(path.join(here, '..', '..', '..', 'Backend', 'api', 'test', 'support', 'fixtures.ts'), 'utf8');
  const match = fixtures.match(/export const DEMO_PASSWORD = '([^']+)'/);
  if (!match?.[1]) throw new Error('DEMO_PASSWORD não encontrada nas fixtures da API; defina E2E_DEMO_PASSWORD.');
  return match[1];
}

/** Login pelo canal do aplicativo (Bearer), como o app Expo faz — para os cenários entre canais. */
export async function mobileLogin(request: APIRequestContext, email: string): Promise<{ token: string; userId: string }> {
  const response = await request.post('/api/auth/login', { data: { email, password: demoPassword() } });
  expect(response.status(), `login (app) de ${email}`).toBe(200);
  const body = (await response.json()) as { data: { accessToken: string; user: { id: string } } };
  return { token: body.data.accessToken, userId: body.data.user.id };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Chave de idempotência única por execução. */
export const requestKey = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
