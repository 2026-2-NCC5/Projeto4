import AsyncStorage from '@react-native-async-storage/async-storage';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Pressable, Share, Text } from 'react-native';

import { resetPlatformInfoForTests, setPlatformInfoForTests } from '../features/platform';
import { clearSupportMemoryCache } from '../features/support/cache';
import { NavigationProvider, useAppNavigation } from '../navigation/AppNavigator';
import { isAppointmentRoute } from '../navigation/navigationReducer';
import { AppointmentsRouter } from '../screens/appointments/AppointmentsRouter';
import { BookAppointmentScreen } from '../screens/appointments/BookAppointmentScreen';
import { configureApiClient, resetApiClientForTests } from '../services/apiClient';
import type { Appointment, AppointmentRescheduleRequest } from '../types/api';
import type { DetailRoute } from '../types/ui';

import { catalogFixture, fail, makeAppointment, makePlatformInfo, NOW, ok, routedFetch, slotListFixture, type RouteHandler } from './support/platformFixtures';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true, useSystemReduceMotion: () => true }));

const mockClipboard = jest.requireMock('expo-clipboard') as { setStringAsync: jest.Mock };

configure({ asyncUtilTimeout: 10_000 });
jest.setTimeout(45_000);

function routeLabel(route: DetailRoute | null): string {
  if (!route) return 'tab';
  if (route.screen === 'appointment') return `appointment:${route.id}`;
  if (route.screen === 'appointment-book') return route.rescheduleId ? `reschedule:${route.rescheduleId}` : 'book';
  if (route.screen === 'support-ticket') return `ticket:${route.id}`;
  return route.screen;
}

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
      {/* atalho de teste: abrir a remarcação mesmo quando a tela não oferece o botão */}
      <Pressable testID="force-reschedule" onPress={() => navigation.openRescheduleAppointment('appt-1')} />
    </>
  );
}

function renderDetail(appointment: Appointment, routes: Record<string, RouteHandler> = {}) {
  const router = routedFetch({
    [`GET /api/appointments/${appointment.id}`]: () => ok(appointment),
    'GET /api/appointments/catalog': () => ok(catalogFixture),
    'GET /api/appointments/slots': (call) => ok(slotListFixture(call.query.mode ?? null)),
    'GET /api/appointments': () => ok({ items: [appointment] }),
    ...routes,
  });
  configureApiClient({ baseUrl: 'http://api.test', getAccessToken: () => 'token-aluno', fetchFn: router.fn as unknown as typeof fetch });
  render(
    <NavigationProvider initialState={{ tab: 'services', detail: { screen: 'appointment', id: appointment.id }, backStack: [{ screen: 'appointments' }] }}>
      <Harness />
    </NavigationProvider>,
  );
  return router;
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
  jest.restoreAllMocks();
});

