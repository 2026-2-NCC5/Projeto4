import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { describeServerErrors, validateBusinessHours, validateLinks } from '@/features/admin/settings';
import { apiError, makeSettings } from '@/features/admin/testFixtures';
import { ApiError } from '@/services/api/client';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import type { AdminSetting } from '@/types/api';
import SettingsPage from './SettingsPage';

const adminSession = () => makeSession(makeMe('technical_admin'));
const routes = [{ path: '/admin/configuracoes', element: <SettingsPage /> }];
const section = (label: string) => screen.getByRole('heading', { name: label, level: 2 }).closest('section') as HTMLElement;
const putCalls = (calls: Array<{ method: string; path: string; body: unknown }>) => calls.filter((call) => call.method === 'PUT');

/** PUT devolve a lista com o valor novo (como o servidor faz). */
function settingsApi(initial: AdminSetting[] = makeSettings(), extra: Parameters<typeof mockApi>[0] = {}) {
  let current = initial;
  return mockApi({
    'GET /api/admin/settings': () => ({ data: current }),
    ...Object.fromEntries(
      current.map((setting) => [
        `PUT /api/admin/settings/${setting.key}`,
        ({ body }: { body: unknown }) => {
          current = current.map((item) => (item.key === setting.key ? { ...item, value: (body as { value: unknown }).value, isDefault: false, updatedAt: '2026-10-15T12:30:00.000Z', updatedBy: 'Administração' } : item));
          return { data: current };
        },
      ]),
    ),
    ...extra,
  });
}

