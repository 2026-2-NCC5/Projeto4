import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeStudentContext } from '@/features/support/staff/testFixtures';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import StudentContextPage from './StudentContextPage';
import StudentsPage from './StudentsPage';

const staffSession = () => makeSession(makeMe('institutional_staff'));

describe('Alunos atendidos', () => {
  it('lista com busca e paginação no servidor', async () => {
    const { calls } = mockApi({
      'GET /api/asa/students': ({ url }) => ({
        data: {
          items: [{ ...makeStudentContext().student, fullName: url.searchParams.get('page') === '2' ? 'Bruno Lima' : 'Maria Souza' }],
          total: 45,
        },
      }),
    });
    renderRoutes([{ path: '/asa/alunos', element: <StudentsPage /> }, { path: '/asa/alunos/:id', element: <p>contexto</p> }], { initialPath: '/asa/alunos?busca=souza', session: staffSession() });
    const link = await screen.findByRole('link', { name: 'Maria Souza' });
    expect(link).toHaveAttribute('href', '/asa/alunos/student-1');
    expect(screen.getByText(/Notas, frequência e análises do agente acadêmico/)).toBeInTheDocument();
    expect(calls[0]!.path).toBe('/api/asa/students?search=souza&page=1&pageSize=20');
    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(await screen.findByRole('link', { name: 'Bruno Lima' })).toBeInTheDocument();
    expect(calls.at(-1)!.path).toBe('/api/asa/students?search=souza&page=2&pageSize=20');
  });
});

describe('Contexto do aluno', () => {
  it('mostra contato institucional, o aviso de auditoria e os chamados, sem dados acadêmicos', async () => {
    mockApi({ 'GET /api/asa/students/student-1': () => ({ data: makeStudentContext() }) });
    renderRoutes([{ path: '/asa/alunos/:id', element: <StudentContextPage /> }], { initialPath: '/asa/alunos/student-1', session: staffSession() });
    expect(await screen.findByRole('heading', { level: 1, name: 'Maria Souza' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Consulta registrada na auditoria (finalidade: atendimento).');
    expect(screen.getByRole('link', { name: 'maria.souza@edu.fecap.br' })).toHaveAttribute('href', 'mailto:maria.souza@edu.fecap.br');
    expect(screen.getByText(/Minimização de dados/)).toBeInTheDocument();
    const tickets = screen.getByRole('list', { name: 'Chamados do aluno' });
    expect(within(tickets).getByRole('link', { name: /Boleto da mensalidade/ })).toHaveAttribute('href', '/asa/chamados/t-1');
    expect(screen.queryByText(/Média|Frequência média/)).toBeNull();
  });

  it('aluno sem atendimentos (404) mostra a explicação de finalidade', async () => {
    mockApi({});
    renderRoutes([{ path: '/asa/alunos/:id', element: <StudentContextPage /> }], { initialPath: '/asa/alunos/x', session: staffSession() });
    expect(await screen.findByText('Aluno sem atendimentos registrados')).toBeInTheDocument();
    expect(screen.getByText('A equipe só consulta alunos que já interagiram com o ASA.')).toBeInTheDocument();
  });
});
