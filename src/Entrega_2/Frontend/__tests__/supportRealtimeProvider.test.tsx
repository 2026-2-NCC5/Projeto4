import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { AppState, Text, type AppStateStatus } from 'react-native';

import { setSupportApi } from '../features/support/api';
import { createMockSupportApi } from '../features/support/api/mockSupportApi';
import type { SupportApi } from '../features/support/api/types';
import { clearSupportMemoryCache, peekCache, readCache, setSupportCacheOwner, writeCache } from '../features/support/cache';
import { SUPPORT } from '../features/support/config';
import { useSupportOverview, useTicket } from '../features/support/hooks/useSupportData';
import { SupportRealtimeProvider, useSupportRealtime } from '../features/support/realtime';
import { NavigationProvider } from '../navigation/AppNavigator';
import { TicketDetailScreen } from '../screens/support/TicketDetailScreen';
import { ApiClientError } from '../services/apiClient';
import type { SupportEventEnvelope, SupportEventFeed } from '../types/api';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true, useSystemReduceMotion: () => true }));

interface FakeSession {
  user: { id: string } | null;
  signingOut?: boolean;
}

const mockSession: { current: FakeSession | null } = { current: null };
jest.mock('../hooks/useSession', () => ({
  useOptionalSession: () => mockSession.current,
  useSession: () => mockSession.current,
}));

const networkMock = jest.requireMock('expo-network') as { getNetworkStateAsync: jest.Mock };

function feed(overrides: Partial<SupportEventFeed> = {}): SupportEventFeed {
  return { events: [], nextCursor: 'c1', hasMore: false, resyncRequired: false, serverTime: '2026-11-02T12:00:00.000Z', ...overrides };
}

function ticketEvent(eventId: string, ticketId: string): SupportEventEnvelope {
  return { schemaVersion: '1.0', eventId, correlationId: null, ticketId, sequence: 1, type: 'support.message.created', occurredAt: '2026-11-02T12:00:00.000Z', actor: { type: 'staff' }, audience: 'STUDENT_VISIBLE', data: {} };
}

/** API real em forma (`mode: 'api'`) com o feed roteirizado; sem roteiro, a chamada fica pendente até ser abortada. */
function liveApi(script: (SupportEventFeed | Error)[] = []) {
  const signals: AbortSignal[] = [];
  const getEvents = jest.fn(
    (_params: { since?: string | null | undefined; wait: number }, options?: { signal?: AbortSignal }) =>
      new Promise<SupportEventFeed>((resolve, reject) => {
        if (options?.signal) signals.push(options.signal);
        const next = script.shift();
        if (next instanceof Error) reject(next);
        else if (next) resolve(next);
        else options?.signal?.addEventListener('abort', () => reject(new ApiClientError({ kind: 'cancelled', message: 'cancelada' })));
      }),
  );
  const api: SupportApi = { ...createMockSupportApi({ latencyMs: 0 }), mode: 'api', getEvents };
  setSupportApi(api);
  return { api, getEvents, signals, script };
}

function Status() {
  const realtime = useSupportRealtime();
  return <Text testID="realtime">{`${String(realtime.enabled)}:${realtime.state}`}</Text>;
}

/** O que está em tela em cada teste: o estado e dois recursos, cada um com a sua contagem. */
function Probe({ ticketId }: { ticketId?: string }) {
  useSupportOverview();
  return (
    <>
      <Status />
      {ticketId ? <TicketProbe ticketId={ticketId} /> : null}
    </>
  );
}

function TicketProbe({ ticketId }: { ticketId: string }) {
  useTicket(ticketId);
  return null;
}

const tree = (children: React.ReactNode) => <SupportRealtimeProvider>{children}</SupportRealtimeProvider>;

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

const realtimeText = () => screen.getByTestId('realtime').props.children as string;

let appStateListeners: ((state: AppStateStatus) => void)[] = [];

beforeEach(async () => {
  jest.useFakeTimers();
  clearSupportMemoryCache();
  await AsyncStorage.clear();
  mockSession.current = { user: { id: 'user-a' } };
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, listener: (state: AppStateStatus) => void) => {
    appStateListeners.push(listener);
    return {
      remove: () => {
        appStateListeners = appStateListeners.filter((item) => item !== listener);
      },
    };
  }) as never);
  networkMock.getNetworkStateAsync.mockResolvedValue({ isConnected: true, isInternetReachable: true, type: 'WIFI' });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

afterAll(() => setSupportApi(null));

const sendAppState = (state: AppStateStatus) => act(() => appStateListeners.slice().forEach((listener) => listener(state)));

