import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { vi } from 'vitest';
import { ToastProvider } from '@/components/ui/Toast';
import { StaticSessionProvider, type SessionValue } from '@/features/auth/session';
import { permissionsFor } from '@/test/permissions';
import type { AuthMe, UserRole } from '@/types/api';

export function makeMe(role: UserRole = 'student', overrides: Partial<AuthMe> = {}): AuthMe {
  const names: Record<UserRole, string> = { student: 'Estudante Exemplo', institutional_staff: 'Atendente ASA', technical_admin: 'Administração' };
  return {
    user: { id: `user-${role}`, fullName: names[role], email: `${role}@demo.asa`, role },
    roleLabel: role === 'student' ? 'Aluno' : role === 'institutional_staff' ? 'Equipe ASA' : 'Administração',
    permissions: permissionsFor(role),
    student: role === 'student' ? { id: 'student-demo-001', registrationNumber: 'DEMO-2026-001', program: 'Ciências da Computação' } : null,
    isDemo: true,
    session: { id: 'family-1', channel: 'web', deviceLabel: 'Chrome no Linux', createdAt: '2026-10-14T12:00:00.000Z', lastUsedAt: null, expiresAt: '2026-10-15T00:00:00.000Z', rememberMe: false, current: true },
    ...overrides,
  };
}

export function makeSession(me: AuthMe | null, overrides: Partial<SessionValue> = {}): SessionValue {
  return {
    status: me ? 'authenticated' : 'anonymous',
    me,
    notice: null,
    login: vi.fn(async () => me as AuthMe),
    register: vi.fn(async () => me as AuthMe),
    logout: vi.fn(async () => undefined),
    reload: vi.fn(async () => undefined),
    clearNotice: vi.fn(),
    can: (permission) => Boolean(me?.permissions.includes(permission)),
    ...overrides,
  };
}

/** Renderiza com QueryClient sem repetição, rotas em memória e sessão fixa. */
export function renderRoutes(routes: RouteObject[], options: { initialPath?: string; session?: SessionValue } = {}): RenderResult & { router: ReturnType<typeof createMemoryRouter>; queryClient: QueryClient } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [options.initialPath ?? '/'] });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <StaticSessionProvider value={options.session ?? makeSession(makeMe())}>
          <RouterProvider router={router} />
        </StaticSessionProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...result, router, queryClient };
}

export function renderPage(element: ReactElement, options: { path?: string; initialPath?: string; session?: SessionValue } = {}) {
  return renderRoutes([{ path: options.path ?? '/', element }], options);
}

type Handler = (request: { method: string; url: URL; body: unknown; headers: Headers }) => { status?: number; data?: unknown; error?: { code: string; message: string; reason?: string } } | undefined;

/**
 * Substitui fetch por rotas falsas no formato da API ({ data } / { error }). Rotas não previstas
 * respondem 404 — o teste mostra claramente o que a tela tentou chamar.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: Array<{ method: string; path: string; body: unknown; headers: Headers }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: `${url.pathname}${url.search}`, body, headers });
    const handler = routes[`${method} ${url.pathname}`];
    const result = handler?.({ method, url, body, headers });
    if (!result) {
      return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: `sem rota falsa: ${method} ${url.pathname}`, requestId: 'req-test', correlationId: 'corr-test' } }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    const status = result.status ?? (result.error ? 400 : 200);
    if (status === 204) return new Response(null, { status });
    const payload = result.error ? { error: { ...result.error, requestId: 'req-test', correlationId: 'corr-test' } } : { data: result.data, meta: { requestId: 'req-test', correlationId: 'corr-test' } };
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}
