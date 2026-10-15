import { CALLED_VIBRATION_GAP_MS, performQueueAlert, type AlertEffectDeps } from '../features/queue/services/alertEffects';
import { isQueueDeepLink } from '../features/queue/services/deepLink';
import { createSseParser, type SseMessage } from '../features/queue/services/sse';
import { baselineMilestone, pickAlert, type QueueInAppAlert } from '../features/queue/state/alerts';
import { deriveExperience } from '../features/queue/state/experience';
import { queueErrorMessage } from '../features/queue/state/queueController';
import { timelineText } from '../features/queue/components/QueueHistory';
import { relativeUpdate, syncLabel } from '../features/queue/components/QueueSyncIndicator';
import { validateTicketInput } from '../features/queue/components/QueueTicketForm';
import { alertBannerCopy, calledAccessibilityAnnouncement, queueSpeech } from '../features/queue/voice/queueSpeech';
import { ApiClientError } from '../services/apiClient';
import type { QueueStatus, QueueSubscription } from '../types/api';

const NOW = Date.parse('2026-10-06T23:47:00.000Z');
const formatTime = (iso: string) => iso.slice(11, 16);

function sub(overrides: Partial<QueueSubscription> = {}): QueueSubscription {
  return {
    id: 'sub-1',
    ticket: '0029',
    status: 'waiting',
    position: 8,
    ahead: 7,
    positionKnown: true,
    calledDesk: null,
    calledAt: null,
    alreadyCalled: false,
    lastAlert: null,
    estimate: null,
    preferences: { pushEnabled: true, voiceEnabled: true, vibrationEnabled: true },
    createdAt: '2026-10-06T23:20:00.000Z',
    updatedAt: '2026-10-06T23:20:00.000Z',
    expiresAt: '2026-10-07T02:59:59.999Z',
    timeline: [],
    ...overrides,
  };
}

function status(subscription: QueueSubscription | null, queueStatus: QueueStatus['queue']['status'] = 'open'): QueueStatus {
  return {
    queue: { status: queueStatus, latestCall: null, currentCalls: [], recentCalls: [], upcoming: [], upcomingCount: 0, sync: { status: 'live', lastSuccessfulSyncAt: null, snapshotAgeSeconds: 0, pollIntervalSeconds: 10 } },
    subscription,
    serverTime: new Date(NOW).toISOString(),
  };
}

describe('estados de experiência', () => {
  const derive = (s: QueueStatus | null, extra: { isOffline?: boolean; hasError?: boolean } = {}) => deriveExperience({ status: s, isOffline: false, hasError: false, formatTime, ...extra });

  it('waiting → approaching → next → called, com texto em cada estado', () => {
    expect(derive(status(sub()))).toMatchObject({ state: 'waiting', tone: 'neutral', title: 'Você está na fila', message: '7 pessoas antes de você.', step: 1 });
    expect(derive(status(sub({ status: 'approaching', ahead: 3, position: 4 })))).toMatchObject({ state: 'approaching', tone: 'attention', title: 'Sua vez está chegando', message: '3 pessoas antes de você.', hint: 'Fique próximo à área de atendimento.', step: 2 });
    expect(derive(status(sub({ status: 'next', ahead: 1 })))).toMatchObject({ state: 'next', title: 'Prepare-se', message: 'Sua senha está entre as próximas.', hint: 'Mantenha o celular por perto.' });
    expect(derive(status(sub({ status: 'next', ahead: 0 }))).message).toBe('Sua senha é a próxima.');
    const called = derive(status(sub({ status: 'called', calledDesk: 'Mesa 03', calledAt: '2026-10-06T23:53:00.000Z' })));
    expect(called).toMatchObject({ state: 'called', tone: 'success', title: 'É a sua vez!', message: 'Senha 0029 · Mesa 03', hint: 'Dirija-se à mesa indicada.', step: 3 });
    expect(called.accessibilityLabel).toBe('É a sua vez!. Senha 0029 · Mesa 03. Dirija-se à mesa indicada.');
  });

  it('sem posição conhecida não inventa: "Sua senha ainda não foi chamada."', () => {
    expect(derive(status(sub({ positionKnown: false, ahead: 4 }))).message).toBe('Sua senha ainda não foi chamada.');
  });

  it('chamada sem mesa orienta a conferir o painel; senha antiga mostra o horário', () => {
    expect(derive(status(sub({ status: 'called' }))).hint).toBe('Confira a mesa indicada no painel do ASA.');
    const old = derive(status(sub({ status: 'called', alreadyCalled: true, calledAt: '2026-10-06T23:10:00.000Z', calledDesk: 'Mesa 01' })));
    expect(old).toMatchObject({ title: 'Senha já chamada', message: 'A senha 0029 foi chamada às 23:10 na Mesa 01.' });
  });

  it('sem senha: not_tracking, queue_empty, service_closed, offline e sync_error', () => {
    expect(derive(status(null)).state).toBe('not_tracking');
    expect(derive(status(null, 'empty')).state).toBe('queue_empty');
    expect(derive(status(null, 'closed')).state).toBe('service_closed');
    expect(derive(null, { isOffline: true }).state).toBe('offline');
    expect(derive(null, { hasError: true })).toMatchObject({ state: 'sync_error', tone: 'error' });
    expect(derive(status(sub({ status: 'completed' }))).state).toBe('completed');
  });
});