describe('Detalhe do agendamento', () => {
  it('mostra situação, data/hora em Brasília, local, protocolo e histórico; ações conforme canCancel/canReschedule', async () => {
    renderDetail(makeAppointment());
    expect(await screen.findByTestId('appointment-detail')).toBeTruthy();
    expect(screen.getByText('Documentos')).toBeTruthy();
    expect(screen.getByLabelText('Situação: Confirmado')).toBeTruthy();
    const when = screen.getByTestId('appointment-when');
    expect(within(when).getByText('Sexta-feira, 16 de outubro de 2026')).toBeTruthy();
    expect(within(when).getByText('10:00 às 10:30 (horário de Brasília)')).toBeTruthy();
    expect(within(when).getByText('Central de atendimento ASA')).toBeTruthy();
    expect(screen.getByTestId('appointment-protocol').props.children).toBe('AGD-2026-00001');
    expect(screen.getByText('Você pode cancelar ou remarcar pelo app até 16/10 às 08:00.')).toBeTruthy();
    expect(within(screen.getByTestId('appointment-events')).getByText('Confirmado pelo ASA')).toBeTruthy();
    expect(screen.getByTestId('appointment-cancel')).toBeTruthy();
    expect(screen.getByTestId('appointment-reschedule')).toBeTruthy();
    expect(screen.getByTestId('appointment-share')).toBeTruthy();
  });

  it('sem permissão do servidor (prazo encerrado) não oferece cancelar nem remarcar', async () => {
    renderDetail(makeAppointment({ canCancel: false, canReschedule: false }));
    expect(await screen.findByText('O prazo para cancelar ou remarcar pelo app terminou. Se precisar, fale com o ASA.')).toBeTruthy();
    expect(screen.queryByTestId('appointment-cancel')).toBeNull();
    expect(screen.queryByTestId('appointment-reschedule')).toBeNull();
    // compartilhar continua disponível
    expect(screen.getByTestId('appointment-share')).toBeTruthy();
  });

  it('só remarcar permitido: o botão de cancelar some e o de remarcar fica', async () => {
    renderDetail(makeAppointment({ canCancel: false, canReschedule: true }));
    expect(await screen.findByTestId('appointment-reschedule')).toBeTruthy();
    expect(screen.queryByTestId('appointment-cancel')).toBeNull();
  });

  it('cancelar exige confirmação, envia o motivo e atualiza a tela', async () => {
    const appointment = makeAppointment();
    const api = renderDetail(appointment, {
      'POST /api/appointments/appt-1/cancel': () =>
        ok(
          makeAppointment({
            status: 'cancelled',
            canCancel: false,
            canReschedule: false,
            changeDeadline: null,
            cancelReason: 'Imprevisto no trabalho',
            cancelledBy: 'student',
            events: [...appointment.events, { id: 'ev-3', type: 'cancelled', title: 'Cancelado pelo aluno', description: 'Imprevisto no trabalho', actorType: 'student', createdAt: NOW.toISOString() }],
          }),
        ),
    });
    fireEvent.press(await screen.findByTestId('appointment-cancel'));
    expect(await screen.findByText('Cancelar este agendamento?')).toBeTruthy();
    // "Manter" fecha sem cancelar
    fireEvent.press(screen.getByTestId('appointment-cancel-dialog-dismiss'));
    await waitFor(() => expect(screen.queryByText('Cancelar este agendamento?')).toBeNull());
    expect(api.find('POST', '/api/appointments/appt-1/cancel')).toHaveLength(0);

    fireEvent.press(screen.getByTestId('appointment-cancel'));
    fireEvent.changeText(await screen.findByTestId('appointment-cancel-reason'), 'Imprevisto no trabalho');
    fireEvent.press(screen.getByTestId('appointment-cancel-dialog-confirm'));
    expect(await screen.findByText('Agendamento cancelado. O horário foi liberado.')).toBeTruthy();
    expect(api.find('POST', '/api/appointments/appt-1/cancel')[0]?.body).toEqual({ reason: 'Imprevisto no trabalho' });
    expect(screen.getByLabelText('Situação: Cancelado')).toBeTruthy();
    expect(screen.queryByTestId('appointment-cancel')).toBeNull();
    expect(screen.queryByTestId('appointment-reschedule')).toBeNull();
    expect(within(screen.getByTestId('appointment-extra')).getByText('Imprevisto no trabalho')).toBeTruthy();
  });

  it('409 change_window_closed: explica no diálogo e recarrega a situação do servidor', async () => {
    let reads = 0;
    const api = renderDetail(makeAppointment(), {
      'GET /api/appointments/appt-1': () => {
        reads += 1;
        return ok(reads === 1 ? makeAppointment() : makeAppointment({ canCancel: false, canReschedule: false }));
      },
      'POST /api/appointments/appt-1/cancel': () => fail(409, 'CONFLICT', 'Cancelamentos pelo portal/app vão até 2 h antes. Fale com o ASA.', 'change_window_closed'),
    });
    fireEvent.press(await screen.findByTestId('appointment-cancel'));
    fireEvent.press(await screen.findByTestId('appointment-cancel-dialog-confirm'));
    expect(await screen.findByText('Cancelamentos pelo portal/app vão até 2 h antes. Fale com o ASA.')).toBeTruthy();
    await waitFor(() => expect(api.find('GET', '/api/appointments/appt-1').length).toBeGreaterThanOrEqual(2));
    fireEvent.press(screen.getByTestId('appointment-cancel-dialog-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('appointment-cancel')).toBeNull());
  });

  it('copiar protocolo e compartilhar um resumo em texto (sem prometer calendário)', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as Awaited<ReturnType<typeof Share.share>>);
    renderDetail(makeAppointment());
    fireEvent.press(await screen.findByTestId('appointment-copy-protocol'));
    await waitFor(() => expect(mockClipboard.setStringAsync).toHaveBeenCalledWith('AGD-2026-00001'));
    expect(await screen.findByText('Protocolo copiado')).toBeTruthy();

    fireEvent.press(screen.getByTestId('appointment-share'));
    expect(share).toHaveBeenCalledTimes(1);
    const [content] = share.mock.calls[0] as [{ message: string; title?: string }];
    expect(content.message).toContain('Atendimento com o ASA — Documentos');
    expect(content.message).toContain('Sexta-feira, 16 de outubro de 2026, das 10:00 às 10:30 (horário de Brasília)');
    expect(content.message).toContain('Protocolo: AGD-2026-00001');
    expect(content.message.toLowerCase()).not.toContain('calend');
  });

  it('agendamento inexistente: mensagem amigável com "Tentar novamente"', async () => {
    const router = routedFetch({ 'GET /api/appointments/nao-existe': () => fail(404, 'NOT_FOUND', 'Agendamento não encontrado.') });
    configureApiClient({ baseUrl: 'http://api.test', getAccessToken: () => 'token', fetchFn: router.fn as unknown as typeof fetch });
    render(
      <NavigationProvider initialState={{ detail: { screen: 'appointment', id: 'nao-existe' } }}>
        <Harness />
      </NavigationProvider>,
    );
    expect(await screen.findByText('Não encontramos este agendamento.')).toBeTruthy();
    expect(screen.getByText('Tentar novamente')).toBeTruthy();
  });
});

