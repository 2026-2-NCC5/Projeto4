import { defineConfig, devices } from '@playwright/test';

/**
 * E2E do portal web contra a API e o PostgreSQL reais (nada simulado no navegador).
 *
 * Local, com a pilha de desenvolvimento no ar (API :3000 + Vite :5173):   npx playwright test
 * CI (E2E_START_PREVIEW=1): sobe `vite preview` em :4173 → API :3000 (demonstração ligada) e
 * :4174 → API :3001 (DEMO_DATA_ENABLED=false) para o cenário "demonstração desligada".
 * Cada perfil entra uma única vez (projeto `setup`) e os testes reaproveitam a sessão (limite de logins por IP).
 */
const startPreview = process.env.E2E_START_PREVIEW === '1';
const baseURL = process.env.E2E_BASE_URL ?? (startPreview ? 'http://localhost:4173' : 'http://localhost:5173');
const demoOffURL = process.env.E2E_DEMO_OFF_URL ?? (startPreview ? 'http://localhost:4174' : '');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    { name: 'portal', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'], testIgnore: [/global\.setup\.ts/, /demo-off\.spec\.ts/] },
    ...(demoOffURL ? [{ name: 'demo-off', use: { ...devices['Desktop Chrome'], baseURL: demoOffURL }, testMatch: /demo-off\.spec\.ts/ }] : []),
  ],
  webServer: startPreview
    ? [
        { command: 'npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', env: { VITE_API_PROXY_TARGET: 'http://localhost:3000' }, reuseExistingServer: false, timeout: 60_000 },
        { command: 'npx vite preview --port 4174 --strictPort', url: 'http://localhost:4174', env: { VITE_API_PROXY_TARGET: 'http://localhost:3001' }, reuseExistingServer: false, timeout: 60_000 },
      ]
    : undefined,
});