describe('alertas internos: decididos pelo estado, nunca repetidos', () => {
  it('dispara o marco novo uma vez e o marca como exibido', () => {
    const s = sub({ status: 'approaching', ahead: 3, lastAlert: 'QUEUE_3_AHEAD' });
    const first = pickAlert(s, 'QUEUE_5_AHEAD', NOW, 30 * 60_000);
    expect(first.alert).toMatchObject({ kind: 'three_ahead', ticket: '0029', ahead: 3 });
    expect(first.markHandled).toBe('QUEUE_3_AHEAD');
    expect(pickAlert(s, 'QUEUE_3_AHEAD', NOW, 30 * 60_000)).toEqual({ alert: null, markHandled: null });
  });

  it('chamada antiga ou já chamada antes do cadastro só atualiza a tela', () => {
    const old = sub({ status: 'called', lastAlert: 'QUEUE_CALLED', calledAt: '2026-10-06T22:00:00.000Z' });
    expect(pickAlert(old, 'QUEUE_NEXT', NOW, 30 * 60_000)).toEqual({ alert: null, markHandled: 'QUEUE_CALLED' });
    const before = sub({ status: 'called', lastAlert: 'QUEUE_CALLED', alreadyCalled: true, calledAt: '2026-10-06T23:46:00.000Z' });
    expect(pickAlert(before, null, NOW, 30 * 60_000).alert).toBeNull();
    const fresh = sub({ status: 'called', lastAlert: 'QUEUE_CALLED', calledAt: '2026-10-06T23:46:00.000Z', calledDesk: 'Mesa 03' });
    expect(pickAlert(fresh, 'QUEUE_NEXT', NOW, 30 * 60_000).alert).toMatchObject({ kind: 'called', desk: 'Mesa 03' });
  });

  it('linha de base no cadastro: marcos já atingidos não viram alerta; só uma chamada recente', () => {
    expect(baselineMilestone(sub({ lastAlert: 'QUEUE_3_AHEAD' }))).toBe('QUEUE_3_AHEAD');
    expect(baselineMilestone(sub({ lastAlert: 'QUEUE_CALLED' }))).toBe('QUEUE_NEXT');
    expect(baselineMilestone(sub({ lastAlert: 'QUEUE_CALLED', alreadyCalled: true }))).toBe('QUEUE_CALLED');
  });
});

