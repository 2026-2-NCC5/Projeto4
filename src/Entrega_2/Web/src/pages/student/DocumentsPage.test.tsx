import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeCatalog, makeList, makeSummary, makeTicket } from '@/features/support/student/testing/fixtures';
import { mockApi, renderRoutes } from '@/test/utils';
import type { SupportAttachment } from '@/types/api';
import DocumentsPage from './DocumentsPage';

const routes = [{ path: '/aluno/documentos', element: <DocumentsPage /> }];

const file = (overrides: Partial<SupportAttachment>): SupportAttachment => ({
  id: 'att-1',
  name: 'declaracao-matricula.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  createdAt: '2026-10-15T10:00:00.000Z',
  uploadedBy: 'agent',
  uploaderName: 'Secretaria Acadêmica',
  messageId: 'msg-1',
  ...overrides,
});

describe('Documentos', () => {
  it('lista só os pedidos da categoria Documentos e os arquivos enviados pelo ASA', async () => {
    const declaration = makeSummary({ id: 'doc-1', subject: 'Declaração para estágio' });
    const transcript = makeSummary({ id: 'doc-2', protocol: 'ASA-2026-000200', subject: 'Histórico para intercâmbio', subcategoryId: 'transcript', subcategoryLabel: 'Histórico escolar', status: 'received' });
    const bill = makeSummary({ id: 'fin-1', subject: 'Boleto em dobro', categoryId: 'financial', categoryLabel: 'Financeiro' });
    const { calls } = mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'GET /api/support/tickets': () => ({ data: makeList([declaration, bill, transcript]) }),
      'GET /api/support/tickets/doc-1': () => ({
        data: makeTicket({ ...declaration, attachments: [file({}), file({ id: 'att-2', name: 'meu-rg.pdf', uploadedBy: 'student', uploaderName: 'Estudante Exemplo', messageId: null })] }),
      }),
      'GET /api/support/tickets/doc-2': () => ({ data: makeTicket({ ...transcript, attachments: [] }) }),
    });
    renderRoutes(routes, { initialPath: '/aluno/documentos' });

    expect(screen.getByRole('link', { name: 'Solicitar documento' })).toHaveAttribute('href', '/aluno/chamados/novo?categoria=documents');
    const requests = await screen.findByRole('list', { name: 'Pedidos de documentos' });
    expect(within(requests).getAllByRole('listitem')).toHaveLength(2);
    expect(within(requests).getByText('Declaração para estágio')).toBeInTheDocument();
    expect(within(requests).getByText('Histórico para intercâmbio')).toBeInTheDocument();
    expect(within(requests).getByText('Recebido')).toBeInTheDocument();
    expect(screen.queryByText('Boleto em dobro')).toBeNull();
    expect(new URL(calls.find((call) => call.path.startsWith('/api/support/tickets?'))!.path, 'http://localhost').searchParams.get('limit')).toBe('50');

    const sent = screen.getByRole('region', { name: 'Arquivos enviados pelo ASA' });
    expect(await within(sent).findByText('declaracao-matricula.pdf')).toBeInTheDocument();
    expect(within(sent).queryByText('meu-rg.pdf')).toBeNull();
    expect(calls.some((call) => call.path === '/api/support/tickets/fin-1')).toBe(false);

    // orientação vinda do catálogo
    expect(screen.getByText(/declaração de matrícula, histórico escolar/)).toBeInTheDocument();
    expect(screen.getByText(/encaminha para Secretaria Acadêmica\. Prazo de resposta: até 3 dias úteis/)).toBeInTheDocument();
    const articles = screen.getByRole('list', { name: 'Artigos sobre documentos' });
    expect(within(articles).getAllByRole('listitem')).toHaveLength(4);
    expect(within(articles).getByRole('link', { name: /Como obter o histórico escolar/ })).toHaveAttribute('href', '/aluno/ajuda/documents-transcript');
    expect(screen.getByText(/Conteúdo de orientação de demonstração/)).toBeInTheDocument();
  });

  it('sem pedidos: explica como pedir', async () => {
    mockApi({
      'GET /api/support/catalog': () => ({ data: makeCatalog() }),
      'GET /api/support/tickets': () => ({ data: makeList([makeSummary({ categoryId: 'financial', categoryLabel: 'Financeiro' })]) }),
    });
    renderRoutes(routes, { initialPath: '/aluno/documentos' });
    expect(await screen.findByText(/Você ainda não pediu documentos/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Quando o ASA enviar um documento pelo chamado/)).toBeInTheDocument());
  });
});
