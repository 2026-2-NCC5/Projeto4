import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAppointment, makeCatalog, makeSlot, makeSlotList } from '@/features/appointments/testFixtures';
import { mockApi, renderRoutes } from '@/test/utils';
import BookAppointmentPage from './BookAppointmentPage';

const routes = [
  { path: '/aluno/agendamentos/novo', element: <BookAppointmentPage /> },
  { path: '/aluno/agendamentos', element: <p>lista de agendamentos</p> },
];

const CLIENT_KEY = /^[A-Za-z0-9._:-]{8,128}$/;

/** Assunto + modalidade → "Continuar" → grade de horários. */
async function goToSlots() {
  await userEvent.click(await screen.findByRole('radio', { name: /^Matrícula/ }));
  await userEvent.click(screen.getByRole('radio', { name: /^Presencial/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await screen.findByRole('heading', { name: 'Escolha a data e o horário' });
}

describe('Agendar atendimento (aluno)', () => {
  // "agora" fixo: quinta-feira, 15/10/2026, 09:00 em São Paulo (o ano e o "hoje" exibidos dependem do relógio)
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('envia o startsAt exato do horário escolhido e reaproveita o clientRequestId ao repetir após falha de rede', async () => {
    const { calls, fetchMock } = mockApi({
      'GET /api/appointments/catalog': () => ({ data: makeCatalog() }),
      'GET /api/appointments': () => ({ data: { items: [] } }),
      'GET /api/appointments/slots': () => ({ data: makeSlotList() }),
      'POST /api/appointments': ({ body }) => {
        const request = body as { startsAt: string };
        return { status: 201, data: makeAppointment({ id: 'appt-new', protocol: 'AGD-2026-00042', startsAt: request.startsAt, endsAt: '2026-10-19T17:30:00.000Z' }) };
      },
    });
    // 1º envio: o servidor recebe, mas a resposta se perde (falha de rede no navegador)
    const respond = fetchMock.getMockImplementation()!;
    let dropNextBooking = true;
    fetchMock.mockImplementation(async (input, init) => {
      const response = await respond(input, init);
      const url = new URL(String(input), 'http://localhost');
      if (dropNextBooking && init?.method === 'POST' && url.pathname === '/api/appointments') {
        dropNextBooking = false;
        throw new TypeError('Failed to fetch');
      }
      return response;
    });

    renderRoutes(routes, { initialPath: '/aluno/agendamentos/novo' });
    expect(await screen.findByText(/Agende com pelo menos 2 horas de antecedência/)).toBeInTheDocument();
    await goToSlots();

    // a faixa mostra a quantidade por dia; dia sem horário fica desabilitado
    expect(await screen.findByRole('button', { name: 'sexta-feira, 16 de outubro: 2 horários livres' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'sábado, 17 de outubro: sem horários livres' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'segunda-feira, 19 de outubro: 1 horário livre' }));
    const slot = await screen.findByRole('button', { name: /14:00–14:30/ });
    expect(slot).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(slot);
    expect(slot).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await screen.findByRole('heading', { name: 'Revise e confirme' });
    await userEvent.type(screen.getByLabelText('Observações para o ASA'), 'Dúvida sobre rematrícula');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    expect(await screen.findByText(/Seus dados continuam aqui: tente de novo — o agendamento não será duplicado/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    expect(await screen.findByRole('heading', { name: 'Atendimento agendado' })).toBeInTheDocument();

    const posts = calls.filter((call) => call.method === 'POST' && call.path === '/api/appointments');
    expect(posts).toHaveLength(2);
    const first = posts[0]!.body as Record<string, unknown>;
    const second = posts[1]!.body as Record<string, unknown>;
    expect(first).toEqual({
      clientRequestId: expect.stringMatching(CLIENT_KEY),
      topicId: 'enrollment',
      startsAt: '2026-10-19T17:00:00.000Z',
      mode: 'presencial',
      location: 'Sala 3 — Prédio ASA',
      notes: 'Dúvida sobre rematrícula',
    });
    expect(second.clientRequestId).toBe(first.clientRequestId);
    expect(second).toEqual(first);

    // tela de sucesso com protocolo, horário (São Paulo) e o .ics servido pela API
    expect(screen.getByText('AGD-2026-00042')).toBeInTheDocument();
    expect(screen.getByText('14:00–14:30 (horário de Brasília)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Adicionar à agenda/ })).toHaveAttribute('href', '/api/appointments/appt-new/calendar.ics');
    expect(screen.getByRole('link', { name: 'Ver meus agendamentos' })).toHaveAttribute('href', '/aluno/agendamentos');
  });

  it('mesmo horário em dois locais: um botão por local e a reserva leva o local escolhido', async () => {
    const { calls } = mockApi({
      'GET /api/appointments/catalog': () => ({ data: makeCatalog() }),
      'GET /api/appointments': () => ({ data: { items: [] } }),
      'GET /api/appointments/slots': () => ({ data: makeSlotList({ extra: { '2026-10-16': [makeSlot('2026-10-16T12:00:00.000Z', 30, 'Sala 7 — Bloco B')] } }) }),
      'POST /api/appointments': () => ({ status: 201, data: makeAppointment({ id: 'appt-b', startsAt: '2026-10-16T12:00:00.000Z', endsAt: '2026-10-16T12:30:00.000Z', location: 'Sala 7 — Bloco B' }) }),
    });
    renderRoutes(routes, { initialPath: '/aluno/agendamentos/novo' });
    await goToSlots();
    expect(await screen.findByText(/Alguns horários existem em mais de um local/)).toBeInTheDocument();
    const nine = screen.getAllByRole('button', { name: /^09:00–09:30/ });
    expect(nine).toHaveLength(2);
    const roomB = screen.getByRole('button', { name: /^09:00–09:30\s*Sala 7 — Bloco B$/ });
    await userEvent.click(roomB);
    expect(roomB).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^09:00–09:30\s*Sala 3 — Prédio ASA$/ })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('Presencial · Sala 7 — Bloco B')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));
    expect(await screen.findByRole('heading', { name: 'Atendimento agendado' })).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST')!.body).toMatchObject({ startsAt: '2026-10-16T12:00:00.000Z', mode: 'presencial', location: 'Sala 7 — Bloco B' });
    // a consulta de horários não leva o assunto (a disponibilidade não é por tema)
    expect(calls.find((call) => call.path.startsWith('/api/appointments/slots'))!.path).not.toContain('topicId');
  });

  it('409 slot_unavailable atualiza os horários livres e mantém o aluno na grade com o aviso', async () => {
    let slotRequests = 0;
    const { calls } = mockApi({
      'GET /api/appointments/catalog': () => ({ data: makeCatalog() }),
      'GET /api/appointments': () => ({ data: { items: [] } }),
      'GET /api/appointments/slots': () => {
        slotRequests += 1;
        // depois do conflito, o horário das 14:00 de 19/10 já não aparece como livre
        return { data: slotRequests === 1 ? makeSlotList() : makeSlotList({ without: ['2026-10-19T17:00:00.000Z'] }) };
      },
      'POST /api/appointments': () => ({ status: 409, error: { code: 'CONFLICT', message: 'Esse horário acabou de ser reservado. Escolha outro.', reason: 'slot_unavailable' } }),
    });

    renderRoutes(routes, { initialPath: '/aluno/agendamentos/novo' });
    await goToSlots();
    await userEvent.click(await screen.findByRole('button', { name: 'segunda-feira, 19 de outubro: 1 horário livre' }));
    await userEvent.click(await screen.findByRole('button', { name: /14:00–14:30/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar agendamento' }));

    expect(await screen.findByText('Esse horário acabou de ser reservado por outra pessoa. Atualizamos os horários livres: escolha outro.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Escolha a data e o horário' })).toBeInTheDocument();
    await waitFor(() => expect(slotRequests).toBeGreaterThanOrEqual(2));
    expect(await screen.findByRole('button', { name: 'segunda-feira, 19 de outubro: sem horários livres' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /14:00–14:30/ })).toBeNull();
    // nenhum horário fica marcado; o aluno escolhe outro na grade atualizada
    const days = screen.getByRole('group', { name: 'Dias' });
    expect(within(days).getByRole('button', { name: 'sexta-feira, 16 de outubro: 2 horários livres' })).toHaveAttribute('aria-pressed', 'true');
    for (const button of screen.getAllByRole('button', { name: /^\d{2}:\d{2}–\d{2}:\d{2}/ })) expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });

  it('recurso desligado (403 feature_disabled) explica que os agendamentos estão desativados', async () => {
    mockApi({
      'GET /api/appointments/catalog': () => ({ data: makeCatalog() }),
      'GET /api/appointments': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Este recurso está desativado neste ambiente.', reason: 'feature_disabled' } }),
    });
    renderRoutes(routes, { initialPath: '/aluno/agendamentos/novo' });
    expect(await screen.findByText('Agendamentos desativados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Abrir chamado' })).toHaveAttribute('href', '/aluno/chamados/novo');
  });
});
