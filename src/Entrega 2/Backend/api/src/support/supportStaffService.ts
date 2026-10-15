import { randomUUID } from 'node:crypto';
import type {
  SupportAttachmentLink as SupportAttachmentLinkDto,
  SupportStaffAssignRequest,
  SupportStaffMessageRequest,
  SupportStaffNoteRequest,
  SupportStaffPriorityRequest,
  SupportStaffResolveRequest,
  SupportStaffStatusRequest,
  SupportStaffSummaryInfo,
  SupportStaffTicket,
  SupportTicketPriority,
  SupportTicketList,
  SupportUpload,
  SupportUploadRequest,
} from '../contracts/mobileApi.v1.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError.js';
import { categoryIdsMatching, isSupportTeam, normalizeSearch, TRIAGE_TEAM } from './catalog.js';
import { toStaffTicket, toSummary } from './mappers.js';
import { completeSla, pauseSla, resumeSla } from './sla.js';
import { completesTriage, isActiveStatus, STAFF_SETTABLE_STATUSES, STATUS_EVENT_TEXT, STATUS_LABELS } from './statuses.js';
import { countsFrom, DEFAULT_PAGE_SIZE, decodeCursor, encodeCursor, event, MAX_PAGE_SIZE, parseStatuses, type ListQuery, type SupportActor, type SupportCore } from './supportService.js';
import type { NewSupportEvent, NewSupportNotification, SupportTicketPatch, SupportTicketRecord } from './types.js';

const PRIORITY_LABELS = { normal: 'Normal', high: 'Alta', urgent: 'Urgente' } as const;
const PRIORITIES: ReadonlySet<string> = new Set(Object.keys(PRIORITY_LABELS));

/** Nome exibido nos envios da equipe antes de o arquivo ser vinculado a um chamado. */
const STAFF_UPLOADER_NAME = 'Equipe ASA';

/**
 * Visão da equipe (institutional_staff / technical_admin). Toda ação gera evento de auditoria com o usuário que agiu
 * (interno) e o nome público da equipe (visível ao estudante). Notas internas e prioridade nunca chegam ao estudante.
 */
export class SupportStaffService {
  constructor(private readonly core: SupportCore) {}

  private get repos() {
    return this.core.repos;
  }

  private async view(ticket: SupportTicketRecord): Promise<SupportStaffTicket> {
    const [bundle, student, agent] = await Promise.all([
      this.core.loadBundle(ticket, true),
      this.repos.students.findById(ticket.studentId),
      ticket.assignedAgentId ? this.repos.users.findById(ticket.assignedAgentId) : Promise.resolve(null),
    ]);
    const user = student ? await this.repos.users.findById(student.userId) : null;
    const base = toStaffTicket(bundle, { id: ticket.studentId, fullName: user?.fullName ?? 'Estudante', registrationNumber: student?.registrationNumber ?? '—' }, this.core.now());
    return {
      ...base,
      assignedAgent: agent ? { id: agent.id, fullName: agent.fullName } : null,
      unreadFromStudent: bundle.messages.filter((message) => message.senderType === 'student' && !message.readAt).length,
    };
  }

  private async active(ticketId: string): Promise<SupportTicketRecord> {
    const ticket = await this.core.findTicketOrThrow(ticketId);
    if (!isActiveStatus(ticket.status)) throw new ConflictError('O chamado já foi finalizado.', 'ticket_finished');
    return ticket;
  }

