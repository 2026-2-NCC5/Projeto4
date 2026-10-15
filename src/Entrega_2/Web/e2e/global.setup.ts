import { expect, test as setup } from '@playwright/test';
import { ACCOUNTS, authFile, demoPassword, type Role } from './support/accounts';

// Um login pela tela por perfil; os demais testes reaproveitam os cookies (sessão HttpOnly + CSRF).
for (const role of Object.keys(ACCOUNTS) as Role[]) {
  setup(`entrar como ${role}`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(ACCOUNTS[role].email);
    await page.locator('input[type="password"]').fill(demoPassword());
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${ACCOUNTS[role].home}(/|$|\\?)`));
    // o token de acesso nunca fica em localStorage (só cookies HttpOnly)
    // expressão em texto: o tsconfig dos testes E2E não carrega os tipos do DOM
    const stored = await page.evaluate<string>('JSON.stringify(window.localStorage)');
    expect(stored).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === 'asa_at')?.httpOnly).toBe(true);
    await page.context().storageState({ path: authFile(role) });
  });
}
