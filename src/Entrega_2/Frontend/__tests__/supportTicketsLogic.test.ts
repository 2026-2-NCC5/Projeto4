import { createMockSupportApi } from '../features/support/api/mockSupportApi';
import { httpSupportApi, ticketsQuery } from '../features/support/api/httpSupportApi';
import { supportErrorMessage } from '../features/support/errors';
import { formatDayGroup, formatDueDate, formatFileSize, formatFriendlyDateTime, formatRelative, formatRemaining } from '../features/support/format';
import { DETAILED_FILTERS, findFilter, STATUS_META } from '../features/support/labels';
import { buildProgress } from '../features/support/progress';
import { canAdvance, createTicketReducer, draftHasContent, initialCreateState, validateDetails } from '../features/support/state/createTicketReducer';
import { inferMimeType, validatePickedFile } from '../features/support/attachments';
import { currentScreenKey, INITIAL_NAVIGATION_STATE, navigationReducer, supportRoutes } from '../navigation/navigationReducer';
import { ApiClientError, configureApiClient, resetApiClientForTests } from '../services/apiClient';
import type { SupportTicketEvent, SupportTicketStatus } from '../types/api';

import { fakeResponse, okEnvelope } from './support/fakeFetch';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

const NOW = new Date(2026, 9, 6, 18, 42, 0);

const ev = (type: SupportTicketEvent['type'], minutesAgo: number, extra: Partial<SupportTicketEvent> = {}): SupportTicketEvent => ({
  id: `${type}-${minutesAgo}`,
  type,
  title: type,
  description: null,
  createdAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
  actorType: 'system',
  actorName: null,
  fromStatus: null,
  toStatus: null,
  details: [],
  ...extra,
});

describe('progresso do chamado', () => {
  const events = [ev('ticket_created', 60), ev('ticket_received', 60), ev('ticket_triaged', 40, { toStatus: 'assigned' })];
  const progress = (status: SupportTicketStatus, list = events, canRate = false) => buildProgress({ status, events: list, canRate });

  it('recebido: solicitação concluída e triagem como etapa atual', () => {
    const result = progress('received', events.slice(0, 2));
    expect(result.steps.map((step) => step.state)).toEqual(['done', 'current', 'upcoming', 'upcoming']);
    expect(result.steps[0]?.label).toBe('Solicitação recebida');
    expect(result.steps[1]?.description).toBe(STATUS_META.received.description);
    expect(result.next?.label).toBe('Encaminhamento para a equipe responsável');
  });

  it('em análise e aguardando você mostram a etapa atual com texto humano', () => {
    const analysis = progress('in_analysis');
    expect(analysis.steps.map((step) => step.state)).toEqual(['done', 'done', 'current', 'upcoming']);
    expect(analysis.steps[1]).toMatchObject({ label: 'Triagem concluída', completedAt: events[2]?.createdAt });
    expect(analysis.steps[2]?.label).toBe('Em análise');
    const waiting = progress('waiting_student');
    expect(waiting.steps[2]?.label).toBe('Aguardando você');
    expect(waiting.next?.label).toBe('Sua resposta');
  });

  it('resolvido conclui tudo e sugere a avaliação; cancelado mostra até onde chegou', () => {
    const resolved = progress('resolved', [...events, ev('ticket_resolved', 5)], true);
    expect(resolved.steps.every((step) => step.state === 'done')).toBe(true);
    expect(resolved.next?.label).toBe('Sua avaliação');
    expect(progress('resolved', [...events, ev('ticket_resolved', 5)], false).next).toBeNull();
    const cancelled = progress('cancelled', events.slice(0, 2));
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.steps.map((step) => step.state)).toEqual(['done', 'skipped', 'skipped', 'skipped']);
    expect(cancelled.next).toBeNull();
  });
});