  /** Fila da equipe: filtros operacionais e dados internos (aluno, atendente) em cada linha. */
  async list(query: ListQuery, viewerUserId?: string): Promise<SupportTicketList> {
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const search = query.search ? normalizeSearch(query.search).slice(0, 80) : '';
    const statuses = parseStatuses(query.status);
    const now = this.core.now();
    const priorities = query.priority ? query.priority.split(',').filter((value): value is SupportTicketPriority => PRIORITIES.has(value)) : undefined;
    const rows = await this.repos.support.listTickets({
      ...(statuses ? { statuses } : {}),
      ...(search ? { search, searchCategoryIds: categoryIdsMatching(search) } : {}),
      limit: limit + 1,
      cursor: decodeCursor(query.cursor),
      perspective: 'staff',
      ...(query.assigned === 'mine' && viewerUserId ? { assignment: { kind: 'mine' as const, userId: viewerUserId } } : {}),
      ...(query.assigned === 'unassigned' ? { assignment: { kind: 'unassigned' as const } } : {}),
      ...(query.team ? { teams: query.team.split(',').filter(isSupportTeam) } : {}),
      ...(query.category ? { categoryIds: query.category.split(',') } : {}),
      ...(priorities && priorities.length > 0 ? { priorities } : {}),
      ...(query.sla ? { slaRisk: query.sla } : {}),
      ...(query.unread ? { unreadByStaff: true } : {}),
      excludeDemo: Boolean(this.core.config.excludeDemo),
      orderBy: query.sort === 'due' ? 'due' : 'updated',
      now,
    });
    const page = rows.slice(0, limit);
    const byStatus: Partial<Record<SupportTicketRecord['status'], number>> = {};
    for (const row of page) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    const last = page[page.length - 1];
    const people = await this.people(page);
    return {
      items: page.map((row) => ({ ...toSummary(row, row, now), staff: this.staffInfo(row, people) })),
      nextCursor: rows.length > limit && last ? encodeCursor({ updatedAt: query.sort === 'due' ? last.sla.dueAt : last.updatedAt, id: last.id }) : null,
      counts: countsFrom(byStatus),
    };
  }

  /** Nomes de alunos e atendentes da página (uma leitura por pessoa distinta). */
  private async people(rows: SupportTicketRecord[]) {
    const students = new Map<string, { fullName: string; registrationNumber: string }>();
    const agents = new Map<string, string>();
    await Promise.all(
      [...new Set(rows.map((row) => row.studentId))].map(async (studentId) => {
        const student = await this.repos.students.findById(studentId);
        const user = student ? await this.repos.users.findById(student.userId) : null;
        students.set(studentId, { fullName: user?.fullName ?? 'Estudante', registrationNumber: student?.registrationNumber ?? '—' });
      }),
    );
    await Promise.all(
      [...new Set(rows.map((row) => row.assignedAgentId).filter((id): id is string => Boolean(id)))].map(async (agentId) => {
        agents.set(agentId, (await this.repos.users.findById(agentId))?.fullName ?? 'Atendente');
      }),
    );
    return { students, agents };
  }

  private staffInfo(row: SupportTicketRecord, people: Awaited<ReturnType<SupportStaffService['people']>>): SupportStaffSummaryInfo {
    const student = people.students.get(row.studentId);
    return {
      studentId: row.studentId,
      studentName: student?.fullName ?? 'Estudante',
      registrationNumber: student?.registrationNumber ?? '—',
      assignedTeam: row.assignedTeam,
      assignedAgentId: row.assignedAgentId,
      assignedAgentName: row.assignedAgentId ? (people.agents.get(row.assignedAgentId) ?? null) : null,
      channel: row.channel,
    };
  }

  /** Equipe abriu o chamado: confirma leitura das mensagens do aluno. */
  async markRead(ticketId: string): Promise<SupportStaffTicket> {
    const ticket = await this.core.findTicketOrThrow(ticketId);
    await this.repos.support.markReadByStaff(ticket.id, this.core.now());
    return this.view(ticket);
  }

  async get(ticketId: string): Promise<SupportStaffTicket> {
    return this.view(await this.core.findTicketOrThrow(ticketId));
  }

