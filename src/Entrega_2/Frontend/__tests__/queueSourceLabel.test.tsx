import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { QueueSourceLabel } from '../features/queue/components/QueueSourceLabel';
import { QueueProvider } from '../features/queue/hooks/useQueue';
import { QueueScreen } from '../features/queue/screens/QueueScreen';
import { createMockQueueClient } from '../features/queue/services/mockQueueClient';
import type { AlertStore, PushAdapter } from '../features/queue/state/queueController';
import { PreferencesProvider } from '../hooks/usePreferences';
import type { QueueAlertMilestone, QueueDataSource } from '../types/api';

const push: PushAdapter = {
  getPermission: async () => 'undetermined',
  requestPermission: async () => 'denied',
  getToken: async () => ({ token: null, reason: 'no_project_id' }),
  platform: () => 'android',
};

function store(): AlertStore {
  let handled: Record<string, QueueAlertMilestone> = {};
  return {
    loadHandled: async () => handled,
    saveHandled: async (value) => {
      handled = value;
    },
    loadDefaults: async () => ({ pushEnabled: true, voiceEnabled: true, vibrationEnabled: true }),
    saveDefaults: async () => undefined,
  };
}

function renderQueue(source?: QueueDataSource | null) {
  const client = createMockQueueClient(source === undefined ? { stepMs: 600_000 } : { stepMs: 600_000, source });
  render(
    <PreferencesProvider>
      <QueueProvider client={client} push={push} store={store()}>
        <QueueScreen onBack={jest.fn()} />
      </QueueProvider>
    </PreferencesProvider>,
  );
}

describe('Fila presencial — origem dos dados', () => {
  it('simulação (fonte demo): rótulo visível "Simulação — dados fictícios" junto do indicador de sincronização', async () => {
    renderQueue();
    expect(await screen.findByTestId('queue-source-demo')).toBeTruthy();
    expect(screen.getByText('Simulação — dados fictícios')).toBeTruthy();
    expect(screen.getByTestId('queue-sync-indicator')).toBeTruthy();
    expect(screen.getByText(/Simulação do painel do ASA com senhas fictícias/)).toBeTruthy();
    expect(screen.queryByTestId('queue-source-unauthorized')).toBeNull();
  });

  it('painel público sem autorização registrada: nota discreta, sem rótulo de simulação', async () => {
    renderQueue({ kind: 'public_panel', label: 'Painel público do ASA (presencial.fecap.br)', authorized: false });
    expect(await screen.findByText('Fonte pública sem autorização institucional registrada')).toBeTruthy();
    expect(screen.queryByTestId('queue-source-demo')).toBeNull();
    expect(screen.getByText(/Dados do painel público presencial\.fecap\.br/)).toBeTruthy();
  });

  it('painel público autorizado ou fonte não informada: nenhuma marcação extra', async () => {
    renderQueue({ kind: 'public_panel', label: 'Painel público do ASA', authorized: true });
    await screen.findByTestId('queue-sync-indicator');
    expect(await screen.findByText('Qual é a sua senha?')).toBeTruthy();
    expect(screen.queryByTestId('queue-source-demo')).toBeNull();
    expect(screen.queryByTestId('queue-source-unauthorized')).toBeNull();
  });

  it('componente isolado: sem fonte não renderiza nada', () => {
    const view = render(<QueueSourceLabel source={undefined} />);
    expect(view.toJSON()).toBeNull();
  });
});
