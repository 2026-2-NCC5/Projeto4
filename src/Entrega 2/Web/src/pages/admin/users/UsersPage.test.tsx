import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { adminUser, apiError, demoUser, makeAdminUser, studentUser } from '@/features/admin/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import type { AdminUser } from '@/types/api';
import UsersPage from './UsersPage';

const adminSession = () => makeSession(makeMe('technical_admin'));
const routes = [{ path: '/admin/usuarios', element: <UsersPage /> }];
const staffUser = makeAdminUser();
const pendingInvite = makeAdminUser({ id: 'u-new', fullName: 'Nova Pessoa', email: 'nova.pessoa@fecap.br', lastLoginAt: null, activeSessions: 0 });
const me = makeAdminUser({ id: 'user-technical_admin', fullName: 'Administração', email: 'technical_admin@demo.asa', role: 'technical_admin', roleLabel: 'Administração' });

function usersApi(extra: Parameters<typeof mockApi>[0] = {}, items: AdminUser[] = [staffUser, studentUser, demoUser, adminUser, pendingInvite, me]) {
  const byId = new Map(items.map((user) => [user.id, user]));
  return mockApi({
    'GET /api/admin/users': () => ({ data: { items, total: items.length, page: 1, pageSize: 25 } }),
    ...Object.fromEntries([...byId.keys()].map((id) => [`GET /api/admin/users/${id}`, () => ({ data: byId.get(id) })])),
    ...extra,
  });
}

async function openInvite() {
  await userEvent.click(await screen.findByRole('button', { name: 'Convidar pessoa' }));
  return screen.findByRole('dialog', { name: 'Convidar pessoa' });
}

async function fillInvite(dialog: HTMLElement, role: 'Equipe ASA' | 'Administração' = 'Equipe ASA') {
  await userEvent.type(within(dialog).getByLabelText(/Nome completo/), 'Joana Lima');
  await userEvent.type(within(dialog).getByLabelText(/E-mail institucional/), 'joana.lima@fecap.br');
  await userEvent.click(within(dialog).getByRole('radio', { name: new RegExp(`^${role}`) }));
}

