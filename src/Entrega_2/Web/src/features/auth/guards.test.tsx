import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import LoginPage from '@/pages/auth/LoginPage';
import { ApiError } from '@/services/api/client';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import { platformHasInstitutionalData, RedirectIfAuthenticated, RequireAuth, RequireInstitutionalData, RequireRole } from './guards';
import type { PlatformInfo } from '@/types/api';

const protectedRoutes = [
  { path: '/login', element: <p>tela de login</p> },
  {
    path: '/asa',
    element: (
      <RequireAuth>
        <RequireRole role="institutional_staff">
          <p>fila da equipe</p>
        </RequireRole>
      </RequireAuth>
    ),
  },
];

describe('guardas de rota (experiência; o servidor autoriza de verdade)', () => {
  it('sem sessão manda para o login lembrando a página pedida', async () => {
    const { router } = renderRoutes(protectedRoutes, { initialPath: '/asa?filtro=1', session: makeSession(null) });
    expect(await screen.findByText('tela de login')).toBeInTheDocument();
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/asa?filtro=1')}`);
  });

  it('perfil de outra área vê "acesso não permitido" com o link da própria área', async () => {
    renderRoutes(protectedRoutes, { initialPath: '/asa', session: makeSession(makeMe('student')) });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
    expect(screen.queryByText('fila da equipe')).toBeNull();
    expect(screen.getByRole('link', { name: '/aluno' })).toHaveAttribute('href', '/aluno');
  });

  it('equipe ASA entra na própria área', async () => {
    renderRoutes(protectedRoutes, { initialPath: '/asa', session: makeSession(makeMe('institutional_staff')) });
    expect(await screen.findByText('fila da equipe')).toBeInTheDocument();
  });
});

describe('bloqueio de dados não institucionais em produção', () => {
  const platformInfo = (dataMode: 'demo' | 'institutional', provider: 'demo' | 'institutional') => ({
    dataMode,
    academicSource: { provider },
  }) as PlatformInfo;

  it('reconhece somente a origem marcada como institucional pela API', () => {
    expect(platformHasInstitutionalData(platformInfo('institutional', 'institutional'))).toBe(true);
    expect(platformHasInstitutionalData(platformInfo('demo', 'demo'))).toBe(false);
    expect(platformHasInstitutionalData(platformInfo('institutional', 'demo'))).toBe(false);
    expect(platformHasInstitutionalData(undefined)).toBe(false);
  });

  it('bloqueia login quando a API informa dados de demonstração', async () => {
    mockApi({ 'GET /api/platform/info': () => ({ data: platformInfo('demo', 'demo') }) });
    renderRoutes([{ path: '/', element: <RequireInstitutionalData enforce><p>tela de login</p></RequireInstitutionalData> }], { session: makeSession(null) });
    expect(await screen.findByRole('alert')).toHaveTextContent('A API vinculada ao portal informa modo de demonstração');
    expect(screen.queryByText('tela de login')).toBeNull();
  });

  it('falha fechada se não consegue confirmar a origem dos dados', async () => {
    mockApi({});
    renderRoutes([{ path: '/', element: <RequireInstitutionalData enforce><p>área autenticada</p></RequireInstitutionalData> }], { session: makeSession(null) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível confirmar que a API está usando uma fonte institucional');
    expect(screen.queryByText('área autenticada')).toBeNull();
  });

  it('permite a área quando a API confirma o modo institucional', async () => {
    mockApi({ 'GET /api/platform/info': () => ({ data: platformInfo('institutional', 'institutional') }) });
    renderRoutes([{ path: '/', element: <RequireInstitutionalData enforce><p>área autenticada</p></RequireInstitutionalData> }], { session: makeSession(null) });
    expect(await screen.findByText('área autenticada')).toBeInTheDocument();
  });
});

describe('login', () => {
  const routes = [
    { path: '/login', element: <RedirectIfAuthenticated><LoginPage /></RedirectIfAuthenticated> },
    { path: '/aluno', element: <p>área do aluno</p> },
    { path: '/asa', element: <p>área da equipe</p> },
  ];

  it('mostra a mensagem certa para credenciais inválidas sem revelar detalhes', async () => {
    mockApi({ 'GET /api/platform/info': () => ({ data: undefined }) });
    const login = vi.fn(async () => {
      throw new ApiError('unauthorized', 'E-mail ou senha inválidos.', { status: 401, reason: 'invalid_credentials' });
    });
    renderRoutes(routes, { initialPath: '/login', session: makeSession(null, { login }) });
    fireEvent.change(await screen.findByLabelText(/E-mail/), { target: { value: 'aluno@demo.asa' } });
    fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: 'errada' } });
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
    expect(login).toHaveBeenCalledWith('aluno@demo.asa', 'errada', false);
  });

  it('após entrar vai para a área do papel e ignora "next" de outra área', async () => {
    mockApi({ 'GET /api/platform/info': () => ({ data: undefined }) });
    const login = vi.fn(async () => makeMe('institutional_staff'));
    const { router } = renderRoutes(routes, { initialPath: `/login?next=${encodeURIComponent('/admin/usuarios')}`, session: makeSession(null, { login }) });
    fireEvent.change(await screen.findByLabelText(/E-mail/), { target: { value: 'atendente.asa@demo.asa' } });
    fireEvent.change(screen.getByLabelText(/^Senha/), { target: { value: 'Demo@2026' } });
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('área da equipe')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/asa');
  });
});