describe('formatação amigável', () => {
  it('tempo relativo, grupos de dia e data/hora', () => {
    expect(formatRelative(new Date(NOW.getTime() - 30_000).toISOString(), NOW)).toBe('agora');
    expect(formatRelative(new Date(NOW.getTime() - 18 * 60_000).toISOString(), NOW)).toBe('há 18 min');
    expect(formatRelative(new Date(2026, 9, 5, 14, 20).toISOString(), NOW)).toBe('ontem');
    expect(formatRelative(new Date(2026, 8, 20, 10, 0).toISOString(), NOW)).toBe('20 set. 2026');
    expect(formatDayGroup(new Date(2026, 9, 6, 9, 0).toISOString(), NOW)).toBe('Hoje');
    expect(formatFriendlyDateTime(new Date(2026, 9, 5, 14, 20).toISOString(), NOW)).toBe('Ontem, 14:20');
  });

  it('tamanho de arquivo, prazo e tempo restante sem contagem negativa', () => {
    expect(formatFileSize(1_887_437)).toBe('1,8 MB');
    expect(formatFileSize(320 * 1024)).toBe('320 KB');
    expect(formatDueDate(new Date(2026, 9, 8, 18, 0).toISOString(), NOW)).toBe('Até 08 de outubro');
    expect(formatDueDate(new Date(2027, 0, 8).toISOString(), NOW)).toBe('Até 08 de janeiro de 2027');
    expect(formatRemaining(new Date(NOW.getTime() + 28 * 3_600_000).toISOString(), NOW)).toBe('1 dia e 4 horas');
    expect(formatRemaining(new Date(NOW.getTime() + 40 * 60_000).toISOString(), NOW)).toBe('40 minutos');
    expect(formatRemaining(new Date(NOW.getTime() - 1).toISOString(), NOW)).toBeNull();
  });

  it('erros nunca aparecem como texto técnico', () => {
    expect(supportErrorMessage(new ApiClientError({ kind: 'offline', message: 'Network request failed' }))).toBe('Você está offline. Tente de novo quando a conexão voltar.');
    expect(supportErrorMessage(new ApiClientError({ kind: 'server', status: 500, message: 'Error 500' }))).toBe('Não conseguimos concluir agora. Tente novamente.');
    expect(supportErrorMessage(new ApiClientError({ kind: 'unknown', status: 409, message: 'Você já avaliou este atendimento.' }))).toBe('Você já avaliou este atendimento.');
    expect(supportErrorMessage(new Error('Fetch failed'))).toBe('Não conseguimos concluir agora. Tente novamente.');
  });
});

