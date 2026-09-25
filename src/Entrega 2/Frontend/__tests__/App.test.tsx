import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import React from 'react';

import App from '../App';
import { MESSAGES } from '../utils/messages';

import { errorEnvelope, fakeResponse, okEnvelope } from './support/fakeFetch';
import { demoSession, makeAnalysis, summaryFixture } from './support/fixtures';

const originalFetch = global.fetch;

/** Sessão "lembrada": só o refresh token + perfil ficam no armazenamento seguro (o access token vive em memória). */
async function seedSession() {
  await SecureStore.setItemAsync('asa.auth.refreshToken', demoSession.refreshToken);
  await SecureStore.setItemAsync('asa.auth.profile', JSON.stringify({ user: demoSession.user, student: demoSession.student, rememberMe: true }));
}

const refreshed = (accessToken = 'restored-access', refreshToken = 'restored-refresh') => fakeResponse(200, okEnvelope({ ...demoSession, accessToken, refreshToken }));

function studentEndpoints(url: string) {
  if (url.endsWith('/api/student/summary')) return fakeResponse(200, okEnvelope(summaryFixture));
  if (url.endsWith('/api/student/subjects') || url.endsWith('/api/student/pending-items') || url.endsWith('/api/student/assessments')) return fakeResponse(200, okEnvelope([]));
  return null;
}

describe('App (fluxo integrado)', () => {
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await SecureStore.deleteItemAsync('asa.auth.refreshToken');
    await SecureStore.deleteItemAsync('asa.auth.profile');
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('sem sessão: splash acessível e depois tela de login, sem conteúdo protegido', async () => {
    render(<App />);
    expect(screen.getByLabelText(MESSAGES.loadingSession)).toBeTruthy();
    expect(screen.queryByTestId('authenticated-area')).toBeNull();
    await screen.findByText('Bem-vindo ao ASA');
    expect(screen.queryByTestId('authenticated-area')).toBeNull();
  });

  it('login com sucesso entra na área autenticada; sair volta ao login', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/login')) return fakeResponse(200, okEnvelope(demoSession));
      const student = studentEndpoints(url);
      if (student) return student;
      if (url.endsWith('/api/auth/logout')) return fakeResponse(204, undefined);
      if (url.endsWith('/api/student/me')) {
        return fakeResponse(200, okEnvelope({ id: 's', userId: 'u', fullName: 'Maria Silva Souza', email: 'e@x.y', role: 'student', registrationNumber: '1', program: null }));
      }
      return fakeResponse(404, errorEnvelope('NOT_FOUND', 'x'));
    });
    render(<App />);
    await screen.findByText('Bem-vindo ao ASA');
    fireEvent.changeText(screen.getByLabelText('E-mail'), 'estudante.exemplo@demo.asa');
    fireEvent.changeText(screen.getByLabelText('Senha'), 'Demo@2026');
    fireEvent.press(screen.getByLabelText('Entrar na sua conta'));
    await screen.findByTestId('home-greeting');
    expect(screen.getByText(/, Maria$/)).toBeTruthy();
    const loginCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/auth/login')) as [string, RequestInit];
    expect(JSON.parse(String(loginCall[1].body))).toEqual({ email: 'estudante.exemplo@demo.asa', password: 'Demo@2026', rememberMe: false });
    // A API respondeu rememberMe=true: só o refresh token é persistido; o access token nunca vai para o armazenamento.
    expect(await SecureStore.getItemAsync('asa.auth.refreshToken')).toBe(demoSession.refreshToken);
    expect(await SecureStore.getItemAsync('asa.session.accessToken')).toBeNull();

    fireEvent.press(screen.getByLabelText('Perfil, aba'));
    await screen.findByLabelText('Sair da conta');
    fireEvent.press(screen.getByLabelText('Sair da conta'));
    await screen.findByText('Bem-vindo ao ASA');
    expect(await SecureStore.getItemAsync('asa.auth.refreshToken')).toBeNull();
    expect(screen.queryByText(MESSAGES.errorUnauthorized)).toBeNull();
  });

  it('401 não recuperável na área autenticada encerra a sessão e avisa na tela de login', async () => {
    await seedSession();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/auth/refresh')) return refreshed();
      const student = studentEndpoints(url);
      if (student) return student;
      if (url.endsWith('/api/agent/recommendations')) {
        return fakeResponse(401, errorEnvelope('UNAUTHORIZED', 'Sessão encerrada.', { reason: 'session_revoked' }));
      }
      return fakeResponse(404, errorEnvelope('NOT_FOUND', 'x'));
    });
    render(<App />);
    await screen.findByTestId('home-greeting');
    fireEvent.press(screen.getByLabelText('Assistente, aba'));
    fireEvent.press(await screen.findByLabelText('Análise completa'));
    await screen.findByText(MESSAGES.errorUnauthorized);
    expect(screen.getByText('Bem-vindo ao ASA')).toBeTruthy();
    expect(screen.queryByTestId('authenticated-area')).toBeNull();
    expect(await SecureStore.getItemAsync('asa.auth.refreshToken')).toBeNull();
  });

  it('401 token_expired faz refresh (rotativo) e mantém o usuário logado', async () => {
    await seedSession();
    let summaryCalls = 0;
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/auth/refresh')) {
        refreshCalls += 1;
        const body = JSON.parse(String(init?.body)) as { refreshToken: string };
        // 1º refresh: restauração no boot; 2º: renovação após token_expired (token rotacionado).
        expect(body.refreshToken).toBe(refreshCalls === 1 ? demoSession.refreshToken : 'restored-refresh');
        return refreshCalls === 1 ? refreshed('restored-access', 'restored-refresh') : refreshed('new-access', 'new-refresh');
      }
      if (url.endsWith('/api/student/summary')) {
        summaryCalls += 1;
        const auth = (init?.headers as Record<string, string>).Authorization;
        if (auth !== 'Bearer new-access') {
          return fakeResponse(401, errorEnvelope('UNAUTHORIZED', 'Sessão expirada.', { reason: 'token_expired' }));
        }
        return fakeResponse(200, okEnvelope(summaryFixture));
      }
      const student = studentEndpoints(url);
      if (student) return student;
      if (url.endsWith('/api/agent/recommendations')) return fakeResponse(200, okEnvelope(makeAnalysis()));
      return fakeResponse(404, errorEnvelope('NOT_FOUND', 'x'));
    });
    render(<App />);
    await screen.findByTestId('home-greeting');
    await waitFor(() => expect(summaryCalls).toBe(2));
    await waitFor(async () => expect(await SecureStore.getItemAsync('asa.auth.refreshToken')).toBe('new-refresh'));
  });
});