describe('fala do ASA IA', () => {
  const base = { ticket: '0029', desk: 'Mesa 03' as string | null, ahead: 3 as number | null };

  it('com nome e com mesa', () => {
    expect(queueSpeech('called', { firstName: 'Vinícius', ...base })).toBe('Vinícius, chegou a sua vez! Sua senha 0029 foi chamada. Dirija-se à Mesa 03.');
    expect(queueSpeech('five_ahead', { firstName: 'Vinícius', ...base, ahead: 5 })).toBe('Vinícius, sua vez no ASA está se aproximando. Existem cerca de cinco atendimentos antes da sua senha.');
    expect(queueSpeech('three_ahead', { firstName: 'Vinícius', ...base })).toBe('Vinícius, fique por perto. Faltam apenas três atendimentos para a sua senha no ASA.');
    expect(queueSpeech('next', { firstName: 'Vinícius', ...base })).toBe('Vinícius, prepare-se. Sua senha está entre as próximas a serem chamadas.');
  });

  it('sem nome e sem mesa (nunca inventa a mesa)', () => {
    expect(queueSpeech('called', { firstName: null, ...base, desk: null })).toBe('Chegou a sua vez! Sua senha 0029 foi chamada. Verifique a mesa indicada no painel do ASA.');
    expect(queueSpeech('next', { firstName: '  ', ...base })).toBe('Prepare-se. Sua senha está entre as próximas a serem chamadas.');
    expect(calledAccessibilityAnnouncement('0029', 'Mesa 03')).toBe('Sua senha 0029 foi chamada para a Mesa 03.');
    expect(alertBannerCopy('three_ahead', { ticket: '0029', ahead: 3, desk: null })).toEqual({ title: 'Fique por perto', message: 'Faltam apenas 3 atendimentos para a senha 0029.' });
  });
});

describe('efeitos do alerta (vibração, voz, leitor de tela)', () => {
  const alert = (kind: QueueInAppAlert['kind'], desk: string | null = 'Mesa 03'): QueueInAppAlert => ({ kind, milestone: 'QUEUE_CALLED', subscriptionId: 's', ticket: '0029', ahead: 0, desk });
  function deps(overrides: Partial<AlertEffectDeps> = {}) {
    const scheduled: number[] = [];
    const value = {
      haptics: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), selection: jest.fn(), impactLight: jest.fn() },
      speak: jest.fn(() => true),
      announceAccessibility: jest.fn(),
      screenReaderEnabled: false,
      firstName: 'Vinícius',
      schedule: (run: () => void, ms: number) => {
        scheduled.push(ms);
        run();
      },
      ...overrides,
    };
    return { value, scheduled };
  }
  const allOn = { pushEnabled: true, voiceEnabled: true, vibrationEnabled: true };

  it('chamada: dois pulsos, fala com prioridade alta e anúncio ao leitor de tela', () => {
    const { value, scheduled } = deps();
    const result = performQueueAlert(alert('called'), allOn, value);
    expect(value.haptics.success).toHaveBeenCalledTimes(2);
    expect(scheduled).toEqual([CALLED_VIBRATION_GAP_MS]);
    expect(value.speak).toHaveBeenCalledWith('Vinícius, chegou a sua vez! Sua senha 0029 foi chamada. Dirija-se à Mesa 03.', 'high');
    expect(value.announceAccessibility).toHaveBeenCalledWith('Sua senha 0029 foi chamada para a Mesa 03.');
    expect(result).toEqual({ spoke: true, vibrated: true, announcedToScreenReader: true });
  });

  it('voz e vibração desativadas: nada é falado nem vibra (leitor de tela continua informado)', () => {
    const { value } = deps();
    const result = performQueueAlert(alert('called'), { pushEnabled: true, voiceEnabled: false, vibrationEnabled: false }, value);
    expect(value.speak).not.toHaveBeenCalled();
    expect(value.haptics.success).not.toHaveBeenCalled();
    expect(value.announceAccessibility).toHaveBeenCalledTimes(1);
    expect(result.spoke).toBe(false);
  });

  it('leitor de tela ativo: o anúncio vai pelo leitor, sem segunda voz', () => {
    const { value } = deps({ screenReaderEnabled: true });
    performQueueAlert(alert('three_ahead'), allOn, value);
    expect(value.speak).not.toHaveBeenCalled();
    expect(value.announceAccessibility).toHaveBeenCalledWith(expect.stringContaining('fique por perto'));
  });

  it('proximidade: vibração leve e fala com prioridade normal (não interrompe o assistente)', () => {
    const { value } = deps();
    performQueueAlert(alert('five_ahead'), allOn, value);
    expect(value.haptics.impactLight).toHaveBeenCalledTimes(1);
    expect(value.speak).toHaveBeenCalledWith(expect.any(String), 'normal');
    performQueueAlert(alert('next'), allOn, value);
    expect(value.haptics.warning).toHaveBeenCalledTimes(1);
  });
});

