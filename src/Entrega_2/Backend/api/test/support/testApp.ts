import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import type { IntentInterpreter } from '../../src/assistant/interpretation.js';
import type { Mailer } from '../../src/mail/mailer.js';
import { createAgentClient, type AgentClient } from '../../src/clients/agentClient.js';
import { loadConfig, type AppConfig } from '../../src/config/env.js';
import { createLogger } from '../../src/config/logger.js';
import type { Repositories } from '../../src/repositories/types.js';
import { buildFixtureData, DEMO_PASSWORD, USERS } from './fixtures.js';
import { createInMemoryRepositories } from './inMemoryRepositories.js';

export interface TestAppOptions {
  agentServiceUrl?: string;
  agentTimeoutMs?: number;
  agentClient?: AgentClient;
  repos?: Repositories;
  configOverrides?: Partial<AppConfig>;
  intentInterpreter?: IntentInterpreter;
  now?: () => Date;
  mailer?: Mailer;
}

export function buildTestConfig(options: TestAppOptions = {}): AppConfig {
  const base = loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret-not-for-production-0123456789',
    JWT_EXPIRES_IN: '15m',
    AGENT_SERVICE_URL: options.agentServiceUrl ?? 'http://127.0.0.1:1',
    AGENT_SERVICE_TIMEOUT_MS: String(options.agentTimeoutMs ?? 1000),
    LOG_LEVEL: 'silent',
  });
  return { ...base, ...options.configOverrides };
}

export function createTestApp(options: TestAppOptions = {}): { app: Express; repos: Repositories; config: AppConfig } {
  const config = buildTestConfig(options);
  const repos = options.repos ?? createInMemoryRepositories(buildFixtureData());
  const agentClient = options.agentClient ?? createAgentClient({ baseUrl: config.agentService.url, timeoutMs: config.agentService.timeoutMs });
  const app = createApp({
    config,
    repos,
    logger: createLogger('silent'),
    agentClient,
    ...(options.intentInterpreter ? { intentInterpreter: options.intentInterpreter } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.mailer ? { mailer: options.mailer } : {}),
  });
  return { app, repos, config };
}

export async function loginAs(app: Express, email: string = USERS.student1.email, password: string = DEMO_PASSWORD) {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(`login falhou: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.data as { accessToken: string; refreshToken: string; user: { id: string }; student: { id: string } | null };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
