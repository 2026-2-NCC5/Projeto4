import AsyncStorage from '@react-native-async-storage/async-storage';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { clearSupportMemoryCache } from '../features/support/cache';
import { NavigationProvider, useAppNavigation } from '../navigation/AppNavigator';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { configureApiClient, resetApiClientForTests } from '../services/apiClient';
import type { InboxNotificationList, InboxReadRequest } from '../types/api';
import type { DetailRoute } from '../types/ui';

import { defaultInboxItems, fail, inboxFixture, ok, routedFetch, type RouteHandler } from './support/platformFixtures';

jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true, useSystemReduceMotion: () => true }));

configure({ asyncUtilTimeout: 10_000 });
jest.setTimeout(45_000);

/** 15/10/2026 às 12:00 em Brasília: os dois primeiros avisos são de hoje. */
const NOW = new Date('2026-10-15T15:00:00.000Z');
const [APPOINTMENT_ID, TICKET_ID, SYSTEM_ID] = defaultInboxItems().map((item) => item.id) as [string, string, string];

function routeLabel(route: DetailRoute | null): string {
  if (!route) return 'tab';
  if (route.screen === 'appointment') return `appointment:${route.id}`;
  if (route.screen === 'support-ticket') return `ticket:${route.id}`;
  return route.screen;
}

function Harness() {
  const navigation = useAppNavigation();
  return navigation.detail?.screen === 'notifications' ? <NotificationsScreen now={NOW} /> : <Text testID="route">{`${routeLabel(navigation.detail)}|${navigation.backStack.map(routeLabel).join(',')}`}</Text>;
}

/** Servidor da central: aplica as leituras de verdade (a contagem volta do servidor). */
function inboxServer(routes: Record<string, RouteHandler> = {}) {
  let list: InboxNotificationList = inboxFixture();
  const router = routedFetch({
    'GET /api/notifications': () => ok(list),
    'PATCH /api/notifications': (call) => {
      const body = call.body as InboxReadRequest;
      const ids = body.ids ? new Set(body.ids) : null;
      const items = list.items.map((item) => (!item.readAt && (!ids || ids.has(item.id)) ? { ...item, readAt: '2026-10-15T15:00:00.000Z' } : item));
      list = { items, unreadCount: items.filter((item) => !item.readAt).length };
      return ok(list);
    },
    ...routes,
  });
  configureApiClient({ baseUrl: 'http://api.test', getAccessToken: () => 'token-aluno', fetchFn: router.fn as unknown as typeof fetch });
  return router;
}

function renderInbox() {
  return render(
    <NavigationProvider initialState={{ tab: 'home', detail: { screen: 'notifications' } }}>
      <Harness />
    </NavigationProvider>,
  );
}

beforeEach(async () => {
  clearSupportMemoryCache();
  await AsyncStorage.clear();
});

afterEach(() => resetApiClientForTests());

