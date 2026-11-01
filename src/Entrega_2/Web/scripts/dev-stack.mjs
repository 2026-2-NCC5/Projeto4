import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = path.resolve(webDir, '../Backend');
const apiDir = path.join(backendDir, 'api');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const docker = process.platform === 'win32' ? 'docker.exe' : 'docker';
const children = new Set();

function start(command, args, cwd, label) {
  const child = spawn(command, args, { cwd, env: process.env, stdio: 'inherit', shell: process.platform === 'win32' });
  children.add(child);
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`[dev:stack] ${label} encerrou (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`);
      stop(code ?? 1);
    }
  });
  return child;
}

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 100).unref();
}

async function apiPlatformReady() {
  try {
    const response = await fetch('http://127.0.0.1:3000/api/platform/info', { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch { return false; }
}

async function apiDatabaseUp() {
  try {
    const response = await fetch('http://127.0.0.1:3000/health', { signal: AbortSignal.timeout(1500) });
    const payload = await response.json();
    return payload?.data?.database === 'up';
  } catch { return false; }
}

async function apiResponding() {
  try {
    await fetch('http://127.0.0.1:3000/health', { signal: AbortSignal.timeout(1500) });
    return true;
  } catch { return false; }
}

async function waitFor(check, label, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return true;
    await delay(500);
  }
  throw new Error(`Tempo esgotado aguardando ${label}.`);
}

function localDatabaseTarget() {
  let configured = process.env.DATABASE_URL;
  if (!configured) {
    try {
      const line = readFileSync(path.join(apiDir, '.env'), 'utf8').split(/\r?\n/).find((item) => /^\s*DATABASE_URL\s*=/.test(item));
      configured = line?.replace(/^\s*DATABASE_URL\s*=\s*/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
    } catch { /* .env is optional */ }
  }
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return null;
    return { host: url.hostname === '::1' ? '::1' : '127.0.0.1', port: Number(url.port || 5432) };
  } catch { return null; }
}

function tcpReachable({ host, port }) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}

function runOnce(command, args, cwd, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${label} falhou (código ${code ?? 'desconhecido'}).`)));
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

try {
  const dbTarget = localDatabaseTarget();
  if (dbTarget) {
    if (!(await tcpReachable(dbTarget))) {
      console.log('[dev:stack] Iniciando PostgreSQL local pelo Docker Compose...');
      await runOnce(docker, ['compose', '-f', 'docker-compose.yml', 'up', '-d', 'db'], backendDir, 'Inicialização do PostgreSQL');
      await waitFor(() => tcpReachable(dbTarget), 'PostgreSQL aceitar conexões', 45_000);
    }
    console.log('[dev:stack] Verificando migrations locais...');
    await runOnce(npm, ['run', 'db:migrate'], apiDir, 'Migrations locais');
  }

  if (!(await apiPlatformReady())) {
    if (!(await apiResponding())) {
      console.log('[dev:stack] Iniciando a API na porta 3000...');
      start(npm, ['run', 'dev'], apiDir, 'API');
      await waitFor(apiResponding, 'API responder');
    }

    if (!(await apiDatabaseUp())) throw new Error('API sem banco disponível. Confira DATABASE_URL e o log do backend.');

    await waitFor(apiPlatformReady, 'API ficar pronta com o banco conectado');
  }

  console.log('[dev:stack] API e banco prontos. Iniciando o Vite em http://localhost:5173...');
  start(npm, ['run', 'dev', '--', '--host', '0.0.0.0'], webDir, 'Vite');
} catch (error) {
  console.error(`[dev:stack] ${error instanceof Error ? error.message : 'Falha ao iniciar a pilha local.'}`);
  stop(1);
}
