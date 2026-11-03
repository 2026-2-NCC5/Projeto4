import AsyncStorage from '@react-native-async-storage/async-storage';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';

import { setSupportApi } from '../features/support/api';
import { createMockSupportApi } from '../features/support/api/mockSupportApi';
import type { SupportApi } from '../features/support/api/types';
import { realtimeStatusLine } from '../components/tickets';
import { clearSupportMemoryCache } from '../features/support/cache';
import { CHANNEL_LABELS, DETAILED_FILTERS, findFilter, PRIMARY_FILTERS } from '../features/support/labels';
import { NavigationProvider } from '../navigation/AppNavigator';
import { SupportHomeSection } from '../screens/support/SupportHomeSection';
import { TicketDetailScreen } from '../screens/support/TicketDetailScreen';
import { TicketsScreen } from '../screens/support/TicketsScreen';
import type { SupportTicket, SupportTicketMessage } from '../types/api';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true, useSystemReduceMotion: () => true }));

configure({ asyncUtilTimeout: 10_000 });
jest.setTimeout(45_000);

let api: SupportApi;
let base: SupportTicket;

function message(overrides: Partial<SupportTicketMessage>): SupportTicketMessage {
  return { id: 'msg-1', senderType: 'agent', senderName: 'Equipe ASA', content: 'Recebemos o seu documento.', createdAt: '2026-11-01T12:00:00.000Z', readAt: '2026-11-01T12:05:00.000Z', attachments: [], ...overrides };
}

function renderTicket(overrides: Partial<SupportTicket>) {
  const ticket: SupportTicket = { ...base, unreadCount: 0, ...overrides };
  jest.spyOn(api, 'getTicket').mockResolvedValue(ticket);
  return render(
    <NavigationProvider>
      <TicketDetailScreen ticketId={ticket.id} />
    </NavigationProvider>,
  );
}

beforeEach(async () => {
  clearSupportMemoryCache();
  await AsyncStorage.clear();
  api = createMockSupportApi({ latencyMs: 0 });
  setSupportApi(api);
  const list = await api.listTickets({});
  const active = list.items.find((item) => item.status === 'in_analysis') ?? list.items[0];
  base = await api.getTicket((active as { id: string }).id);
});

afterEach(() => jest.restoreAllMocks());
afterAll(() => setSupportApi(null));

describe('chamado aberto pelo WhatsApp', () => {
  it('mostra a origem e a nota de que a atualização não significa entrega no WhatsApp', async () => {
    renderTicket({ channel: 'whatsapp' });
    const note = await screen.findByTestId('ticket-whatsapp-note');
    expect(within(note).getByText(/começou pelo WhatsApp/)).toBeTruthy();
    expect(within(note).getByText(/são da equipe do ASA e não significam que uma mensagem chegou ao seu WhatsApp/)).toBeTruthy();
    const origin = screen.getByTestId('ticket-origin');
    expect(within(origin).getByText('Origem')).toBeTruthy();
    expect(within(origin).getByText('WhatsApp')).toBeTruthy();
  });

  it('sem nenhuma mensagem visível: é um estado esperado, com o histórico na tela', async () => {
    renderTicket({ channel: 'whatsapp', messages: [], canReply: false });
    const empty = await screen.findByTestId('ticket-no-messages');
    expect(within(empty).getByText(/A conversa deste atendimento fica no WhatsApp e não aparece aqui/)).toBeTruthy();
    expect(screen.queryByText('Nenhuma mensagem neste chamado.')).toBeNull();
    expect(screen.queryByText('Converse com a equipe sobre este chamado.')).toBeNull();
    expect(screen.queryByTestId('ticket-error')).toBeNull();
    expect(screen.getByTestId('ticket-timeline')).toBeTruthy();
    expect(screen.getByTestId('ticket-latest')).toBeTruthy();
  });

  it('sem mensagens, podendo responder: também explica que dá para escrever à equipe', async () => {
    renderTicket({ channel: 'whatsapp', messages: [], canReply: true });
    const empty = await screen.findByTestId('ticket-no-messages');
    expect(within(empty).getByText(/você também pode escrever para a equipe/)).toBeTruthy();
  });

  it('mensagem espelhada leva o rótulo "via WhatsApp"; a conversa no app não', async () => {
    renderTicket({
      channel: 'whatsapp',
      messages: [
        message({ id: 'msg-wa', senderType: 'student', senderName: 'Você', content: 'Enviei pelo WhatsApp', transport: 'whatsapp' }),
        message({ id: 'msg-app', content: 'Resposta no app', transport: 'in_app' }),
        message({ id: 'msg-old', content: 'Mensagem antiga, sem o campo' }),
      ],
    });
    expect(await screen.findByTestId('message-msg-wa-via-whatsapp')).toBeTruthy();
    expect(screen.getByTestId('message-msg-wa').props.accessibilityLabel).toContain('via WhatsApp');
    expect(screen.queryByTestId('message-msg-app-via-whatsapp')).toBeNull();
    expect(screen.queryByTestId('message-msg-old-via-whatsapp')).toBeNull();
    expect(screen.getByTestId('message-msg-app').props.accessibilityLabel).not.toContain('WhatsApp');
  });
});