describe('Central de avisos', () => {
  it('agrupa em Hoje e Anteriores, destaca os não lidos e mostra a contagem do servidor', async () => {
    const api = inboxServer();
    renderInbox();
    expect(await screen.findByText('2 avisos não lidos')).toBeTruthy();
    expect(api.find('GET', '/api/notifications')[0]?.query).toEqual({ limit: '50' });
    expect(screen.getByText('Hoje')).toBeTruthy();
    expect(screen.getByText('Anteriores')).toBeTruthy();
    const today = screen.getByTestId('notifications-today');
    expect(within(today).getByText('Atendimento confirmado')).toBeTruthy();
    expect(within(today).getByText('Nova mensagem da Secretaria')).toBeTruthy();
    expect(within(screen.getByTestId('notifications-earlier')).getByText('Horário especial do ASA')).toBeTruthy();
    // não lido: ponto + "Não lido" para o leitor de tela; lido: sem destaque
    expect(screen.getByTestId(`notification-unread-${APPOINTMENT_ID}`)).toBeTruthy();
    expect(screen.queryByTestId(`notification-unread-${SYSTEM_ID}`)).toBeNull();
    expect(screen.getByTestId(`notification-${APPOINTMENT_ID}`).props.accessibilityLabel).toMatch(/^Não lido\. Atendimento confirmado\./);
    expect(screen.getByTestId(`notification-${APPOINTMENT_ID}`).props.accessibilityHint).toBe('Abre o agendamento');
    expect(screen.getByTestId(`notification-${SYSTEM_ID}`).props.accessibilityLabel).toMatch(/^Horário especial do ASA\./);
  });

  it('tocar em um aviso de agendamento marca como lido e abre o detalhe do agendamento', async () => {
    const api = inboxServer();
    renderInbox();
    fireEvent.press(await screen.findByTestId(`notification-${APPOINTMENT_ID}`));
    expect(screen.getByTestId('route').props.children).toBe('appointment:appt-1|notifications');
    await waitFor(() => expect(api.find('PATCH', '/api/notifications')).toHaveLength(1));
    expect(api.find('PATCH', '/api/notifications')[0]?.body).toEqual({ read: true, ids: [APPOINTMENT_ID] });
    expect(api.find('PATCH', '/api/notifications')[0]?.query).toEqual({ limit: '50' });
  });

  it('tocar em um aviso de chamado abre o chamado existente do Atendimento; voltar retorna à central', async () => {
    const api = inboxServer();
    renderInbox();
    fireEvent.press(await screen.findByTestId(`notification-${TICKET_ID}`));
    expect(screen.getByTestId('route').props.children).toBe('ticket:ticket-1|notifications');
    await waitFor(() => expect(api.find('PATCH', '/api/notifications')[0]?.body).toEqual({ read: true, ids: [TICKET_ID] }));
  });

  it('aviso já lido e sem registro não chama a API nem navega', async () => {
    const api = inboxServer();
    renderInbox();
    fireEvent.press(await screen.findByTestId(`notification-${SYSTEM_ID}`));
    expect(screen.getByTestId('notifications-screen')).toBeTruthy();
    expect(api.find('PATCH', '/api/notifications')).toHaveLength(0);
  });

  it('"Marcar todas como lidas" envia PATCH sem ids e zera os destaques', async () => {
    const api = inboxServer();
    renderInbox();
    fireEvent.press(await screen.findByTestId('notifications-mark-all'));
    expect(await screen.findByText('Tudo lido por aqui')).toBeTruthy();
    expect(api.find('PATCH', '/api/notifications')[0]?.body).toEqual({ read: true });
    expect(screen.queryByTestId(`notification-unread-${APPOINTMENT_ID}`)).toBeNull();
    expect(screen.queryByTestId('notifications-mark-all')).toBeNull();
  });

  it('falha ao marcar: avisa sem jargão e recarrega a verdade do servidor', async () => {
    let reads = 0;
    const api = inboxServer({
      'GET /api/notifications': () => {
        reads += 1;
        return ok(inboxFixture());
      },
      'PATCH /api/notifications': () => fail(500, 'INTERNAL_ERROR', 'Error 500'),
    });
    renderInbox();
    fireEvent.press(await screen.findByTestId('notifications-mark-all'));
    expect(await screen.findByText('Não conseguimos marcar como lido agora. Tente novamente.')).toBeTruthy();
    await waitFor(() => expect(reads).toBeGreaterThanOrEqual(2));
    expect(await screen.findByText('2 avisos não lidos')).toBeTruthy();
    expect(screen.queryByText(/500/)).toBeNull();
    expect(api.find('PATCH', '/api/notifications')).toHaveLength(1);
  });

  it('sem avisos: estado vazio; erro sem cache: mensagem amigável e "Tentar novamente"', async () => {
    let attempts = 0;
    inboxServer({
      'GET /api/notifications': () => {
        attempts += 1;
        return attempts === 1 ? fail(503, 'DEPENDENCY_ERROR', 'x') : ok(inboxFixture([]));
      },
    });
    renderInbox();
    expect(await screen.findByText('Não conseguimos carregar seus avisos')).toBeTruthy();
    fireEvent.press(screen.getByText('Tentar novamente'));
    expect(await screen.findByText('Nenhum aviso por aqui')).toBeTruthy();
    expect(screen.getByText('Tudo lido por aqui')).toBeTruthy();
  });
});
