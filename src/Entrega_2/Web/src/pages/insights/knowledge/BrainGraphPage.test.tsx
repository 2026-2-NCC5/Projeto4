import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { permissionsFor } from '@/test/permissions';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import type { AssistantBrainGraph, AssistantBrainNoteDetail } from '@/types/api';
import BrainGraphPage from './BrainGraphPage';

const staff = () => makeSession(makeMe('institutional_staff', { permissions: permissionsFor('institutional_staff') }));
const routes = [{ path: '/asa/cerebro-assistente/mapa', element: <BrainGraphPage /> }];

const graph: AssistantBrainGraph = {
  hash: 'abc',
  nodes: [
    { id: 'FECAP/Campus Liberdade', title: 'Campus Liberdade', folder: 'FECAP', tags: ['campus'], generated: false, updated: '2026-11-20' },
    { id: 'Cesta de Serviços do ASA/Acesso ao Moodle', title: 'Acesso ao Moodle', folder: 'Cesta de Serviços do ASA', tags: [], generated: false, updated: null },
  ],
  edges: [{ source: 'FECAP/Campus Liberdade', target: 'Cesta de Serviços do ASA/Acesso ao Moodle' }],
};

const note: AssistantBrainNoteDetail = {
  id: 'Cesta de Serviços do ASA/Acesso ao Moodle',
  title: 'Acesso ao Moodle',
  folder: 'Cesta de Serviços do ASA',
  aliases: [],
  tags: ['moodle'],
  sourceLabel: 'Cesta de Serviços',
  sourceUrl: 'https://www.fecap.br/',
  updated: null,
  generated: false,
  sections: [{ anchor: 'como-acessar', heading: 'Como acessar', text: 'Entre com o RA e a senha do portal.' }],
  links: [{ label: 'Campus Liberdade', id: 'FECAP/Campus Liberdade' }, { label: 'Mestrado', id: null }],
  backlinks: [{ id: 'FECAP/Campus Liberdade', title: 'Campus Liberdade' }],
};

describe('Mapa do cérebro', () => {
  it('busca uma nota e mostra o texto, os links e os backlinks', async () => {
    const { calls } = mockApi({
      'GET /api/assistant-brain/graph': () => ({ data: graph }),
      'GET /api/assistant-brain/note': () => ({ data: note }),
    });
    renderRoutes(routes, { initialPath: '/asa/cerebro-assistente/mapa', session: staff() });
    expect(await screen.findByRole('img', { name: /Grafo do cérebro com 2 notas e 1 ligações/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cesta de Serviços do ASA 1/ })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.type(screen.getByLabelText('Buscar nota'), 'moodle');
    const results = screen.getByRole('list', { name: 'Notas encontradas' });
    await userEvent.click(within(results).getByRole('button', { name: /Acesso ao Moodle/ }));

    expect(await screen.findByRole('heading', { name: 'Acesso ao Moodle' })).toBeInTheDocument();
    expect(screen.getByText('Entre com o RA e a senha do portal.')).toBeInTheDocument();
    expect(screen.getByText('Mestrado')).toHaveAttribute('title', 'Assunto citado que ainda não tem nota');
    expect(screen.getByText(/Notas que apontam para esta \(1\)/)).toBeInTheDocument();
    await waitFor(() => expect(calls.some((call) => call.method === 'GET' && call.path.includes('id=Cesta'))).toBe(true));
  });
});
