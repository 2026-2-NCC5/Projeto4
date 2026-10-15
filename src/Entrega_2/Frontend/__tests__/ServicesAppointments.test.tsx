import AsyncStorage from '@react-native-async-storage/async-storage';
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { resetPlatformInfoForTests, setPlatformInfoForTests } from '../features/platform';
import { clearSupportMemoryCache } from '../features/support/cache';
import { NavigationProvider, useAppNavigation } from '../navigation/AppNavigator';
import { ServicesScreen } from '../screens/ServicesScreen';
import { configureApiClient, resetApiClientForTests } from '../services/apiClient';

import { makeAppointment, makePlatformInfo, ok, routedFetch } from './support/platformFixtures';

jest.mock('../services/studentService', () => ({
  studentService: { getSummary: async () => null, getSubjects: async () => [], getPendingItems: async () => [], getAssessments: async () => [] },
}));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true, useSystemReduceMotion: () => true }));

configure({ asyncUtilTimeout: 10_000 });

function Harness() {
  const navigation = useAppNavigation();
  return navigation.detail ? <Text testID="route">{navigation.detail.screen}</Text> : <ServicesScreen />;
}

function renderServices(upcoming = [makeAppointment()]) {
  const router = routedFetch({
    'GET /api/support/notifications': () => ok({ items: [], unreadCount: 0 }),
    'GET /api/appointments': () => ok({ items: upcoming }),
  });
  configureApiClient({ baseUrl: 'http://api.test', getAccessToken: () => 'token', fetchFn: router.fn as unknown as typeof fetch });
  render(
    <NavigationProvider initialState={{ tab: 'services' }}>
      <Harness />
    </NavigationProvider>,
  );
  return router;
}

beforeEach(async () => {
  clearSupportMemoryCache();
  await AsyncStorage.clear();
});

afterEach(() => {
  resetApiClientForTests();
  resetPlatformInfoForTests();
});

describe('Serviços — agendamentos', () => {
  it('sem agendamento ativo: a entrada "Agendar atendimento" abre "Meus agendamentos"', async () => {
    setPlatformInfoForTests(makePlatformInfo());
    renderServices([]);
    expect(await screen.findByText('Agendar atendimento')).toBeTruthy();
    fireEvent.press(screen.getByTestId('service-appointments'));
    expect(screen.getByTestId('route').props.children).toBe('appointments');
  });

  it('com um próximo atendimento, a entrada vira "Meus agendamentos"', async () => {
    setPlatformInfoForTests(makePlatformInfo());
    renderServices();
    expect(await screen.findByText('Meus agendamentos')).toBeTruthy();
    expect(screen.getByText('Próximo: sex, 16 out · 10:00 · Documentos.')).toBeTruthy();
  });

  it('features.appointments = false: a entrada some e nada é buscado', async () => {
    setPlatformInfoForTests(makePlatformInfo({ features: { ...makePlatformInfo().features, appointments: false } }));
    const api = renderServices();
    await screen.findByTestId('service-support');
    await waitFor(() => expect(api.find('GET', '/api/support/notifications')).toHaveLength(1));
    expect(screen.queryByTestId('service-appointments')).toBeNull();
    expect(api.find('GET', '/api/appointments')).toHaveLength(0);
  });
});
