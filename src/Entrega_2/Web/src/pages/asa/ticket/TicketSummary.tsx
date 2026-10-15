import { Star, UserRound } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Badge, KeyValueList, SectionHeader, Surface } from '@/components/ui/Display';
import { PriorityBadge, SlaIndicator, StatusBadge } from '@/features/support/labels';
import { CHANNEL_LABELS } from '@/features/support/staff/components';
import { formatDateTime } from '@/lib/format';
import type { SupportFirstResponse, SupportStaffTicket } from '@/types/api';

const FIRST_RESPONSE_META: Record<SupportFirstResponse['status'], { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  pending: { label: 'Aguardando resposta', tone: 'neutral' },
  met: { label: 'Respondido no prazo', tone: 'success' },
  late: { label: 'Respondido fora do prazo', tone: 'warning' },
  overdue: { label: 'Prazo de resposta excedido', tone: 'danger' },
  not_applicable: { label: 'Não se aplica', tone: 'neutral' },
};

/** Meta de primeira resposta da equipe (horas corridas desde a abertura). */
function FirstResponseInfo({ firstResponse }: { firstResponse: SupportFirstResponse }) {
  const meta = FIRST_RESPONSE_META[firstResponse.status];
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge tone={meta.tone}>{meta.label}</Badge>
      <span className="text-small text-slate">
        {firstResponse.respondedAt ? `Respondido em ${formatDateTime(firstResponse.respondedAt)} · ` : ''}
        meta até {formatDateTime(firstResponse.dueAt)}
      </span>
    </span>
  );
}

/** Resumo do chamado (coluna esquerda do atendimento). */
export function TicketSummary({ ticket }: { ticket: SupportStaffTicket }) {
  const sla = ticket.sla;
  return (
    <Surface aria-labelledby="resumo">
      <SectionHeader id="resumo" title="Resumo" />
      <KeyValueList
        items={[
          { label: 'Protocolo', value: <span className="font-mono">{ticket.protocol}</span> },
          { label: 'Situação', value: <StatusBadge status={ticket.status} audience="staff" /> },
          {
            label: 'Prazo (SLA)',
            value: (
              <span className="flex flex-col items-start gap-1">
                <SlaIndicator sla={sla} audience="staff" showDue={false} />
                {sla.status === 'completed' ? (
                  <span className="text-small text-slate">Concluído em {formatDateTime(sla.completedAt)}</span>
                ) : sla.status === 'paused' ? (
                  <span className="text-small text-slate">
                    Pausado desde {formatDateTime(sla.pausedAt)}. Ao retomar, o vencimento é estendido pelo tempo em pausa.
                  </span>
                ) : (
                  <span className="text-small text-slate">
                    {sla.status === 'overdue' ? 'Venceu' : 'Vence'} em {formatDateTime(sla.dueAt)}
                  </span>
                )}
                <span className="text-caption text-mist">Meta: {sla.targetBusinessDays === 1 ? '1 dia útil' : `${sla.targetBusinessDays} dias úteis`}</span>
              </span>
            ),
          },
          ...(ticket.firstResponse ? [{ label: 'Primeira resposta', value: <FirstResponseInfo firstResponse={ticket.firstResponse} /> }] : []),
          { label: 'Prioridade', value: <PriorityBadge priority={ticket.priority} /> },
          { label: 'Categoria', value: ticket.subcategoryLabel ? `${ticket.categoryLabel} · ${ticket.subcategoryLabel}` : ticket.categoryLabel },
          { label: 'Equipe responsável', value: ticket.assignedTeam },
          { label: 'Atendente', value: ticket.assignedAgent ? ticket.assignedAgent.fullName : <span className="text-mist">Sem atendente</span> },
          { label: 'Canal de abertura', value: CHANNEL_LABELS[ticket.channel] },
          { label: 'Aberto em', value: formatDateTime(ticket.createdAt) },
          ...(ticket.reopenedCount > 0 ? [{ label: 'Reaberturas', value: String(ticket.reopenedCount) }] : []),
          ...(ticket.resolvedAt ? [{ label: 'Resolvido em', value: formatDateTime(ticket.resolvedAt) }] : []),
          ...(ticket.closedAt ? [{ label: 'Encerrado em', value: formatDateTime(ticket.closedAt) }] : []),
          ...(ticket.cancelledAt ? [{ label: 'Cancelado em', value: formatDateTime(ticket.cancelledAt) }] : []),
          ...(ticket.rating
            ? [
                {
                  label: 'Avaliação do aluno',
                  value: (
                    <span className="flex flex-col gap-0.5">
                      <span className="inline-flex items-center gap-1">
                        <Star size={16} aria-hidden className="text-slate" /> {ticket.rating.rating} de 5
                      </span>
                      {ticket.rating.comment ? <span className="text-small text-slate">“{ticket.rating.comment}”</span> : null}
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />
    </Surface>
  );
}

export function StudentCard({ ticket, canOpenContext }: { ticket: SupportStaffTicket; canOpenContext: boolean }) {
  return (
    <Surface aria-labelledby="aluno">
      <SectionHeader id="aluno" title="Aluno" />
      <div className="flex items-start gap-3">
        <UserRound size={20} aria-hidden className="mt-0.5 shrink-0 text-slate" />
        <div className="min-w-0">
          <p className="text-body font-medium text-ink break-words">{ticket.student.fullName}</p>
          <p className="font-mono text-caption text-mist">RA {ticket.student.registrationNumber}</p>
        </div>
      </div>
      {canOpenContext ? (
        <ButtonLink to={`/asa/alunos/${encodeURIComponent(ticket.student.id)}`} size="sm" className="mt-3">
          Ver histórico do aluno
        </ButtonLink>
      ) : null}
    </Surface>
  );
}