describe('Remarcar', () => {
  it('reaproveita a escolha de dia/horário, marca o horário atual e abre o novo agendamento sem voltar ao antigo', async () => {
    const api = renderDetail(makeAppointment(), {
      'POST /api/appointments/appt-1/reschedule': (call) => {
        const body = call.body as AppointmentRescheduleRequest;
        return ok(makeAppointment({ id: 'appt-2', protocol: 'AGD-2026-00003', status: 'scheduled', startsAt: body.startsAt, endsAt: new Date(Date.parse(body.startsAt) + 30 * 60_000).toISOString(), rescheduledFromId: 'appt-1' }));
      },
      'GET /api/appointments/appt-2': () => ok(makeAppointment({ id: 'appt-2', protocol: 'AGD-2026-00003', status: 'scheduled', startsAt: '2026-10-16T13:30:00.000Z', endsAt: '2026-10-16T14:00:00.000Z', rescheduledFromId: 'appt-1' })),
    });
    fireEvent.press(await screen.findByTestId('appointment-reschedule'));
    expect(await screen.findByText('Remarcar atendimento')).toBeTruthy();
    expect(screen.getByText('Etapa 1 de 4 · Modalidade')).toBeTruthy();
    // a modalidade atual já vem escolhida
    expect(screen.getByTestId('book-mode-presencial').props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(screen.getByTestId('book-next'));
    fireEvent.press(await screen.findByTestId('book-day-2026-10-16'));
    fireEvent.press(screen.getByTestId('book-next'));

    const current = await screen.findByLabelText('10:00, seu horário atual');
    expect(current.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId('book-time-10:30'));
    fireEvent.press(screen.getByTestId('book-next'));
    expect(await screen.findByText('Confira o novo horário')).toBeTruthy();
    expect(within(screen.getByTestId('book-current')).getByText('Sexta-feira, 16 de outubro de 2026, 10:00 às 10:30')).toBeTruthy();
    fireEvent.press(screen.getByTestId('book-confirm'));

    expect(await screen.findByText('Atendimento remarcado!')).toBeTruthy();
    expect(api.find('POST', '/api/appointments/appt-1/reschedule')[0]?.body).toEqual({
      clientRequestId: expect.stringMatching(/^[A-Za-z0-9._:-]{8,128}$/),
      startsAt: '2026-10-16T13:30:00.000Z',
      mode: 'presencial',
      location: 'Central de atendimento ASA',
    });
    fireEvent.press(screen.getByTestId('booked-open'));
    expect(await screen.findByTestId('appointment-detail')).toBeTruthy();
    expect(screen.getByTestId('route').props.children).toBe('appointment:appt-2');
    // a pilha não guarda o agendamento antigo nem o fluxo: voltar leva a "Meus agendamentos"
    expect(screen.getByTestId('stack').props.children).toBe('appointments');
  });

  it('v1.8: o agendamento antigo mostra "Remarcado para …" e abre o substituto', async () => {
    const old = makeAppointment({
      status: 'cancelled',
      canCancel: false,
      canReschedule: false,
      changeDeadline: null,
      cancelReason: 'Remarcado pelo aluno',
      cancelledBy: 'student',
      rescheduledToId: 'appt-2',
    });
    renderDetail(old, {
      'GET /api/appointments/appt-2': () => ok(makeAppointment({ id: 'appt-2', protocol: 'AGD-2026-00003', status: 'scheduled', startsAt: '2026-10-22T13:30:00.000Z', endsAt: '2026-10-22T14:00:00.000Z', rescheduledFromId: 'appt-1' })),
    });
    expect(await screen.findByLabelText('Situação: Remarcado')).toBeTruthy();
    const link = await screen.findByText('Remarcado para qui, 22 out · 10:30');
    expect(screen.queryByText('Motivo do cancelamento')).toBeNull();
    fireEvent.press(link);
    await waitFor(() => expect(screen.getByTestId('route').props.children).toBe('appointment:appt-2'));
    expect(await screen.findByText('AGD-2026-00003')).toBeTruthy();
    expect(screen.getByTestId('stack').props.children).toBe('appointments,appointment:appt-1');
  });

  it('agendamento que não pode mais ser remarcado: explica em vez de abrir o fluxo', async () => {
    renderDetail(makeAppointment({ canReschedule: false }));
    await screen.findByTestId('appointment-detail');
    fireEvent.press(screen.getByTestId('force-reschedule'));
    expect(await screen.findByText('Não é possível remarcar pelo app')).toBeTruthy();
  });
});