describe('formulário de abertura', () => {
  const catalog = { categories: [{ id: 'financial', label: 'Financeiro', description: '', subcategories: [{ id: 'bill', label: 'Boleto' }], slaBusinessDays: 2, defaultTeam: 'Financeiro' }], articles: [], limits: { subjectMinLength: 5, subjectMaxLength: 120, descriptionMinLength: 20, descriptionMaxLength: 1500, messageMaxLength: 2000, maxAttachmentsPerTicket: 10, maxAttachmentBytes: 5_242_880, allowedMimeTypes: ['application/pdf'], reopenWindowDays: 7 } };

  it('valida com mensagens amigáveis e só avança quando a etapa está completa', () => {
    let state = initialCreateState('req-1');
    expect(canAdvance(state, catalog)).toBe(false);
    state = createTicketReducer(state, { type: 'SELECT_CATEGORY', categoryId: 'financial' });
    expect(canAdvance(state, catalog)).toBe(false); // falta o tipo
    state = createTicketReducer(state, { type: 'SELECT_SUBCATEGORY', subcategoryId: 'bill' });
    expect(canAdvance(state, catalog)).toBe(true);
    state = createTicketReducer(state, { type: 'GO_TO', step: 'details' });
    expect(validateDetails(state, catalog.limits)).toEqual({ subject: 'Descreva o assunto em poucas palavras.', description: 'Conte um pouco mais sobre sua solicitação.' });
    state = createTicketReducer(state, { type: 'SET_SUBJECT', value: 'Boleto' });
    state = createTicketReducer(state, { type: 'SET_DESCRIPTION', value: 'Meu boleto venceu e preciso da segunda via.' });
    expect(canAdvance(state, catalog)).toBe(true);
    // trocar a categoria limpa o tipo escolhido
    expect(createTicketReducer(state, { type: 'SELECT_CATEGORY', categoryId: 'other' }).subcategoryId).toBeNull();
  });

  it('rascunho não sobrescreve o que já foi digitado; depois do envio o formulário congela', () => {
    const typed = createTicketReducer(initialCreateState('req-1'), { type: 'SET_SUBJECT', value: 'Já digitei' });
    const draft = { categoryId: 'financial', subcategoryId: 'bill', subject: 'Antigo', description: 'Rascunho salvo antes', step: 'review' as const, savedAt: 1 };
    expect(createTicketReducer(typed, { type: 'RESTORE', draft }).subject).toBe('Já digitei');
    const restored = createTicketReducer(initialCreateState('req-2'), { type: 'RESTORE', draft });
    expect(restored).toMatchObject({ subject: 'Antigo', step: 'details', restored: true });
    expect(draftHasContent({ subject: ' ', description: '' })).toBe(false);
    const sent = createTicketReducer(createTicketReducer(restored, { type: 'SUBMIT_START' }), { type: 'SUBMIT_SUCCESS', ticket: { id: 't' } as never });
    expect(createTicketReducer(sent, { type: 'SUBMIT_START' })).toBe(sent);
    expect(createTicketReducer(sent, { type: 'SET_SUBJECT', value: 'x' })).toBe(sent);
  });

  it('arquivos: tipo deduzido pela extensão e limites amigáveis', () => {
    expect(inferMimeType('comprovante.PDF', null)).toBe('application/pdf');
    expect(inferMimeType('foto.jpg', 'image/jpg')).toBe('image/jpeg');
    const limits = { allowedMimeTypes: ['application/pdf'], maxAttachmentBytes: 5_242_880 };
    expect(validatePickedFile({ mimeType: 'application/zip', sizeBytes: 10 }, limits)).toMatch(/não é aceito/);
    expect(validatePickedFile({ mimeType: 'application/pdf', sizeBytes: 6_000_000 }, limits)).toMatch(/maior que 5 MB/);
    expect(validatePickedFile({ mimeType: 'application/pdf', sizeBytes: 1000 }, limits)).toBeNull();
  });
});

describe('navegação do Atendimento (pilha de volta)', () => {
  it('empilha as telas do fluxo, volta uma a uma e limpa a pilha ao trocar de aba', () => {
    let state = navigationReducer(INITIAL_NAVIGATION_STATE, { type: 'OPEN_SUPPORT_ROUTE', route: supportRoutes.home() });
    state = navigationReducer(state, { type: 'OPEN_SUPPORT_ROUTE', route: supportRoutes.tickets('waiting_student') });
    state = navigationReducer(state, { type: 'OPEN_SUPPORT_ROUTE', route: supportRoutes.ticket('t1') });
    expect(state.detail).toEqual({ screen: 'support-ticket', id: 't1' });
    expect(currentScreenKey(state)).toBe('services');
    state = navigationReducer(state, { type: 'GO_BACK' });
    expect(state.detail).toEqual({ screen: 'support-tickets', filter: 'waiting_student' });
    state = navigationReducer(state, { type: 'GO_BACK' });
    expect(state.detail).toEqual({ screen: 'support' });
    state = navigationReducer(state, { type: 'GO_BACK' });
    expect(state.detail).toBeNull();
    const deep = navigationReducer(navigationReducer(INITIAL_NAVIGATION_STATE, { type: 'OPEN_SUPPORT_ROUTE', route: supportRoutes.home() }), { type: 'OPEN_SUPPORT_ROUTE', route: supportRoutes.newTicket() });
    expect(navigationReducer(deep, { type: 'CHANGE_TAB', tab: 'home' })).toMatchObject({ detail: null, backStack: [] });
  });

  it('confirmação → detalhe substitui a tela de abertura (voltar não reabre o formulário)', () => {
    let state = navigationReducer(INITIAL_NAVIGATION_STATE, { type: 'OPEN_SUPPORT_ROUTE', route: supportRoutes.home() });
    state = navigationReducer(state, { type: 'OPEN_SUPPORT_ROUTE', route: supportRoutes.newTicket() });
    state = navigationReducer(state, { type: 'OPEN_SUPPORT_ROUTE', route: supportRoutes.ticket('novo'), replace: true });
    expect(navigationReducer(state, { type: 'GO_BACK' }).detail).toEqual({ screen: 'support' });
  });

  it('rotas existentes continuam voltando direto para a aba', () => {
    const run = navigationReducer(navigationReducer(INITIAL_NAVIGATION_STATE, { type: 'OPEN_HISTORY' }), { type: 'OPEN_RUN', runId: 'r1' });
    expect(navigationReducer(run, { type: 'GO_BACK' }).detail).toBeNull();
  });
});

