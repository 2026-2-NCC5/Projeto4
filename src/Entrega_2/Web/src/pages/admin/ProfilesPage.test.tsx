import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makePermissionMatrix } from '@/features/admin/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import ProfilesPage from './ProfilesPage';

const routes = [{ path: '/admin/perfis', element: <ProfilesPage /> }];

describe('Papéis e perfis', () => {
  it('mostra somente os papéis e as contagens devolvidos pela API', async () => {
    const matrix = makePermissionMatrix();
    mockApi({ 'GET /api/admin/permissions': () => ({ data: matrix }) });
    renderRoutes(routes, { initialPath: '/admin/perfis', session: makeSession(makeMe('technical_admin')) });
    expect(await screen.findByRole('heading', { name: 'Papéis e perfis' })).toBeInTheDocument();
    for (const role of matrix.roles) {
      expect(await screen.findByRole('heading', { name: role.label })).toBeInTheDocument();
    }
    for (const count of new Set(matrix.roles.map((role) => role.permissions.length))) {
      expect(await screen.findAllByText(`${count} permissões`)).toHaveLength(matrix.roles.filter((role) => role.permissions.length === count).length);
    }
    expect(screen.getByRole('link', { name: /Gerenciar usuários/ })).toHaveAttribute('href', '/admin/usuarios');
  });

  it('bloqueia a tela sem consultar a API quando o papel não tem leitura de permissões', async () => {
    const { calls } = mockApi({ 'GET /api/admin/permissions': () => ({ data: makePermissionMatrix() }) });
    renderRoutes(routes, { initialPath: '/admin/perfis', session: makeSession(makeMe('institutional_staff')) });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
