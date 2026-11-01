import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderPage } from '@/test/utils';
import QueuePage from './QueuePage';

describe('Meu Atendimento ASA no web', () => {
  it('não apresenta o painel como integrado quando falta autorização da fonte', async () => {
    mockApi({
      'GET /api/queue/status': () => ({ data: {
        queue: {
          status: null, latestCall: null, currentCalls: [], recentCalls: [], upcoming: [], upcomingCount: null,
          sync: { status: 'disabled', lastSuccessfulSyncAt: null, snapshotAgeSeconds: null, pollIntervalSeconds: 30, source: { kind: 'public_panel', label: 'Painel público do ASA', authorized: false } },
        },
        subscription: null,
        serverTime: '2026-11-01T12:00:00.000Z',
      } }),
    });
    renderPage(<QueuePage />);

    expect(await screen.findByRole('heading', { name: 'Acompanhamento ainda não ativado' })).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma leitura ao painel é iniciada/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir painel oficial/ })).toHaveAttribute('href', 'https://presencial.fecap.br/');
    expect(screen.queryByText(/Demonstração — dados fictícios/)).not.toBeInTheDocument();
  });

  it('oculta números e bloqueia ações quando uma API retorna fonte demonstrativa', async () => {
    mockApi({
      'GET /api/queue/status': () => ({ data: {
        queue: {
          status: 'open', latestCall: null, currentCalls: [], recentCalls: [{ ticket: '9876', desk: 'Mesa 99', calledAt: null, serviceStatus: 'unknown' }],
          upcoming: [{ ticket: '9877', position: 1 }], upcomingCount: 1,
          sync: { status: 'live', lastSuccessfulSyncAt: '2026-11-01T12:00:00.000Z', snapshotAgeSeconds: 0, pollIntervalSeconds: 30, source: { kind: 'demo', label: 'Demonstração', authorized: true } },
        },
        subscription: { id: 'demo-sub', ticket: '9876', status: 'waiting', position: 1, ahead: 0, positionKnown: true, calledDesk: null, calledAt: null, alreadyCalled: false, lastAlert: null, estimate: null, preferences: { pushEnabled: false, voiceEnabled: false, vibrationEnabled: false }, createdAt: '', updatedAt: '', expiresAt: '', timeline: [] },
        serverTime: '2026-11-01T12:00:00.000Z',
      } }),
    });
    renderPage(<QueuePage />);

    expect(await screen.findByText(/Dados não exibidos/)).toBeInTheDocument();
    expect(screen.queryByText('9876')).not.toBeInTheDocument();
    expect(screen.queryByText('9877')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acompanhar senha' })).toBeDisabled();
  });

  it('exibe posição e mesa somente quando vêm da API e envia a senha informada à conta autenticada', async () => {
    const snapshot = {
      queue: {
        status: 'open', latestCall: { ticket: '0026', desk: 'Mesa 02', calledAt: '2026-11-01T14:20:00.000Z', serviceStatus: 'in_service' },
        currentCalls: [], recentCalls: [], upcoming: [{ ticket: '0027', position: 1 }], upcomingCount: 1,
        sync: { status: 'live', lastSuccessfulSyncAt: '2026-11-01T14:20:00.000Z', snapshotAgeSeconds: 0, pollIntervalSeconds: 30, source: { kind: 'public_panel', label: 'Painel público do ASA', authorized: true } },
      },
      subscription: null,
      serverTime: '2026-11-01T14:20:00.000Z',
    };
    const withSubscription = {
      ...snapshot,
      subscription: {
        id: 'subscription-1', ticket: '0027', status: 'waiting', position: 1, ahead: 0, positionKnown: true,
        calledDesk: null, calledAt: null, alreadyCalled: false, lastAlert: null, estimate: null,
        preferences: { pushEnabled: true, voiceEnabled: true, vibrationEnabled: true }, createdAt: '2026-11-01T14:20:00.000Z',
        updatedAt: '2026-11-01T14:20:00.000Z', expiresAt: '2026-11-02T02:59:59.000Z', timeline: [],
      },
    };
    let created = false;
    const { calls } = mockApi({
      'GET /api/queue/status': () => ({ data: created ? withSubscription : snapshot }),
      'POST /api/queue/subscriptions': ({ body }) => {
        expect(body).toEqual({ ticket: '0027' });
        created = true;
        return { data: withSubscription };
      },
    });
    const user = userEvent.setup();
    renderPage(<QueuePage />);

    const input = await screen.findByRole('textbox', { name: 'Número da senha' });
    await user.type(input, '0027');
    await user.click(screen.getByRole('button', { name: 'Acompanhar senha' }));

    expect(await screen.findByText('1ª na lista')).toBeInTheDocument();
    expect(screen.getByText('Senha acompanhada')).toBeInTheDocument();
    expect(screen.getByText(/titularidade FECAP não verificada/)).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST' && call.path === '/api/queue/subscriptions')).toBe(true);
  });
});
