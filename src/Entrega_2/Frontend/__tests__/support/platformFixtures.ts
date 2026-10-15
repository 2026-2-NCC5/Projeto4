import type { Appointment, AppointmentCatalog, AppointmentSlot, AppointmentSlotList, InboxNotification, InboxNotificationList, PlatformInfo } from '../../types/api';

import { errorEnvelope, fakeResponse, okEnvelope } from './fakeFetch';

/** Quinta-feira, 15/10/2026 às 09:00 em Brasília (12:00 UTC). */
export const NOW = new Date('2026-10-15T12:00:00.000Z');

export function makePlatformInfo(overrides: Partial<PlatformInfo> = {}): PlatformInfo {
  return {
    name: 'ASA Conecta',
    institution: 'FECAP — Área do Sucesso Alvarista (ASA)',
    environment: 'development',
    apiVersion: '1.0.0',
    contractVersion: '1.6',
    dataMode: 'demo',
    dataModeLabel: 'DEMONSTRAÇÃO — Dados fictícios',
    academicSource: { provider: 'demo', status: 'demo', message: 'Disciplinas, notas, frequência e pendências fictícias, criadas para demonstração.' },
    features: { tickets: true, appointments: true, knowledgeBase: true, notifications: true, realtime: false, assistant: true },
    assistant: { provider: 'existing', providerLabel: 'Regras do ASA Conecta', jev: { status: 'planned', enabled: false } },
    queue: { enabled: true, source: 'demo', authorized: false },
    announcement: null,
    businessHours: { timezone: 'America/Sao_Paulo', days: [], note: null },
    links: [],
    timezone: 'America/Sao_Paulo',
    serverTime: NOW.toISOString(),
    ...overrides,
  };
}

export const catalogFixture: AppointmentCatalog = {
  topics: [
    { id: 'academic', label: 'Acadêmico', description: 'Notas, frequência, disciplinas e orientação acadêmica.' },
    { id: 'documents', label: 'Documentos', description: 'Declarações, histórico escolar e certificados.' },
  ],
  modes: [
    { id: 'presencial', label: 'Presencial', description: 'Atendimento no ASA, no horário marcado. Chegue alguns minutos antes.' },
    { id: 'online', label: 'Online', description: 'Videochamada. O link é combinado pela equipe do ASA na confirmação.' },
  ],
  policy: { minLeadHours: 2, maxDaysAhead: 30, cancellationMinHours: 2, maxActivePerStudent: 2, timezone: 'America/Sao_Paulo' },
};

const LOCATION = 'Central de atendimento ASA';

export function slot(startsAt: string, minutes = 30, mode: AppointmentSlot['mode'] = 'presencial', location: string | null = mode === 'presencial' ? LOCATION : null): AppointmentSlot {
  return { startsAt, endsAt: new Date(Date.parse(startsAt) + minutes * 60_000).toISOString(), mode, location, available: 1 };
}

/** 14 dias a partir de 15/10/2026; horários presenciais em 16/10 e 19/10 e online em 20/10 (horário de Brasília = UTC−3). */
export function slotListFixture(mode: string | null, options: { exclude?: string[] } = {}): AppointmentSlotList {
  const exclude = new Set(options.exclude ?? []);
  const byDay: Record<string, AppointmentSlot[]> = {
    '2026-10-16': [slot('2026-10-16T13:00:00.000Z'), slot('2026-10-16T13:30:00.000Z')],
    // v1.8: o mesmo horário em duas salas são duas opções (uma por local)
    '2026-10-19': [slot('2026-10-19T12:00:00.000Z'), slot('2026-10-19T12:00:00.000Z', 30, 'presencial', 'Sala 2'), slot('2026-10-19T12:30:00.000Z'), slot('2026-10-19T13:00:00.000Z')],
    '2026-10-20': [slot('2026-10-20T21:00:00.000Z', 30, 'online'), slot('2026-10-20T21:30:00.000Z', 30, 'online')],
  };
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 9, 15 + index)).toISOString().slice(0, 10);
    const slots = (byDay[date] ?? []).filter((item) => (!mode || item.mode === mode) && !exclude.has(item.startsAt));
    return { date, slots };
  });
  return { from: '2026-10-15', to: '2026-10-28', timezone: 'America/Sao_Paulo', days, generatedAt: NOW.toISOString() };
}

