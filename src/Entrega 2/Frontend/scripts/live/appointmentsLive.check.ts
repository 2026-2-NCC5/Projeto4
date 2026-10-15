/**
 * Verificação AO VIVO dos agendamentos contra a API de desenvolvimento, usando a própria camada HTTP do app
 * (services/apiClient + httpAppointmentsApi/httpNotificationsApi). NÃO faz parte de `npm test` (fora do testMatch).
 *
 *   npx jest --testMatch '<rootDir>/scripts/live/*.check.ts' --runInBand
 *
 * - Faz UM login (limite de 20 logins/10 min por IP, compartilhado).
 * - Cria agendamentos reais da conta de DEMONSTRAÇÃO e cancela tudo o que criou (inclusive se algo falhar no meio).
 * - Variáveis opcionais: ASA_LIVE_API_URL (padrão http://localhost:3000), ASA_LIVE_EMAIL, ASA_LIVE_PASSWORD e
 *   ASA_LIVE_CLEANUP_IDS (ids de agendamentos de uma execução anterior: entram na limpeza, no resumo e nos avisos lidos).
 */
import http from 'node:http';
import { URL as NodeURL } from 'node:url';

import { httpAppointmentsApi, newAppointmentRequestId, slotRange, uniqueSlots, appointmentErrorMessage } from '../../features/appointments';
import { httpNotificationsApi } from '../../features/notifications/api';
import { ApiClientError, configureApiClient, request, resetApiClientForTests } from '../../services/apiClient';
import { login } from '../../services/authService';
import type { Appointment, AppointmentSlot, PlatformInfo, QueueStatus } from '../../types/api';

const BASE = (process.env.ASA_LIVE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const EMAIL = process.env.ASA_LIVE_EMAIL ?? 'estudante.exemplo@demo.asa';
const PASSWORD = process.env.ASA_LIVE_PASSWORD ?? 'Demo@2026';
const NOTE = 'Verificação automática do app ASA Conecta (será cancelado em seguida).';

jest.setTimeout(120_000);

/** `fetch` mínimo sobre node:http com o que o apiClient usa (status, ok, headers.get, text) e cancelamento. */
function nodeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const target = new NodeURL(url);
    const headers = { ...(init.headers as Record<string, string> | undefined) };
    const body = init.body === undefined || init.body === null ? undefined : String(init.body);
    if (body !== undefined) headers['Content-Length'] = String(Buffer.byteLength(body));
    const outgoing = http.request({ hostname: target.hostname, port: target.port, path: `${target.pathname}${target.search}`, method: init.method ?? 'GET', headers }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const status = incoming.statusCode ?? 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          headers: { get: (name: string) => (incoming.headers[name.toLowerCase()] as string | undefined) ?? null },
          text: async () => text,
          json: async () => JSON.parse(text) as unknown,
        } as unknown as Response);
      });
    });
    init.signal?.addEventListener('abort', () => outgoing.destroy(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
    outgoing.on('error', reject);
    if (body !== undefined) outgoing.write(body);
    outgoing.end();
  });
}

const log: string[] = [];
const note = (line: string) => log.push(line);

async function expectRejection(promise: Promise<unknown>): Promise<ApiClientError> {
  const outcome = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  if (!(outcome instanceof ApiClientError)) throw new Error('A chamada deveria ter sido recusada pela API.');
  return outcome;
}

const overlaps = (slot: AppointmentSlot, item: Appointment) => Date.parse(slot.startsAt) < Date.parse(item.endsAt) && Date.parse(item.startsAt) < Date.parse(slot.endsAt);

/**
 * Dois horários presenciais a partir de amanhã (longe do prazo de alteração), sem conflito com os atendimentos que o
 * aluno já tem; prefere um início que exista em mais de um local.
 */
function pickSlots(days: { date: string; slots: AppointmentSlot[] }[], today: string, mine: Appointment[]): { first: AppointmentSlot; second: AppointmentSlot; multiLocation: boolean } {
  const future = days
    .filter((day) => day.date > today)
    .flatMap((day) => uniqueSlots(day.slots))
    .filter((slot) => !mine.some((item) => overlaps(slot, item)));
  const byStart = new Map<string, AppointmentSlot[]>();
  for (const slot of future) byStart.set(slot.startsAt, [...(byStart.get(slot.startsAt) ?? []), slot]);
  const shared = [...byStart.values()].find((group) => new Set(group.map((slot) => slot.location)).size > 1);
  const first = shared ? (shared[shared.length - 1] as AppointmentSlot) : future[0];
  const second = future.find((slot) => first && slot.startsAt !== first.startsAt);
  if (!first || !second) throw new Error('Sem horários presenciais suficientes nos próximos 14 dias para a verificação.');
  return { first, second, multiLocation: Boolean(shared) };
}