describe('API do Atendimento (HTTP)', () => {
  afterEach(() => resetApiClientForTests());

  it('lista com filtros na query e abre chamado sem studentId no corpo', async () => {
    expect(ticketsQuery({ statuses: findFilter('waiting_student').statuses, search: ' matrícula ', cursor: 'abc', limit: 10 })).toBe('/api/support/tickets?status=waiting_student&search=matr%C3%ADcula&limit=10&cursor=abc');
    expect(DETAILED_FILTERS.find((item) => item.key === 'resolved')?.statuses).toEqual(['resolved', 'closed']);
    const fetchFn = jest.fn(async () => fakeResponse(201, okEnvelope({ id: 'ticket-1' })));
    configureApiClient({ baseUrl: 'http://api.test', getAccessToken: () => 'token-123', fetchFn: fetchFn as unknown as typeof fetch });
    await httpSupportApi.createTicket({ clientRequestId: 'req-1', categoryId: 'financial', subcategoryId: 'bill', subject: 'Boleto', description: 'Preciso da segunda via do boleto.' });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/api/support/tickets');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-123');
    expect(JSON.parse(init.body as string)).not.toHaveProperty('studentId');
  });
});

describe('dados de demonstração (EXPO_PUBLIC_USE_MOCK_TICKETS)', () => {
  it('cobre os cenários pedidos e aplica as mesmas regras da API', async () => {
    let now = new Date(2026, 9, 6, 12, 0);
    const api = createMockSupportApi({ now: () => now, latencyMs: 0 });
    const list = await api.listTickets({});
    const statuses = list.items.map((item) => item.status);
    expect(statuses).toEqual(expect.arrayContaining(['received', 'triage', 'in_analysis', 'waiting_student', 'waiting_department', 'in_progress', 'resolved', 'closed', 'cancelled']));
    expect(list.items.some((item) => item.sla.status === 'overdue')).toBe(true);
    expect(list.items.some((item) => item.unreadCount > 1)).toBe(true);
    expect((await api.listTickets({ search: 'matricula' })).items.length).toBeGreaterThan(0);
    const overview = await api.getOverview();
    expect(overview.highlight?.status).toBe('waiting_student');

    const created = await api.createTicket({ clientRequestId: 'req-x', categoryId: 'documents', subcategoryId: 'transcript', subject: 'Histórico', description: 'Preciso do histórico escolar assinado.' });
    expect(created.status).toBe('received');
    expect((await api.createTicket({ clientRequestId: 'req-x', categoryId: 'documents', subcategoryId: 'transcript', subject: 'Histórico', description: 'Preciso do histórico escolar assinado.' })).id).toBe(created.id);
    now = new Date(now.getTime() + 50_000);
    expect((await api.getTicket(created.id)).status).toBe('in_analysis');

    const waiting = list.items.find((item) => item.status === 'waiting_student');
    const replied = await api.sendMessage(waiting!.id, { clientMessageId: 'msg-1', content: 'Segue o comprovante.' });
    expect(replied).toMatchObject({ status: 'in_analysis', pendingAction: null });
    now = new Date(now.getTime() + 61_000);
    const resolved = await api.getTicket(waiting!.id);
    expect(resolved).toMatchObject({ status: 'resolved', canRate: true, canReopen: true });
    await api.rateTicket(waiting!.id, { rating: 5 });
    await expect(api.rateTicket(waiting!.id, { rating: 4 })).rejects.toMatchObject({ status: 409 });
    const cancelled = list.items.find((item) => item.status === 'cancelled');
    await expect(api.sendMessage(cancelled!.id, { clientMessageId: 'msg-2', content: 'oi' })).rejects.toMatchObject({ reason: 'ticket_not_open' });
  });
});
