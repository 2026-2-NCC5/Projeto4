import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makePermissionMatrix } from '@/features/admin/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import PermissionsPage, { groupPermissions } from './PermissionsPage';

const adminSession = () => makeSession(makeMe('technical_admin'));
const routes = [{ path: '/admin/permissoes', element: <PermissionsPage /> }];

describe('Permissões', () => {
  it('mostra a matriz por grupo × papel, só para leitura, dizendo que quem decide é o servidor', async () => {
    mockApi({ 'GET /api/admin/permissions': () => ({ data: makePermissionMatrix() }) });
    renderRoutes(routes, { initialPath: '/admin/permissoes', session: adminSession() });

    const attendance = await screen.findByRole('table', { name: 'Permissões do grupo Atendimento por papel' });
    const metadataRow = within(attendance).getByText('tickets:read:metadata').closest('tr') as HTMLElement;
    expect(within(metadataRow).getByText('Aluno: não permitido')).toBeInTheDocument();
    expect(within(metadataRow).getByText('Equipe ASA: não permitido')).toBeInTheDocument();
    expect(within(metadataRow).getByText('Administração: permitido')).toBeInTheDocument();
    const anyRow = within(attendance).getByText('tickets:read:any').closest('tr') as HTMLElement;
    expect(within(anyRow).getByText('Equipe ASA: permitido')).toBeInTheDocument();
    expect(within(anyRow).getByText('Administração: não permitido')).toBeInTheDocument();

    expect(screen.getByRole('table', { name: 'Permissões do grupo Conta por papel' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Permissões do grupo Governança por papel' })).toBeInTheDocument();
    expect(screen.getByText('Quem decide é o servidor')).toBeInTheDocument();
    expect(screen.getByText(/são conveniência, não proteção/)).toBeInTheDocument();
    // nenhum controle de edição
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('agrupa na ordem enviada pelo servidor', () => {
    expect(groupPermissions(makePermissionMatrix()).map((group) => group.group)).toEqual(['Conta', 'Atendimento', 'Governança']);
  });

  it('403 mostra acesso não permitido', async () => {
    mockApi({ 'GET /api/admin/permissions': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Acesso não autorizado a este recurso.' } }) });
    renderRoutes(routes, { initialPath: '/admin/permissoes', session: adminSession() });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
  });

  it('erro do servidor mostra a falha', async () => {
    mockApi({ 'GET /api/admin/permissions': () => ({ status: 500, error: { code: 'INTERNAL_ERROR', message: 'falha' } }) });
    renderRoutes(routes, { initialPath: '/admin/permissoes', session: adminSession() });
    expect(await screen.findByText('Não foi possível carregar a matriz')).toBeInTheDocument();
  });
});
