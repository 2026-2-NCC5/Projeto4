import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, makeSlaPolicies } from '@/features/admin/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import type { SlaPolicyUpdate } from '@/types/api';
import SlaPoliciesPage, { validateSla } from './SlaPoliciesPage';

const adminSession = () => makeSession(makeMe('technical_admin'));
const routes = [{ path: '/admin/sla', element: <SlaPoliciesPage /> }];

async function openEditor(category: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Editar meta de ${category}` }));
  return screen.findByRole('dialog', { name: `Meta de ${category}` });
}

describe('SLA e categorias', () => {
  it('mostra padrão × personalizada, com quem e quando alterou, e avisa que vale para chamados novos', async () => {
    mockApi({ 'GET /api/admin/sla-policies': () => ({ data: makeSlaPolicies() }) });
    renderRoutes(routes, { initialPath: '/admin/sla', session: adminSession() });
    const table = await screen.findByRole('table', { name: 'Metas de SLA por categoria' });
    const academic = within(table).getByRole('button', { name: 'Editar meta de Acadêmico' }).closest('tr') as HTMLElement;
    expect(within(academic).getByText('Padrão do catálogo')).toBeInTheDocument();
    expect(within(academic).getByText('Nunca alterada')).toBeInTheDocument();
    expect(within(academic).getByText('24 h')).toBeInTheDocument();
    const financial = within(table).getByRole('button', { name: 'Editar meta de Financeiro' }).closest('tr') as HTMLElement;
    expect(within(financial).getByText('Personalizada')).toBeInTheDocument();
    expect(within(financial).getByText('8 h')).toBeInTheDocument();
    expect(within(financial).getByText('4 dias úteis')).toBeInTheDocument();
    expect(within(financial).getByText('padrão: 2 dias úteis')).toBeInTheDocument();
    expect(financial).toHaveTextContent('Alterado por Carla Administração em 10/10/2026 às 12:30.');
    expect(screen.getByText('Mudanças valem só para chamados abertos depois de salvar')).toBeInTheDocument();
    // não existe "excluir meta" na API: a página não oferece
    expect(screen.queryByRole('button', { name: /Excluir|Remover|Restaurar/ })).toBeNull();
  });

  it('valida os limites antes de enviar e grava com PUT', async () => {
    const saved = makeSlaPolicies().map((policy) => (policy.categoryId === 'financial' ? { ...policy, firstResponseHours: 12, resolutionBusinessDays: 5, updatedAt: '2026-10-15T12:00:00.000Z', updatedBy: 'Administração' } : policy));
    const { calls } = mockApi({
      'GET /api/admin/sla-policies': () => ({ data: makeSlaPolicies() }),
      'PUT /api/admin/sla-policies/financial': () => ({ data: saved }),
    });
    renderRoutes(routes, { initialPath: '/admin/sla', session: adminSession() });
    const dialog = await openEditor('Financeiro');
    const first = within(dialog).getByLabelText(/^Primeira resposta \(horas\)/);
    const days = within(dialog).getByLabelText(/^Solução \(dias úteis\)/);
    expect(first).toHaveValue(8);
    await userEvent.clear(first);
    await userEvent.type(first, '0');
    await userEvent.clear(days);
    await userEvent.type(days, '31');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar meta' }));
    expect(within(dialog).getByText('Use um número inteiro de 1 a 240.')).toBeInTheDocument();
    expect(within(dialog).getByText('Use um número inteiro de 1 a 30.')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);

    await userEvent.clear(first);
    await userEvent.type(first, '12');
    await userEvent.clear(days);
    await userEvent.type(days, '5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar meta' }));
    expect(await screen.findByText('Meta de Financeiro salva. Vale para os chamados abertos a partir de agora.')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PUT')).toMatchObject({ path: '/api/admin/sla-policies/financial', body: { firstResponseHours: 12, resolutionBusinessDays: 5 } satisfies SlaPolicyUpdate });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Meta de Financeiro' })).toBeNull());
    const row = screen.getByRole('button', { name: 'Editar meta de Financeiro' }).closest('tr') as HTMLElement;
    expect(within(row).getByText('12 h')).toBeInTheDocument();
    expect(within(row).getByText('5 dias úteis')).toBeInTheDocument();
  });

  it('400 do servidor aparece no campo e o diálogo continua aberto', async () => {
    mockApi({
      'GET /api/admin/sla-policies': () => ({ data: makeSlaPolicies() }),
      'PUT /api/admin/sla-policies/academic': () => apiError(400, 'VALIDATION_ERROR', 'Dados inválidos.', { details: [{ field: 'resolutionBusinessDays', message: 'acima do limite institucional' }] }),
    });
    renderRoutes(routes, { initialPath: '/admin/sla', session: adminSession() });
    const dialog = await openEditor('Acadêmico');
    await userEvent.clear(within(dialog).getByLabelText(/^Solução \(dias úteis\)/));
    await userEvent.type(within(dialog).getByLabelText(/^Solução \(dias úteis\)/), '20');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar meta' }));
    expect(await within(dialog).findByText('Acima do limite institucional')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Meta de Acadêmico' })).toBeInTheDocument();
  });

  it('validateSla aceita só inteiros dentro dos limites', () => {
    expect(validateSla({ firstResponseHours: '240', resolutionBusinessDays: '1' })).toEqual({});
    expect(Object.keys(validateSla({ firstResponseHours: '2.5', resolutionBusinessDays: '' }))).toEqual(['firstResponseHours', 'resolutionBusinessDays']);
  });

  it('503 database_required explica que depende do banco', async () => {
    mockApi({ 'GET /api/admin/sla-policies': () => apiError(503, 'DEPENDENCY_ERROR', 'A administração exige o banco de dados PostgreSQL.', { reason: 'database_required' }) });
    renderRoutes(routes, { initialPath: '/admin/sla', session: adminSession() });
    expect(await screen.findByText('Indisponível neste ambiente')).toBeInTheDocument();
  });

  it('403 mostra acesso não permitido', async () => {
    mockApi({ 'GET /api/admin/sla-policies': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Acesso não autorizado a este recurso.' } }) });
    renderRoutes(routes, { initialPath: '/admin/sla', session: adminSession() });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
  });
});
