import { expect, test } from '@playwright/test';
import { authFile } from './support/accounts';

/**
 * Cada perfil só abre a própria área. A guarda da tela é conveniência: a mesma sessão (cookie) recebe
 * 403 da API nas rotas dos outros perfis — a API é a autoridade.
 */
const DENIED = 'Acesso não permitido';

async function expectDenied(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: DENIED }), `${path} deveria estar bloqueada`).toBeVisible();
}

async function expectAllowed(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[/?]/g, '\\$&')}`));
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { name: DENIED })).toHaveCount(0);
}

test.describe('aluno', () => {
  test.use({ storageState: authFile('student') });

  test('abre o próprio portal; área da equipe e administração bloqueadas na tela e na API', async ({ page }) => {
    await expectAllowed(page, '/aluno');
    await expectAllowed(page, '/aluno/chamados');
    for (const path of ['/asa', '/asa/chamados', '/admin', '/admin/usuarios']) await expectDenied(page, path);
    expect((await page.request.get('/api/support/staff/tickets')).status()).toBe(403);
    expect((await page.request.get('/api/admin/users')).status()).toBe(403);
    expect((await page.request.get('/api/asa/dashboard')).status()).toBe(403);
  });
});

test.describe('equipe ASA', () => {
  test.use({ storageState: authFile('staff') });

  test('abre a operação; portal do aluno e administração bloqueados; API recusa rotas de administração', async ({ page }) => {
    await expectAllowed(page, '/asa');
    await expectAllowed(page, '/asa/chamados');
    for (const path of ['/aluno', '/admin']) await expectDenied(page, path);
    expect((await page.request.get('/api/admin/users')).status()).toBe(403);
    expect((await page.request.get('/api/support/tickets')).status()).toBe(403);
  });
});

test.describe('administração', () => {
  test.use({ storageState: authFile('admin') });

  test('abre a administração; não lê conteúdo de chamados (só metadados)', async ({ page }) => {
    await expectAllowed(page, '/admin/conta');
    for (const path of ['/asa', '/asa/chamados', '/aluno']) await expectDenied(page, path);
    expect((await page.request.get('/api/support/staff/tickets')).status()).toBe(403);
    const metadata = await page.request.get('/api/admin/tickets?pageSize=5');
    expect(metadata.status()).toBe(200);
    const body = (await metadata.json()) as { data: { items: Array<Record<string, unknown>> } };
    for (const item of body.data.items) {
      expect(item).not.toHaveProperty('subject');
      expect(item).not.toHaveProperty('description');
      expect(item).not.toHaveProperty('messages');
    }
  });
});

test.describe('sem sessão', () => {
  test('rotas protegidas levam ao login preservando o destino', async ({ page }) => {
    await page.goto('/aluno/chamados');
    await expect(page).toHaveURL(/\/login\?next=%2Faluno%2Fchamados/);
    expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  });
});
