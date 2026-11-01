import { expect, test } from '@playwright/test';

test.describe('Portal público ASA', () => {
  test('homepage e conteúdo de parceiros estão dentro da experiência ASA', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page).toHaveTitle(/ASA/);
    await expect(page.getByRole('heading', { name: 'Seu futuro começa com acolhimento e oportunidades.' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Empresas parceiras da FECAP' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Logo ABENDI' })).toHaveAttribute('href', 'https://www.fecap.br/parceiro/abendi/');
    await page.getByRole('button', { name: 'Mostrar próximas empresas' }).click();
    await expect.poll(() => page.evaluate<number>(`document.querySelector('[aria-label="Empresas parceiras publicadas pela FECAP"]')?.scrollLeft ?? 0`)).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Abrir assistente virtual Hermes' }).click();
    const dialog = page.getByRole('dialog', { name: /Hermes/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Olá! Como posso ajudar?')).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1440);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
    await page.getByRole('button', { name: 'Fechar' }).click();
    await expect(dialog).toBeHidden();
  });

  test('a interface ASA e o diálogo Hermes se ajustam a mobile compacto', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Seu futuro começa com acolhimento e oportunidades.' })).toBeVisible();
    expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBe(320);
    await page.getByRole('button', { name: 'Abrir navegação' }).click();
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
    await page.getByRole('link', { name: 'Cesta de Serviços' }).last().click();
    await expect(page).toHaveURL(/\/cesta-de-servicos$/);
    await expect(page.getByRole('heading', { name: 'Encontre a orientação oficial para cada serviço.' })).toBeVisible();

    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir assistente virtual Hermes' }).click();
    const dialog = page.getByRole('dialog', { name: /Hermes/ });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(780);
    await page.setViewportSize({ width: 320, height: 480 });
    await expect.poll(async () => {
      const resized = await dialog.boundingBox();
      return Boolean(resized && resized.y >= 0 && resized.y + resized.height <= 480);
    }).toBe(true);
    expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBe(320);
  });

  test('rotas ASA e sessão autenticada têm destinos claros', async ({ page }) => {
    await page.goto('/asa-conecta');
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Seu futuro começa com acolhimento e oportunidades.' })).toBeVisible();
    await page.goto('/asa');
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test('baseline visual da homepage ASA desktop @visual', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Seu futuro começa com acolhimento e oportunidades.' })).toBeVisible();
    await expect(page).toHaveScreenshot('asa-home-desktop.png', { animations: 'disabled', fullPage: false, maxDiffPixelRatio: 0.01 });
  });

  test('baseline visual da homepage ASA mobile @visual', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Seu futuro começa com acolhimento e oportunidades.' })).toBeVisible();
    await expect(page).toHaveScreenshot('asa-home-mobile.png', { animations: 'disabled', fullPage: false, maxDiffPixelRatio: 0.01 });
  });
});
