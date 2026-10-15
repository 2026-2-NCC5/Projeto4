import AsyncStorage from '@react-native-async-storage/async-storage';
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { resetPlatformInfoForTests, setPlatformInfoForTests } from '../features/platform';
import { clearSupportMemoryCache } from '../features/support/cache';
import { NavigationProvider, useAppNavigation } from '../navigation/AppNavigator';
import { HomeScreen } from '../screens/HomeScreen';
import { ApiClientError, configureApiClient, resetApiClientForTests } from '../services/apiClient';
import type { DetailRoute } from '../types/ui';

import { demoSession, summaryFixture } from './support/fixtures';
import { fail, inboxFixture, makeAppointment, makePlatformInfo, ok, routedFetch, type RouteHandler } from './support/platformFixtures';

const mockGetSummary = jest.fn();
const mockUser = { ...demoSession.user };
const mockStudent = demoSession.student ? { ...demoSession.student } : null;

jest.mock('../services/studentService', () => ({
  studentService: {
    getSummary: () => mockGetSummary(),
    getSubjects: async () => [],
    getPendingItems: async () => [],
    getAssessments: async () => [],
  },
}));

jest.mock('../hooks/useSession', () => {
  const session = () => ({ status: 'authenticated', user: mockUser, student: mockStudent, signOutReason: null });
  return { useSession: session, useOptionalSession: session };
});

jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true, useSystemReduceMotion: () => true }));

configure({ asyncUtilTimeout: 10_000 });
jest.setTimeout(45_000);

/** Quinta-feira, 15/10/2026 às 9h (o agendamento de exemplo é "amanhã", 16/10 às 10:00 em Brasília). */
const NOW = new Date(2026, 9, 15, 9, 0, 0);
const UNAVAILABLE = 'Aguardando integração institucional: a fonte oficial de dados acadêmicos não está configurada.';

function routeLabel(route: DetailRoute | null): string {
  if (!route) return 'tab';
  return route.screen === 'appointment' ? `appointment:${route.id}` : route.screen;
}

function Harness() {
  const navigation = useAppNavigation();
  return navigation.detail ? <Text testID="route">{routeLabel(navigation.detail)}</Text> : <HomeScreen onNavigate={navigation.changeTab} now={NOW} />;
}

function withApi(routes: Record<string, RouteHandler>) {
  const router = routedFetch(routes);
  configureApiClient({ baseUrl: 'http://api.test', getAccessToken: () => 'token-aluno', fetchFn: router.fn as unknown as typeof fetch });
  return router;
}

beforeEach(async () => {
  mockGetSummary.mockReset();
  mockGetSummary.mockResolvedValue(summaryFixture);
  clearSupportMemoryCache();
  await AsyncStorage.clear();
});

afterEach(() => {
  resetApiClientForTests();
  resetPlatformInfoForTests();
});

describe('Início — modo de dados e fonte acadêmica', () => {
  it('modo demonstração: rótulo "DEMONSTRAÇÃO — Dados fictícios" (tom de atenção, ícone + texto)', async () => {
    setPlatformInfoForTests(makePlatformInfo());
    render(<HomeScreen onNavigate={jest.fn()} now={NOW} />);
    await screen.findByLabelText('Frequência: 90%, média');
    expect(screen.getByText('DEMONSTRAÇÃO — Dados fictícios')).toBeTruthy();
    expect(screen.getByLabelText('Modo demonstração: dados fictícios')).toBeTruthy();
    expect(screen.getByTestId('icon-information-circle-outline')).toBeTruthy();
  });

  it('modo institucional: sem rótulo de demonstração', async () => {
    setPlatformInfoForTests(makePlatformInfo({ dataMode: 'institutional', dataModeLabel: 'INSTITUCIONAL — Dados autorizados' }));
    render(<HomeScreen onNavigate={jest.fn()} now={NOW} />);
    await screen.findByLabelText('Frequência: 90%, média');
    expect(screen.queryByText('DEMONSTRAÇÃO — Dados fictícios')).toBeNull();
  });

  it('informação pública vem sem token (GET /api/platform/info); falha não derruba a tela', async () => {
    const api = withApi({ 'GET /api/platform/info': () => fail(500, 'INTERNAL_ERROR', 'x') });
    render(<HomeScreen onNavigate={jest.fn()} now={NOW} />);
    await screen.findByLabelText('Frequência: 90%, média');
    await waitFor(() => expect(api.find('GET', '/api/platform/info')).toHaveLength(1));
    const [, init] = api.fn.mock.calls.find(([url]) => String(url).endsWith('/api/platform/info')) as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(screen.queryByText('DEMONSTRAÇÃO — Dados fictícios')).toBeNull();
  });

  it('fonte acadêmica indisponível: a Home mostra a mensagem da plataforma no lugar do resumo (sem erro genérico)', async () => {
    setPlatformInfoForTests(makePlatformInfo({ dataMode: 'institutional', academicSource: { provider: 'institutional', status: 'unavailable', message: UNAVAILABLE } }));
    mockGetSummary.mockRejectedValue(new ApiClientError({ kind: 'dependency', status: 503, reason: 'academic_source_unavailable', message: UNAVAILABLE }));
    render(<HomeScreen onNavigate={jest.fn()} now={NOW} />);
    expect(await screen.findByText('Dados acadêmicos indisponíveis')).toBeTruthy();
    expect(screen.getByText(UNAVAILABLE)).toBeTruthy();
    expect(screen.queryByText('Não conseguimos carregar suas informações agora')).toBeNull();
    expect(screen.queryByTestId('summary-skeleton')).toBeNull();
    expect(await screen.findByText('Nenhum compromisso para mostrar')).toBeTruthy();
  });

  it('503 academic_source_unavailable sem a informação da plataforma: usa a mensagem do servidor', async () => {
    mockGetSummary.mockRejectedValue(new ApiClientError({ kind: 'dependency', status: 503, reason: 'academic_source_unavailable', message: UNAVAILABLE }));
    render(<HomeScreen onNavigate={jest.fn()} now={NOW} />);
    expect(await screen.findByText(UNAVAILABLE)).toBeTruthy();
    expect(screen.queryByText('Não conseguimos carregar suas informações agora')).toBeNull();
  });
});