describe('verificação ao vivo — agendamentos com o ASA (API de desenvolvimento)', () => {
  const previous: string[] = (process.env.ASA_LIVE_CLEANUP_IDS ?? '')
    .split(',')
    .map((id: string) => id.trim())
    .filter(Boolean);
  const created = new Map<string, string>(previous.map((id): [string, string] => [id, 'execução anterior']));
  let token: string | null = null;

  beforeAll(() => {
    configureApiClient({ baseUrl: BASE, getAccessToken: () => token, fetchFn: nodeFetch as unknown as typeof fetch });
  });

  afterAll(async () => {
    // Limpeza: nada criado aqui fica ativo, mesmo se a verificação falhou no meio.
    for (const id of created.keys()) {
      try {
        const current = await httpAppointmentsApi.get(id);
        if (current.status === 'scheduled' || current.status === 'confirmed') {
          await httpAppointmentsApi.cancel(id, { reason: 'Limpeza da verificação automática do app.' });
          note(`limpeza: ${current.protocol} cancelado`);
        }
      } catch (error) {
        note(`limpeza: falhou para ${id} (${error instanceof Error ? error.message : String(error)})`);
      }
    }
    const summary = await Promise.all(
      [...created.keys()].map((id) =>
        httpAppointmentsApi.get(id).then(
          (item) => `${item.protocol} (${item.id}) · ${item.status}${item.rescheduledToId ? ` → remarcado para ${item.rescheduledToId}` : ''}${item.location ? ` · ${item.location}` : ''}`,
          () => `${id} · não foi possível ler`,
        ),
      ),
    );
    note('agendamentos criados nesta verificação (situação final):');
    for (const line of summary) note(`  - ${line}`);
    resetApiClientForTests();
    process.stdout.write(`\n${log.join('\n')}\n`);
  });

  it('agenda com local, repete com a mesma chave, recusa local errado, remarca, cancela e marca os próprios avisos', async () => {
    const info = await request<PlatformInfo>('/api/platform/info', { auth: false });
    note(`plataforma: contrato ${info.contractVersion} · modo ${info.dataMode} · agendamentos ${info.features.appointments ? 'ligados' : 'desligados'}`);
    expect(info.features.appointments).toBe(true);

    const session = await login(EMAIL, PASSWORD);
    token = session.accessToken;
    note(`login: ${session.user.email} (1 login)`);

    const catalog = await httpAppointmentsApi.getCatalog();
    const range = slotRange(new Date(), catalog.policy.timezone);
    const slots = await httpAppointmentsApi.getSlots({ ...range, mode: 'presencial' });
    note(`catálogo: ${catalog.topics.length} assuntos · política ${JSON.stringify(catalog.policy)} · horários ${range.from}..${range.to}: ${slots.days.reduce((sum, day) => sum + day.slots.length, 0)}`);
    const before = await httpAppointmentsApi.list('upcoming');
    note(`ativos antes: ${before.items.length} (limite ${catalog.policy.maxActivePerStudent}) · ${before.items.map((item) => `${item.protocol} ${item.status}`).join(', ') || 'nenhum'}`);
    const { first, second, multiLocation } = pickSlots(slots.days, range.from, before.items);
    note(`escolhidos: ${first.startsAt} @ ${first.location} (início com mais de um local: ${multiLocation ? 'sim' : 'não'}) · remarcar para ${second.startsAt} @ ${second.location}`);
    const topicId = catalog.topics[0]?.id ?? 'other';

    if (before.items.length >= catalog.policy.maxActivePerStudent) {
      // conta já no limite (agendamentos de outras pessoas/agentes): só dá para conferir a recusa — nada é criado
      const limited = await expectRejection(httpAppointmentsApi.create({ clientRequestId: newAppointmentRequestId(), topicId, startsAt: first.startsAt, mode: 'presencial', location: first.location }));
      note(`limite de ativos: ${limited.status} ${limited.reason} → "${appointmentErrorMessage(limited)}" (fluxo de criação não verificado)`);
      expect(limited.reason).toBe('active_limit');
      return;
    }

    // 1) local inexistente naquele horário: 409 slot_unavailable e nada é criado (antes de agendar: abaixo do limite de ativos,
    //    que o servidor confere antes do horário)
    const refused = await expectRejection(
      httpAppointmentsApi.create({ clientRequestId: newAppointmentRequestId(), topicId, startsAt: second.startsAt, mode: 'presencial', location: 'Local inexistente (verificação do app)' }),
    );
    note(`agendar em local errado: ${refused.status} ${refused.reason} → "${appointmentErrorMessage(refused)}"`);
    expect(refused.status).toBe(409);
    expect(refused.reason).toBe('slot_unavailable');

    // 2) agendar com o local do horário escolhido; repetir com a mesma chave devolve o mesmo agendamento
    const body = { clientRequestId: newAppointmentRequestId(), topicId, startsAt: first.startsAt, mode: 'presencial' as const, location: first.location, notes: NOTE };
    const booked = await httpAppointmentsApi.create(body);
    created.set(booked.id, booked.protocol);
    note(`agendado: ${booked.protocol} · ${booked.status} · ${booked.startsAt} · ${booked.location} · rescheduledToId=${String(booked.rescheduledToId)}`);
    expect(booked.startsAt).toBe(new Date(first.startsAt).toISOString());
    expect(booked.location).toBe(first.location);
    expect(booked.rescheduledToId).toBeNull();
    const repeated = await httpAppointmentsApi.create(body);
    note(`mesma clientRequestId: devolveu ${repeated.protocol} (${repeated.id === booked.id ? 'o mesmo, sem duplicar' : 'OUTRO — duplicou!'})`);
    expect(repeated.id).toBe(booked.id);

    // 3) remarcar para um local inexistente: 409 slot_unavailable e o agendamento continua como estava
    const refusedMove = await expectRejection(
      httpAppointmentsApi.reschedule(booked.id, { clientRequestId: newAppointmentRequestId(), startsAt: second.startsAt, mode: 'presencial', location: 'Local inexistente (verificação do app)' }),
    );
    const untouched = await httpAppointmentsApi.get(booked.id);
    note(`remarcar para local errado: ${refusedMove.status} ${refusedMove.reason} · agendamento continua ${untouched.status}`);
    expect(refusedMove.reason).toBe('slot_unavailable');
    expect(untouched.status).toBe(booked.status);

    // 4) remarcar para outro horário/local: o novo aponta para o antigo e o antigo para o novo
    const moved = await httpAppointmentsApi.reschedule(booked.id, { clientRequestId: newAppointmentRequestId(), startsAt: second.startsAt, mode: 'presencial', location: second.location });
    created.set(moved.id, moved.protocol);
    const old = await httpAppointmentsApi.get(booked.id);
    note(`remarcado: ${old.protocol} → ${moved.protocol} · antigo ${old.status} (rescheduledToId=${String(old.rescheduledToId)}) · novo rescheduledFromId=${String(moved.rescheduledFromId)} · ${moved.location}`);
    expect(old.status).toBe('cancelled');
    expect(old.rescheduledToId).toBe(moved.id);
    expect(moved.rescheduledFromId).toBe(booked.id);
    expect(moved.location).toBe(second.location);

    // 5) cancelar o novo
    const cancelled: Appointment = await httpAppointmentsApi.cancel(moved.id, { reason: 'Verificação automática do app — cancelado ao final.' });
    note(`cancelado: ${cancelled.protocol} · ${cancelled.status} · canCancel=${String(cancelled.canCancel)} · canReschedule=${String(cancelled.canReschedule)}`);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.canCancel).toBe(false);

    // 6) agendamento inexistente: 404 com mensagem amigável
    const missing = await expectRejection(httpAppointmentsApi.get('appt-inexistente-verificacao'));
    note(`inexistente: ${missing.status} → "${appointmentErrorMessage(missing)}"`);
    expect(missing.status).toBe(404);

    // 7) central de avisos: GET e PATCH com o mesmo limite; marca como lidos só os avisos criados por esta verificação
    const inbox = await httpNotificationsApi.list(50);
    const ours = inbox.items.filter((item) => item.resource?.type === 'appointment' && created.has(item.resource.id));
    note(`central: ${inbox.items.length} avisos · ${inbox.unreadCount} não lidos · desta verificação: ${ours.map((item) => `${item.kind}${item.readAt ? ' (lido)' : ''}`).join(', ') || 'nenhum'}`);
    if (ours.length > 0) {
      const after = await httpNotificationsApi.markRead(
        ours.map((item) => item.id),
        50,
      );
      note(`PATCH ?limit=50: ${after.items.length} itens na resposta (GET trouxe ${inbox.items.length}) · não lidos ${inbox.unreadCount} → ${after.unreadCount}`);
      expect(after.items.length).toBe(inbox.items.length);
      expect(after.items.filter((item) => ours.some((mine) => mine.id === item.id)).every((item) => item.readAt !== null)).toBe(true);
    }

    // 8) fila: origem dos dados informada (rótulo de simulação no app)
    const queue = await request<QueueStatus>('/api/queue/status');
    note(`fila: sync.source = ${JSON.stringify(queue.queue.sync.source ?? null)}`);
  });
});