describe('Usuários e equipe', () => {
  it('lista contas com papel, situação, demonstração e RA, e consulta a API com paginação', async () => {
    const { calls } = usersApi();
    renderRoutes(routes, { initialPath: '/admin/usuarios', session: adminSession() });
    const table = await screen.findByRole('table', { name: 'Contas da plataforma' });
    const demoRow = within(table).getByText('Estudante Exemplo').closest('tr') as HTMLElement;
    expect(within(demoRow).getByText('Demonstração')).toBeInTheDocument();
    expect(within(demoRow).getByText('RA DEMO-2026-001')).toBeInTheDocument();
    expect(within(within(table).getByText('Maria Souza').closest('tr') as HTMLElement).queryByText('Demonstração')).toBeNull();
    expect(within(within(table).getByText('Nova Pessoa').closest('tr') as HTMLElement).getByText('Convite pendente')).toBeInTheDocument();
    expect(within(within(table).getByText('Nova Pessoa').closest('tr') as HTMLElement).getByText('Nunca entrou')).toBeInTheDocument();
    expect(calls.find((call) => call.path.startsWith('/api/admin/users'))!.path).toBe('/api/admin/users?page=1&pageSize=25');
  });

  it('filtros de papel, situação e demonstração ficam na URL e vão para a API', async () => {
    const { calls } = usersApi();
    const { router } = renderRoutes(routes, { initialPath: '/admin/usuarios', session: adminSession() });
    await screen.findByRole('table', { name: 'Contas da plataforma' });
    await userEvent.selectOptions(screen.getByLabelText('Papel'), 'institutional_staff');
    await userEvent.selectOptions(screen.getByLabelText('Situação'), 'inactive');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contas de demonstração' }));
    expect(router.state.location.search).toBe('?role=institutional_staff&status=inactive&demo=0');
    await waitFor(() => expect(calls.at(-1)!.path).toBe('/api/admin/users?page=1&pageSize=25&role=institutional_staff&status=inactive&includeDemo=false'));
  });

  it('convite com e-mail ativo: envia nome, e-mail e papel e confirma o envio', async () => {
    const { calls } = usersApi({
      'POST /api/admin/users': ({ body }) => ({
        status: 201,
        data: { user: makeAdminUser({ id: 'u-joana', fullName: 'Joana Lima', email: 'joana.lima@fecap.br', lastLoginAt: null }), invitation: { sent: true, message: 'Convite enviado para joana.lima@fecap.br.' }, body },
      }),
    });
    renderRoutes(routes, { initialPath: '/admin/usuarios', session: adminSession() });
    const dialog = await openInvite();
    await fillInvite(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar convite' }));
    const result = await screen.findByRole('dialog', { name: 'Convite enviado' });
    expect(within(result).getByText('Convite enviado para joana.lima@fecap.br.')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST')!.body).toEqual({ fullName: 'Joana Lima', email: 'joana.lima@fecap.br', role: 'institutional_staff' });
  });

  it('convite com e-mail desligado: diz que a conta existe e que nenhum e-mail foi enviado', async () => {
    usersApi({
      'POST /api/admin/users': () => ({
        status: 201,
        data: {
          user: makeAdminUser({ id: 'u-joana', fullName: 'Joana Lima', email: 'joana.lima@fecap.br', role: 'technical_admin', roleLabel: 'Administração', lastLoginAt: null }),
          invitation: { sent: false, message: 'E-mail não configurado neste ambiente: a pessoa pode definir a senha em "Esqueci minha senha" quando o envio estiver ativo.' },
        },
      }),
    });
    renderRoutes(routes, { initialPath: '/admin/usuarios', session: adminSession() });
    const dialog = await openInvite();
    await fillInvite(dialog, 'Administração');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar convite' }));
    const result = await screen.findByRole('dialog', { name: 'Conta criada sem envio de e-mail' });
    expect(within(result).getByText('A conta existe, mas nenhum e-mail foi enviado.')).toBeInTheDocument();
    expect(within(result).getByText(/E-mail não configurado neste ambiente/)).toBeInTheDocument();
    expect(within(result).getByText(/Reenviar convite/)).toBeInTheDocument();
    expect(within(result).queryByText('Convite enviado')).toBeNull();
    expect(await screen.findByText('Conta criada. O e-mail de convite não foi enviado.')).toBeInTheDocument();
  });

  it('valida o convite antes de enviar', async () => {
    const { calls } = usersApi();
    renderRoutes(routes, { initialPath: '/admin/usuarios', session: adminSession() });
    const dialog = await openInvite();
    await userEvent.type(within(dialog).getByLabelText(/E-mail institucional/), 'sem-arroba');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar convite' }));
    expect(within(dialog).getByText('Informe o nome completo (mínimo de 3 caracteres).')).toBeInTheDocument();
    expect(within(dialog).getByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(within(dialog).getByText('Escolha o papel da pessoa.')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('convite recusado: domínio fora da instituição (400 com detalhes) e conta já existente (409)', async () => {
    let attempt = 0;
    usersApi({
      'POST /api/admin/users': () => {
        attempt += 1;
        return attempt === 1
          ? apiError(400, 'VALIDATION_ERROR', 'Use um e-mail institucional.', { details: [{ field: 'email', message: 'domínios aceitos: @fecap.br, @edu.fecap.br' }] })
          : apiError(409, 'CONFLICT', 'Já existe uma conta com este e-mail.', { reason: 'account_exists' });
      },
    });
    renderRoutes(routes, { initialPath: '/admin/usuarios', session: adminSession() });
    const dialog = await openInvite();
    await fillInvite(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar convite' }));
    expect(await within(dialog).findByText('Domínios aceitos: @fecap.br, @edu.fecap.br')).toBeInTheDocument();
    expect(within(dialog).getByText('Use um e-mail institucional.')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar convite' }));
    expect(await within(dialog).findAllByText('Já existe uma conta com este e-mail.')).not.toHaveLength(0);
    expect(within(dialog).getByLabelText(/E-mail institucional/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('mudar o papel pede confirmação explicando que as sessões terminam na hora', async () => {
    const { calls } = usersApi({
      'PATCH /api/admin/users/u-staff': ({ body }) => ({ data: { ...staffUser, ...(body as object), roleLabel: 'Administração', activeSessions: 0 } }),
    });
    renderRoutes(routes, { initialPath: '/admin/usuarios?conta=u-staff', session: adminSession() });
    const drawer = await screen.findByRole('dialog', { name: 'Bruno Atendente' });
    await userEvent.click(await within(drawer).findByRole('radio', { name: /^Administração/ }));
    await userEvent.click(within(drawer).getByRole('button', { name: 'Alterar papel' }));
    const confirm = await screen.findByRole('dialog', { name: 'Alterar papel?' });
    expect(confirm).toHaveTextContent('Bruno Atendente passa de Equipe ASA para Administração.');
    expect(confirm).toHaveTextContent('Todas as sessões dessa pessoa terminam na hora');
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Alterar papel' }));
    expect(await screen.findByText(/Papel de Bruno Atendente alterado para Administração/)).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PATCH')).toMatchObject({ path: '/api/admin/users/u-staff', body: { role: 'technical_admin' } });
  });

  it('409 last_admin (ao tirar o papel ou desativar) explica que é preciso manter uma administração ativa', async () => {
    const { calls } = usersApi({
      'PATCH /api/admin/users/u-admin-2': () => apiError(409, 'CONFLICT', 'É preciso manter pelo menos uma conta de administração ativa.', { reason: 'last_admin' }),
    });
    renderRoutes(routes, { initialPath: '/admin/usuarios?conta=u-admin-2', session: adminSession() });
    const drawer = await screen.findByRole('dialog', { name: 'Carla Administração' });
    const message = /É preciso manter pelo menos uma conta de administração ativa\. Dê o papel de Administração a outra pessoa/;

    await userEvent.click(await within(drawer).findByRole('radio', { name: /^Equipe ASA/ }));
    await userEvent.click(within(drawer).getByRole('button', { name: 'Alterar papel' }));
    const roleConfirm = await screen.findByRole('dialog', { name: 'Alterar papel?' });
    await userEvent.click(within(roleConfirm).getByRole('button', { name: 'Alterar papel' }));
    expect(await within(roleConfirm).findByText(message)).toBeInTheDocument();
    // o aviso também sai como notificação (toast) de falha
    expect(screen.getAllByText(message)).toHaveLength(2);
    expect(calls.find((call) => call.method === 'PATCH')!.body).toEqual({ role: 'institutional_staff' });
    await userEvent.click(within(roleConfirm).getByRole('button', { name: 'Voltar' }));

    await userEvent.click(within(drawer).getByRole('button', { name: 'Desativar conta' }));
    const activeConfirm = await screen.findByRole('dialog', { name: 'Desativar conta?' });
    expect(activeConfirm).toHaveTextContent('terminam na hora');
    expect(within(activeConfirm).queryByText(message)).toBeNull();
    await userEvent.click(within(activeConfirm).getByRole('button', { name: 'Desativar conta' }));
    expect(await within(activeConfirm).findByText(message)).toBeInTheDocument();
    expect(calls.filter((call) => call.method === 'PATCH').at(-1)!.body).toEqual({ isActive: false });
  });

  it('contas de aluno não oferecem mudança de papel', async () => {
    usersApi();
    renderRoutes(routes, { initialPath: '/admin/usuarios?conta=u-student', session: adminSession() });
    const drawer = await screen.findByRole('dialog', { name: 'Maria Souza' });
    expect(await within(drawer).findByText(/Contas de aluno não mudam de papel/)).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Alterar papel' })).toBeNull();
    expect(within(drawer).queryByRole('radio')).toBeNull();
    expect(within(drawer).getByText('26000001')).toBeInTheDocument();
  });

  it('a própria conta não oferece mudança de papel nem desativação', async () => {
    usersApi();
    renderRoutes(routes, { initialPath: '/admin/usuarios?conta=user-technical_admin', session: adminSession() });
    const drawer = await screen.findByRole('dialog', { name: 'Administração' });
    expect(await within(drawer).findByText(/Você não pode alterar o próprio papel/)).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Desativar conta' })).toBeNull();
    expect(within(drawer).getByRole('button', { name: 'Encerrar minhas outras sessões' })).toBeInTheDocument();
  });

  it('encerrar sessões pede confirmação e informa quantas terminaram', async () => {
    const { calls } = usersApi({ 'POST /api/admin/users/u-staff/revoke-sessions': () => ({ data: { revoked: 2 } }) });
    renderRoutes(routes, { initialPath: '/admin/usuarios?conta=u-staff', session: adminSession() });
    const drawer = await screen.findByRole('dialog', { name: 'Bruno Atendente' });
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Encerrar sessões' }));
    const confirm = await screen.findByRole('dialog', { name: 'Encerrar todas as sessões?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Encerrar sessões' }));
    expect(await screen.findByText('2 sessões encerradas.')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST' && call.path === '/api/admin/users/u-staff/revoke-sessions')).toBe(true);
  });

  it('reenviar convite mostra o resultado real (sem envio quando o e-mail está desligado)', async () => {
    usersApi({ 'POST /api/admin/users/u-new/invite': () => ({ data: { sent: false, message: 'E-mail não configurado neste ambiente.' } }) });
    renderRoutes(routes, { initialPath: '/admin/usuarios?conta=u-new', session: adminSession() });
    const drawer = await screen.findByRole('dialog', { name: 'Nova Pessoa' });
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Reenviar convite' }));
    expect(await within(drawer).findByText('Convite não enviado')).toBeInTheDocument();
    expect(within(drawer).getByText('E-mail não configurado neste ambiente.')).toBeInTheDocument();
  });

  it('403 da lista mostra acesso não permitido', async () => {
    mockApi({ 'GET /api/admin/users': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Acesso não autorizado a este recurso.' } }) });
    renderRoutes(routes, { initialPath: '/admin/usuarios', session: adminSession() });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
  });
});
