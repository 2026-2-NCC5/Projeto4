import { render } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { addInboxPushListener } from '../features/notifications/push';
import { NavigationProvider, useAppNavigation } from '../navigation/AppNavigator';
import { NotificationsPushRouter } from '../screens/NotificationsPushRouter';

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
  const { detail } = useAppNavigation();
  const label = !detail ? 'none' : detail.screen === 'appointment' ? `appointment:${detail.id}` : detail.screen === 'support-ticket' ? `ticket:${detail.id}` : detail.screen;
  return <Text testID="route">{label}</Text>;
}

beforeEach(() => {
  mockState.listener = null;
  mockState.last = null;
  notifications.clearLastNotificationResponse.mockClear();
});

describe('push da central de avisos', () => {
  it('toque em aviso de agendamento abre o detalhe; aviso sem registro abre a central; outros pushes são ignorados', () => {
    const screen = render(
      <NavigationProvider>
        <NotificationsPushRouter />
        <CurrentRoute />
      </NavigationProvider>,
    );
    mockState.listener?.(response({ type: 'support_ticket', ticketId: 't-1' }));
    mockState.listener?.(response({ screen: 'queue', milestone: 'QUEUE_CALLED' }));
    expect(screen.getByTestId('route').props.children).toBe('none');

    React.act(() => mockState.listener?.(response({ type: 'inbox', category: 'appointment', resourceType: 'appointment', resourceId: 'appt-42' })));
    expect(screen.getByTestId('route').props.children).toBe('appointment:appt-42');

    React.act(() => mockState.listener?.(response({ type: 'inbox', category: 'support', resourceType: 'ticket', resourceId: 'ticket-9' })));
    expect(screen.getByTestId('route').props.children).toBe('ticket:ticket-9');

    React.act(() => mockState.listener?.(response({ type: 'inbox', category: 'system' })));
    expect(screen.getByTestId('route').props.children).toBe('notifications');
    screen.unmount();
    expect(mockState.listener).toBeNull();
  });

  it('início a frio: abre o aviso que abriu o app e limpa só o próprio toque', () => {
    const opened: string[] = [];
    mockState.last = response({ type: 'inbox', category: 'appointment', resourceType: 'appointment', resourceId: 'appt-7' });
    const remove = addInboxPushListener((target) => opened.push(target.kind === 'appointment' ? target.id : target.kind));
    expect(opened).toEqual(['appt-7']);
    expect(notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
    remove();

    mockState.last = response({ type: 'support_ticket', ticketId: 't-1' });
    addInboxPushListener((target) => opened.push(target.kind))();
    expect(opened).toEqual(['appt-7']);
    expect(notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1); // o de chamado é do roteador do Atendimento
  });
});
