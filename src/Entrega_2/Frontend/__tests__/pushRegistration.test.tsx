import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockRequest = jest.fn();
const mockPermission = { current: 'undetermined' as 'granted' | 'denied' | 'undetermined' | 'unavailable' };
const mockRequestPermission = jest.fn();

jest.mock('../services/apiClient', () => ({ request: (...args: unknown[]) => mockRequest(...args) }));
jest.mock('../features/queue/services/pushNotifications', () => ({
  pushPlatform: () => 'android',
  getPushPermission: jest.fn(async () => mockPermission.current),
  requestPushPermission: (...args: unknown[]) => mockRequestPermission(...args),
  getExpoPushToken: jest.fn(async () => ({ token: 'ExponentPushToken[abcdefgh12345678]' })),
}));

import { PushOptInCard } from '../features/notifications/PushOptInCard';
import { syncPushRegistration, unregisterPushDevice } from '../features/notifications/pushRegistration';
import { ThemeProvider } from '../theme';

const renderCard = (props: React.ComponentProps<typeof PushOptInCard> = {}) => render(<ThemeProvider><PushOptInCard {...props} /></ThemeProvider>);

describe('push da conta (todas as notificações do app)', () => {
  beforeEach(async () => {
    mockRequest.mockReset().mockResolvedValue(undefined);
    mockRequestPermission.mockReset();
    mockPermission.current = 'undetermined';
    await unregisterPushDevice();
    mockRequest.mockReset().mockResolvedValue(undefined);
  });

  it('sem permissão não registra nem pede nada sozinho', async () => {
    await expect(syncPushRegistration()).resolves.toBe('needs_permission');
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('com permissão registra o aparelho uma vez e remove no logout', async () => {
    mockPermission.current = 'granted';
    await expect(syncPushRegistration()).resolves.toBe('registered');
    await syncPushRegistration();
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith('/api/notifications/push-token', { method: 'POST', body: { token: 'ExponentPushToken[abcdefgh12345678]', platform: 'android' } });
    await unregisterPushDevice();
    expect(mockRequest).toHaveBeenLastCalledWith('/api/notifications/push-token', { method: 'DELETE', body: { token: 'ExponentPushToken[abcdefgh12345678]' } });
  });

  it('cartão: "Ativar notificações" pede a permissão, registra e manda o push de teste', async () => {
    mockRequestPermission.mockImplementation(async () => {
      mockPermission.current = 'granted';
      return 'granted';
    });
    mockRequest.mockImplementation(async (path: string) => (path.endsWith('push-test') ? { status: 'sent', devices: 1 } : undefined));
    const screen = renderCard();
    fireEvent.press(await screen.findByTestId('push-opt-in-enable'));
    await screen.findByTestId('push-opt-in-done');
    expect(mockRequest.mock.calls.map(([path]) => path)).toEqual(['/api/notifications/push-token', '/api/notifications/push-test']);
  });

  it('cartão: bloqueado nas configurações oferece abrir as configurações; já ativo não aparece', async () => {
    mockPermission.current = 'denied';
    const denied = renderCard();
    await denied.findByTestId('push-opt-in-settings');
    denied.unmount();
    mockPermission.current = 'granted';
    const active = renderCard();
    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    expect(active.queryByTestId('push-opt-in')).toBeNull();
  });
});
