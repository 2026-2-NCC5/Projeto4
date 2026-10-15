import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Pressable } from 'react-native';

import { QueueAlertLayer } from '../features/queue/components/QueueAlertLayer';
import { QueueHomeCard } from '../features/queue/components/QueueHomeCard';
import { QueueProvider, useQueue } from '../features/queue/hooks/useQueue';
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
  it('valida a senha, confirma o acompanhamento e mostra a posição real', async () => {
    const { client } = renderQueue();
    await act(async () => {
      await client.simulate({ scenario: 'waiting' });
    });
    expect(await screen.findByText('Qual é a sua senha?')).toBeTruthy();

    fireEvent.press(screen.getByTestId('queue-ticket-submit'));
    expect(await screen.findByText('Digite uma senha válida.')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('queue-ticket-input'), '29');
    fireEvent.press(screen.getByTestId('queue-ticket-submit'));
    expect(await screen.findByText('Senha adicionada')).toBeTruthy();
    expect(screen.getByText('Estamos acompanhando a senha 0029. Você será avisado quando sua vez estiver próxima.')).toBeTruthy();
    expect(screen.getByTestId('queue-ticket-number').props.children).toBe('0029');
    expect(screen.getByText('Você está na fila')).toBeTruthy();
    expect(screen.getByText('7 pessoas antes de você.')).toBeTruthy();
    // painel: senha em atendimento com a mesa e chamadas recentes
    expect(screen.getByTestId('queue-current-call')).toBeTruthy();
    expect(screen.getByTestId('queue-recent-calls')).toBeTruthy();
    // permissão pedida só com contexto, depois do cadastro
    expect(screen.getByText('Ative as notificações para avisarmos quando sua vez estiver chegando, mesmo com o app fechado.')).toBeTruthy();
    expect(screen.getByText('Seu acompanhamento')).toBeTruthy();
  });

  it('chamada: aviso "É a sua vez!" com senha e mesa; "Entendi" fecha', async () => {
    const { client } = renderQueue();
    await act(async () => {
      await client.simulate({ scenario: 'next' });
    });
    fireEvent.changeText(await screen.findByTestId('queue-ticket-input'), '0029');
    fireEvent.press(screen.getByTestId('queue-ticket-submit'));
    expect(await screen.findByText('Prepare-se')).toBeTruthy();

    fireEvent.press(screen.getByTestId('queue-dev-called'));
    expect(await screen.findByTestId('queue-called-modal')).toBeTruthy();
    expect(screen.getByTestId('queue-called-ticket').props.children).toBe('0029');
    expect(screen.getByTestId('queue-called-desk').props.children).toBe('Mesa 03');
    expect(screen.getAllByText('É a sua vez!').length).toBeGreaterThan(0);

    // a animação de saída roda em requestAnimationFrame: relógio falso deixa o teste determinístico
    jest.useFakeTimers();
    try {
      fireEvent.press(screen.getByTestId('queue-called-ack'));
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      expect(screen.queryByTestId('queue-called-modal')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
    // a tela continua no estado de chamada (texto, não só cor)
    expect(screen.getByText('Dirija-se à mesa indicada.')).toBeTruthy();
  });

  it('fonte indisponível: mantém o último estado e explica com o horário da última atualização', async () => {
    renderQueue();
    fireEvent.changeText(await screen.findByTestId('queue-ticket-input'), '0029');
    fireEvent.press(screen.getByTestId('queue-ticket-submit'));
    await screen.findByText('Senha adicionada');
    fireEvent.press(screen.getByTestId('queue-dev-offline'));
    expect(await screen.findByText('Não conseguimos atualizar a fila agora.')).toBeTruthy();
    expect(screen.getByTestId('queue-ticket-card')).toBeTruthy();
    expect(screen.getByTestId('queue-sync-indicator')).toBeTruthy();
  });

  it('com "Reduzir movimento" o aviso de chamada aparece igual (só fade)', async () => {
    const { client } = renderQueue({ preferences: { reduceMotion: 'always' } });
    await act(async () => {
      await client.simulate({ scenario: 'next' });
    });
    fireEvent.changeText(await screen.findByTestId('queue-ticket-input'), '0029');
    fireEvent.press(screen.getByTestId('queue-ticket-submit'));
    await screen.findByText('Prepare-se');
    fireEvent.press(screen.getByTestId('queue-dev-called'));
    expect(await screen.findByTestId('queue-called-modal')).toBeTruthy();
    expect(screen.getByLabelText('É a sua vez! Senha 0029, Mesa 03. Dirija-se à mesa indicada.')).toBeTruthy();
  });

  it('preferências: desligar a voz do ASA IA', async () => {
    renderQueue();
    fireEvent.changeText(await screen.findByTestId('queue-ticket-input'), '0029');
    fireEvent.press(screen.getByTestId('queue-ticket-submit'));
    await screen.findByText('Alertas da fila');
    const voice = screen.getByLabelText('ASA IA por voz');
    expect(voice.props.value).toBe(true);
    fireEvent(voice, 'valueChange', false);
    await waitFor(() => expect(screen.getByLabelText('ASA IA por voz').props.value).toBe(false));
  });
});

describe('Fila presencial — card do Início', () => {
  function Subscriber() {
    const queue = useQueue();
    return <Pressable testID="subscribe-0029" onPress={() => void queue.subscribe('0029')} />;
  }

  it('só aparece com uma senha acompanhada e mostra quantas pessoas estão à frente', async () => {
    const client = createMockQueueClient({ stepMs: 600_000 });
    await client.simulate({ scenario: '3_ahead' });
    render(
      <PreferencesProvider>
        <QueueProvider client={client} push={push} store={store()}>
          <QueueHomeCard />
          <Subscriber />
        </QueueProvider>
      </PreferencesProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('queue-home-card')).toBeNull();
    fireEvent.press(screen.getByTestId('subscribe-0029'));
    expect(await screen.findByTestId('queue-home-card')).toBeTruthy();
    expect(screen.getByText('3 pessoas à frente')).toBeTruthy();
    expect(screen.getByText('Ver fila')).toBeTruthy();

    await act(async () => {
      await client.simulate({ scenario: 'called' });
    });
    expect(await screen.findByText('0029 · Mesa 03')).toBeTruthy();
    expect(screen.getByText('Ver atendimento')).toBeTruthy();
  });
});
