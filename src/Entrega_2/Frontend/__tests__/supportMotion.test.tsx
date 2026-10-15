import AsyncStorage from '@react-native-async-storage/async-storage';
import { configure, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo } from 'react-native';

import { setSupportApi } from '../features/support/api';
import { createMockSupportApi } from '../features/support/api/mockSupportApi';
import { clearSupportMemoryCache } from '../features/support/cache';
import { useSupportMotion } from '../features/support/motion';
import { NavigationProvider } from '../navigation/AppNavigator';
import { SupportRouter } from '../screens/support/SupportRouter';
import type { SupportRoute } from '../types/ui';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

// Fluxos com várias telas: com a máquina saturada (várias suítes/sessões em paralelo) um render pode levar segundos.
// As esperas terminam assim que a tela fica pronta; o limite maior só evita falso negativo sob carga.
configure({ asyncUtilTimeout: 10_000 });
jest.setTimeout(45_000);

const renderRoute = (route: SupportRoute) =>
  render(
    <NavigationProvider initialState={{ detail: route }}>
      <SupportRouter route={route} />
    </NavigationProvider>,
  );

let reduceMotion = false;

beforeEach(async () => {
  clearSupportMemoryCache();
  await AsyncStorage.clear();
  setSupportApi(createMockSupportApi({ latencyMs: 0 }));
  reduceMotion = false;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(async () => reduceMotion);
});

afterEach(() => jest.restoreAllMocks());
afterAll(() => setSupportApi(null));

describe('movimento do Atendimento', () => {
  it('vocabulário: 150/220/320 ms e stagger curto; com "Reduzir movimento" tudo vira instantâneo', async () => {
    const normal = renderHook(() => useSupportMotion());
    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());
    expect(normal.result.current.reduce).toBe(false);
    expect(normal.result.current.timing(320).duration).toBe(320);
    expect(normal.result.current.timing().duration).toBe(220);
    expect(normal.result.current.stagger(2)).toBe(80);
    expect(normal.result.current.stagger(50)).toBe(320); // listas longas não esperam

    reduceMotion = true;
    const reduced = renderHook(() => useSupportMotion());
    await waitFor(() => expect(reduced.result.current.reduce).toBe(true));
    expect(reduced.result.current.timing(320).duration).toBe(0);
    expect(reduced.result.current.stagger(5)).toBe(0);
  });

  it.each([false, true])('telas animadas renderizam sem travar (reduzir movimento: %s)', async (reduce) => {
    reduceMotion = reduce;
    const tickets = await createMockSupportApi({ latencyMs: 0 }).listTickets({});
    expect(tickets.items.length).toBeGreaterThan(0);

    renderRoute({ screen: 'support-tickets' });
    expect(await screen.findByText('Pagamento ainda não consta no sistema')).toBeTruthy();
    screen.unmount();

    renderRoute({ screen: 'support-new' });
    expect(await screen.findByTestId('step-indicator')).toBeTruthy();
    screen.unmount();
  });
});
