import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { RefreshControl, Text } from 'react-native';

import { setSupportApi } from '../features/support/api';
import { createMockSupportApi } from '../features/support/api/mockSupportApi';
import type { SupportApi } from '../features/support/api/types';
import { clearSupportMemoryCache } from '../features/support/cache';
import { SUPPORT } from '../features/support/config';
import { NavigationProvider, useAppNavigation } from '../navigation/AppNavigator';
import { isSupportRoute } from '../navigation/navigationReducer';
import { SupportRouter } from '../screens/support/SupportRouter';
import { ApiClientError } from '../services/apiClient';
import type { SupportRoute } from '../types/ui';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));
jest.mock('expo-file-system', () => ({ File: jest.fn().mockImplementation(() => ({ base64: async () => 'JVBERi0xLjQ=' })) }));

const mockClipboard = jest.requireMock('expo-clipboard') as { setStringAsync: jest.Mock };
const mockPicker = jest.requireMock('expo-document-picker') as { getDocumentAsync: jest.Mock };

/** Navegação real + telas do Atendimento (o que está fora do fluxo vira um marcador de aba). */
function Harness() {
  const navigation = useAppNavigation();
  return isSupportRoute(navigation.detail) ? <SupportRouter route={navigation.detail} /> : <Text testID="outside">{navigation.tab}</Text>;
}

function renderSupport(route: SupportRoute) {
  return render(
    <NavigationProvider initialState={{ detail: route }}>
      <Harness />
    </NavigationProvider>,
  );
}

// Fluxos com várias telas: com a máquina saturada (várias suítes/sessões em paralelo) um render pode levar segundos.
// As esperas terminam assim que a tela fica pronta; o limite maior só evita falso negativo sob carga.
configure({ asyncUtilTimeout: 10_000 });
jest.setTimeout(45_000);

// As telas aqui testam comportamento, não animação: com "Reduzir movimento" ligado nada roda na thread JS do Jest
// (as animações e o caminho reduzido são cobertos em supportMotion.test.tsx).
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true, useSystemReduceMotion: () => true }));

let api: SupportApi;

beforeEach(async () => {
  clearSupportMemoryCache();
  await AsyncStorage.clear();
  api = createMockSupportApi({ latencyMs: 0 });
  setSupportApi(api);
  mockClipboard.setStringAsync.mockClear();
});

afterAll(() => setSupportApi(null));

