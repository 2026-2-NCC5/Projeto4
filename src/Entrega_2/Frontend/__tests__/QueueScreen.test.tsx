import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import { QueueAlertLayer } from '../features/queue/components/QueueAlertLayer';
import { QueueHomeCard } from '../features/queue/components/QueueHomeCard';
import { QueueProvider } from '../features/queue/hooks/useQueue';
import { QueueScreen } from '../features/queue/screens/QueueScreen';
import { createMockQueueClient } from '../features/queue/services/mockQueueClient';
import type { QueueClient } from '../features/queue/services/queueClient';
import type { AlertStore, PushAdapter } from '../features/queue/state/queueController';
import { PreferencesProvider, type Preferences } from '../hooks/usePreferences';
import type { QueueAlertMilestone } from '../types/api';

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

function renderQueue(options: { client?: QueueClient; preferences?: Partial<Preferences> } = {}) {
  const client = options.client ?? createMockQueueClient({ stepMs: 600_000 });
  render(
    <PreferencesProvider initialPreferences={options.preferences}>
      <QueueProvider client={client} push={push} store={store()}>
        <QueueScreen onBack={jest.fn()} />
        <QueueAlertLayer />
      </QueueProvider>
    </PreferencesProvider>,
  );
  return { client };
}

describe('Fila presencial — tela', () => {
  it('não exibe nem permite acompanhar dados quando a API informa fonte demonstrativa', async () => {
    renderQueue();
    expect(await screen.findByText('Dados de demonstração não são exibidos no app. Conecte uma fonte institucional real e autorizada para habilitar a fila.')).toBeTruthy();
    expect(screen.queryByTestId('queue-ticket-card')).toBeNull();
    expect(screen.queryByTestId('queue-current-call')).toBeNull();
    expect(screen.getByTestId('queue-ticket-input').props.editable).toBe(false);
    expect(screen.getByTestId('queue-ticket-submit').props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByTestId('queue-dev-called')).toBeNull();
  });
});

describe('Fila presencial — card do Início', () => {
  it('não mostra senha retornada por uma fonte de demonstração', async () => {
    render(
      <PreferencesProvider>
        <QueueProvider client={createMockQueueClient({ stepMs: 600_000 })} push={push} store={store()}>
          <QueueHomeCard />
        </QueueProvider>
      </PreferencesProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('queue-home-card')).toBeNull();
    expect(screen.queryByText('0029')).toBeNull();
  });
});
