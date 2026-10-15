import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACADEMIC_UNAVAILABLE } from '@/features/academic/testing/fixtures';
import { mockApi, renderRoutes } from '@/test/utils';
import type { StudentPendingItem } from '@/types/api';
import PendingItemsPage from './PendingItemsPage';

const routes = [{ path: '/aluno/pendencias', element: <PendingItemsPage /> }];

const item = (overrides: Partial<StudentPendingItem>): StudentPendingItem => ({
  id: 'p',
  subjectId: 'subject-db',
  subjectName: 'Banco de Dados',
  type: 'assignment',
  description: 'Entrega',
  dueDate: null,
  status: 'pending',
  ...overrides,
});

/** Ordem da API: prazo mais próximo primeiro, sem prazo no fim (pending_items order by due_date nulls last). */
const API_ORDER: StudentPendingItem[] = [
  item({ id: 'late-flagged', description: 'Lista 2 de exercícios', dueDate: '2026-09-10', status: 'overdue', subjectId: 'subject-ai', subjectName: 'Inteligência Artificial', type: 'activity' }),
  item({ id: 'late-by-date', description: 'Entrega do trabalho prático', dueDate: '2026-09-22', status: 'pending' }),
  item({ id: 'done', description: 'Relatório parcial', dueDate: '2026-10-01', status: 'completed' }),
  item({ id: 'soon', description: 'Prova substitutiva', dueDate: '2026-10-20', status: 'pending', type: 'exam' }),
  item({ id: 'no-date', description: 'Enviar comprovante de matrícula', dueDate: null, status: 'pending', type: 'document', subjectId: null, subjectName: null }),
];

describe('Pendências', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('agrupa em atrasadas, pendentes e concluídas mantendo a ordem da API em cada grupo', async () => {
    mockApi({ 'GET /api/student/pending-items': () => ({ data: API_ORDER }) });
    renderRoutes(routes, { initialPath: '/aluno/pendencias' });

    expect(await screen.findByText('4 itens precisam de atenção')).toHaveAttribute('role', 'status');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(['Atrasadas (2)', 'Pendentes (2)', 'Concluídas (1)']);

    const late = within(screen.getByRole('list', { name: 'Pendências: atrasadas' })).getAllByRole('listitem');
    expect(late.map((row) => row.querySelector('p')?.textContent)).toEqual(['Lista 2 de exercícios', 'Entrega do trabalho prático']);
    // prazo vencido sem marcação da fonte também aparece como atrasada (mesma regra do app)
    expect(late[1]).toHaveTextContent('Atrasada');
    expect(late[1]).toHaveTextContent('Prazo: 22/09/2026 (há 23 dias)');
    expect(late[0]).toHaveTextContent('Atividade · Inteligência Artificial');
    expect(within(late[0]!).getByRole('link')).toHaveAttribute('href', '/aluno/academico?disciplina=subject-ai');

    const open = within(screen.getByRole('list', { name: 'Pendências: pendentes' })).getAllByRole('listitem');
    expect(open[0]).toHaveTextContent('Prova substitutiva');
    expect(open[0]).toHaveTextContent('Prazo: 20/10/2026 (em 5 dias)');
    expect(open[0]).toHaveTextContent('Pendente');
    expect(open[1]).toHaveTextContent('Sem prazo definido');
    expect(open[1]).toHaveTextContent('Documento');
    expect(within(open[1]!).queryByRole('link')).toBeNull(); // sem disciplina, sem link

    const done = within(screen.getByRole('list', { name: 'Pendências: concluídas' })).getAllByRole('listitem');
    expect(done[0]).toHaveTextContent('Concluída');
  });

  it('lista vazia e fonte acadêmica indisponível (503) com a mensagem do servidor', async () => {
    mockApi({ 'GET /api/student/pending-items': () => ({ data: [] }) });
    const first = renderRoutes(routes, { initialPath: '/aluno/pendencias' });
    expect(await screen.findByText('Nenhuma pendência encontrada')).toBeInTheDocument();
    first.unmount();

    mockApi({ 'GET /api/student/pending-items': () => ACADEMIC_UNAVAILABLE });
    renderRoutes(routes, { initialPath: '/aluno/pendencias' });
    expect(await screen.findByText('Dados acadêmicos indisponíveis')).toBeInTheDocument();
    expect(screen.getByText(/nenhuma fonte institucional configurada/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('403 mostra acesso não permitido', async () => {
    mockApi({ 'GET /api/student/pending-items': () => ({ status: 403, error: { code: 'FORBIDDEN', message: 'Este recurso é exclusivo para estudantes.' } }) });
    renderRoutes(routes, { initialPath: '/aluno/pendencias' });
    expect(await screen.findByText('Acesso não permitido')).toBeInTheDocument();
    expect(screen.getByText('Este recurso é exclusivo para estudantes.')).toBeInTheDocument();
  });
});