describe('Meus chamados', () => {
  it('lista os chamados e filtra por "Aguardando você"', async () => {
    renderSupport({ screen: 'support-tickets' });
    expect(await screen.findByText('Solicitação de declaração de matrícula')).toBeTruthy();
    expect(screen.getByText('Pagamento ainda não consta no sistema')).toBeTruthy();

    fireEvent.press(screen.getByTestId('tickets-filter-waiting_student'));
    await waitFor(() => expect(screen.queryByText('Solicitação de declaração de matrícula')).toBeNull());
    expect(screen.getByText('Pagamento ainda não consta no sistema')).toBeTruthy();
    expect(screen.getByText('O ASA precisa de uma informação sua')).toBeTruthy();
  });

  it('busca no servidor só depois da espera entre teclas, sem esvaziar a lista enquanto carrega', async () => {
    // A resposta da busca fica pendente até o teste liberar: dá para ver o estado "carregando" sem corrida.
    const original = api.listTickets.bind(api);
    let release: () => void = () => undefined;
    const listTickets = jest.spyOn(api, 'listTickets').mockImplementation((params) =>
      params.search === 'estágio' ? new Promise((resolve) => (release = () => resolve(original(params)))) : original(params),
    );
    const searched = () => listTickets.mock.calls.filter(([params]) => params.search === 'estágio');
    renderSupport({ screen: 'support-tickets' });
    await screen.findByText('Pagamento ainda não consta no sistema');

    // Relógio controlado: a espera entre teclas é avançada exatamente, sem depender da carga da máquina.
    jest.useFakeTimers();
    try {
      fireEvent.changeText(screen.getByTestId('tickets-search'), 'estágio');
      await act(async () => {
        jest.advanceTimersByTime(SUPPORT.SEARCH_DEBOUNCE_MS - 50);
      });
      expect(searched()).toHaveLength(0);

      await act(async () => {
        jest.advanceTimersByTime(50);
      });
      expect(searched()).toHaveLength(1);
      // enquanto a resposta não chega, os resultados anteriores continuam (sem piscar para o esqueleto)
      expect(screen.getByText('Pagamento ainda não consta no sistema')).toBeTruthy();
      expect(screen.queryByTestId('tickets-skeleton')).toBeNull();

      await act(async () => {
        release();
        await listTickets.mock.results[listTickets.mock.results.length - 1]?.value;
      });
    } finally {
      jest.useRealTimers();
    }
    expect(screen.getByText('Validação das horas de estágio')).toBeTruthy();
    expect(screen.queryByText('Pagamento ainda não consta no sistema')).toBeNull();
  });

  it('filtros detalhados ficam na folha "Filtros"', async () => {
    renderSupport({ screen: 'support-tickets' });
    await screen.findByText('Solicitação de declaração de matrícula');
    fireEvent.press(screen.getByTestId('tickets-more-filters'));
    fireEvent.press(await screen.findByTestId('filter-cancelled'));
    expect(await screen.findByText('Agendamento de conversa com o ASA')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Solicitação de declaração de matrícula')).toBeNull());
  });

  it('estado vazio convida a abrir o primeiro chamado', async () => {
    setSupportApi(createMockSupportApi({ latencyMs: 0, seed: false }));
    renderSupport({ screen: 'support-tickets' });
    expect(await screen.findByText('Nenhum chamado por aqui')).toBeTruthy();
    fireEvent.press(screen.getByText('Abrir meu primeiro chamado'));
    expect(await screen.findByText('Como podemos ajudar?')).toBeTruthy();
  });

  it('falha sem dados mostra erro amigável com "Tentar novamente"', async () => {
    const failing = { ...api, listTickets: jest.fn(async () => Promise.reject(new ApiClientError({ kind: 'server', status: 500, message: 'Error 500' }))) };
    setSupportApi(failing);
    renderSupport({ screen: 'support-tickets' });
    expect(await screen.findByText('Não conseguimos carregar seus chamados.')).toBeTruthy();
    expect(screen.queryByText(/500/)).toBeNull();
    expect(screen.getByText('Tentar novamente')).toBeTruthy();
  });
});

describe('Abrir chamado', () => {
  async function fillUntilReview() {
    fireEvent.press(await screen.findByTestId('category-financial'));
    fireEvent.press(await screen.findByTestId('subcategory-unidentified_payment'));
    fireEvent.press(screen.getByTestId('create-next'));
    await screen.findByText('Conte o que aconteceu');
    // sem preencher: erro amigável, sem avançar
    fireEvent.press(screen.getByTestId('create-next'));
    expect(await screen.findByText('Conte um pouco mais sobre sua solicitação.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('create-subject'), 'Pagamento não identificado');
    fireEvent.changeText(screen.getByTestId('create-description'), 'Paguei o boleto de setembro e ainda aparece em aberto.');
    expect(screen.getByText('Como emitir a segunda via do boleto?')).toBeTruthy(); // sugestão da Central de ajuda
    fireEvent.press(screen.getByTestId('create-next'));
    await screen.findByText('Quer anexar algum arquivo?');
    fireEvent.press(screen.getByTestId('create-next'));
    await screen.findByText('Revise sua solicitação');
  }

  it('fluxo completo: categoria → detalhes → anexos → revisão → confirmação com protocolo copiável', async () => {
    renderSupport({ screen: 'support-new' });
    await fillUntilReview();
    expect(screen.getAllByText('Pagamento não identificado').length).toBe(2); // tipo + assunto
    expect(screen.getByText('Nenhum arquivo')).toBeTruthy();

    fireEvent.press(screen.getByTestId('create-submit'));
    expect(await screen.findByText('Chamado aberto!')).toBeTruthy();
    const protocol = screen.getByTestId('created-protocol');
    expect(within(protocol).getByText(/^#ASA-\d{4}-\d{5}$/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('copy-protocol'));
    await waitFor(() => expect(mockClipboard.setStringAsync).toHaveBeenCalledWith(expect.stringMatching(/^ASA-\d{4}-\d{5}$/)));
    expect(await screen.findByText('Protocolo copiado')).toBeTruthy();

    fireEvent.press(screen.getByTestId('created-track'));
    expect(await screen.findByTestId('ticket-progress')).toBeTruthy();
    expect(screen.getByText('Recebido pelo ASA')).toBeTruthy();
  });

  it('envio protegido contra duplo toque; falha mantém os dados e permite tentar de novo', async () => {
    let attempts = 0;
    const createTicket = jest.fn(async (body: Parameters<SupportApi['createTicket']>[0]) => {
      attempts += 1;
      if (attempts === 1) throw new ApiClientError({ kind: 'offline', message: 'Network request failed' });
      return api.createTicket(body);
    });
    setSupportApi({ ...api, createTicket });
    renderSupport({ screen: 'support-new' });
    await fillUntilReview();

    fireEvent.press(screen.getByTestId('create-submit'));
    fireEvent.press(screen.getByTestId('create-submit'));
    expect(await screen.findByText('Você está offline. Tente de novo quando a conexão voltar.')).toBeTruthy();
    expect(createTicket).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Revise sua solicitação')).toBeTruthy();
    expect(screen.getAllByText('Pagamento não identificado').length).toBe(2);

    fireEvent.press(screen.getByTestId('create-submit'));
    expect(await screen.findByText('Chamado aberto!')).toBeTruthy();
    // a nova tentativa reaproveita a mesma chave de idempotência
    expect(createTicket.mock.calls[1]?.[0].clientRequestId).toBe(createTicket.mock.calls[0]?.[0].clientRequestId);
  });

  it('arquivo de tipo não aceito é recusado com mensagem amigável', async () => {
    mockPicker.getDocumentAsync.mockResolvedValueOnce({ canceled: false, assets: [{ name: 'setup.exe', size: 1200, uri: 'file:///setup.exe', mimeType: 'application/x-msdownload', lastModified: 0 }] });
    renderSupport({ screen: 'support-new', categoryId: 'other' });
    fireEvent.press(await screen.findByTestId('create-next'));
    fireEvent.changeText(await screen.findByTestId('create-subject'), 'Outro assunto');
    fireEvent.changeText(screen.getByTestId('create-description'), 'Uma descrição suficientemente longa.');
    fireEvent.press(screen.getByTestId('create-next'));
    fireEvent.press(await screen.findByTestId('create-attach'));
    expect(await screen.findByText(/Esse tipo de arquivo não é aceito/)).toBeTruthy();
  });

  it('anexo válido sobe com progresso e aparece como enviado', async () => {
    mockPicker.getDocumentAsync.mockResolvedValueOnce({ canceled: false, assets: [{ name: 'comprovante.pdf', size: 1_887_437, uri: 'file:///comprovante.pdf', mimeType: 'application/pdf', lastModified: 0 }] });
    renderSupport({ screen: 'support-new', categoryId: 'other' });
    fireEvent.press(await screen.findByTestId('create-next'));
    fireEvent.changeText(await screen.findByTestId('create-subject'), 'Outro assunto');
    fireEvent.changeText(screen.getByTestId('create-description'), 'Uma descrição suficientemente longa.');
    fireEvent.press(screen.getByTestId('create-next'));
    fireEvent.press(await screen.findByTestId('create-attach'));
    expect(await screen.findByText('comprovante.pdf')).toBeTruthy();
    expect(await screen.findByText('1,8 MB · Enviado')).toBeTruthy();
  });
});

describe('Detalhe do chamado', () => {
  async function openTicket(subject: string) {
    const ticket = (await api.listTickets({})).items.find((item) => item.subject === subject);
    renderSupport({ screen: 'support-ticket', id: ticket!.id });
    await screen.findByTestId('ticket-progress');
    return ticket!;
  }

  it('aguardando você: ação pendente no topo, mensagem do ASA, prazo pausado e resposta otimista', async () => {
    await openTicket('Pagamento ainda não consta no sistema');
    const action = screen.getByTestId('ticket-action-required');
    expect(within(action).getByText('Precisamos de uma informação sua')).toBeTruthy();
    expect(within(action).getByText('Envie o comprovante de pagamento da parcela de setembro para continuarmos sua solicitação.')).toBeTruthy();
    expect(screen.getByTestId('action-attach')).toBeTruthy();
    expect(screen.getByText('Novas mensagens')).toBeTruthy();
    expect(screen.getByText('Prazo pausado')).toBeTruthy();
    expect(screen.getByText('Sua resposta')).toBeTruthy(); // próxima etapa

    fireEvent.changeText(screen.getByTestId('composer-input'), 'Acabei de enviar o comprovante.');
    fireEvent.press(screen.getByTestId('composer-send'));
    expect(await screen.findByText('Acabei de enviar o comprovante.')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('Entregue').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByTestId('ticket-action-required')).toBeNull());
    expect(screen.getAllByText('Resposta enviada ao ASA').length).toBeGreaterThan(0);
  });

  it('cancelamento exige confirmação e mantém o histórico', async () => {
    await openTicket('Dúvida sobre a rematrícula do próximo semestre');
    fireEvent.press(screen.getByTestId('ticket-cancel'));
    expect(await screen.findByText('Deseja cancelar esta solicitação?')).toBeTruthy();
    expect(screen.getByText(/O histórico permanecerá disponível/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('ticket-sheet-confirm'));
    expect(await screen.findByText('Chamado cancelado. O histórico continua disponível.')).toBeTruthy();
    expect(screen.getAllByText('Chamado cancelado').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('ticket-composer')).toBeNull();
    expect(within(screen.getByTestId('ticket-timeline')).getByText('Chamado cancelado pelo estudante')).toBeTruthy();
  });

  it('resolvido: solução visível, avaliação com estrelas e reabertura com motivo', async () => {
    await openTicket('Revisão da Prova 1 de Banco de Dados');
    expect(screen.getAllByText('Solicitação resolvida').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/A nota foi ajustada de 6,5 para 7,0/).length).toBeGreaterThan(0);
    expect(screen.getByText('Enviados por você')).toBeTruthy();
    expect(screen.getByText('Enviados pelo ASA')).toBeTruthy();

    fireEvent.press(screen.getByTestId('rating-star-4'));
    fireEvent.changeText(await screen.findByTestId('rating-comment'), 'Bem explicado.');
    fireEvent.press(screen.getByTestId('rating-submit'));
    expect(await screen.findByText('Obrigado pela avaliação!')).toBeTruthy();

    fireEvent.press(screen.getByTestId('ticket-reopen'));
    expect(await screen.findByText('Ainda precisa de ajuda?')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('ticket-sheet-reason'), 'A nota ainda não apareceu no portal.');
    fireEvent.press(screen.getByTestId('ticket-sheet-confirm'));
    expect(await screen.findByText('Chamado reaberto. O ASA vai analisar de novo.')).toBeTruthy();
    expect(within(screen.getByTestId('ticket-timeline')).getByText('Chamado reaberto pelo estudante')).toBeTruthy();
  });

  it('copiar protocolo dá feedback; anexo em modo demonstração explica que não abre', async () => {
    const ticket = await openTicket('Validação das horas de estágio');
    fireEvent.press(screen.getByTestId('ticket-copy-protocol'));
    await waitFor(() => expect(mockClipboard.setStringAsync).toHaveBeenCalledWith(ticket.protocol));
    expect(await screen.findByText('Protocolo copiado')).toBeTruthy();
    fireEvent.press(screen.getByLabelText(/^relatorio-final-estagio\.pdf, PDF/));
    expect(await screen.findByText(/não está disponível no modo de demonstração/)).toBeTruthy();
  });

  it('chamado inexistente: mensagem amigável e "Tentar novamente"', async () => {
    renderSupport({ screen: 'support-ticket', id: 'nao-existe' });
    expect(await screen.findByText('Não conseguimos carregar este chamado.')).toBeTruthy();
    expect(screen.getByText('Não encontramos este chamado.')).toBeTruthy();
    expect(screen.getByTestId('ticket-retry')).toBeTruthy();
  });

  it('voltar retorna à tela anterior do fluxo', async () => {
    renderSupport({ screen: 'support' });
    fireEvent.press(await screen.findByTestId('support-my-tickets'));
    fireEvent.press(await screen.findByText('Pagamento ainda não consta no sistema'));
    await screen.findByTestId('ticket-progress');
    fireEvent.press(screen.getAllByLabelText('Voltar')[0]!);
    expect(await screen.findByText('Meus chamados')).toBeTruthy();
  });
});

describe('Atendimento (hub)', () => {
  it('mostra o chamado mais relevante, atalhos e a Central de ajuda; artigo nunca bloqueia a abertura', async () => {
    renderSupport({ screen: 'support' });
    expect(await screen.findByText('O ASA precisa de uma informação sua')).toBeTruthy();
    expect(screen.getByText('Meus chamados')).toBeTruthy();
    fireEvent.press(await screen.findByTestId('help-financial-bill-copy'));
    expect(await screen.findByText('Ainda preciso de ajuda')).toBeTruthy();
    fireEvent.press(screen.getByTestId('help-article-open-ticket'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(await screen.findByText('Qual é o tipo de solicitação?')).toBeTruthy();
  });
});

describe('Atualização e movimento', () => {
  it('mudança feita pelo ASA com a tela aberta mostra "Chamado atualizado" e anima o novo evento, sem recarregar a tela', async () => {
    let now = new Date();
    const live = createMockSupportApi({ latencyMs: 0, seed: false, now: () => now });
    setSupportApi(live);
    const created = await live.createTicket({ clientRequestId: 'req-live-1', categoryId: 'documents', subcategoryId: 'transcript', subject: 'Histórico escolar', description: 'Preciso do histórico escolar assinado.' });
    renderSupport({ screen: 'support-ticket', id: created.id });
    await screen.findByTestId('ticket-progress');
    expect(screen.queryByText('Chamado atualizado')).toBeNull();

    now = new Date(now.getTime() + 25_000); // o ASA coloca o chamado em triagem
    const getTicket = jest.spyOn(live, 'getTicket');
    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });
    // espera exatamente a requisição da atualização (sem depender de tempo)
    await act(async () => {
      await getTicket.mock.results[getTicket.mock.results.length - 1]?.value;
    });
    expect(screen.getByText('Chamado atualizado')).toBeTruthy();
    expect(within(screen.getByTestId('ticket-timeline')).getByText('Chamado em triagem')).toBeTruthy();
    expect(screen.getByTestId('ticket-progress')).toBeTruthy();
  });
});