  async setStatus(actor: SupportActor, ticketId: string, body: SupportStaffStatusRequest): Promise<SupportStaffTicket> {
    const ticket = await this.core.findTicketOrThrow(ticketId);
    const to = body.status;
    if (ticket.status === 'closed' || ticket.status === 'cancelled') throw new ConflictError('O chamado já foi finalizado.', 'ticket_finished');
    if (ticket.status === 'resolved' && to !== 'closed') throw new ConflictError('Um chamado resolvido só pode ser encerrado (ou reaberto pelo estudante).', 'invalid_transition');
    if (!STAFF_SETTABLE_STATUSES.has(to)) {
      throw new ValidationError('Use a ação específica para esta situação (pedir ação ao estudante ou resolver).', [{ field: 'status', message: 'situação não definida diretamente' }], { reason: 'invalid_transition' });
    }
    if (to === ticket.status) throw new ConflictError('O chamado já está nesta situação.', 'status_unchanged');

    const now = this.core.now();
    const patch: SupportTicketPatch = { status: to };
    let sla = ticket.status === 'waiting_student' ? resumeSla(ticket.sla, now) : ticket.sla;
    if (ticket.status === 'waiting_student') patch.pendingAction = null;
    if (to === 'closed') {
      patch.closedAt = now;
      sla = completeSla(sla, now);
    }
    if (to === 'cancelled') {
      patch.cancelledAt = now;
      sla = completeSla(sla, now);
    }
    patch.sla = sla;

    const note = body.publicNote?.trim();
    const details = note ? [{ label: 'Observação', value: note }] : [];
    const text = STATUS_EVENT_TEXT[to] ?? { title: STATUS_LABELS[to], description: '' };
    const base = { actorType: 'agent' as const, actorUserId: actor.userId, actorName: ticket.assignedTeam, fromStatus: ticket.status, toStatus: to, details };
    const statusEvent: NewSupportEvent = completesTriage(ticket.status, to)
      ? event({ ...base, type: 'ticket_triaged', title: 'Triagem concluída', description: text.description })
      : event({ ...base, type: to === 'closed' ? 'ticket_closed' : to === 'cancelled' ? 'ticket_cancelled' : 'status_changed', title: text.title, description: text.description || null });
    const notification: NewSupportNotification =
      to === 'closed'
        ? { kind: 'ticket_closed', title: 'Chamado encerrado', body: 'O atendimento foi finalizado. O histórico continua disponível.' }
        : { kind: 'status_changed', title: 'Chamado atualizado', body: `Agora ele está: ${STATUS_LABELS[to]}.` };
    const updated = await this.core.apply({ ticketId: ticket.id, expectedVersion: ticket.version, patch, events: [statusEvent], messages: [], attachments: [], notifications: [notification], now });
    return this.view(updated);
  }

