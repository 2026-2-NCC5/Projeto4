import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACADEMIC_UNAVAILABLE,
  makeAnalysis,
  makeAssessments,
  makeAttendance,
  makeHistoryItem,
  makePendingItems,
  makePlatformInfo,
  makeProfile,
  makeRecommendation,
  makeRecommendationDetail,
  makeSubjects,
  makeSummary,
} from '@/features/academic/testing/fixtures';
import { mockApi, renderRoutes } from '@/test/utils';
import AcademicPage from './AcademicPage';

const routes = [
  { path: '/aluno/academico', element: <AcademicPage /> },
  { path: '/aluno/pendencias', element: <p>pendências</p> },
];

type Routes = Parameters<typeof mockApi>[0];

function academicRoutes(extra: Routes = {}) {
  return mockApi({
    'GET /api/platform/info': () => ({ data: makePlatformInfo() }),
    'GET /api/student/me': () => ({ data: makeProfile() }),
    'GET /api/student/summary': () => ({ data: makeSummary() }),
    'GET /api/student/subjects': () => ({ data: makeSubjects() }),
    'GET /api/student/assessments': () => ({ data: makeAssessments() }),
    'GET /api/student/attendance': () => ({ data: makeAttendance() }),
    'GET /api/student/pending-items': () => ({ data: makePendingItems() }),
    'GET /api/agent/recommendations': () => ({ data: makeAnalysis() }),
    'GET /api/agent/history': () => ({ data: [makeHistoryItem()] }),
    ...extra,
  });
}