describe('Configurações', () => {
  it('mostra cada parâmetro com editor próprio, visibilidade e quem/quando alterou', async () => {
    settingsApi();
    renderRoutes(routes, { initialPath: '/admin/configuracoes', session: adminSession() });
    expect(await screen.findByRole('heading', { name: 'Aviso institucional', level: 2 })).toBeInTheDocument();
    expect(within(section('Aviso institucional')).getByText('Público')).toBeInTheDocument();
    expect(within(section('Aviso institucional')).getByText('Valor padrão: nunca alterado.')).toBeInTheDocument();
    expect(within(section('Governança da base de conhecimento')).getByText('Interno')).toBeInTheDocument();
    expect(section('Política de agendamentos')).toHaveTextContent('Alterado por Carla Administração em 12/10/2026 às 07:00.');
    expect(within(section('Política de agendamentos')).getByLabelText('Horizonte da agenda (dias)')).toHaveValue(30);
    expect(within(section('Horário de atendimento do ASA')).getByRole('checkbox', { name: 'Segunda-feira' })).toBeChecked();
    expect(within(section('Horário de atendimento do ASA')).getByRole('checkbox', { name: 'Domingo' })).not.toBeChecked();
    expect(within(section('Recursos ativos')).getByRole('switch', { name: 'Motor de automações' })).toHaveAttribute('aria-checked', 'true');
    // âncora usada pelo aviso das automações
    expect(section('Recursos ativos')).toHaveAttribute('id', 'recursos-ativos');
  });

  it('publica o aviso institucional com texto e tom', async () => {
    const { calls } = settingsApi();
    renderRoutes(routes, { initialPath: '/admin/configuracoes', session: adminSession() });
    await screen.findByRole('heading', { name: 'Aviso institucional', level: 2 });
    const announcement = section('Aviso institucional');
    expect(within(announcement).getByRole('button', { name: 'Publicar aviso' })).toBeDisabled();
    await userEvent.type(within(announcement).getByLabelText('Texto do aviso'), '  Atendimento presencial suspenso na sexta.  ');
    await userEvent.click(within(announcement).getByRole('radio', { name: /^Atenção/ }));
    expect(within(announcement).getByText('Atendimento presencial suspenso na sexta.', { selector: 'span' })).toBeInTheDocument();
    await userEvent.click(within(announcement).getByRole('button', { name: 'Publicar aviso' }));
    expect(await screen.findByText('Aviso institucional: alteração salva.')).toBeInTheDocument();
    expect(putCalls(calls)[0]).toMatchObject({ path: '/api/admin/settings/institution.announcement', body: { value: { text: 'Atendimento presencial suspenso na sexta.', tone: 'attention' } } });
    // depois de salvo: quem/quando e opção de remover
    expect(await within(section('Aviso institucional')).findByRole('button', { name: 'Remover aviso' })).toBeInTheDocument();
    expect(section('Aviso institucional')).toHaveTextContent('Alterado por Administração em 15/10/2026 às 09:30.');
  });

  it('aviso existente: texto vazio é recusado antes de enviar e “Remover aviso” grava null', async () => {
    const { calls } = settingsApi(makeSettings({ 'institution.announcement': { value: { text: 'Mudança de horário', tone: 'info' }, isDefault: false, updatedAt: '2026-10-14T12:00:00.000Z', updatedBy: 'Carla Administração' } }));
    renderRoutes(routes, { initialPath: '/admin/configuracoes', session: adminSession() });
    await screen.findByRole('heading', { name: 'Aviso institucional', level: 2 });
    const announcement = section('Aviso institucional');
    await userEvent.clear(within(announcement).getByLabelText('Texto do aviso'));
    await userEvent.click(within(announcement).getByRole('button', { name: 'Salvar aviso' }));
    expect(within(announcement).getByText('Escreva o texto do aviso (ou use “Remover aviso”).')).toBeInTheDocument();
    expect(putCalls(calls)).toHaveLength(0);

    await userEvent.click(within(announcement).getByRole('button', { name: 'Remover aviso' }));
    await waitFor(() => expect(putCalls(calls)).toHaveLength(1));
    expect(putCalls(calls)[0]!.body).toEqual({ value: null });
  });

  it('política de agendamentos: valida limites e mostra os detalhes do 400 no próprio parâmetro', async () => {
    const { calls } = settingsApi(makeSettings(), {
      'PUT /api/admin/settings/appointments.policy': () =>
        apiError(400, 'VALIDATION_ERROR', 'Valor inválido para este parâmetro.', { details: [{ field: 'value.maxDaysAhead', message: 'acima do limite institucional' }] }),
    });
    renderRoutes(routes, { initialPath: '/admin/configuracoes', session: adminSession() });
    await screen.findByRole('heading', { name: 'Política de agendamentos', level: 2 });
    const policy = section('Política de agendamentos');
    const horizon = within(policy).getByLabelText('Horizonte da agenda (dias)');
    await userEvent.clear(horizon);
    await userEvent.type(horizon, '91');
    await userEvent.click(within(policy).getByRole('button', { name: 'Salvar política' }));
    expect(within(policy).getByText('Use um número inteiro de 1 a 90.')).toBeInTheDocument();
    expect(putCalls(calls)).toHaveLength(0);

    await userEvent.clear(horizon);
    await userEvent.type(horizon, '45');
    await userEvent.click(within(policy).getByRole('button', { name: 'Salvar política' }));
    const refused = await within(policy).findByText('O servidor recusou o valor');
    expect(refused.closest('[role="alert"]')).toHaveTextContent('Horizonte da agenda (dias): Acima do limite institucional');
    expect(within(policy).getByText('Acima do limite institucional')).toBeInTheDocument();
    expect(putCalls(calls)[0]!.body).toEqual({ value: { minLeadHours: 2, maxDaysAhead: 45, cancellationMinHours: 2, maxActivePerStudent: 2 } });
  });

  it('horário de atendimento: faixa com fim antes do início é recusada antes de enviar', async () => {
    const { calls } = settingsApi();
    renderRoutes(routes, { initialPath: '/admin/configuracoes', session: adminSession() });
    await screen.findByRole('heading', { name: 'Horário de atendimento do ASA', level: 2 });
    const hours = section('Horário de atendimento do ASA');
    fireEvent.change(within(hours).getByLabelText('Fim — Segunda-feira, faixa 1'), { target: { value: '07:00' } });
    await userEvent.click(within(hours).getByRole('button', { name: 'Salvar horário' }));
    expect(within(hours).getByText('O fim deve ser depois do início.')).toBeInTheDocument();
    expect(putCalls(calls)).toHaveLength(0);

    fireEvent.change(within(hours).getByLabelText('Fim — Segunda-feira, faixa 1'), { target: { value: '18:00' } });
    await userEvent.click(within(hours).getByRole('checkbox', { name: 'Sábado' }));
    fireEvent.change(within(hours).getByLabelText('Início — Sábado, faixa 1'), { target: { value: '09:00' } });
    fireEvent.change(within(hours).getByLabelText('Fim — Sábado, faixa 1'), { target: { value: '12:00' } });
    await userEvent.click(within(hours).getByRole('button', { name: 'Salvar horário' }));
    await waitFor(() => expect(putCalls(calls)).toHaveLength(1));
    expect(putCalls(calls)[0]!.body).toEqual({
      value: {
        days: [
          { weekday: 1, intervals: [{ start: '08:00', end: '18:00' }] },
          { weekday: 6, intervals: [{ start: '09:00', end: '12:00' }] },
        ],
        note: null,
      },
    });
  });

  it('recursos ativos: interruptores com explicação e resumo do que muda', async () => {
    const { calls } = settingsApi();
    renderRoutes(routes, { initialPath: '/admin/configuracoes', session: adminSession() });
    await screen.findByRole('heading', { name: 'Recursos ativos', level: 2 });
    const toggles = section('Recursos ativos');
    expect(within(toggles).getByText(/nenhuma regra roda, mesmo as ativadas/)).toBeInTheDocument();
    await userEvent.click(within(toggles).getByRole('switch', { name: 'Motor de automações' }));
    expect(within(toggles).getByText(/Ao salvar:/)).toHaveTextContent('Ao salvar: desliga Motor de automações.');
    await userEvent.click(within(toggles).getByRole('button', { name: 'Salvar recursos' }));
    await waitFor(() => expect(putCalls(calls)).toHaveLength(1));
    expect(putCalls(calls)[0]).toMatchObject({
      path: '/api/admin/settings/features.toggles',
      body: { value: { appointments: true, knowledgeBase: true, assistantKnowledgeAnswers: true, automations: false } },
    });
  });

  it('links institucionais: só HTTPS e nome com 2 a 60 caracteres', async () => {
    const { calls } = settingsApi();
    renderRoutes(routes, { initialPath: '/admin/configuracoes', session: adminSession() });
    await screen.findByRole('heading', { name: 'Links institucionais', level: 2 });
    const links = section('Links institucionais');
    await userEvent.click(within(links).getByRole('button', { name: 'Adicionar link' }));
    await userEvent.type(within(links).getByLabelText('Nome do link 1'), 'P');
    await userEvent.type(within(links).getByLabelText('Endereço do link 1'), 'http://portal.fecap.br');
    await userEvent.click(within(links).getByRole('button', { name: 'Salvar links' }));
    expect(within(links).getByText('Use de 2 a 60 caracteres.')).toBeInTheDocument();
    expect(within(links).getByText('Use um endereço HTTPS completo (https://…).')).toBeInTheDocument();
    expect(putCalls(calls)).toHaveLength(0);
  });

  it('formato inesperado vira leitura sem edição (nada é sobrescrito às cegas)', async () => {
    settingsApi(makeSettings({ 'knowledge.policy': { value: { requireSecondReviewer: 'sim' } } }));
    renderRoutes(routes, { initialPath: '/admin/configuracoes', session: adminSession() });
    await screen.findByRole('heading', { name: 'Governança da base de conhecimento', level: 2 });
    const knowledge = section('Governança da base de conhecimento');
    expect(within(knowledge).getByText(/não tem o formato esperado/)).toBeInTheDocument();
    expect(within(knowledge).queryByRole('button')).toBeNull();
  });

  it('403 mostra acesso não permitido', async () => {
    mockApi({ 'GET /api/admin/settings': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Acesso não autorizado a este recurso.' } }) });
    renderRoutes(routes, { initialPath: '/admin/configuracoes', session: adminSession() });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
  });

  it('validações e mensagens do servidor em texto legível', () => {
    expect(
      validateBusinessHours(
        [{ weekday: 1, open: true, intervals: [{ start: '08:00', end: '12:00' }, { start: '11:00', end: '13:00' }] }],
        '',
      ),
    ).toEqual({ '1.1': 'As faixas do mesmo dia não podem se sobrepor.' });
    expect(validateLinks([{ label: 'Portal', url: 'https://www.fecap.br' }])).toEqual({});
    const error = new ApiError('validation', 'Valor inválido para este parâmetro.', { status: 400, details: [{ field: 'value.days.0.intervals.1', message: 'O fim deve ser depois do início.' }] });
    expect(describeServerErrors('asa.business_hours', error, { days: [{ weekday: 3, intervals: [] }], note: null })).toEqual(['Quarta-feira, faixa 2: O fim deve ser depois do início.']);
    // mensagens padrão do validador do servidor (em inglês) chegam traduzidas
    const english = new ApiError('validation', 'Valor inválido para este parâmetro.', { status: 400, details: [{ field: 'value.minLeadHours', message: 'Too big: expected number to be <=72' }] });
    expect(describeServerErrors('appointments.policy', english, null)).toEqual(['Antecedência mínima para agendar (horas): Use no máximo 72.']);
  });
});