describe('outros canais', () => {
  it.each([
    ['app', 'Aplicativo ASA Conecta'],
    ['web', 'Portal ASA Conecta'],
  ] as const)('origem %s: sem nota do WhatsApp e com o rótulo certo', async (channel, label) => {
    renderTicket({ channel });
    const origin = await screen.findByTestId('ticket-origin');
    expect(within(origin).getByText(label)).toBeTruthy();
    expect(screen.queryByTestId('ticket-whatsapp-note')).toBeNull();
  });

  it('o texto de chamado sem mensagens continua o mesmo fora do WhatsApp', async () => {
    renderTicket({ channel: 'app', messages: [], canReply: false });
    expect(await screen.findByText('Nenhuma mensagem neste chamado.')).toBeTruthy();
  });

  it('todos os canais do contrato têm rótulo', () => {
    expect(CHANNEL_LABELS).toEqual({ app: 'Aplicativo ASA Conecta', web: 'Portal ASA Conecta', whatsapp: 'WhatsApp' });
  });
});

describe('linha de estado das atualizações', () => {
  const now = new Date(2026, 10, 2, 18, 50);
  const at = new Date(2026, 10, 2, 18, 42).getTime();

  it('recebendo: sem horário e sem prometer tempo real', () => {
    expect(realtimeStatusLine('live', at, now)).toBe('Atualizações automáticas ativas');
  });

  it('fora do ar: diz o estado e a última atualização', () => {
    expect(realtimeStatusLine('connecting', at, now)).toBe('Conectando para receber atualizações · Última atualização: Hoje, 18:42');
    expect(realtimeStatusLine('reconnecting', at, now)).toBe('Reconectando · Última atualização: Hoje, 18:42');
    expect(realtimeStatusLine('offline', at, now)).toBe('Sem conexão · Última atualização: Hoje, 18:42');
  });

  it('sem nenhuma atualização ainda, não inventa horário', () => {
    expect(realtimeStatusLine('reconnecting', null, now)).toBe('Reconectando');
    expect(realtimeStatusLine('offline', null, now)).toBe('Sem conexão');
  });
});

describe('Meus chamados', () => {
  it('os filtros principais são Todos, Em andamento, Aguardando você e Resolvidos', async () => {
    expect(PRIMARY_FILTERS.map((item) => item.label)).toEqual(['Todos', 'Em andamento', 'Aguardando você', 'Resolvidos']);
    render(
      <NavigationProvider>
        <TicketsScreen />
      </NavigationProvider>,
    );
    await screen.findByText('Solicitação de declaração de matrícula');
    const chips: [string, string][] = [
      ['all', 'Todos'],
      ['active', 'Em andamento'],
      ['waiting_student', 'Aguardando você'],
      ['resolved', 'Resolvidos'],
    ];
    for (const [key, label] of chips) expect(within(screen.getByTestId(`tickets-filter-${key}`)).getByText(new RegExp(`^${label}`))).toBeTruthy();
  });

  it('"Resolvidos" não inclui chamado cancelado, que continua em "Cancelados"', async () => {
    expect(findFilter('resolved').statuses).toEqual(['resolved', 'closed']);
    expect(DETAILED_FILTERS.find((item) => item.key === 'cancelled')?.statuses).toEqual(['cancelled']);
    render(
      <NavigationProvider>
        <TicketsScreen />
      </NavigationProvider>,
    );
    await screen.findByText('Solicitação de declaração de matrícula');
    fireEvent.press(screen.getByTestId('tickets-filter-resolved'));
    await waitFor(() => expect(screen.queryByText('Solicitação de declaração de matrícula')).toBeNull());
    expect(screen.queryByText('Agendamento de conversa com o ASA')).toBeNull();
    expect(screen.getByTestId('tickets-filter-resolved')).toBeTruthy();
  });

  it('escolher "Resolvidos" na folha de filtros não cria um segundo chip igual', async () => {
    render(
      <NavigationProvider>
        <TicketsScreen />
      </NavigationProvider>,
    );
    await screen.findByText('Solicitação de declaração de matrícula');
    fireEvent.press(screen.getByTestId('tickets-more-filters'));
    fireEvent.press(await screen.findByTestId('filter-resolved'));
    await waitFor(() => expect(screen.queryByText('Solicitação de declaração de matrícula')).toBeNull());
    await waitFor(() => expect(screen.queryByTestId('tickets-filter-sheet')).toBeNull());
    expect(screen.getAllByText('Resolvidos')).toHaveLength(1);
  });
});

describe('Início', () => {
  it('o bloco do Atendimento mostra o chamado em destaque e a contagem dos abertos e pendentes', async () => {
    jest.spyOn(api, 'getOverview').mockResolvedValue({ activeCount: 3, waitingStudentCount: 1, unreadMessagesCount: 0, unreadNotificationsCount: 0, highlight: base });
    render(
      <NavigationProvider>
        <SupportHomeSection />
      </NavigationProvider>,
    );
    expect(await screen.findByTestId('home-support-card')).toBeTruthy();
    expect(screen.getByText('3 em andamento · 1 aguardando você')).toBeTruthy();
    expect(screen.getByText('Meus chamados')).toBeTruthy();
  });

  it('sem chamado relevante o bloco não aparece', async () => {
    const getOverview = jest.spyOn(api, 'getOverview').mockResolvedValue({ activeCount: 0, waitingStudentCount: 0, unreadMessagesCount: 0, unreadNotificationsCount: 0, highlight: null });
    render(
      <NavigationProvider>
        <SupportHomeSection />
      </NavigationProvider>,
    );
    await waitFor(() => expect(getOverview).toHaveBeenCalled());
    expect(screen.queryByTestId('home-support-card')).toBeNull();
    expect(screen.queryByText('Meus chamados')).toBeNull();
  });
});