describe('Vida acadêmica', () => {
  // "hoje" fixo: 15/10/2026 em São Paulo (prazos relativos dependem do relógio)
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra resumo, origem dos dados, disciplinas de relance e o detalhe de cada disciplina', async () => {
    academicRoutes();
    const user = userEvent.setup();
    const { router } = renderRoutes(routes, { initialPath: '/aluno/academico' });

    expect(await screen.findByText('RA DEMO-2026-001 · Ciências da Computação')).toBeInTheDocument();
    expect(await screen.findByRole('note', { name: 'Origem dos dados acadêmicos' })).toHaveTextContent('DEMONSTRAÇÃO — Dados fictícios');
    const summary = await screen.findByRole('region', { name: 'Resumo acadêmico' });
    expect(within(summary).getByText('7,6')).toBeInTheDocument();
    expect(within(summary).getByText('95%')).toBeInTheDocument();
    expect(within(summary).getByText('1 em atenção na última análise')).toBeInTheDocument();

    const list = await screen.findByRole('region', { name: 'Minhas disciplinas' });
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('Banco de Dados');
    expect(links[0]).toHaveTextContent('Atenção');
    expect(links[0]).toHaveTextContent('Média7,0');
    expect(links[0]).toHaveTextContent('Frequência78%');
    expect(links[0]).toHaveAttribute('href', '/aluno/academico?disciplina=subject-db');
    expect(links[1]).not.toHaveTextContent('Atenção');

    await user.click(links[0]!);
    expect(router.state.location.search).toBe('?disciplina=subject-db');
    expect(await screen.findByRole('heading', { level: 2, name: 'Banco de Dados' })).toBeInTheDocument();
    const grades = await screen.findByRole('region', { name: 'Avaliações de Banco de Dados' });
    expect(within(grades).getAllByRole('listitem')).toHaveLength(2);
    expect(within(grades).getByText('Aguardando nota')).toBeInTheDocument();
    expect(within(grades).getByText(/abaixo de 60% da nota máxima/)).toBeInTheDocument();
    expect(within(grades).queryByText('Prova 1')).toBeNull(); // nota de outra disciplina não aparece
    const attendance = screen.getByRole('region', { name: 'Frequência em Banco de Dados' });
    expect(within(attendance).getByText('7 de 9 aulas')).toBeInTheDocument();
    expect(within(attendance).getAllByText('Atenção').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Pendências de Banco de Dados' })).toHaveTextContent('Prazo: 20/10/2026 (em 5 dias)');
    expect(screen.getByText(/A última análise do Agente para o Estudante trouxe uma recomendação/)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Todas as disciplinas' }));
    expect(await screen.findByRole('region', { name: 'Minhas disciplinas' })).toBeInTheDocument();
  });

  it('abas de avaliações (com filtro por disciplina) e de frequência (com o mínimo exigido)', async () => {
    academicRoutes();
    const user = userEvent.setup();
    const { router } = renderRoutes(routes, { initialPath: '/aluno/academico?aba=avaliacoes' });

    expect(await screen.findByRole('tab', { name: 'Avaliações' })).toHaveAttribute('aria-selected', 'true');
    const grades = await screen.findByRole('region', { name: 'Avaliações e notas' });
    expect(within(grades).getAllByRole('listitem')).toHaveLength(3);
    expect(within(grades).getByText('3 registros')).toBeInTheDocument();
    await user.selectOptions(within(grades).getByRole('combobox', { name: 'Disciplina' }), 'subject-ai');
    expect(within(grades).getAllByRole('listitem')).toHaveLength(1);
    expect(within(grades).getByText('8,2')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Frequência' }));
    expect(router.state.location.search).toBe('?aba=frequencia');
    const attendance = await screen.findByRole('region', { name: 'Frequência por disciplina' });
    expect(attendance).toHaveTextContent('Mínimo exigido: 75%');
    const rows = within(attendance).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Banco de Dados');
    expect(rows[0]).toHaveTextContent('78%');
    expect(rows[0]).toHaveTextContent('Atenção');
    expect(rows[1]).toHaveTextContent('90%');
    expect(rows[1]).not.toHaveTextContent('Atenção');
  });

  it('503 academic_source_unavailable mostra a mensagem do servidor e nenhum dado no lugar', async () => {
    const { calls } = academicRoutes({
      'GET /api/student/summary': () => ACADEMIC_UNAVAILABLE,
      'GET /api/student/subjects': () => ACADEMIC_UNAVAILABLE,
      'GET /api/student/assessments': () => ACADEMIC_UNAVAILABLE,
      'GET /api/student/attendance': () => ACADEMIC_UNAVAILABLE,
      'GET /api/student/pending-items': () => ACADEMIC_UNAVAILABLE,
    });
    renderRoutes(routes, { initialPath: '/aluno/academico' });

    expect(await screen.findByText('Dados acadêmicos indisponíveis')).toBeInTheDocument();
    expect(screen.getByText(/Modo demonstração desligado e nenhuma fonte institucional configurada/)).toBeInTheDocument();
    expect(screen.getByText(/não mostra dados de exemplo no lugar/)).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Resumo acadêmico' })).toBeNull();
    expect(screen.queryByText('Banco de Dados')).toBeNull();
    expect(calls.filter((call) => call.path === '/api/student/summary')).toHaveLength(1);
  });

  it('pede uma análise ao agente e avalia a recomendação (útil + comentário)', async () => {
    const fresh = makeAnalysis({ runId: 'run-2', createdAt: '2026-10-15T12:00:00.000Z', recommendations: [makeRecommendation({ id: 'rec-2', type: 'attendance_attention', message: 'Sua frequência em Banco de Dados merece atenção.' })] });
    let feedbackGiven = false;
    const { calls } = academicRoutes({
      'GET /api/agent/recommendations': () => ({ data: null }),
      'GET /api/agent/history': () => ({ data: [] }),
      'POST /api/agent/analyze': () => ({ status: 201, data: fresh }),
      'GET /api/agent/recommendations/rec-2': () => ({ data: makeRecommendationDetail({ id: 'rec-2', runId: 'run-2', type: 'attendance_attention', message: 'Sua frequência em Banco de Dados merece atenção.', feedback: null }) }),
      'POST /api/agent/recommendations/rec-2/feedback': () => {
        feedbackGiven = true;
        return { status: 201, data: { helpful: true, comment: 'Ajudou a me organizar.', createdAt: '2026-10-15T12:01:00.000Z' } };
      },
    });
    const user = userEvent.setup();
    const { router } = renderRoutes(routes, { initialPath: '/aluno/academico?aba=analise' });

    expect(await screen.findByText(/segue regras explicáveis/)).toBeInTheDocument();
    expect(screen.getByText(/Não é uma nota nem uma avaliação sua/)).toBeInTheDocument();
    expect(await screen.findByText('Nenhuma análise realizada ainda')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma análise registrada ainda.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Solicitar análise' }));
    expect(await screen.findByRole('heading', { name: 'Sua frequência em Banco de Dados merece atenção.' })).toBeInTheDocument();
    expect(screen.getByText('Frequência em atenção')).toBeInTheDocument();
    expect(screen.getByText('Por que estou vendo isso?')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST' && call.path === '/api/agent/analyze')?.body).toEqual({});

    await user.click(screen.getByRole('button', { name: /Ver detalhes e avaliar/ }));
    expect(router.state.location.search).toContain('recomendacao=rec-2');
    const dialog = await screen.findByRole('dialog', { name: 'Recomendação' });
    expect(await within(dialog).findByText('Esta recomendação ajudou você?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Enviar avaliação' }));
    expect(within(dialog).getByText('Escolha “Sim, ajudou” ou “Não ajudou”.')).toBeInTheDocument();
    expect(feedbackGiven).toBe(false);
    await user.click(within(dialog).getByRole('radio', { name: 'Sim, ajudou' }));
    await user.type(within(dialog).getByRole('textbox', { name: /Comentário/ }), '  Ajudou a me organizar. ');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar avaliação' }));
    expect(await within(dialog).findByText('Avaliação enviada')).toBeInTheDocument();
    expect(within(dialog).getByText(/Você marcou esta recomendação como útil/)).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST' && call.path === '/api/agent/recommendations/rec-2/feedback')?.body).toEqual({ helpful: true, comment: 'Ajudou a me organizar.' });
    expect(await screen.findByText('Obrigado! Sua avaliação foi registrada.')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(router.state.location.search).toBe('?aba=analise'));
  });

  it('serviço do agente fora do ar (503) aparece com honestidade e permite tentar de novo', async () => {
    academicRoutes({
      'POST /api/agent/analyze': () => ({ status: 503, error: { code: 'DEPENDENCY_ERROR', message: 'Não foi possível concluir a análise. Tente novamente.' } }),
    });
    const user = userEvent.setup();
    renderRoutes(routes, { initialPath: '/aluno/academico?aba=analise' });
    await user.click(await screen.findByRole('button', { name: 'Solicitar análise' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Serviço de análise indisponível');
    expect(alert).toHaveTextContent('O Agente para o Estudante não está respondendo agora.');
    expect(within(alert).getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    // a análise anterior continua visível (nada é apagado por causa da falha)
    expect(screen.getByRole('heading', { name: 'Existe uma atividade pendente que merece sua atenção.' })).toBeInTheDocument();
  });

  it('link de aviso (?recomendacao=) abre o detalhe já avaliado; segunda avaliação (409) é explicada', async () => {
    academicRoutes({
      'GET /api/agent/recommendations/rec-1': () => ({ data: makeRecommendationDetail({ feedback: { helpful: false, comment: null, createdAt: '2026-10-12T13:00:00.000Z' } }) }),
      'GET /api/agent/recommendations/rec-9': () => ({ data: makeRecommendationDetail({ id: 'rec-9' }) }),
      'POST /api/agent/recommendations/rec-9/feedback': () => ({ status: 409, error: { code: 'CONFLICT', message: 'Você já avaliou esta recomendação.', reason: 'already_rated' } }),
    });
    const user = userEvent.setup();
    const first = renderRoutes(routes, { initialPath: '/aluno/academico?recomendacao=rec-1' });
    const dialog = await screen.findByRole('dialog', { name: 'Recomendação' });
    expect(await within(dialog).findByText(/Você marcou esta recomendação como não útil em 12\/10\/2026/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Enviar avaliação' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Agente para o Estudante' })).toHaveAttribute('aria-selected', 'true');
    first.unmount();

    renderRoutes(routes, { initialPath: '/aluno/academico?aba=analise&recomendacao=rec-9' });
    const second = await screen.findByRole('dialog', { name: 'Recomendação' });
    await user.click(await within(second).findByRole('radio', { name: 'Não ajudou' }));
    await user.click(within(second).getByRole('button', { name: 'Enviar avaliação' }));
    expect(await within(second).findByText('Você já avaliou esta recomendação.')).toBeInTheDocument();
  });
});
