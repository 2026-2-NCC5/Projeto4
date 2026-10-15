import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMetrics } from '@/features/insights/testFixtures';
import { permissionsFor } from '@/test/permissions';
import { makeMe, makeSession, mockApi, renderRoutes } from '@/test/utils';
import MetricsPage from './MetricsPage';

const staff = () => makeSession(makeMe('institutional_staff'));
const admin = () => makeSession(makeMe('technical_admin'));
const routes = [
  { path: '/asa/metricas', element: <MetricsPage /> },
  { path: '/admin/metricas', element: <MetricsPage /> },
];
const paths = (calls: Array<{ path: string }>) => calls.map((call) => call.path);

beforeEach(() => {
  // "hoje" fixo: 15/10/2026 ao meio-dia em São Paulo (só o relógio é falso; os timers continuam reais)
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T15:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  // jsdom não implementa estes métodos; o teste do CSV os define
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('Métricas e relatórios', () => {
  it('o período escolhido vai para a API e para o link do CSV, e fica na URL', async () => {
    const { calls } = mockApi({ 'GET /api/asa/metrics': () => ({ data: makeMetrics() }) });
    const { router } = renderRoutes(routes, { initialPath: '/asa/metricas', session: staff() });
    await screen.findByRole('heading', { name: 'Resumo do período' });
    // padrão: últimos 30 dias, incluindo hoje
    expect(paths(calls)).toContain('/api/asa/metrics?from=2026-09-16&to=2026-10-15');
    const csv = screen.getByRole('link', { name: /Exportar CSV/ });
    expect(csv).toHaveAttribute('href', '/api/asa/reports/tickets.csv?from=2026-09-16&to=2026-10-15');
    expect(csv).toHaveAttribute('download', 'chamados_2026-09-16_a_2026-10-15.csv');

    await userEvent.click(screen.getByRole('radio', { name: '7 dias' }));
    await waitFor(() => expect(paths(calls)).toContain('/api/asa/metrics?from=2026-10-09&to=2026-10-15'));
    expect(router.state.location.search).toBe('?periodo=7');
    expect(screen.getByRole('link', { name: /Exportar CSV/ })).toHaveAttribute('href', '/api/asa/reports/tickets.csv?from=2026-10-09&to=2026-10-15');
    expect(screen.getByText(/09\/10\/2026 a 15\/10\/2026 \(7 dias\)/)).toBeInTheDocument();
  });

  it('datas do calendário: período acima de 366 dias não chama a API nem oferece o CSV', async () => {
    const { calls } = mockApi({ 'GET /api/asa/metrics': () => ({ data: makeMetrics() }) });
    const { router } = renderRoutes(routes, { initialPath: '/asa/metricas', session: staff() });
    await screen.findByRole('heading', { name: 'Resumo do período' });

    await userEvent.click(screen.getByRole('radio', { name: 'Datas' }));
    const from = screen.getByLabelText('De');
    // começa com o intervalo que estava selecionado
    expect(from).toHaveValue('2026-09-16');
    expect(screen.getByLabelText('Até')).toHaveValue('2026-10-15');

    fireEvent.change(from, { target: { value: '2025-01-01' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha um período de até 366 dias.');
    expect(router.state.location.search).toBe('?periodo=personalizado&de=2025-01-01&ate=2026-10-15');
    expect(screen.getByText('Período inválido')).toBeInTheDocument();
    expect(paths(calls).some((path) => path.includes('from=2025-01-01'))).toBe(false);
    expect(screen.queryByRole('link', { name: /Exportar CSV/ })).toBeNull();

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-01' } });
    await waitFor(() => expect(paths(calls)).toContain('/api/asa/metrics?from=2026-10-01&to=2026-10-15'));
    expect(screen.getByRole('link', { name: /Exportar CSV/ })).toHaveAttribute('href', '/api/asa/reports/tickets.csv?from=2026-10-01&to=2026-10-15');
  });

  it('link direto com datas abre o período certo', async () => {
    const { calls } = mockApi({ 'GET /api/asa/metrics': () => ({ data: makeMetrics() }) });
    renderRoutes(routes, { initialPath: '/asa/metricas?de=2026-10-01&ate=2026-10-10', session: staff() });
    await screen.findByRole('heading', { name: 'Resumo do período' });
    expect(paths(calls)).toContain('/api/asa/metrics?from=2026-10-01&to=2026-10-10');
    expect(screen.getByRole('radio', { name: 'Datas' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/01\/10\/2026 a 10\/10\/2026 \(10 dias\)/)).toBeInTheDocument();
  });

  it('mostra os números da API com fonte, horário, fuso e modo de dados', async () => {
    mockApi({ 'GET /api/asa/metrics': () => ({ data: makeMetrics() }) });
    renderRoutes(routes, { initialPath: '/asa/metricas', session: staff() });
    const summary = await screen.findByRole('region', { name: 'Resumo do período' });
    const stat = (label: string) => within(summary).getByText(label).parentElement!;
    expect(stat('Abertos no período')).toHaveTextContent('6');
    expect(stat('Em aberto agora')).toHaveTextContent('21');
    expect(stat('Cumprimento do SLA')).toHaveTextContent('52%');
    expect(stat('Cumprimento do SLA')).toHaveTextContent('Base: 21 prazos concluídos');
    expect(stat('Primeira resposta (mediana)')).toHaveTextContent('2 h 5 min');
    expect(stat('Avaliação média')).toHaveTextContent('4,5 de 5');
    expect(within(summary).getByText(/Chamados abertos no período \(support_tickets\)/)).toBeInTheDocument();
    expect(within(summary).getByText(/^Gerado/)).toHaveTextContent('15/10/2026 às 09:00');
    expect(within(summary).getByText('Fuso America/Sao_Paulo')).toBeInTheDocument();
    expect(within(summary).getByText('DEMONSTRAÇÃO — Dados fictícios')).toBeInTheDocument();
    // situação da fila com as palavras da equipe
    const byStatus = screen.getByRole('figure', { name: 'Em aberto agora, por situação' });
    expect(within(byStatus).getByText('Aguardando aluno')).toBeInTheDocument();
    expect(within(byStatus).queryByText('Aguardando você')).toBeNull();
  });

  it('cada gráfico tem a tabela equivalente', async () => {
    mockApi({ 'GET /api/asa/metrics': () => ({ data: makeMetrics() }) });
    renderRoutes(routes, { initialPath: '/asa/metricas', session: staff() });
    const figure = await screen.findByRole('figure', { name: 'Abertos e resolvidos por dia' });
    // o SVG tem um resumo em texto (totais e dia de maior movimento)
    expect(within(figure).getByRole('img', { name: /Abertos: 6 no período; maior valor em um dia: 3 em 15\/10\/2026/ })).toBeInTheDocument();
    expect(within(figure).getByRole('list', { name: 'Legenda' })).toHaveTextContent('Resolvidos · 3 no período');

    await userEvent.click(within(figure).getByRole('button', { name: 'Ver como tabela' }));
    const table = within(figure).getByRole('table', { name: 'Abertos e resolvidos por dia' });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[0]!).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Data', 'Abertos', 'Resolvidos']);
    expect(within(rows[2]!).getByRole('rowheader')).toHaveTextContent('14/10/2026');
    expect(within(rows[2]!).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['2', '1']);
    // a tabela rola dentro de uma região focável (nunca a página)
    expect(within(figure).getByRole('region', { name: 'Abertos e resolvidos por dia' })).toHaveAttribute('tabindex', '0');

    await userEvent.click(within(figure).getByRole('button', { name: 'Ver como gráfico' }));
    expect(within(figure).queryByRole('table')).toBeNull();

    const categories = screen.getByRole('figure', { name: 'Abertos no período, por categoria' });
    await userEvent.click(within(categories).getByRole('button', { name: 'Ver como tabela' }));
    const categoryRows = within(within(categories).getByRole('table')).getAllByRole('row');
    expect(categoryRows[1]).toHaveTextContent('Documentos467%');
  });

  it('exportar CSV baixa pelo cliente da API (sessão renovável) e explica o erro do servidor', async () => {
    const createObjectURL = vi.fn(() => 'blob:relatorio');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    let csvCalls = 0;
    const { calls } = mockApi({
      'GET /api/asa/metrics': () => ({ data: makeMetrics() }),
      'GET /api/asa/reports/tickets.csv': () => {
        csvCalls += 1;
        return csvCalls === 1
          ? { data: 'protocolo;aberto_em' }
          : { status: 422, error: { code: 'VALIDATION_ERROR', message: 'O relatório passa de 5000 linhas. Escolha um período menor.', reason: 'export_too_large' } };
      },
    });
    renderRoutes(routes, { initialPath: '/asa/metricas', session: staff() });
    await userEvent.click(await screen.findByRole('link', { name: /Exportar CSV/ }));
    expect(await screen.findByText('Arquivo chamados_2026-09-16_a_2026-10-15.csv gerado. A exportação foi registrada na auditoria.')).toBeInTheDocument();
    const request = calls.find((call) => call.path.startsWith('/api/asa/reports/tickets.csv'));
    expect(request?.path).toBe('/api/asa/reports/tickets.csv?from=2026-09-16&to=2026-10-15');
    expect(request?.headers.get('Accept')).toContain('text/csv');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('link', { name: /Exportar CSV/ }));
    expect(await screen.findByText('O relatório passa de 5000 linhas. Escolha um período menor.')).toBeInTheDocument();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('explica que o CSV não tem dados pessoais e que a exportação é auditada', async () => {
    mockApi({ 'GET /api/asa/metrics': () => ({ data: makeMetrics() }) });
    renderRoutes(routes, { initialPath: '/asa/metricas', session: staff() });
    const note = await screen.findByRole('region', { name: 'Sobre o relatório CSV' });
    expect(note).toHaveTextContent('o arquivo não traz nome, RA nem e-mail de alunos');
    expect(note).toHaveTextContent('cada download fica registrado na auditoria');
    expect(within(note).getByRole('link', { name: 'Abrir minha auditoria' })).toHaveAttribute('href', '/asa/auditoria');
  });

  it('sem permissão de exportar, não há link de CSV', async () => {
    mockApi({ 'GET /api/asa/metrics': () => ({ data: makeMetrics() }) });
    const me = makeMe('institutional_staff', { permissions: permissionsFor('institutional_staff').filter((permission) => permission !== 'reports:export') });
    renderRoutes(routes, { initialPath: '/asa/metricas', session: makeSession(me) });
    await screen.findByRole('heading', { name: 'Resumo do período' });
    expect(screen.queryByRole('link', { name: /Exportar CSV/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Sobre o relatório CSV' })).toBeNull();
  });

  it.each([
    [503, 'DEPENDENCY_ERROR', 'database_required', 'Indisponível neste ambiente'],
    [403, 'FORBIDDEN', 'feature_disabled', 'Recurso desativado neste ambiente'],
    [403, 'FORBIDDEN', 'permission_denied', 'Acesso não permitido'],
  ])('erro %i (%s/%s) vira uma explicação, nunca números simulados', async (status, code, reason, title) => {
    mockApi({ 'GET /api/asa/metrics': () => ({ status, error: { code, message: 'Sem acesso.', reason } }) });
    renderRoutes(routes, { initialPath: '/asa/metricas', session: staff() });
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Resumo do período' })).toBeNull();
  });

  it('na Administração, nenhum link aponta para /asa', async () => {
    mockApi({ 'GET /api/asa/metrics': () => ({ data: makeMetrics() }) });
    const { container } = renderRoutes(routes, { initialPath: '/admin/metricas', session: admin() });
    await screen.findByRole('heading', { name: 'Resumo do período' });
    const hrefs = Array.from(container.querySelectorAll('a')).map((link) => link.getAttribute('href') ?? '');
    expect(hrefs.filter((href) => href.startsWith('/asa'))).toEqual([]);
    expect(screen.getByRole('link', { name: 'Metas de SLA' })).toHaveAttribute('href', '/admin/sla');
    expect(screen.getByRole('link', { name: 'Abrir a auditoria' })).toHaveAttribute('href', '/admin/auditoria');
  });
});
