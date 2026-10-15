import AsyncStorage from '@react-native-async-storage/async-storage';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { resetPlatformInfoForTests, setPlatformInfoForTests } from '../features/platform';
import { clearSupportMemoryCache } from '../features/support/cache';
import { NavigationProvider, useAppNavigation } from '../navigation/AppNavigator';
import { isAppointmentRoute } from '../navigation/navigationReducer';
import { AppointmentsRouter } from '../screens/appointments/AppointmentsRouter';
import { BookAppointmentScreen } from '../screens/appointments/BookAppointmentScreen';
import { configureApiClient, resetApiClientForTests } from '../services/apiClient';
import type { Appointment, AppointmentCreateRequest } from '../types/api';
import type { DetailRoute } from '../types/ui';

import { catalogFixture, fail, makeAppointment, makePlatformInfo, NOW, ok, routedFetch, slotListFixture, type RouteHandler } from './support/platformFixtures';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
// comportamento, não animação
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true, useSystemReduceMotion: () => true }));

const mockClipboard = jest.requireMock('expo-clipboard') as { setStringAsync: jest.Mock };

configure({ asyncUtilTimeout: 10_000 });
jest.setTimeout(45_000);

const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function routeLabel(route: DetailRoute | null): string {
  if (!route) return 'tab';
  if (route.screen === 'appointment') return `appointment:${route.id}`;
  if (route.screen === 'appointment-book') return route.rescheduleId ? `reschedule:${route.rescheduleId}` : 'book';
  return route.screen;
}

/** Navegação real + telas de agendamento (a de agendar recebe o "agora" fixo do teste). */
function Harness() {
  const navigation = useAppNavigation();
  const detail = navigation.detail;
  let content: React.ReactNode = null;
  if (detail?.screen === 'appointment-book') content = <BookAppointmentScreen key={detail.rescheduleId ?? 'new'} rescheduleId={detail.rescheduleId} now={NOW} />;
  else if (isAppointmentRoute(detail)) content = <AppointmentsRouter route={detail} />;
  return (
    <>
      {content}
      <Text testID="route">{routeLabel(detail)}</Text>
      <Text testID="stack">{navigation.backStack.map(routeLabel).join(',')}</Text>
    </>
  );
}

function renderAt(route: DetailRoute) {
  return render(
    <NavigationProvider initialState={{ tab: 'services', detail: route }}>
      <Harness />
    </NavigationProvider>,
  );
}

function created(body: AppointmentCreateRequest, overrides: Partial<Appointment> = {}): Appointment {
  return makeAppointment({
    id: 'appt-new',
    protocol: 'AGD-2026-00042',
    status: 'scheduled',
    topicId: body.topicId,
    startsAt: body.startsAt,
    endsAt: new Date(Date.parse(body.startsAt) + 30 * 60_000).toISOString(),
    mode: body.mode,
    studentNotes: body.notes ?? null,
    events: [{ id: 'ev-new', type: 'scheduled', title: 'Atendimento agendado', description: 'Documentos · Presencial', actorType: 'student', createdAt: NOW.toISOString() }],
    ...overrides,
  });
}

function bookingApi(routes: Record<string, RouteHandler> = {}) {
  const router = routedFetch({
    'GET /api/appointments/catalog': () => ok(catalogFixture),
    'GET /api/appointments/slots': (call) => ok(slotListFixture(call.query.mode ?? null)),
    'POST /api/appointments': (call) => ok(created(call.body as AppointmentCreateRequest), 201),
    'GET /api/appointments/appt-new': () => ok(created({ clientRequestId: 'x', topicId: 'documents', startsAt: '2026-10-19T13:00:00.000Z', mode: 'presencial' })),
    'GET /api/appointments': () => ok({ items: [] }),
    ...routes,
  });
  configureApiClient({ baseUrl: 'http://api.test', getAccessToken: () => 'token-aluno', fetchFn: router.fn as unknown as typeof fetch });
  return router;
}

