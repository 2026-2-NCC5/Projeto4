import { render } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { addSupportPushListener, supportTicketIdFromPush } from '../features/support/push';
import { NavigationProvider, useAppNavigation } from '../navigation/AppNavigator';
import { SupportPushRouter } from '../screens/support/SupportPushRouter';

type Response = { notification: { request: { content: { data: unknown } } } } | null;

const mockState: { listener: ((response: NonNullable<Response>) => void) | null; last: Response } = { listener: null, last: null };

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest.fn((listener: (response: unknown) => void) => {
    mockState.listener = listener as never;
    return { remove: jest.fn(() => (mockState.listener = null)) };
  }),
  getLastNotificationResponse: jest.fn(() => mockState.last),
  clearLastNotificationResponse: jest.fn(() => (mockState.last = null)),
}));

const notifications = jest.requireMock('expo-notifications') as { clearLastNotificationResponse: jest.Mock };
const response = (data: unknown): NonNullable<Response> => ({ notification: { request: { content: { data } } } });

function CurrentRoute() {
  const navigation = useAppNavigation();
  return <Text testID="route">{navigation.detail?.screen === 'support-ticket' ? navigation.detail.id : 'none'}</Text>;
}

beforeEach(() => {
  mockState.listener = null;
  mockState.last = null;
  notifications.clearLastNotificationResponse.mockClear();
});

describe('push de chamados', () => {
  it('reconhece só o payload de chamado', () => {
    expect(supportTicketIdFromPush({ type: 'support_ticket', ticketId: 't-1', kind: 'new_message' })).toBe('t-1');
    expect(supportTicketIdFromPush({ screen: 'queue' })).toBeNull();
    expect(supportTicketIdFromPush({ type: 'support_ticket' })).toBeNull();
    expect(supportTicketIdFromPush(null)).toBeNull();
  });

  it('toque com o app aberto abre o chamado; toque de outra notificação é ignorado', () => {
    const screen = render(
      <NavigationProvider>
        <SupportPushRouter />
        <CurrentRoute />
      </NavigationProvider>,
    );
    expect(screen.getByTestId('route').props.children).toBe('none');
    mockState.listener?.(response({ screen: 'queue', milestone: 'QUEUE_CALLED' }));
    expect(screen.getByTestId('route').props.children).toBe('none');
    // act implícito: o dispatch de navegação acontece no callback do listener
    React.act(() => mockState.listener?.(response({ type: 'support_ticket', ticketId: 'ticket-42' })));
    expect(screen.getByTestId('route').props.children).toBe('ticket-42');
    screen.unmount();
    expect(mockState.listener).toBeNull();
  });

  it('início a frio: abre o chamado do toque que abriu o app e limpa só o próprio toque', () => {
    const opened: string[] = [];
    mockState.last = response({ type: 'support_ticket', ticketId: 'ticket-7' });
    const remove = addSupportPushListener((id) => opened.push(id));
    expect(opened).toEqual(['ticket-7']);
    expect(notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
    remove();

    mockState.last = response({ screen: 'queue' });
    addSupportPushListener((id) => opened.push(id))();
    expect(opened).toEqual(['ticket-7']);
    expect(notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1); // o da fila não é limpo aqui
  });
});
