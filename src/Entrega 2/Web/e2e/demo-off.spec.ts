import { randomInt, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { ACCOUNTS, bearer, demoPassword } from './support/accounts';

/**
 * Projeto `demo-off`: portal apontando para uma API com DEMO_DATA_ENABLED=false.
 * Nada fictício pode aparecer nem servir de "plano B": contas demo não entram e a fonte acadêmica
 * fictícia fica indisponível (503 explícito), sem fallback silencioso.
 */
test('contas de demonstração não entram, pela tela nem pelo app, e o selo de demonstração some', async ({ page, request }) => {
  const info = (await (await request.get('/api/platform/info')).json()) as { data: { dataMode: string } };
  expect(info.data.dataMode).not.toBe('demo');

  await page.goto('/login');
  await expect(page.getByText(/DEMONSTRAÇÃO/i)).toHaveCount(0);
  await page.getByLabel('E-mail').fill(ACCOUNTS.student.email);
  await page.locator('input[type="password"]').fill(demoPassword());
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Contas de demonstração estão desativadas neste ambiente.')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  const mobile = await request.post('/api/auth/login', { data: { email: ACCOUNTS.staff.email, password: demoPassword() } });
  expect(mobile.status()).toBe(403);
  expect(((await mobile.json()) as { error: { reason: string } }).error.reason).toBe('demo_account_disabled');
});

test('aluno real recém-cadastrado não recebe dados acadêmicos fictícios: 503 com aviso honesto', async ({ request }) => {
  // conta descartável deste teste (senha aleatória, nunca reaproveitada)
  const email = `e2e.${randomUUID().slice(0, 8)}@edu.fecap.br`;
  const password = `E2e-${randomUUID()}-Aa1!`;
  const registered = await request.post('/api/auth/register', {
    data: { fullName: 'Pessoa Teste Automatizado', email, password, registrationNumber: String(randomInt(10_000_000, 99_999_999)) },
  });
  expect(registered.status()).toBe(201);
  const token = ((await registered.json()) as { data: { accessToken: string } }).data.accessToken;
  const subjects = await request.get('/api/student/subjects', { headers: bearer(token) });
  expect(subjects.status()).toBe(503);
  expect(((await subjects.json()) as { error: { reason: string } }).error.reason).toBe('academic_source_unavailable');
});