async function chooseUntilReview(time = '10:00') {
  fireEvent.press(await screen.findByTestId('book-topic-documents'));
  fireEvent.press(screen.getByTestId('book-next'));
  fireEvent.press(await screen.findByTestId('book-mode-presencial'));
  fireEvent.press(screen.getByTestId('book-next'));
  fireEvent.press(await screen.findByTestId('book-day-2026-10-19'));
  fireEvent.press(screen.getByTestId('book-next'));
  fireEvent.press(await screen.findByTestId(`book-time-${time}`));
  fireEvent.press(screen.getByTestId('book-next'));
  await screen.findByText('Confira e confirme');
}

beforeEach(async () => {
  clearSupportMemoryCache();
  await AsyncStorage.clear();
  setPlatformInfoForTests(makePlatformInfo());
  mockClipboard.setStringAsync.mockClear();
});

afterEach(() => {
  resetApiClientForTests();
  resetPlatformInfoForTests();
});

describe('Agendar atendimento', () => {
  it('fluxo completo: assunto → modalidade → dia (14 dias com contagem) → horário → resumo → confirmação com protocolo', async () => {
    const api = bookingApi();
    renderAt({ screen: 'appointment-book' });

    expect(await screen.findByText('Qual é o assunto?')).toBeTruthy();
    expect(screen.getByText('Etapa 1 de 5 · Assunto')).toBeTruthy();
    // sem escolher, não avança
    expect(screen.getByTestId('book-next').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId('book-topic-documents'));
    expect(screen.getByTestId('book-topic-documents').props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(screen.getByTestId('book-next'));

    expect(await screen.findByText('Como prefere ser atendido?')).toBeTruthy();
    fireEvent.press(screen.getByTestId('book-mode-presencial'));
    fireEvent.press(screen.getByTestId('book-next'));

    expect(await screen.findByText('Escolha o dia')).toBeTruthy();
    await screen.findByTestId('book-day');
    // hoje (no horário de Brasília) + 13 dias, só com horários da modalidade escolhida
    expect(api.find('GET', '/api/appointments/slots')[0]?.query).toEqual({ from: '2026-10-15', to: '2026-10-28', mode: 'presencial' });
    expect(within(screen.getByTestId('book-day')).getAllByRole('radio')).toHaveLength(14);
    expect(screen.getByLabelText('Segunda-feira, 19 de outubro: 4 horários livres')).toBeTruthy(); // 09:00 em duas salas = 2 opções
    expect(screen.getByLabelText('Sexta-feira, 16 de outubro: 2 horários livres')).toBeTruthy();
    expect(screen.getByLabelText('Quinta-feira, 15 de outubro: sem horários livres').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId('book-day-2026-10-19'));
    fireEvent.press(screen.getByTestId('book-next'));

    expect(await screen.findByText('Escolha o horário')).toBeTruthy();
    expect(screen.getByText('Segunda-feira, 19 de outubro')).toBeTruthy();
    // um grupo por local; cada botão é uma opção (horário + local)
    expect(screen.getByText('Sala 2')).toBeTruthy();
    expect(within(screen.getByTestId('book-time')).getAllByRole('radio').map((item) => item.props.accessibilityLabel)).toEqual([
      '09:00 às 09:30, Presencial · Central de atendimento ASA',
      '09:30 às 10:00, Presencial · Central de atendimento ASA',
      '10:00 às 10:30, Presencial · Central de atendimento ASA',
      '09:00 às 09:30, Presencial · Sala 2',
    ]);
    fireEvent.press(screen.getByTestId('book-time-10:00'));
    fireEvent.press(screen.getByTestId('book-next'));

    expect(await screen.findByText('Confira e confirme')).toBeTruthy();
    const summary = screen.getByTestId('book-summary');
    expect(within(summary).getByText('Documentos')).toBeTruthy();
    expect(within(summary).getByText('Presencial')).toBeTruthy();
    expect(within(summary).getByText('Segunda-feira, 19 de outubro de 2026')).toBeTruthy();
    expect(within(summary).getByText('10:00 às 10:30 (horário de Brasília)')).toBeTruthy();
    expect(within(summary).getByText('Central de atendimento ASA')).toBeTruthy();
    expect(screen.getByText('Você pode cancelar ou remarcar pelo app até 2 h antes do horário.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('book-notes'), 'Preciso do histórico escolar assinado.');
    fireEvent.press(screen.getByTestId('book-confirm'));

    expect(await screen.findByText('Atendimento agendado!')).toBeTruthy();
    expect(screen.getByTestId('booked-protocol').props.children).toBe('AGD-2026-00042');
    const [post] = api.find('POST', '/api/appointments');
    expect(post?.body).toEqual({
      clientRequestId: expect.stringMatching(KEY_PATTERN),
      topicId: 'documents',
      startsAt: '2026-10-19T13:00:00.000Z',
      mode: 'presencial',
      location: 'Central de atendimento ASA',
      notes: 'Preciso do histórico escolar assinado.',
    });

    fireEvent.press(screen.getByTestId('booked-copy'));
    await waitFor(() => expect(mockClipboard.setStringAsync).toHaveBeenCalledWith('AGD-2026-00042'));
    expect(await screen.findByText('Protocolo copiado')).toBeTruthy();

    // "Ver agendamento" troca a confirmação pelo detalhe (voltar não reabre o fluxo)
    fireEvent.press(screen.getByTestId('booked-open'));
    expect(await screen.findByTestId('appointment-detail')).toBeTruthy();
    expect(screen.getByTestId('route').props.children).toBe('appointment:appt-new');
    expect(screen.getByText('AGD-2026-00042')).toBeTruthy();
  });

  it('falha de rede: mantém os dados, protege contra toque duplo e a nova tentativa reaproveita o clientRequestId', async () => {
    let attempts = 0;
    const api = bookingApi({
      'POST /api/appointments': (call) => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Network request failed');
        return ok(created(call.body as AppointmentCreateRequest), 201);
      },
    });
    renderAt({ screen: 'appointment-book' });
    await chooseUntilReview();

    fireEvent.press(screen.getByTestId('book-confirm'));
    fireEvent.press(screen.getByTestId('book-confirm'));
    expect(await screen.findByText('Não conseguimos falar com o ASA agora. Verifique sua conexão e tente novamente.')).toBeTruthy();
    expect(api.find('POST', '/api/appointments')).toHaveLength(1);
    expect(screen.getByText('Confira e confirme')).toBeTruthy(); // continua na confirmação, com tudo preenchido
    expect(screen.queryByText(/Network request failed/)).toBeNull();

    fireEvent.press(screen.getByTestId('book-confirm'));
    expect(await screen.findByText('Atendimento agendado!')).toBeTruthy();
    const posts = api.find('POST', '/api/appointments').map((call) => call.body as AppointmentCreateRequest);
    expect(posts).toHaveLength(2);
    expect(posts[1]?.clientRequestId).toBe(posts[0]?.clientRequestId);
    expect(posts[0]?.clientRequestId).toMatch(KEY_PATTERN);
  });

  it('409 slot_unavailable: atualiza os horários, pede outro horário e envia com uma chave nova', async () => {
    const taken: string[] = [];
    let attempts = 0;
    const api = bookingApi({
      'GET /api/appointments/slots': (call) => ok(slotListFixture(call.query.mode ?? null, { exclude: taken })),
      'POST /api/appointments': (call) => {
        attempts += 1;
        if (attempts === 1) {
          taken.push('2026-10-19T13:00:00.000Z'); // outra pessoa reservou antes
          return fail(409, 'CONFLICT', 'Esse horário acabou de ser reservado. Escolha outro.', 'slot_unavailable');
        }
        return ok(created(call.body as AppointmentCreateRequest), 201);
      },
    });
    renderAt({ screen: 'appointment-book' });
    await chooseUntilReview('10:00');

    fireEvent.press(screen.getByTestId('book-confirm'));
    expect(await screen.findByText('Esse horário não está mais disponível. Escolha outro horário.')).toBeTruthy();
    expect(screen.getByText('Escolha o horário')).toBeTruthy();
    await waitFor(() => expect(api.find('GET', '/api/appointments/slots')).toHaveLength(2));
    await screen.findByTestId('book-time-09:30');
    expect(screen.queryByTestId('book-time-10:00')).toBeNull();
    expect(screen.getByTestId('book-next').props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.press(screen.getByTestId('book-time-09:30'));
    fireEvent.press(screen.getByTestId('book-next'));
    await screen.findByText('Confira e confirme');
    fireEvent.press(screen.getByTestId('book-confirm'));
    expect(await screen.findByText('Atendimento agendado!')).toBeTruthy();
    const posts = api.find('POST', '/api/appointments').map((call) => call.body as AppointmentCreateRequest);
    expect(posts.map((body) => body.startsAt)).toEqual(['2026-10-19T13:00:00.000Z', '2026-10-19T12:30:00.000Z']);
    expect(posts[1]?.clientRequestId).not.toBe(posts[0]?.clientRequestId);
  });

  it('v1.8: o mesmo horário em duas salas — o aluno escolhe a sala e ela vai no pedido', async () => {
    const api = bookingApi({ 'POST /api/appointments': (call) => ok(created(call.body as AppointmentCreateRequest, { location: (call.body as AppointmentCreateRequest).location ?? null }), 201) });
    renderAt({ screen: 'appointment-book' });
    await chooseUntilReview('09:00@Sala 2');
    expect(within(screen.getByTestId('book-summary')).getByText('Sala 2')).toBeTruthy();
    expect(within(screen.getByTestId('book-summary')).getByText('09:00 às 09:30 (horário de Brasília)')).toBeTruthy();
    fireEvent.press(screen.getByTestId('book-confirm'));
    expect(await screen.findByText('Atendimento agendado!')).toBeTruthy();
    expect(api.find('POST', '/api/appointments')[0]?.body).toMatchObject({ startsAt: '2026-10-19T12:00:00.000Z', mode: 'presencial', location: 'Sala 2' });
    expect(within(screen.getByTestId('booked-summary')).getByText('Presencial · Sala 2')).toBeTruthy();
  });

  it('online: a opção não tem local e o pedido vai com location null', async () => {
    const api = bookingApi();
    renderAt({ screen: 'appointment-book' });
    fireEvent.press(await screen.findByTestId('book-topic-academic'));
    fireEvent.press(screen.getByTestId('book-next'));
    fireEvent.press(await screen.findByTestId('book-mode-online'));
    fireEvent.press(screen.getByTestId('book-next'));
    fireEvent.press(await screen.findByTestId('book-day-2026-10-20'));
    fireEvent.press(screen.getByTestId('book-next'));
    fireEvent.press(await screen.findByTestId('book-time-18:00'));
    expect(screen.queryByText('Sala 2')).toBeNull();
    fireEvent.press(screen.getByTestId('book-next'));
    expect(await screen.findByText('Combinado pela equipe do ASA na confirmação.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('book-confirm'));
    expect(await screen.findByText('Atendimento agendado!')).toBeTruthy();
    expect(api.find('POST', '/api/appointments')[0]?.body).toMatchObject({ topicId: 'academic', startsAt: '2026-10-20T21:00:00.000Z', mode: 'online', location: null });
  });

  it('limite de agendamentos ativos: explica com o texto do servidor e não sai da confirmação', async () => {
    bookingApi({ 'POST /api/appointments': () => fail(409, 'CONFLICT', 'Você já tem 2 agendamento(s) ativo(s). Cancele ou aguarde um deles para marcar outro.', 'active_limit') });
    renderAt({ screen: 'appointment-book' });
    await chooseUntilReview();
    fireEvent.press(screen.getByTestId('book-confirm'));
    expect(await screen.findByText('Você já tem 2 agendamento(s) ativo(s). Cancele ou aguarde um deles para marcar outro.')).toBeTruthy();
    expect(screen.getByText('Confira e confirme')).toBeTruthy();
  });

  it('v1.8: catálogo com 403 feature_disabled — "indisponível" sem "Tentar novamente"', async () => {
    bookingApi({ 'GET /api/appointments/catalog': () => fail(403, 'FORBIDDEN', 'Este recurso está desativado neste ambiente.', 'feature_disabled') });
    renderAt({ screen: 'appointment-book' });
    expect(await screen.findByText('Agendamentos indisponíveis')).toBeTruthy();
    expect(screen.getByText('Os agendamentos com o ASA estão desativados no momento.')).toBeTruthy();
    expect(screen.queryByText('Tentar novamente')).toBeNull();
    expect(screen.getByTestId('book-next').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('modalidade sem horários nas próximas duas semanas: oferece trocar a modalidade', async () => {
    bookingApi({ 'GET /api/appointments/slots': () => ok(slotListFixture('nenhuma')) });
    renderAt({ screen: 'appointment-book' });
    fireEvent.press(await screen.findByTestId('book-topic-academic'));
    fireEvent.press(screen.getByTestId('book-next'));
    fireEvent.press(await screen.findByTestId('book-mode-online'));
    fireEvent.press(screen.getByTestId('book-next'));
    expect(await screen.findByText('Nenhum horário livre nas próximas duas semanas')).toBeTruthy();
    fireEvent.press(screen.getByText('Trocar modalidade'));
    expect(await screen.findByText('Como prefere ser atendido?')).toBeTruthy();
  });
});

describe('Meus agendamentos', () => {
  it('lista próximos e histórico; "Agendar atendimento" abre o fluxo e a linha abre o detalhe', async () => {
    const past = makeAppointment({ id: 'appt-0', protocol: 'AGD-2026-00002', status: 'completed', topicLabel: 'Financeiro', startsAt: '2026-10-05T18:00:00.000Z', endsAt: '2026-10-05T18:30:00.000Z', canCancel: false, canReschedule: false, changeDeadline: null });
    const api = bookingApi({
      'GET /api/appointments': (call) => ok({ items: call.query.scope === 'past' ? [past] : [makeAppointment()] }),
      'GET /api/appointments/appt-1': () => ok(makeAppointment()),
    });
    renderAt({ screen: 'appointments' });

    const upcoming = await screen.findByTestId('appointments-upcoming');
    expect(within(upcoming).getByText('Documentos')).toBeTruthy();
    expect(within(upcoming).getByText('Sex · 10:00 às 10:30 · Presencial')).toBeTruthy();
    expect(within(upcoming).getByLabelText('Situação: Confirmado')).toBeTruthy();
    const history = await screen.findByTestId('appointments-past');
    expect(within(history).getByText('Financeiro')).toBeTruthy();
    expect(within(history).getByLabelText('Situação: Realizado')).toBeTruthy();
    expect(api.find('GET', '/api/appointments').map((call) => call.query.scope).sort()).toEqual(['past', 'upcoming']);

    fireEvent.press(screen.getByTestId('appointments-book'));
    expect(await screen.findByText('Qual é o assunto?')).toBeTruthy();
    fireEvent.press(screen.getAllByLabelText('Voltar')[0]!);
    fireEvent.press(await screen.findByTestId('appointment-row-appt-1'));
    expect(await screen.findByTestId('appointment-detail')).toBeTruthy();
    expect(screen.getByTestId('stack').props.children).toBe('appointments');
  });

  it('recurso desligado pela plataforma: sem botão de agendar e com explicação', async () => {
    setPlatformInfoForTests(makePlatformInfo({ features: { ...makePlatformInfo().features, appointments: false } }));
    const api = bookingApi();
    renderAt({ screen: 'appointments' });
    expect(await screen.findByText('Agendamentos indisponíveis')).toBeTruthy();
    expect(screen.queryByTestId('appointments-book')).toBeNull();
    expect(api.find('GET', '/api/appointments')).toHaveLength(0);
  });

  it('API sem agendamentos (404 da rota): "indisponível", não "agendamento não encontrado"', async () => {
    bookingApi({ 'GET /api/appointments': () => fail(404, 'NOT_FOUND', 'Rota não encontrada: GET /api/appointments') });
    renderAt({ screen: 'appointments' });
    expect(await screen.findByText('Os agendamentos com o ASA ainda não estão disponíveis neste ambiente.')).toBeTruthy();
    expect(screen.queryByText('Não encontramos este agendamento.')).toBeNull();
    expect(screen.queryByTestId('appointments-book')).toBeNull();
  });

  it('403 feature_disabled da API também vira "indisponível" (nunca erro genérico)', async () => {
    bookingApi({ 'GET /api/appointments': () => fail(403, 'FORBIDDEN', 'Este recurso está desativado neste ambiente.', 'feature_disabled') });
    renderAt({ screen: 'appointments' });
    expect(await screen.findByText('Os agendamentos com o ASA estão desativados no momento.')).toBeTruthy();
    expect(screen.queryByTestId('appointments-book')).toBeNull();
  });
});
