import { render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import React from 'react';
import { Text } from 'react-native';

import { SessionProvider, useSession } from '../hooks/useSession';

import { fakeResponse, okEnvelope } from './support/fakeFetch';
import { demoSession } from './support/fixtures';

const originalFetch = global.fetch;

const seen: string[] = [];

function Probe() {
  const { status, user } = useSession();
  seen.push(status);
  if (status === 'booting') return <Text>Splash</Text>;
  if (status === 'unauthenticated') return <Text>Login</Text>;
  return <Text>Protegido: {user?.fullName}</Text>;
}

describe('SessionProvider', () => {
  beforeEach(async () => {
    seen.length = 0;
    global.fetch = jest.fn(async (url: string) => {
      if (String(url).endsWith('/api/auth/refresh')) return fakeResponse(200, okEnvelope({ ...demoSession, accessToken: 'restored-access', refreshToken: 'restored-refresh' }));
      return fakeResponse(404, { error: { code: 'NOT_FOUND', message: 'x', requestId: 'r', correlationId: 'c' } });
    }) as unknown as typeof fetch;
    await SecureStore.deleteItemAsync('asa.auth.refreshToken');
    await SecureStore.deleteItemAsync('asa.auth.profile');
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('boot sem sessão → unauthenticated, passando por booting', async () => {
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByText('Splash')).toBeTruthy();
    expect(screen.queryByText(/Protegido/)).toBeNull();
    await waitFor(() => expect(screen.getByText('Login')).toBeTruthy());
    expect(seen[0]).toBe('booting');
    expect(seen).not.toContain('authenticated');
  });

  it('boot com sessão armazenada → authenticated sem renderizar conteúdo privado durante booting', async () => {
    await SecureStore.setItemAsync('asa.auth.refreshToken', demoSession.refreshToken);
    await SecureStore.setItemAsync('asa.auth.profile', JSON.stringify({ user: demoSession.user, student: demoSession.student, rememberMe: true }));

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByText('Splash')).toBeTruthy();
    expect(screen.queryByText(/Protegido/)).toBeNull();
    await waitFor(() => expect(screen.getByText('Protegido: Maria Silva Souza')).toBeTruthy());
    expect(seen[0]).toBe('booting');
    expect(seen).not.toContain('unauthenticated');
  });
});
