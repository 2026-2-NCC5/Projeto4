import AsyncStorage from '@react-native-async-storage/async-storage';
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import React from 'react';

import App from '../App';
import { clearSupportMemoryCache, peekCache } from '../features/support/cache';
import { SUPPORT } from '../features/support/config';
import { resetPlatformInfoForTests } from '../features/platform';

import { errorEnvelope, fakeResponse, okEnvelope } from './support/fakeFetch';
import { demoSession, summaryFixture } from './support/fixtures';

configure({ asyncUtilTimeout: 10_000 });
jest.setTimeout(45_000);

const originalFetch = global.fetch;
const OVERVIEW = { activeCount: 0, waitingStudentCount: 0, unreadMessagesCount: 0, unreadNotificationsCount: 0, highlight: null };
const FEED = { events: [], nextCursor: 'cursor-1', hasMore: false, resyncRequired: false, serverTime: '2026-11-02T12:00:00.000Z' };

interface FeedCall {
  url: string;
  signal: AbortSignal;
  authorization: string | undefined;
}

const supportKeys = async () => (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(`${SUPPORT.CACHE_KEY_PREFIX}:`));

async function signIn(email: string) {
  await screen.findByText('Bem-vindo ao ASA');
  fireEvent.changeText(screen.getByLabelText('E-mail'), email);
  fireEvent.changeText(screen.getByLabelText('Senha'), 'Demo@2026');
  fireEvent.press(screen.getByLabelText('Entrar na sua conta'));
  await screen.findByTestId('home-greeting');
}

/** App inteiro com a API falsa: confirma que a leitura está ligada à sessão de verdade, do login ao logout. */
describe('atualizações do Atendimento no app inteiro', () => {
  let feedCalls: FeedCall[];
  let session = demoSession;
  let releaseLogout: () => void;

  beforeEach(async () => {
    feedCalls = [];
    session = demoSession;
    releaseLogout = () => undefined;
    clearSupportMemoryCache();
    await AsyncStorage.clear();
    await SecureStore.deleteItemAsync('asa.auth.refreshToken');
    await SecureStore.deleteItemAsync('asa.auth.profile');
    resetPlatformInfoForTests();
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/auth/login')) return fakeResponse(200, okEnvelope(session));
      if (url.endsWith('/api/auth/logout')) return new Promise((resolve) => (releaseLogout = () => resolve(fakeResponse(204, undefined))));
      if (url.includes('/api/support/me/events')) {
        const signal = init?.signal as AbortSignal;
        feedCalls.push({ url, signal, authorization: (init?.headers as Record<string, string>).Authorization });
        if (!url.includes('since=')) return fakeResponse(200, okEnvelope(FEED));
        // o long polling fica pendente até o servidor responder ou a chamada ser abortada
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))));
      }
      if (url.endsWith('/api/support/overview')) return fakeResponse(200, okEnvelope(OVERVIEW));
      if (url.endsWith('/api/student/summary')) return fakeResponse(200, okEnvelope(summaryFixture));
      if (url.endsWith('/api/student/subjects') || url.endsWith('/api/student/pending-items') || url.endsWith('/api/student/assessments')) return fakeResponse(200, okEnvelope([]));
      if (url.endsWith('/api/student/me')) return fakeResponse(200, okEnvelope({ id: 's', userId: 'u', fullName: 'Maria Silva Souza', email: 'e@x.y', role: 'student', registrationNumber: '1', program: null }));
      return fakeResponse(404, errorEnvelope('NOT_FOUND', 'x'));
    }) as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('lê com a sessão, para ao pedir para sair, apaga o cache e recomeça do zero na conta seguinte', async () => {
    render(<App />);
    expect(feedCalls).toHaveLength(0);

    await signIn('estudante.exemplo@demo.asa');
    await waitFor(() => expect(feedCalls).toHaveLength(2));
    expect(feedCalls[0]?.url).toMatch(/\/api\/support\/me\/events\?wait=0$/);
    expect(feedCalls[1]?.url).toMatch(/\/api\/support\/me\/events\?since=cursor-1&wait=25$/);
    expect(feedCalls[1]?.authorization).toBe(`Bearer ${demoSession.accessToken}`);
    expect(feedCalls[1]?.signal.aborted).toBe(false);

    const accountKey = `${SUPPORT.CACHE_KEY_PREFIX}:${demoSession.user.id}:overview`;
    await waitFor(async () => expect(await supportKeys()).toContain(accountKey));

    // Sair: a leitura para na hora, ainda com o logout remoto em andamento.
    fireEvent.press(screen.getByLabelText('Perfil, aba'));
    fireEvent.press(await screen.findByLabelText('Sair da conta'));
    await waitFor(() => expect(feedCalls[1]?.signal.aborted).toBe(true));
    expect(screen.getByTestId('authenticated-area')).toBeTruthy();

    releaseLogout();
    await screen.findByText('Bem-vindo ao ASA');
    await waitFor(async () => expect(await supportKeys()).toEqual([]));
    expect(peekCache(demoSession.user.id, 'overview')).toBeNull();

    // Nada de novas chamadas sem sessão, mesmo depois do intervalo entre leituras.
    const before = feedCalls.length;
    await new Promise((resolve) => setTimeout(resolve, SUPPORT.EVENTS_MIN_INTERVAL_MS + 200));
    expect(feedCalls).toHaveLength(before);

    // Outra conta no mesmo aparelho: sem o cursor da anterior.
    session = { ...demoSession, accessToken: 'access-token-conta-b', user: { ...demoSession.user, id: 'user-conta-b' } };
    await signIn('outra.conta@demo.asa');
    await waitFor(() => expect(feedCalls.length).toBeGreaterThan(before));
    expect(feedCalls[before]?.url).toMatch(/\/api\/support\/me\/events\?wait=0$/);
    expect(feedCalls[before]?.authorization).toBe('Bearer access-token-conta-b');
    await waitFor(() => expect(feedCalls.length).toBeGreaterThan(before + 1));
    await waitFor(async () => expect(await supportKeys()).toContain(`${SUPPORT.CACHE_KEY_PREFIX}:user-conta-b:overview`));
    expect((await supportKeys()).filter((key) => key.includes(demoSession.user.id))).toEqual([]);
  });
});