  /**
   * Mesma equipe = assumir: quem age passa a ser o atendente. Só vira evento público (e aviso ao aluno) quando
   * a situação muda (recebido/triagem/reaberto → encaminhado) ou há observação pública; trocar de atendente é
   * interno. Outra equipe = encaminhar: evento público e aviso, e o chamado fica sem atendente até alguém da
   * nova equipe assumir (quem encaminha não vira responsável).
   */
  async assign(actor: SupportActor, ticketId: string, body: SupportStaffAssignRequest): Promise<SupportStaffTicket> {
    const ticket = await this.active(ticketId);
    if (!isSupportTeam(body.team)) throw new ValidationError('Equipe desconhecida.', [{ field: 'team', message: 'fora da lista de equipes' }]);
    const now = this.core.now();
    const nextStatus = ticket.status === 'received' || ticket.status === 'triage' || ticket.status === 'reopened' ? 'assigned' : ticket.status;
    const note = body.publicNote?.trim();
    const forwarded = body.team !== ticket.assignedTeam;
    const statusChanges = nextStatus !== ticket.status;
    if (!forwarded && !statusChanges && !note && ticket.assignedAgentId === actor.userId) return this.view(ticket);
    const details = [{ label: 'Responsável', value: body.team }, ...(note ? [{ label: 'Observação', value: note }] : [])];
    const publicClaim = statusChanges || Boolean(note);
    const events: NewSupportEvent[] = forwarded
      ? [
          event({
            type: 'department_forwarded',
            title: `Encaminhado para ${body.team}`,
            description: 'A equipe responsável vai cuidar da sua solicitação.',
            actorType: 'department',
            actorUserId: actor.userId,
            actorName: body.team,
            fromStatus: ticket.status,
            toStatus: nextStatus,
            details,
          }),
        ]
      : publicClaim
        ? [
            event({
              type: 'ticket_assigned',
              title: body.team === TRIAGE_TEAM ? 'Atendimento assumido pelo ASA' : `Atendimento assumido por ${body.team}`,
              actorType: 'agent',
              actorUserId: actor.userId,
              actorName: body.team,
              fromStatus: ticket.status,
              toStatus: nextStatus,
              details,
            }),
          ]
        : [event({ type: 'ticket_assigned', visibility: 'internal', title: `Atendimento assumido por ${actor.displayName}`, actorType: 'agent', actorUserId: actor.userId, actorName: actor.displayName })];
    const notifications: NewSupportNotification[] = forwarded
      ? [{ kind: 'status_changed', title: 'Chamado encaminhado', body: `Sua solicitação está com: ${body.team}.` }]
      : statusChanges
        ? [{ kind: 'status_changed', title: 'Chamado com a equipe responsável', body: `Sua solicitação já está com: ${body.team}.` }]
        : [];
    const updated = await this.core.apply({
      ticketId: ticket.id,
      expectedVersion: ticket.version,
      patch: { assignedTeam: body.team, assignedAgentId: forwarded ? null : actor.userId, status: nextStatus },
      events,
      messages: [],
      attachments: [],
      notifications,
      now,
    });
    return this.view(updated);
  }

  async message(actor: SupportActor, ticketId: string, body: SupportStaffMessageRequest): Promise<SupportStaffTicket> {
    const ticket = await this.active(ticketId);
    const attached = (await this.repos.support.listAttachments(ticket.id)).length;
    const uploads = await this.core.checkPendingUploads(body.attachmentIds, actor.userId, attached);
    const now = this.core.now();
    const messageId = randomUUID();
    const team = ticket.assignedTeam;
    const content = body.content.trim();
    const events: NewSupportEvent[] = [
      event({ type: 'message_received', title: `Nova mensagem de ${team}`, actorType: 'agent', actorUserId: actor.userId, actorName: team }),
      ...uploads.map((upload) => event({ type: 'file_uploaded', title: 'Arquivo disponibilizado pelo ASA', description: upload.fileName, actorType: 'agent', actorUserId: actor.userId, actorName: team })),
    ];
    const notifications: NewSupportNotification[] = [];
    let patch: SupportTicketPatch = {};
    if (body.requestAction) {
      const action = body.requestAction;
      patch = {
        status: 'waiting_student',
        pendingAction: { title: action.title.trim(), description: action.description.trim(), requestedAt: now, expectsAttachment: Boolean(action.expectsAttachment) },
        sla: pauseSla(ticket.sla, now),
      };
      events.push(
        event({
          type: 'student_action_required',
          title: 'Precisamos de uma informação sua',
          description: action.description.trim(),
          actorType: 'agent',
          actorUserId: actor.userId,
          actorName: team,
          fromStatus: ticket.status,
          toStatus: 'waiting_student',
          details: [{ label: 'O que enviar', value: action.title.trim() }],
        }),
      );
      notifications.push({ kind: 'action_required', title: 'O ASA precisa de você', body: action.title.trim() });
    } else {
      notifications.push({ kind: 'new_message', title: `Nova mensagem de ${team}`, body: content.length > 120 ? `${content.slice(0, 117)}...` : content });
    }
    if (uploads.length > 0) notifications.push({ kind: 'file_available', title: 'Novo arquivo no seu chamado', body: uploads.map((upload) => upload.fileName).join(', ') });
    const updated = await this.core.apply({
      ticketId: ticket.id,
      expectedVersion: ticket.version,
      patch,
      events,
      messages: [{ id: messageId, senderType: 'agent', senderUserId: actor.userId, senderName: team, content, clientMessageId: null }],
      attachments: uploads.length > 0 ? [{ ids: uploads.map((upload) => upload.id), ownerUserId: actor.userId, messageId }] : [],
      notifications,
      now,
    });
    return this.view(updated);
  }

