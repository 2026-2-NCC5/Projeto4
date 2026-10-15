/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

/**
 * Portal web do ASA Conecta. Em desenvolvimento o Vite repassa /api e /health para a MESMA API do app
 * (sem CORS aberto): o navegador vê uma única origem, e os cookies de sessão HttpOnly funcionam.
 * Em produção o proxy reverso (nginx, ver Dockerfile) faz o mesmo papel.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_PROXY_TARGET || 'http://localhost:3000';
  const port = Number(env.WEB_PORT || 5173);
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port,
      strictPort: false,
      proxy: {
        '/api': { target, changeOrigin: false },
        '/health': { target, changeOrigin: false },
      },
    },
    preview: {
      port: Number(env.WEB_PREVIEW_PORT || 4173),
      proxy: {
        '/api': { target, changeOrigin: false },
        '/health': { target, changeOrigin: false },
      },
    },
    build: { sourcemap: false, target: 'es2022' },
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      // fluxos de várias etapas com userEvent passam de 5 s com a suíte inteira rodando em paralelo
      testTimeout: 15_000,
      css: false,
      restoreMocks: true,
    },
  };
});
