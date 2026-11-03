import { randomInt } from 'node:crypto';
import { FixedWindowLimiter } from '../../auth/rateLimiter.js';
import type { SupportContactLinkView, SupportContactVerificationView, SupportWhatsAppLinkState } from '../../contracts/mobileApi.v1.js';
import { ConflictError, NotFoundError, RateLimitedError, ValidationError } from '../../errors/AppError.js';
import type { Logger } from '../../config/logger.js';
import type { AuditActor, AuditService } from '../../platform/auditService.js';
import type { Repositories } from '../../repositories/types.js';
import { event, type SupportCore } from '../supportService.js';
import type { ContactRef } from './contactRef.js';
import type { ContactVault } from './contactVault.js';
import type { ChannelRecord, ContactLinkRecord, VerificationRecord, WhatsAppRepository } from './repository.js';

/** Sem 0, O, 1, I: o código é digitado ou lido por pessoas. 8 caracteres ≈ 40 bits, por 10 minutos, uso único. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
export const CODE_PREFIX = 'ASA-';
const CODE_PATTERN = new RegExp(`^\\s*${CODE_PREFIX}([${CODE_ALPHABET}]{${CODE_LENGTH}})\\s*$`, 'i');
export const VERIFICATION_TTL_MS = 10 * 60_000;
/** Depois de provar o número, o estudante tem este tempo para confirmar no app. */
const CONFIRMATION_TTL_MS = 15 * 60_000;
/** Depois de uma revisão humana, o estudante pode não estar com o app aberto: prazo maior para confirmar. */
const REVIEW_CONFIRMATION_TTL_MS = 3 * 24 * 3_600_000;
const LINK_TICKET_ATTEMPTS = 3;
const HOUR_MS = 3_600_000;
const MAX_VERIFICATIONS_PER_HOUR = 5;
const MAX_CODE_ATTEMPTS_PER_CONTACT = 10;

export const CONSENT_VERSION = '2026-11-v1';
export const CONSENT_TEXT =
  'Ao vincular, você autoriza o ASA a associar seu WhatsApp à sua conta para atender você por esse canal e mostrar o andamento dos atendimentos no app. ' +
  'As conversas ficam no histórico do atendimento e são vistas pela equipe do ASA. Você pode desfazer o vínculo a qualquer momento nesta tela.';