  async note(actor: SupportActor, ticketId: string, body: SupportStaffNoteRequest): Promise<SupportStaffTicket> {
    const ticket = await this.core.findTicketOrThrow(ticketId);
    const updated = await this.core.apply({
      ticketId: ticket.id,
      expectedVersion: ticket.version,
      patch: {},
      events: [event({ type: 'internal_note', visibility: 'internal', title: 'Nota interna', description: body.content.trim(), actorType: 'agent', actorUserId: actor.userId, actorName: actor.displayName })],
      messages: [],
      attachments: [],
      notifications: [],
    });
    return this.view(updated);
  }

  async priority(actor: SupportActor, ticketId: string, body: SupportStaffPriorityRequest): Promise<SupportStaffTicket> {
    const ticket = await this.active(ticketId);
    if (ticket.priority === body.priority) return this.view(ticket);
    const updated = await this.core.apply({
      ticketId: ticket.id,
      expectedVersion: ticket.version,
      patch: { priority: body.priority },
      events: [
        event({
          type: 'priority_changed',
          visibility: 'internal',
          title: 'Prioridade alterada',
          actorType: 'agent',
          actorUserId: actor.userId,
          actorName: actor.displayName,
          details: [
            { label: 'Antes', value: PRIORITY_LABELS[ticket.priority] },
            { label: 'Agora', value: PRIORITY_LABELS[body.priority] },
          ],
        }),
      ],
      messages: [],
      attachments: [],
      notifications: [],
    });
    return this.view(updated);
  }

  async resolve(actor: SupportActor, ticketId: string, body: SupportStaffResolveRequest): Promise<SupportStaffTicket> {
    const ticket = await this.active(ticketId);
    const now = this.core.now();
    const resolution = body.resolution.trim();
    const updated = await this.core.apply({
      ticketId: ticket.id,
      expectedVersion: ticket.version,
      patch: { status: 'resolved', resolution, resolvedAt: now, pendingAction: null, sla: completeSla(ticket.sla, now) },
      events: [
        event({
          type: 'ticket_resolved',
          title: 'Solicitação resolvida',
          description: resolution,
          actorType: 'agent',
          actorUserId: actor.userId,
          actorName: ticket.assignedTeam,
          fromStatus: ticket.status,
          toStatus: 'resolved',
        }),
      ],
      messages: [],
      attachments: [],
      notifications: [{ kind: 'ticket_resolved', title: 'Seu chamado foi resolvido', body: 'Veja a solução e conte como foi o atendimento.' }],
      now,
    });
    return this.view(updated);
  }

  /** Link assinado (5 min) de um anexo do chamado para a equipe. */
  async attachmentLink(ticketId: string, attachmentId: string): Promise<SupportAttachmentLinkDto> {
    const ticket = await this.core.findTicketOrThrow(ticketId);
    const attachment = await this.repos.support.findAttachment(attachmentId);
    if (!attachment || attachment.ticketId !== ticket.id) throw new NotFoundError('Arquivo não encontrado.');
    return this.core.link(attachment.id);
  }

  upload(actor: SupportActor, body: SupportUploadRequest): Promise<SupportUpload> {
    return this.core.upload({ userId: actor.userId, displayName: STAFF_UPLOADER_NAME }, 'agent', body);
  }

  deleteUpload(userId: string, uploadId: string): Promise<void> {
    return this.core.deleteUpload(userId, uploadId);
  }
}