describe('modo de demonstração', () => {
  it('não lê o feed nem afirma nada sobre atualizações automáticas', async () => {
    const api = createMockSupportApi({ latencyMs: 0 });
    const getEvents = jest.spyOn(api, 'getEvents');
    setSupportApi(api);
    const { items } = await api.listTickets({});
    render(
      <NavigationProvider>
        {tree(
          <>
            <Status />
            <TicketDetailScreen ticketId={(items[0] as { id: string }).id} />
          </>,
        )}
      </NavigationProvider>,
    );
    await advance(60_000);
    expect(getEvents).not.toHaveBeenCalled();
    expect(realtimeText()).toBe('false:connecting');
    expect(screen.getByTestId('ticket-detail')).toBeTruthy();
    expect(screen.queryByTestId('ticket-live-status')).toBeNull();
    expect(screen.queryByText(/tempo real/i)).toBeNull();
  });
});

describe('leitura com sessão e em primeiro plano', () => {
  it('sem sessão não faz nenhuma chamada', async () => {
    const { getEvents } = liveApi();
    mockSession.current = null;
    render(tree(<Status />));
    await advance(10_000);
    expect(getEvents).not.toHaveBeenCalled();
    expect(realtimeText()).toBe('false:connecting');
  });

  it('um evento recarrega o resumo e o chamado aberto; outro chamado só recarrega o resumo', async () => {
    const { api, script } = liveApi([feed({ nextCursor: 'c1' })]);
    const getTicket = jest.spyOn(api, 'getTicket');
    const getOverview = jest.spyOn(api, 'getOverview');
    const { items } = await api.listTickets({});
    const ticketId = (items[0] as { id: string }).id;

    render(tree(<Probe ticketId={ticketId} />));
    await advance(0);
    expect(realtimeText()).toBe('true:live');
    expect(getTicket).toHaveBeenCalledTimes(1);
    expect(getOverview).toHaveBeenCalledTimes(1);

    script.push(feed({ nextCursor: 'c2', events: [ticketEvent('e1', ticketId)] }));
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(getTicket).toHaveBeenCalledTimes(2);
    expect(getOverview).toHaveBeenCalledTimes(2);

    script.push(feed({ nextCursor: 'c3', events: [ticketEvent('e2', 'outro-chamado')] }));
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(getTicket).toHaveBeenCalledTimes(2);
    expect(getOverview).toHaveBeenCalledTimes(3);

    // o mesmo evento de novo (entrega "ao menos uma vez") não recarrega nada
    script.push(feed({ nextCursor: 'c4', events: [ticketEvent('e2', 'outro-chamado')] }));
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(getOverview).toHaveBeenCalledTimes(3);
  });

  it('`resyncRequired` recarrega tudo o que está aberto', async () => {
    const { api, script } = liveApi([feed({ nextCursor: 'c1' })]);
    const getTicket = jest.spyOn(api, 'getTicket');
    const getOverview = jest.spyOn(api, 'getOverview');
    const { items } = await api.listTickets({});
    render(tree(<Probe ticketId={(items[0] as { id: string }).id} />));
    await advance(0);
    script.push(feed({ nextCursor: 'c2', resyncRequired: true }));
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(getTicket).toHaveBeenCalledTimes(2);
    expect(getOverview).toHaveBeenCalledTimes(2);
  });

  it('segundo plano pausa e aborta; a volta lê do cursor salvo com wait=0 e recarrega', async () => {
    const { api, getEvents, signals, script } = liveApi([feed({ nextCursor: 'c1' })]);
    const getOverview = jest.spyOn(api, 'getOverview');
    render(tree(<Probe />));
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(getEvents).toHaveBeenCalledTimes(2);
    expect(getEvents.mock.calls[1]?.[0]).toEqual({ since: 'c1', wait: 25 });

    sendAppState('background');
    expect(signals[1]?.aborted).toBe(true);
    await advance(120_000);
    expect(getEvents).toHaveBeenCalledTimes(2);

    const before = getOverview.mock.calls.length;
    script.push(feed({ nextCursor: 'c2' }));
    sendAppState('active');
    await advance(0);
    expect(getEvents.mock.calls[2]?.[0]).toEqual({ since: 'c1', wait: 0 });
    expect(getOverview.mock.calls.length).toBe(before + 1);
  });

  it('sem rede mostra "offline" e não lê até a conexão voltar', async () => {
    networkMock.getNetworkStateAsync.mockResolvedValue({ isConnected: false, isInternetReachable: false, type: 'NONE' });
    const { getEvents } = liveApi();
    render(tree(<Status />));
    await advance(0);
    expect(realtimeText()).toBe('true:offline');
    await advance(30_000);
    expect(getEvents.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe('linha de estado no detalhe do chamado', () => {
  async function renderDetail(script: (SupportEventFeed | Error)[]) {
    const { api } = liveApi(script);
    const { items } = await api.listTickets({});
    render(
      <NavigationProvider>
        <SupportRealtimeProvider>
          <TicketDetailScreen ticketId={(items[0] as { id: string }).id} />
        </SupportRealtimeProvider>
      </NavigationProvider>,
    );
    await advance(0);
  }

  it('recebendo: diz que há atualizações automáticas, sem prometer tempo real e sem horário', async () => {
    await renderDetail([feed({ nextCursor: 'c1' })]);
    const line = screen.getByTestId('ticket-live-status');
    expect(line.props.accessibilityLabel).toBe('Atualizações automáticas ativas');
    expect(screen.queryByText(/tempo real/i)).toBeNull();
    expect(screen.queryByText(/Última atualização:/)).toBeNull();
  });

  it('com falha: mostra "Reconectando" e a hora da última atualização', async () => {
    await renderDetail([new ApiClientError({ kind: 'server', status: 500, message: 'Error 500' })]);
    expect(screen.getByTestId('ticket-live-status').props.accessibilityLabel).toMatch(/^Reconectando · Última atualização: .*\d{2}:\d{2}$/);
    expect(screen.queryByText(/500/)).toBeNull();
  });
});

describe('logout e troca de conta', () => {
  it('logout para a leitura, aborta a chamada, esquece o cursor e apaga o cache do aparelho', async () => {
    const { getEvents, signals } = liveApi([feed({ nextCursor: 'c-a' })]);
    const view = render(tree(<Status />));
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    expect(getEvents).toHaveBeenCalledTimes(2);
    writeCache('user-a', 'overview', { secret: 'dados da conta A' });
    await advance(0);
    expect(await AsyncStorage.getAllKeys()).toEqual(expect.arrayContaining([`${SUPPORT.CACHE_KEY_PREFIX}:user-a:overview`]));

    mockSession.current = { user: null };
    view.rerender(tree(<Status />));
    expect(signals[1]?.aborted).toBe(true);
    await advance(0);

    expect(peekCache('user-a', 'overview')).toBeNull();
    const left = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(SUPPORT.CACHE_KEY_PREFIX));
    expect(left).toEqual([]);
    await advance(120_000);
    expect(getEvents).toHaveBeenCalledTimes(2);
  });

  it('resposta que chega depois do logout não volta a gravar no cache', async () => {
    liveApi([feed({ nextCursor: 'c-a' })]);
    const view = render(tree(<Status />));
    await advance(0);
    mockSession.current = { user: null };
    view.rerender(tree(<Status />));
    await advance(0);

    writeCache('user-a', 'tickets:all:', { items: ['tardio'] });
    expect(peekCache('user-a', 'tickets:all:')).toBeNull();
    expect(await readCache('user-a', 'tickets:all:')).toBeNull();
    expect((await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(SUPPORT.CACHE_KEY_PREFIX))).toEqual([]);
  });

  it('desmontar a área autenticada tem o mesmo efeito do logout', async () => {
    const { signals } = liveApi([feed({ nextCursor: 'c-a' })]);
    const view = render(tree(<Status />));
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    writeCache('user-a', 'overview', { value: 1 });
    view.unmount();
    expect(signals[1]?.aborted).toBe(true);
    expect(peekCache('user-a', 'overview')).toBeNull();
  });

  it('o pedido de sair já para a leitura, antes do logout remoto terminar', async () => {
    const { getEvents, signals } = liveApi([feed({ nextCursor: 'c-a' })]);
    const view = render(tree(<Status />));
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    mockSession.current = { user: { id: 'user-a' }, signingOut: true };
    view.rerender(tree(<Status />));
    expect(signals[1]?.aborted).toBe(true);
    expect(realtimeText()).toBe('false:connecting');
    await advance(60_000);
    expect(getEvents).toHaveBeenCalledTimes(2);
  });

  it('outra conta recomeça sem cursor e não vê o cache da anterior', async () => {
    const { getEvents, script } = liveApi([feed({ nextCursor: 'c-a' })]);
    const view = render(tree(<Status />));
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);
    writeCache('user-a', 'overview', { value: 'conta A' });

    script.push(feed({ nextCursor: 'c-b' }));
    mockSession.current = { user: { id: 'user-b' } };
    view.rerender(tree(<Status />));
    await advance(SUPPORT.EVENTS_MIN_INTERVAL_MS);

    const calls = getEvents.mock.calls.map(([params]) => params.since ?? null);
    expect(calls[calls.indexOf('c-a') + 1]).toBeNull();
    expect(peekCache('user-a', 'overview')).toBeNull();
    expect(peekCache('user-b', 'overview')).toBeNull();
  });

  it('ao entrar, o que sobrou de outra conta no aparelho é apagado', async () => {
    liveApi();
    setSupportCacheOwner('user-z');
    writeCache('user-z', 'overview', { value: 'conta Z' });
    await advance(0);
    render(tree(<Status />));
    await advance(0);
    const left = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(`${SUPPORT.CACHE_KEY_PREFIX}:user-z`));
    expect(left).toEqual([]);
    expect(peekCache('user-z', 'overview')).toBeNull();
  });
});
