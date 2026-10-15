import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeHealth } from '@/features/admin/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import HealthPage, { formatUptime } from './HealthPage';

const adminSession = () => makeSession(makeMe('technical_admin'));
const routes = [{ path: '/admin/saude', element: <HealthPage /> }];

const row = (name: string) => screen.getByRole('heading', { name, level: 3 }).closest('li') as HTMLElement;
/** Valor de um par rótulo/valor (<dt> → <dd>). */
const fact = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

describe('Saúde dos serviços', () => {
  it('mostra API, banco com migrations pendentes, Agent Service, fila, e-mail e push, com o horário da verificação', async () => {
    mockApi({ 'GET /api/admin/health': () => ({ data: makeHealth() }) });
    renderRoutes(routes, { initialPath: '/admin/saude', session: adminSession() });

    expect(await screen.findByText('Versão', { selector: 'dt' })).toBeInTheDocument();
    expect(fact('Versão')).toBe('1.0.0');
    expect(fact('Ambiente')).toBe('Desenvolvimento');
    expect(fact('No ar há')).toBe('1 h 5 min');
    expect(fact('Node.js')).toBe('v24.10.0');
    expect(fact('Memória em uso')).toBe('151 MB');
    // horário do servidor no fuso da instituição
    expect(screen.getByText('09:05').parentElement).toHaveTextContent('Verificado às 09:05 de 15/10/2026');

    const database = row('Banco de dados (PostgreSQL)');
    expect(within(database).getByText('Instável')).toBeInTheDocument();
    expect(within(database).getByText('1 migration pendente')).toBeInTheDocument();
    expect(within(database).getByText('011_new_feature.sql')).toBeInTheDocument();
    expect(within(database).getByText('Ver migrations aplicadas (2)')).toBeInTheDocument();

    const agent = row('Agent Service (Agente para o Estudante)');
    expect(within(agent).getByText('Funcionando')).toBeInTheDocument();
    expect(within(agent).getByText('12 ms')).toBeInTheDocument();
    expect(within(agent).getByText('2026.10')).toBeInTheDocument();

    const queue = row('Fila presencial do ASA');
    expect(within(queue).getByText('Simulador de demonstração')).toBeInTheDocument();
    expect(within(queue).getByText('Sim')).toBeInTheDocument();

    expect(within(row('E-mail (recuperação de senha e convites)')).getByText('Desligado')).toBeInTheDocument();
    const push = row('Notificações push');
    expect(within(push).getByText('Somente registro no log')).toBeInTheDocument();
    // e-mail e push: o servidor informa a configuração, sem testar a entrega
    expect(within(push).getByText(/Sem teste de entrega nesta verificação/)).toBeInTheDocument();
  });

  it('“Verificar agora” consulta o servidor de novo', async () => {
    let checks = 0;
    const { calls } = mockApi({
      'GET /api/admin/health': () => {
        checks += 1;
        return { data: makeHealth({ checkedAt: checks === 1 ? '2026-10-15T12:05:00.000Z' : '2026-10-15T12:10:00.000Z' }) };
      },
    });
    renderRoutes(routes, { initialPath: '/admin/saude', session: adminSession() });
    expect(await screen.findByText('09:05')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Verificar agora' }));
    expect(await screen.findByText('09:10')).toBeInTheDocument();
    expect(calls.filter((call) => call.path === '/api/admin/health')).toHaveLength(2);
  });

  it('formatUptime não exibe "0 min" para quem acabou de subir', () => {
    expect(formatUptime(42)).toBe('menos de 1 min');
    expect(formatUptime(2 * 86_400 + 3_600)).toBe('2 d 1 h');
  });

  it('erro na verificação mostra a falha com nova tentativa', async () => {
    mockApi({ 'GET /api/admin/health': () => ({ status: 500, error: { code: 'INTERNAL_ERROR', message: 'falha' } }) });
    renderRoutes(routes, { initialPath: '/admin/saude', session: adminSession() });
    expect(await screen.findByText('Não foi possível verificar os serviços')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('403 mostra acesso não permitido', async () => {
    mockApi({ 'GET /api/admin/health': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Acesso não autorizado a este recurso.' } }) });
    renderRoutes(routes, { initialPath: '/admin/saude', session: adminSession() });
    expect(await screen.findByRole('heading', { name: 'Acesso não permitido' })).toBeInTheDocument();
  });
});
