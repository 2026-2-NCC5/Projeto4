import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const AGENT_SERVICE_DIR = path.resolve(here, '../../../agent-service');

export interface AgentServiceHandle {
  url: string;
  stop(): Promise<void>;
}

function pythonBinary(): string {
  const venv = path.join(AGENT_SERVICE_DIR, '.venv', 'bin', 'python');
  return process.env.AGENT_SERVICE_PYTHON ?? (existsSync(venv) ? venv : 'python3');
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Agent Service não respondeu em ${url}/health dentro de ${timeoutMs}ms`);
}

/**
 * Sobe o Agent Service Python real (uvicorn) para os testes E2E, ou reutiliza
 * E2E_AGENT_SERVICE_URL quando fornecida (ex.: docker compose).
 */
export async function startAgentService(port = 8765): Promise<AgentServiceHandle> {
  const external = process.env.E2E_AGENT_SERVICE_URL;
  if (external) {
    await waitForHealth(external, 15_000);
    return { url: external, stop: async () => undefined };
  }
  const url = `http://127.0.0.1:${port}`;
  const child: ChildProcess = spawn(
    pythonBinary(),
    ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port), '--log-level', 'warning'],
    { cwd: AGENT_SERVICE_DIR, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, AGENT_LOG_LEVEL: 'WARNING' } },
  );
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  try {
    await waitForHealth(url, 30_000);
  } catch (error) {
    child.kill('SIGTERM');
    throw new Error(`${(error as Error).message}\n${stderr.slice(-2000)}`);
  }
  return {
    url,
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 3000).unref();
      }),
  };
}
