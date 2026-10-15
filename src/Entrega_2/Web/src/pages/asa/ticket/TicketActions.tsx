import { CheckCircle2, Lock, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { SectionHeader, Surface } from '@/components/ui/Display';
import { Select, TextArea } from '@/components/ui/Form';
import { PRIORITY_META, STATUS_META } from '@/features/support/labels';
import type { TicketAction } from '@/features/support/staff/hooks';
import type { SupportStaffTicket, SupportTicketPriority, SupportTicketStatus } from '@/types/api';

/**
 * Situações que a equipe define diretamente (espelha STAFF_SETTABLE_STATUSES do servidor).
 * "Aguardando aluno" só com um pedido de ação na resposta; "Resolvido" só com a solução.
 */
export const STAFF_SETTABLE_STATUSES: readonly SupportTicketStatus[] = ['triage', 'assigned', 'in_analysis', 'in_progress', 'waiting_department', 'waiting_external', 'closed', 'cancelled'];
const NEEDS_CONFIRMATION: readonly SupportTicketStatus[] = ['closed', 'cancelled'];
/** situações em que assumir também muda a situação para "Encaminhado" (e o aluno é avisado) */
const CLAIM_MOVES_TO_ASSIGNED: readonly SupportTicketStatus[] = ['received', 'triage', 'reopened'];
export const RESOLUTION_MIN = 10;
const NOTE_MAX = 500;

type Mutate = (action: TicketAction, callbacks?: { onSuccess?: () => void; onSettled?: () => void }) => void;

export function TicketActions({
  ticket,
  teams,
  resolutionMax,
  meId,
  busy,
  pendingKind,
  mutate,
}: {
  ticket: SupportStaffTicket;
  teams: string[];
  /** limite do texto da solução (catálogo); sem ele, "Resolver" fica indisponível */
  resolutionMax: number | undefined;
  meId: string;
  busy: boolean;
  pendingKind: TicketAction['kind'] | null;
  mutate: Mutate;
}) {
  const [status, setStatus] = useState<SupportTicketStatus | ''>('');
  const [statusNote, setStatusNote] = useState('');
  const [team, setTeam] = useState('');
  const [teamNote, setTeamNote] = useState('');
  const [priority, setPriority] = useState<SupportTicketPriority | ''>('');
  const [confirming, setConfirming] = useState<SupportTicketStatus | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveKey, setResolveKey] = useState(0);
  const [claiming, setClaiming] = useState(false);

  const finished = ticket.status === 'closed' || ticket.status === 'cancelled';
  const resolved = ticket.status === 'resolved';
  const mine = ticket.assignedAgent?.id === meId;
  const statusOptions = STAFF_SETTABLE_STATUSES.filter((value) => value !== ticket.status).map((value) => ({ value, label: STATUS_META[value].short }));
  const shownPriority = priority || ticket.priority;

  const applyStatus = (next: SupportTicketStatus) => {
    const note = statusNote.trim();
    mutate(
      { kind: 'status', status: next, ...(note ? { publicNote: note } : {}) },
      {
        onSuccess: () => {
          setStatus('');
          setStatusNote('');
        },
        onSettled: () => setConfirming(null),
      },
    );
  };

  const submitStatus = (event: FormEvent) => {
    event.preventDefault();
    if (!status) return;
    if (NEEDS_CONFIRMATION.includes(status)) setConfirming(status);
    else applyStatus(status);
  };

  const submitTeam = (event: FormEvent) => {
    event.preventDefault();
    if (!team) return;
    const note = teamNote.trim();
    mutate(
      { kind: 'assign', team, intent: 'forward', ...(note ? { publicNote: note } : {}) },
      {
        onSuccess: () => {
          setTeam('');
          setTeamNote('');
        },
      },
    );
  };

  const submitPriority = (event: FormEvent) => {
    event.preventDefault();
    if (!priority || priority === ticket.priority) return;
    mutate({ kind: 'priority', priority }, { onSuccess: () => setPriority('') });
  };

  if (finished) {
    return (
      <Surface aria-labelledby="acoes">
        <SectionHeader id="acoes" title="Ações" />
        <p className="flex items-start gap-2 text-small text-slate">
          <Lock size={16} aria-hidden className="mt-0.5 shrink-0" />
          Chamado {ticket.status === 'closed' ? 'encerrado' : 'cancelado'}: somente consulta. O histórico continua disponível.
        </p>
      </Surface>
    );
  }

  const closeDialog = (
    <ConfirmDialog
      open={confirming !== null}
      title={confirming === 'cancelled' ? 'Cancelar este chamado?' : 'Encerrar este chamado?'}
      description={
        <>
          {confirming === 'cancelled'
            ? 'O chamado será cancelado e o prazo concluído. O aluno é avisado e não poderá mais enviar mensagens.'
            : 'O atendimento será finalizado. O aluno é avisado e o histórico continua disponível.'}
          {statusNote.trim() ? <span className="mt-2 block">Observação para o aluno: “{statusNote.trim()}”</span> : null}
        </>
      }
      confirmLabel={confirming === 'cancelled' ? 'Cancelar chamado' : 'Encerrar chamado'}
      tone={confirming === 'cancelled' ? 'danger' : 'primary'}
      loading={pendingKind === 'status'}
      onConfirm={() => confirming && applyStatus(confirming)}
      onClose={() => setConfirming(null)}
    />
  );

  if (resolved) {
    return (
      <Surface aria-labelledby="acoes">
        <SectionHeader id="acoes" title="Ações" />
        <p className="mb-3 text-small text-slate">Chamado resolvido. A única ação possível é encerrar; até lá, o aluno ainda pode reabrir dentro do prazo.</p>
        <TextArea label="Observação para o aluno (opcional)" value={statusNote} maxLength={NOTE_MAX} rows={2} hint="Aparece no histórico que o aluno vê." onChange={(event) => setStatusNote(event.target.value)} />
        <Button className="mt-3" icon={Lock} disabled={busy} onClick={() => setConfirming('closed')}>
          Encerrar chamado
        </Button>
        {closeDialog}
      </Surface>
    );
  }

  return (
    <Surface aria-labelledby="acoes">
      <SectionHeader id="acoes" title="Ações" />
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          {mine ? (
            <p className="text-small text-slate">Você é o atendente deste chamado.</p>
          ) : (
            <>
              <Button
                icon={UserPlus}
                disabled={busy}
                loading={claiming && pendingKind === 'assign'}
                onClick={() => {
                  setClaiming(true);
                  mutate({ kind: 'assign', team: ticket.assignedTeam, intent: 'claim' }, { onSettled: () => setClaiming(false) });
                }}
              >
                Assumir atendimento
              </Button>
              <p className="text-caption text-mist">
                {ticket.assignedAgent ? `Hoje com ${ticket.assignedAgent.fullName}.` : 'Ninguém assumiu ainda.'} Você passa a ser o atendente e a equipe continua {ticket.assignedTeam}.{' '}
                {CLAIM_MOVES_TO_ASSIGNED.includes(ticket.status)
                  ? 'A situação passa para “Encaminhado” e o aluno é avisado de que a equipe está com o chamado.'
                  : 'Fica só no histórico interno: o aluno não é avisado.'}
              </p>
            </>
          )}
          <Button icon={CheckCircle2} disabled={busy || resolutionMax === undefined} onClick={() => setResolving(true)}>
            Resolver
          </Button>
        </div>

        <form onSubmit={submitStatus} className="flex flex-col gap-3 border-t border-line-soft pt-4" aria-labelledby="form-situacao">
          <h3 id="form-situacao" className="text-h4 font-semibold text-ink">
            Mudar situação
          </h3>
          <Select
            label="Nova situação"
            value={status}
            placeholder="Selecione"
            options={statusOptions}
            hint="“Aguardando aluno” é definido ao pedir uma ação na resposta; “Resolvido”, pelo botão Resolver."
            onChange={(event) => setStatus(event.target.value as SupportTicketStatus | '')}
          />
          {status ? (
            <TextArea label="Observação para o aluno (opcional)" value={statusNote} maxLength={NOTE_MAX} rows={2} hint="Aparece no histórico que o aluno vê." onChange={(event) => setStatusNote(event.target.value)} />
          ) : null}
          <Button type="submit" size="sm" className="self-start" disabled={!status || busy} loading={pendingKind === 'status' && confirming === null}>
            Atualizar situação
          </Button>
        </form>

        <form onSubmit={submitTeam} className="flex flex-col gap-3 border-t border-line-soft pt-4" aria-labelledby="form-encaminhar">
          <h3 id="form-encaminhar" className="text-h4 font-semibold text-ink">
            Encaminhar
          </h3>
          <Select
            label="Equipe"
            value={team}
            placeholder="Selecione a equipe"
            options={teams.filter((item) => item !== ticket.assignedTeam).map((item) => ({ value: item, label: item }))}
            hint={`Hoje: ${ticket.assignedTeam}. O chamado vai para a equipe escolhida sem atendente (alguém dela assume) e o aluno é avisado do encaminhamento.`}
            onChange={(event) => setTeam(event.target.value)}
          />
          {team ? <TextArea label="Observação para o aluno (opcional)" value={teamNote} maxLength={NOTE_MAX} rows={2} hint="Aparece no histórico que o aluno vê." onChange={(event) => setTeamNote(event.target.value)} /> : null}
          <Button type="submit" size="sm" className="self-start" disabled={!team || busy} loading={!claiming && pendingKind === 'assign'}>
            Encaminhar
          </Button>
        </form>

        <form onSubmit={submitPriority} className="flex flex-col gap-3 border-t border-line-soft pt-4" aria-labelledby="form-prioridade">
          <h3 id="form-prioridade" className="text-h4 font-semibold text-ink">
            Prioridade
          </h3>
          <Select
            label="Prioridade do chamado"
            hideLabel
            value={shownPriority}
            options={(Object.keys(PRIORITY_META) as SupportTicketPriority[]).map((value) => ({ value, label: PRIORITY_META[value].label }))}
            hint="Interna: o aluno não vê a prioridade."
            onChange={(event) => setPriority(event.target.value as SupportTicketPriority)}
          />
          <Button type="submit" size="sm" className="self-start" disabled={!priority || priority === ticket.priority || busy} loading={pendingKind === 'priority'}>
            Alterar prioridade
          </Button>
        </form>
      </div>

      {closeDialog}
      {resolutionMax !== undefined ? (
        <ConfirmDialog
          key={resolveKey}
          open={resolving}
          title="Resolver chamado"
          description="Descreva a solução. O aluno recebe o aviso, vê este texto no histórico e pode avaliar o atendimento."
          confirmLabel="Resolver chamado"
          reasonLabel="Solução para o aluno"
          requireReason={{ min: RESOLUTION_MIN, max: resolutionMax }}
          loading={pendingKind === 'resolve'}
          onConfirm={(resolution) =>
            mutate(
              { kind: 'resolve', resolution },
              {
                onSuccess: () => setResolveKey((value) => value + 1),
                onSettled: () => setResolving(false),
              },
            )
          }
          onClose={() => setResolving(false)}
        />
      ) : null}
    </Surface>
  );
}
