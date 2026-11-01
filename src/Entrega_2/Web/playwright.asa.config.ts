import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.ASA_E2E_BASE_URL ?? 'http://127.0.0.1:5190';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'asa-public.spec.ts',
  fullyParallel: true,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: { baseURL, locale: 'pt-BR', ...devices['Desktop Chrome'], launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] } },
  webServer: process.env.ASA_E2E_BASE_URL ? undefined : {
    command: 'npm run dev -- --host 127.0.0.1 --port 5190 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
