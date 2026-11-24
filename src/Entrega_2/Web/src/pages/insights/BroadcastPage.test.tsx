import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { permissionsFor } from '@/test/permissions';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import type { Permission } from '@/types/api';
import BroadcastPage from './BroadcastPage';

const staff = (without: Permission[] = []) => makeSession(makeMe('institutional_staff', { permissions: permissionsFor('institutional_staff').filter((permission) => !without.includes(permission)) }));
const routes = [{ path: '/asa/enviar-aviso', element: <BroadcastPage /> }];

describe('Enviar aviso', () => {
  it('mostra a prévia, pede confirmação e informa o alcance', async () => {
    const { calls } = mockApi({ 'POST /api/notifications/broadcast': () => ({ status: 201, data: { recipients: 312, pushSent: 120, pushEnabled: true } }) });
    renderRoutes(routes, { initialPath: '/asa/enviar-aviso', session: staff() });
    const send = await screen.findByRole('button', { name: 'Revisar e enviar' });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Título/), 'Rematrícula aberta');
    await userEvent.type(screen.getByLabelText(/Mensagem/), 'Faça a rematrícula no Portal do Aluno até 15/12.');
    expect(screen.getAllByText('Rematrícula aberta').length).toBeGreaterThan(0);
    await userEvent.click(send);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar aviso' }));
    await screen.findByText(/Aviso enviado para 312 alunos\. 120 notificações chegaram ao celular\./);
    await waitFor(() => expect(calls.find((call) => call.method === 'POST')?.body).toEqual({ title: 'Rematrícula aberta', body: 'Faça a rematrícula no Portal do Aluno até 15/12.' }));
  });

  it('sem a permissão, acesso negado', async () => {
    mockApi({});
    renderRoutes(routes, { initialPath: '/asa/enviar-aviso', session: staff(['notifications:broadcast']) });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
  });
});
