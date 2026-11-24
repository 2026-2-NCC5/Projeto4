import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { permissionsFor } from '@/test/permissions';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import type { AssistantBrainOverview, Permission } from '@/types/api';
import BrainPage from './BrainPage';

const staff = (without: Permission[] = []) => makeSession(makeMe('institutional_staff', { permissions: permissionsFor('institutional_staff').filter((permission) => !without.includes(permission)) }));
const routes = [{ path: '/asa/cerebro-assistente', element: <BrainPage /> }];

const overview = (): AssistantBrainOverview => ({
  brain: { hash: 'abc', notes: 58, sections: 240, links: 120, folders: { FECAP: 16, 'Graduação': 24 }, danglingLinks: ['Mestrado'], llmEnabled: true, site: { pages: 245, lastFetchedAt: '2026-11-24T07:00:00.000Z' } },
  gaps: {
    items: [{ id: '00000000-0000-4000-8000-000000000001', question: 'tem estacionamento pra aluno', timesAsked: 4, lastChannel: 'voice', status: 'open', resolutionNote: null, resolvedAt: null, firstAskedAt: '2026-11-20T12:00:00.000Z', lastAskedAt: '2026-11-24T12:00:00.000Z' }],
    counts: { open: 1, resolved: 3, ignored: 0 },
  },
});

describe('Cérebro do assistente', () => {
  it('mostra o que o assistente sabe e marca uma pergunta como respondida', async () => {
    const { calls } = mockApi({
      'GET /api/assistant-brain': () => ({ data: overview() }),
      'PATCH /api/assistant-brain/gaps/00000000-0000-4000-8000-000000000001': ({ body }) => ({ data: { ...overview().gaps.items[0], ...(body as object) } }),
    });
    renderRoutes(routes, { initialPath: '/asa/cerebro-assistente', session: staff() });
    const list = await screen.findByRole('list', { name: 'Perguntas sem resposta' });
    expect(screen.getByText(/58 \(240 trechos/)).toBeInTheDocument();
    expect(screen.getByText(/Assuntos citados sem nota ainda: Mestrado/)).toBeInTheDocument();
    expect(screen.getByText(/245 páginas, lidas/)).toBeInTheDocument();
    expect(within(list).getByText('tem estacionamento pra aluno')).toBeInTheDocument();
    expect(within(list).getByText('4 vezes')).toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: 'Respondida' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PATCH' && (call.body as { status: string }).status === 'resolved')).toBe(true));
  });

  it('sem permissão de escrita só mostra as perguntas', async () => {
    mockApi({ 'GET /api/assistant-brain': () => ({ data: overview() }) });
    renderRoutes(routes, { initialPath: '/asa/cerebro-assistente', session: staff(['kb:write']) });
    const list = await screen.findByRole('list', { name: 'Perguntas sem resposta' });
    expect(within(list).queryByRole('button', { name: 'Respondida' })).toBeNull();
  });
});