export function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1',
    protocol: 'AGD-2026-00001',
    status: 'confirmed',
    topicId: 'documents',
    topicLabel: 'Documentos',
    mode: 'presencial',
    location: LOCATION,
    startsAt: '2026-10-16T13:00:00.000Z',
    endsAt: '2026-10-16T13:30:00.000Z',
    studentNotes: 'Retirar o histórico escolar assinado.',
    channel: 'app',
    attendantLabel: 'Equipe ASA',
    ticketId: null,
    rescheduledFromId: null,
    rescheduledToId: null,
    cancelReason: null,
    cancelledBy: null,
    canCancel: true,
    canReschedule: true,
    changeDeadline: '2026-10-16T11:00:00.000Z',
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T13:00:00.000Z',
    events: [
      { id: 'ev-1', type: 'scheduled', title: 'Atendimento agendado', description: 'Documentos · Presencial', actorType: 'student', createdAt: '2026-10-14T12:00:00.000Z' },
      { id: 'ev-2', type: 'confirmed', title: 'Confirmado pelo ASA', description: null, actorType: 'staff', createdAt: '2026-10-14T13:00:00.000Z' },
    ],
    ...overrides,
  };
}

export function makeNotification(overrides: Partial<InboxNotification> = {}): InboxNotification {
  return {
    id: '7d1f2c3a-0000-4000-8000-000000000001',
    category: 'appointment',
    kind: 'appointment_confirmed',
    title: 'Atendimento confirmado',
    body: 'AGD-2026-00001 · sex., 16/10 às 10:00',
    resource: { type: 'appointment', id: 'appt-1' },
    createdAt: '2026-10-15T11:30:00.000Z',
    readAt: null,
    ...overrides,
  };
}

export function inboxFixture(items: InboxNotification[] = defaultInboxItems()): InboxNotificationList {
  return { items, unreadCount: items.filter((item) => !item.readAt).length };
}

export function defaultInboxItems(): InboxNotification[] {
  return [
    makeNotification(),
    makeNotification({
      id: '7d1f2c3a-0000-4000-8000-000000000002',
      category: 'support',
      kind: 'new_message',
      title: 'Nova mensagem da Secretaria',
      body: 'ASA-2026-00400 · Recebemos seu pedido.',
      resource: { type: 'ticket', id: 'ticket-1' },
      createdAt: '2026-10-15T10:00:00.000Z',
    }),
    makeNotification({
      id: '7d1f2c3a-0000-4000-8000-000000000003',
      category: 'system',
      kind: 'announcement',
      title: 'Horário especial do ASA',
      body: 'Na sexta-feira o atendimento presencial vai até as 18h.',
      resource: null,
      createdAt: '2026-10-12T15:00:00.000Z',
      readAt: '2026-10-12T16:00:00.000Z',
    }),
  ];
}

export interface RecordedCall {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
}

export type RouteHandler = (call: RecordedCall) => Response | Promise<Response>;

function parseQuery(search: string): Record<string, string> {
  const query: Record<string, string> = {};
  for (const pair of search.split('&').filter(Boolean)) {
    const [key, value = ''] = pair.split('=');
    if (key) query[decodeURIComponent(key)] = decodeURIComponent(value);
  }
  return query;
}

/** fetch falso roteado por "MÉTODO /caminho"; rotas desconhecidas respondem 404 (como a API). */
export function routedFetch(routes: Record<string, RouteHandler>) {
  const calls: RecordedCall[] = [];
  const fn = jest.fn(async (url: string, init?: RequestInit) => {
    const withoutOrigin = url.replace(/^https?:\/\/[^/]+/, '');
    const [path = '', search = ''] = withoutOrigin.split('?');
    const method = init?.method ?? 'GET';
    const call: RecordedCall = { method, path, query: parseQuery(search), body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined };
    calls.push(call);
    const handler = routes[`${method} ${path}`];
    if (!handler) return fakeResponse(404, errorEnvelope('NOT_FOUND', `Rota não encontrada: ${method} ${path}`));
    return handler(call);
  });
  return { fn, calls, find: (method: string, path: string) => calls.filter((call) => call.method === method && call.path === path) };
}

export const ok = <T>(data: T, status = 200) => fakeResponse(status, okEnvelope(data));
export const fail = (status: number, code: string, message: string, reason?: string) => fakeResponse(status, errorEnvelope(code, message, reason ? { reason } : {}));