function generateCode(): string {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/**
 * Vínculo verificado estudante ↔ WhatsApp. A prova é o caminho inverso do OTP tradicional: o estudante, autenticado no
 * app, recebe um código e o envia DO próprio WhatsApp para o número institucional. Assim:
 * - nenhum número é digitado: não há como testar se o número de outra pessoa tem cadastro (anti-enumeração);
 * - nenhuma mensagem sai sem pedido (o ASA não inicia conversa para provar nada);
 * - funciona mesmo quando o WhatsApp só informa um identificador opaco (LID).
 * Conflito (contato já vinculado a outra conta) vira revisão humana, com a mesma resposta genérica.
 */
export class LinkService {
  private readonly attempts: FixedWindowLimiter;

  constructor(
    private readonly deps: {
      repo: WhatsAppRepository;
      repos: Repositories;
      core: SupportCore;
      vault: ContactVault;
      audit: AuditService;
      logger: Logger;
      demoMode: boolean;
      rateLimitEnabled: boolean;
      /** só canais do provedor ativo recebem o código */
      providerName: string;
      /** confere no provedor antes de prometer que o código vai chegar (com cache curto) */
      refreshChannel: (channel: ChannelRecord) => Promise<ChannelRecord>;
      now: () => Date;
    },
  ) {
    this.attempts = new FixedWindowLimiter({ windowMs: HOUR_MS, max: MAX_CODE_ATTEMPTS_PER_CONTACT }, () => deps.now().getTime());
  }

  /** Canal que pode receber o código agora. Desconectado, o código nunca chegaria: melhor dizer que não dá. */
  private async channel(): Promise<ChannelRecord | null> {
    const channels = await this.deps.repo.listChannels();
    const candidate = channels.find((channel) => channel.provider === this.deps.providerName && channel.state === 'enabled');
    if (!candidate) return null;
    const current = await this.deps.refreshChannel(candidate);
    return current.connection.status === 'CONNECTED' || current.connection.status === 'DEGRADED' ? current : null;
  }

  private view(record: VerificationRecord, channel: ChannelRecord | null, previousTicketsCount: number, code: string | null): SupportContactVerificationView {
    const number = channel?.publicNumber ?? null;
    const showContact = record.status === 'proven';
    return {
      id: record.id,
      status: record.status,
      code,
      expiresAt: record.expiresAt.toISOString(),
      // em revisão, nada sobre o contato: o estudante não descobre se o número tem outro dono
      contactMasked: showContact ? record.contactMasked : null,
      institutionalNumber: number,
      openUrl: number && code && !this.deps.demoMode ? `https://wa.me/${number.slice(1)}?text=${encodeURIComponent(code)}` : null,
      previousTicketsCount: showContact ? previousTicketsCount : 0,
    };
  }

  private linkView(link: ContactLinkRecord): SupportContactLinkView {
    return { id: link.id, contactMasked: link.contactMasked, verifiedAt: link.verifiedAt.toISOString() };
  }

  async state(studentId: string): Promise<SupportWhatsAppLinkState> {
    const { repo, now, demoMode } = this.deps;
    const [channel, links, pending] = await Promise.all([this.channel(), repo.listActiveLinks(studentId), repo.latestOpenVerification(studentId, now())]);
    const previous = pending?.contactFingerprint ? await repo.countUnidentifiedTickets(pending.contactFingerprint) : 0;
    return {
      available: Boolean(channel),
      demoMode,
      consentVersion: CONSENT_VERSION,
      consentText: CONSENT_TEXT,
      links: links.map((link) => this.linkView(link)),
      pending: pending ? this.view(pending, channel, previous, null) : null,
    };
  }

  async request(studentId: string, input: { consentAccepted: boolean; consentVersion: string; source: 'app' | 'web' }, actor: AuditActor): Promise<SupportContactVerificationView> {
    const { repo, vault, audit, now, rateLimitEnabled } = this.deps;
    if (!input.consentAccepted) throw new ValidationError('É preciso aceitar o aviso para vincular o WhatsApp.', [{ field: 'consentAccepted', message: 'obrigatório' }], { reason: 'consent_required' });
    if (input.consentVersion !== CONSENT_VERSION) throw new ConflictError('O aviso de privacidade mudou. Leia a versão atual e tente de novo.', 'consent_version_outdated');
    const channel = await this.channel();
    if (!channel) throw new ConflictError('O canal WhatsApp não está disponível no momento.', 'provider_unavailable');
    const at = now();
    if (rateLimitEnabled && (await repo.countRecentVerifications(studentId, new Date(at.getTime() - HOUR_MS))) >= MAX_VERIFICATIONS_PER_HOUR) throw new RateLimitedError(3600);
    const code = generateCode();
    const fullCode = `${CODE_PREFIX}${code}`;
    const record = await repo.createVerification({
      studentId,
      channelId: channel.id,
      codeHash: vault.codeHash(code),
      consentVersion: input.consentVersion,
      consentSource: input.source,
      expiresAt: new Date(at.getTime() + VERIFICATION_TTL_MS),
      now: at,
    });
    await audit.record(actor, { action: 'whatsapp.link_requested', resourceType: 'contact_verification', resourceId: record.id });
    return this.view(record, channel, 0, fullCode);
  }

  /**
   * Chamado para cada mensagem recebida. Devolve true só quando a mensagem era um código válido (não vira chamado).
   * Qualquer outra coisa segue como mensagem normal: sem resposta que indique se um código existe.
   */
  async tryProve(text: string, contact: ContactRef, fingerprint: string): Promise<boolean> {
    const { repo, repos, vault, audit, now, rateLimitEnabled } = this.deps;
    const match = CODE_PATTERN.exec(text);
    if (!match) return false;
    if (rateLimitEnabled && !this.attempts.hit(fingerprint).allowed) return false;
    const at = now();
    const record = await repo.proveVerification({ codeHash: vault.codeHash(match[1]!.toUpperCase()), fingerprint, encrypted: vault.encrypt(contact.value), masked: contact.masked, provenUntil: new Date(at.getTime() + CONFIRMATION_TTL_MS), now: at });
    if (!record) return false;
    // evento refeito: o código já foi tratado; a mensagem continua não sendo conversa
    if (record.status === 'confirmed' || record.status === 'review_required') return true;
    const existing = await repo.findActiveLink(fingerprint);
    if (existing && existing.studentId === record.studentId) {
      // o mesmo estudante repetiu a vinculação: nada a fazer
      await repo.setVerificationStatus(record.id, 'confirmed', at);
      return true;
    }
    if (existing) {
      await repo.setVerificationStatus(record.id, 'review_required', at);
      const student = await repos.students.findById(record.studentId);
      await audit.record({ userId: student?.userId ?? null, role: 'student', channel: 'system' }, { action: 'whatsapp.link_conflict', outcome: 'denied', resourceType: 'contact_verification', resourceId: record.id });
    }
    return true;
  }

  async get(studentId: string, id: string): Promise<SupportContactVerificationView> {
    const { repo, now } = this.deps;
    const record = await repo.findVerification(id, studentId);
    if (!record) throw new NotFoundError('Pedido de vinculação não encontrado.');
    const expired = (record.status === 'pending' || record.status === 'proven') && record.expiresAt <= now();
    const effective = expired ? { ...record, status: 'expired' as const } : record;
    const previous = effective.status === 'proven' && effective.contactFingerprint ? await repo.countUnidentifiedTickets(effective.contactFingerprint) : 0;
    return this.view(effective, await this.channel(), previous, null);
  }

  /** O estudante reconhece o número mascarado e, se quiser, autoriza trazer os chamados anteriores desse contato. */
  async confirm(studentId: string, id: string, input: { linkPreviousTickets: boolean }, actor: AuditActor): Promise<SupportWhatsAppLinkState> {
    const { repo, repos, audit, logger, now } = this.deps;
    const record = await repo.findVerification(id, studentId);
    if (!record) throw new NotFoundError('Pedido de vinculação não encontrado.');
    // confirmar de novo o que já foi confirmado (toque duplo, resposta perdida) não é erro
    if (record.status === 'confirmed') return this.state(studentId);
    const at = now();
    const usable = record.status === 'proven' && record.expiresAt > at;
    if (!usable || !record.contactFingerprint || !record.contactEncrypted || !record.contactMasked) throw new ConflictError('Este pedido não está mais disponível. Comece de novo.', 'verification_not_ready');
    const fingerprint = record.contactFingerprint;
    const link = await repo.createLink({ studentId, fingerprint, encrypted: record.contactEncrypted, masked: record.contactMasked, verificationId: record.id, consentVersion: record.consentVersion, consentSource: record.consentSource, now: at });
    if (link === 'conflict') {
      // corrida com outra conta: mesma resposta genérica e revisão humana
      await repo.setVerificationStatus(record.id, 'review_required', at);
      await audit.record(actor, { action: 'whatsapp.link_conflict', outcome: 'denied', resourceType: 'contact_verification', resourceId: record.id });
      return this.state(studentId);
    }
    if (link === 'not_ready') {
      // outra confirmação simultânea venceu; se o vínculo é deste estudante, deu certo
      const active = await repo.findActiveLink(fingerprint);
      if (active?.studentId === studentId) return this.state(studentId);
      throw new ConflictError('Este pedido não está mais disponível. Comece de novo.', 'verification_not_ready');
    }
    await audit.record(actor, { action: 'whatsapp.link_confirmed', resourceType: 'contact_link', resourceId: link.id, metadata: { linkPreviousTickets: input.linkPreviousTickets } });
    if (input.linkPreviousTickets) {
      const student = await repos.students.findById(studentId);
      const user = student ? await repos.users.findById(student.userId) : null;
      for (const ticketId of await repo.listUnidentifiedTicketIds(fingerprint)) {
        // o vínculo já existe: um chamado que não pôde ser trazido agora não desfaz a confirmação
        try {
          await this.linkTicket(ticketId, studentId, user?.fullName ?? 'Estudante', at, actor);
        } catch (error) {
          logger.error({ ticket_id: ticketId, error_type: error instanceof Error ? error.name : typeof error }, 'whatsapp previous ticket not linked');
          await audit.record(actor, { action: 'whatsapp.ticket_link_failed', outcome: 'failure', resourceType: 'ticket', resourceId: ticketId });
        }
      }
    }
    return this.state(studentId);
  }

  private async linkTicket(ticketId: string, studentId: string, name: string, at: Date, actor: AuditActor): Promise<void> {
    const { repos, core, audit } = this.deps;
    for (let attempt = 1; ; attempt += 1) {
      const ticket = await repos.support.findTicket(ticketId);
      if (!ticket || ticket.studentId) return;
      try {
        await core.apply({
          ticketId,
          expectedVersion: ticket.version,
          patch: { studentId },
          events: [event({ type: 'status_changed', title: 'Atendimento do WhatsApp vinculado à sua conta', description: 'Você autorizou acompanhar este atendimento pelo app.', actorType: 'student', actorName: name })],
          messages: [],
          attachments: [],
          notifications: [],
          extraLog: [{ type: 'support.ticket.linked', audience: 'STUDENT_VISIBLE', actorType: 'student', actorUserId: actor.userId, data: { title: 'Atendimento vinculado à conta' } }],
          now: at,
        });
        await audit.record(actor, { action: 'whatsapp.ticket_linked', resourceType: 'ticket', resourceId: ticketId });
        return;
      } catch (error) {
        // uma mensagem chegou no mesmo instante: relê e tenta de novo
        if (!(error instanceof ConflictError && error.reason === 'ticket_changed') || attempt >= LINK_TICKET_ATTEMPTS) throw error;
      }
    }
  }

  async revoke(studentId: string, linkId: string, actor: AuditActor): Promise<SupportWhatsAppLinkState> {
    const { repo, audit, now } = this.deps;
    const revoked = await repo.revokeLink(linkId, studentId, now());
    if (!revoked) throw new NotFoundError('Vínculo não encontrado.');
    await audit.record(actor, { action: 'whatsapp.link_revoked', resourceType: 'contact_link', resourceId: linkId });
    return this.state(studentId);
  }

  // ---- revisão humana de conflitos (administração: sem dados do outro estudante)
  async listReviews() {
    const items = await this.deps.repo.listReviews(50);
    return { items: items.map((item) => ({ id: item.id, contactMasked: item.contactMasked ?? 'Contato não informado', createdAt: item.createdAt.toISOString() })) };
  }

  async decideReview(id: string, input: { decision: 'transfer_link' | 'reject'; reason: string }, actor: AuditActor): Promise<void> {
    const { repo, audit, now } = this.deps;
    const review = await repo.findReview(id);
    if (!review) throw new NotFoundError('Revisão não encontrada.');
    const at = now();
    if (input.decision === 'reject') {
      await repo.setVerificationStatus(review.id, 'cancelled', at);
    } else {
      // o estudante ainda precisa reconhecer o número e confirmar no próprio app, com prazo novo
      const moved = await repo.transferReview(review.id, new Date(at.getTime() + REVIEW_CONFIRMATION_TTL_MS), at);
      if (!moved) throw new NotFoundError('Revisão não encontrada.');
    }
    await audit.record(actor, { action: 'whatsapp.link_review_decided', resourceType: 'contact_verification', resourceId: review.id, metadata: { decision: input.decision, justificativa: input.reason } });
  }
}
