import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRule } from '@/features/appointments/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import AvailabilityPage from './AvailabilityPage';

const routes = [{ path: '/asa/agendamentos/disponibilidade', element: <AvailabilityPage /> }];
const staffSession = () => makeSession(makeMe('institutional_staff'));

const mine = makeRule();
const other = makeRule({ id: 'rule-9', attendant: { id: 'user-other', fullName: 'Bruno Atendente' }, weekday: 3, startTime: '14:00', endTime: '18:00', mode: 'online', location: null });

function availabilityApi(extra: Record<string, Parameters<typeof mockApi>[0][string]> = {}) {
  return mockApi({
    'GET /api/asa/availability': ({ url }) => ({ data: { items: url.searchParams.get('attendant') === 'mine' ? [mine] : [mine, other] } }),
    ...extra,
  });
}

async function fillNewRule() {
  await userEvent.click(await screen.findByRole('button', { name: 'Nova faixa' }));
  const dialog = await screen.findByRole('dialog', { name: 'Nova faixa de disponibilidade' });
  await userEvent.selectOptions(within(dialog).getByLabelText(/Dia da semana/), '2');
  fireEvent.change(within(dialog).getByLabelText(/^Início/), { target: { value: '14:00' } });
  fireEvent.change(within(dialog).getByLabelText(/^Fim/), { target: { value: '17:00' } });
  await userEvent.selectOptions(within(dialog).getByLabelText('Duração de cada atendimento'), '45');
  await userEvent.click(within(dialog).getByRole('radio', { name: 'Online' }));
  await userEvent.type(within(dialog).getByLabelText('Local'), 'Videochamada');
  fireEvent.change(within(dialog).getByLabelText(/Vigência a partir de/), { target: { value: '2026-11-02' } });
  fireEvent.change(within(dialog).getByLabelText(/Vigência até/), { target: { value: '2026-12-18' } });
  return dialog;
}

describe('Minha disponibilidade', () => {
  // "hoje" fixo: a situação da faixa (ativa, encerrada, começa depois) depende da data
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T15:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lista as faixas do usuário e, só para leitura, as da equipe', async () => {
    const { calls } = availabilityApi();
    renderRoutes(routes, { initialPath: '/asa/agendamentos/disponibilidade', session: staffSession() });
    const own = await screen.findByRole('table', { name: 'Suas faixas de disponibilidade' });
    expect(within(own).getByText('Segunda-feira')).toBeInTheDocument();
    expect(within(own).getByText('09:00–12:00')).toBeInTheDocument();
    expect(within(own).getByText('30 min · 6 horários')).toBeInTheDocument();
    expect(within(own).getAllByText('Sala 3 — Prédio ASA')).toHaveLength(1);
    expect(within(own).getByText('Desde 01/10/2026')).toBeInTheDocument();
    expect(within(own).getByText('Ativa')).toBeInTheDocument();
    const team = await screen.findByRole('table', { name: 'Faixas de disponibilidade da equipe' });
    expect(within(team).getByText('Bruno Atendente')).toBeInTheDocument();
    expect(within(team).queryByRole('button')).toBeNull();
    expect(calls.map((call) => call.path)).toEqual(expect.arrayContaining(['/api/asa/availability?attendant=mine', '/api/asa/availability']));
  });

  it('criar faixa envia o payload certo', async () => {
    const created = makeRule({ id: 'rule-2', weekday: 2, startTime: '14:00', endTime: '17:00', slotMinutes: 45, mode: 'online', location: 'Videochamada', validFrom: '2026-11-02', validUntil: '2026-12-18' });
    const { calls } = availabilityApi({ 'POST /api/asa/availability': () => ({ status: 201, data: created }) });
    renderRoutes(routes, { initialPath: '/asa/agendamentos/disponibilidade', session: staffSession() });
    const dialog = await fillNewRule();
    expect(within(dialog).getByText('Gera 4 horários por semana: 14:00, 14:45, 15:30, 16:15.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar faixa' }));
    expect(await screen.findByText(/Faixa criada: terça-feira, 14:00–17:00/)).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST')!.body).toEqual({
      weekday: 2,
      startTime: '14:00',
      endTime: '17:00',
      slotMinutes: 45,
      mode: 'online',
      location: 'Videochamada',
      validFrom: '2026-11-02',
      validUntil: '2026-12-18',
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova faixa de disponibilidade' })).toBeNull());
  });

  it('409 availability_overlap mostra o conflito no formulário (que continua aberto)', async () => {
    availabilityApi({
      'POST /api/asa/availability': () => ({ status: 409, error: { code: 'CONFLICT', message: 'Já existe disponibilidade nesse dia e horário (13:00–15:00).', reason: 'availability_overlap' } }),
    });
    renderRoutes(routes, { initialPath: '/asa/agendamentos/disponibilidade', session: staffSession() });
    const dialog = await fillNewRule();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar faixa' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Já existe disponibilidade nesse dia e horário (13:00–15:00). Ajuste o horário, mude a vigência ou pause a outra faixa antes.',
    );
    expect(screen.getByRole('dialog', { name: 'Nova faixa de disponibilidade' })).toBeInTheDocument();
  });

  it('valida no navegador antes de enviar (fim antes do início)', async () => {
    const { calls } = availabilityApi();
    renderRoutes(routes, { initialPath: '/asa/agendamentos/disponibilidade', session: staffSession() });
    await userEvent.click(await screen.findByRole('button', { name: 'Nova faixa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova faixa de disponibilidade' });
    fireEvent.change(within(dialog).getByLabelText(/^Fim/), { target: { value: '08:00' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar faixa' }));
    expect(within(dialog).getByText('Escolha o dia da semana.')).toBeInTheDocument();
    expect(within(dialog).getByText('O fim precisa ser depois do início.')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('pausar e editar usam PATCH só com os campos permitidos', async () => {
    const { calls } = availabilityApi({
      'PATCH /api/asa/availability/rule-1': ({ body }) => ({ data: { ...mine, ...(body as object) } }),
    });
    renderRoutes(routes, { initialPath: '/asa/agendamentos/disponibilidade', session: staffSession() });
    await userEvent.click(await screen.findByRole('button', { name: 'Pausar faixa Segunda-feira 09:00–12:00' }));
    expect(await screen.findByText(/Faixa de segunda-feira pausada/)).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PATCH')).toMatchObject({ path: '/api/asa/availability/rule-1', body: { active: false } });

    await userEvent.click(screen.getByRole('button', { name: 'Editar faixa Segunda-feira 09:00–12:00' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar faixa de disponibilidade' });
    expect(within(dialog).queryByLabelText(/Dia da semana/)).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/^Fim/), { target: { value: '13:00' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(calls.filter((call) => call.method === 'PATCH')).toHaveLength(2));
    expect(calls.filter((call) => call.method === 'PATCH')[1]!.body).toEqual({
      startTime: '09:00',
      endTime: '13:00',
      slotMinutes: 30,
      mode: 'presencial',
      location: 'Sala 3 — Prédio ASA',
      validUntil: null,
    });
  });
});