describe('utilitários', () => {
  it('parser SSE: mensagens em pedaços arbitrários, comentários e múltiplas linhas de data', () => {
    const messages: SseMessage[] = [];
    const parser = createSseParser((message) => messages.push(message));
    parser.feed('retry: 5000\n\n: ping\n\nid: 1\nevent: queue.st');
    parser.feed('atus\ndata: {"a":1}\n\nevent: queue.sync\r\ndata: x\r\ndata: y\r\n\r\n');
    expect(messages).toEqual([
      { event: 'queue.status', data: '{"a":1}', id: '1' },
      { event: 'queue.sync', data: 'x\ny', id: '1' },
    ]);
  });

  it('deep link asaconecta://atendimento/fila', () => {
    expect(isQueueDeepLink('asaconecta://atendimento/fila')).toBe(true);
    expect(isQueueDeepLink('asaconecta://atendimento/fila/?origem=push')).toBe(true);
    expect(isQueueDeepLink('asaconecta://atendimento')).toBe(false);
    expect(isQueueDeepLink('https://presencial.fecap.br/')).toBe(false);
    expect(isQueueDeepLink(null)).toBe(false);
  });

  it('validação da senha digitada (mesma regra da API, mensagem amigável)', () => {
    expect(validateTicketInput('0029')).toBeNull();
    expect(validateTicketInput(' 29 ')).toBeNull();
    expect(validateTicketInput('P012')).toBeNull();
    expect(validateTicketInput('')).toBe('Digite uma senha válida.');
    expect(validateTicketInput('abc!')).toBe('Digite uma senha válida.');
  });

  it('linha do tempo do acompanhamento', () => {
    expect(timelineText({ type: 'subscribed', at: '', ahead: null, desk: null }, '0029')).toBe('Senha 0029 adicionada');
    expect(timelineText({ type: 'QUEUE_5_AHEAD', at: '', ahead: 5, desk: null }, '0029')).toBe('Faltam 5 atendimentos');
    expect(timelineText({ type: 'QUEUE_CALLED', at: '', ahead: null, desk: 'Mesa 03' }, '0029')).toBe('Senha chamada — Mesa 03');
    expect(timelineText({ type: 'QUEUE_CALLED', at: '', ahead: null, desk: null }, '0029')).toBe('Senha chamada');
  });

  it('sincronização: Conectado · Atualizando · Sem conexão · Fonte indisponível', () => {
    const live = { status: 'live' as const, lastSuccessfulSyncAt: new Date(NOW - 20_000).toISOString(), snapshotAgeSeconds: 20, pollIntervalSeconds: 10 };
    expect(syncLabel('live', live)).toBe('Conectado');
    expect(syncLabel('polling', live)).toBe('Atualizando');
    expect(syncLabel('offline', live)).toBe('Sem conexão');
    expect(syncLabel('live', { ...live, status: 'unavailable' })).toBe('Fonte indisponível');
    expect(relativeUpdate(live.lastSuccessfulSyncAt, NOW)).toBe('Atualizado há 20 s');
    expect(relativeUpdate(new Date(NOW + 3000).toISOString(), NOW)).toBe('Atualizado agora');
    expect(relativeUpdate(new Date(NOW - 180_000).toISOString(), NOW)).toBe('Atualizado há 3 min');
  });

  it('erros da API viram mensagens sem jargão', () => {
    expect(queueErrorMessage(new ApiClientError({ kind: 'validation', message: 'Dados inválidos.', details: [{ field: 'ticket', message: 'Digite uma senha válida.' }] }))).toBe('Digite uma senha válida.');
    expect(queueErrorMessage(new ApiClientError({ kind: 'rate_limited', message: 'x' }))).toMatch(/Aguarde/);
    expect(queueErrorMessage(new ApiClientError({ kind: 'dependency', message: 'x' }))).toBe('O acompanhamento da fila não está disponível no momento.');
    expect(queueErrorMessage(new Error('boom'))).toBe('Não foi possível concluir agora. Tente novamente.');
  });
});