describe('Início — sino e próximo atendimento', () => {
  function renderWithNavigation() {
    return render(
      <NavigationProvider>
        <Harness />
      </NavigationProvider>,
    );
  }

  it('o sino mostra os não lidos do servidor e abre a central de avisos', async () => {
    setPlatformInfoForTests(makePlatformInfo());
    withApi({ 'GET /api/notifications': () => ok(inboxFixture()), 'GET /api/appointments': () => ok({ items: [] }) });
    renderWithNavigation();
    // a contagem vai no rótulo do botão; a bolinha com o número é só visual (escondida do leitor de tela)
    await waitFor(() => expect(screen.getByTestId('home-bell').props.accessibilityLabel).toBe('Avisos, 2 avisos não lidos'));
    const count = screen.getByTestId('home-bell-count', { includeHiddenElements: true });
    expect(count.props.accessibilityElementsHidden).toBe(true);
    expect(screen.getByText('2', { exact: true, includeHiddenElements: true })).toBeTruthy();
    const bell = screen.getByTestId('home-bell');
    expect(bell.props.accessibilityHint).toBe('Abre a central de avisos');
    fireEvent.press(bell);
    expect(screen.getByTestId('route').props.children).toBe('notifications');
  });

  it('sem resposta da central, o sino volta ao comportamento anterior (sem contagem)', async () => {
    setPlatformInfoForTests(makePlatformInfo());
    const api = withApi({ 'GET /api/notifications': () => fail(500, 'INTERNAL_ERROR', 'x'), 'GET /api/appointments': () => ok({ items: [] }) });
    renderWithNavigation();
    await screen.findByLabelText('Frequência: 90%, média');
    await waitFor(() => expect(api.find('GET', '/api/notifications')).toHaveLength(1));
    // alertas acadêmicos (a recomendação da última análise) continuam sinalizados como antes
    await waitFor(() => expect(screen.getByTestId('home-bell').props.accessibilityLabel).toBe('Avisos, 1 aviso'));
    expect(screen.queryByTestId('home-bell-count', { includeHiddenElements: true })).toBeNull();
  });

  it('o próximo atendimento com o ASA entra em "Próximos compromissos" e abre o detalhe', async () => {
    setPlatformInfoForTests(makePlatformInfo());
    const api = withApi({ 'GET /api/notifications': () => ok(inboxFixture([])), 'GET /api/appointments': () => ok({ items: [makeAppointment()] }) });
    renderWithNavigation();
    const row = await screen.findByLabelText('Atendimento ASA: Documentos, 10:00 · Presencial, amanhã');
    expect(api.find('GET', '/api/appointments')[0]?.query).toEqual({ scope: 'upcoming' });
    fireEvent.press(row);
    expect(screen.getByTestId('route').props.children).toBe('appointment:appt-1');
  });

  it('agendamentos desligados pela plataforma: nada é buscado nem exibido', async () => {
    setPlatformInfoForTests(makePlatformInfo({ features: { ...makePlatformInfo().features, appointments: false } }));
    const api = withApi({ 'GET /api/notifications': () => ok(inboxFixture([])), 'GET /api/appointments': () => ok({ items: [makeAppointment()] }) });
    renderWithNavigation();
    await screen.findByLabelText('Frequência: 90%, média');
    await screen.findByTestId('upcoming-empty');
    expect(api.find('GET', '/api/appointments')).toHaveLength(0);
    expect(screen.queryByText('Documentos')).toBeNull();
  });
});
