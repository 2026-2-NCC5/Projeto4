import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Mail, ScrollText } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { KeyValueList, List, ListItem, PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { AccessDenied, LoadingRows } from '@/components/feedback/States';
import { useSession } from '@/features/auth/session';
import { PriorityBadge, SlaIndicator, StatusBadge } from '@/features/support/labels';
import { operationsApi, staffKeys } from '@/features/support/staff/api';
import { LoadError, MinimizationNote } from '@/features/support/staff/components';
import { formatDateTime, formatRelative } from '@/lib/format';

/**
 * Contexto de atendimento de um aluno. Cada consulta é auditada no servidor, então a tela não se atualiza
 * sozinha (nada de nova leitura ao voltar para a aba): só quando a pessoa abre ou pede.
 */
export default function StudentContextPage() {
  const { id = '' } = useParams();
  const { can } = useSession();
  const allowed = can('students:read:support_context');
  const canOpenTickets = can('tickets:read:any');
  const query = useQuery({
    queryKey: staffKeys.student(id),
    queryFn: () => operationsApi.student(id),
    enabled: allowed && Boolean(id),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (!allowed) return <AccessDenied />;

  const back = (
    <Link to="/asa/alunos" className="inline-flex items-center gap-1 text-small text-slate hover:text-ink">
      <ChevronLeft size={16} aria-hidden /> Alunos atendidos
    </Link>
  );

  if (query.isPending) {
    return (
      <>
        <div className="mb-4">{back}</div>
        <LoadingRows rows={5} />
      </>
    );
  }
  if (query.data === undefined) {
    return (
      <>
        <div className="mb-4">{back}</div>
        <LoadError
          error={query.error}
          onRetry={() => void query.refetch()}
          notFoundTitle="Aluno sem atendimentos registrados"
          notFoundDescription="A equipe só consulta alunos que já interagiram com o ASA."
          backTo="/asa/alunos"
          backLabel="Voltar para a lista"
        />
      </>
    );
  }

  const { student, tickets, accessLogged } = query.data;
  return (
    <>
      <PageHeader eyebrow={back} title={student.fullName} description={<span className="font-mono">RA {student.registrationNumber}</span>} />
      {accessLogged ? (
        <p role="note" className="mb-4 flex items-start gap-2 rounded-md border border-line bg-white px-4 py-3 text-small text-slate">
          <ScrollText size={20} aria-hidden className="mt-px shrink-0" />
          <span>Consulta registrada na auditoria (finalidade: atendimento).</span>
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Surface aria-labelledby="contato">
            <SectionHeader id="contato" title="Contato" />
            <KeyValueList
              items={[
                {
                  label: 'E-mail institucional',
                  value: (
                    <a href={`mailto:${student.email}`} className="inline-flex items-center gap-1.5 text-action hover:underline break-all">
                      <Mail size={16} aria-hidden className="shrink-0" />
                      {student.email}
                    </a>
                  ),
                },
                { label: 'Curso', value: student.program ?? '—' },
                { label: 'Chamados', value: `${student.ticketsOpen} em aberto · ${student.ticketsTotal} no total` },
                { label: 'Última interação com o ASA', value: student.lastInteractionAt ? <time dateTime={student.lastInteractionAt} title={formatRelative(student.lastInteractionAt)}>{formatDateTime(student.lastInteractionAt)}</time> : '—' },
              ]}
            />
          </Surface>
          <MinimizationNote />
        </div>
        <Surface aria-labelledby="historico-chamados">
          <SectionHeader
            id="historico-chamados"
            title="Chamados com o ASA"
            description={tickets.length < student.ticketsTotal ? `Os ${tickets.length} atualizados mais recentemente, de ${student.ticketsTotal} no total.` : 'Do atualizado mais recentemente para o mais antigo.'}
          />
          {tickets.length === 0 ? (
            <p className="text-small text-slate">Nenhum chamado registrado.</p>
          ) : (
            <List label="Chamados do aluno">
              {tickets.map((ticket) => (
                <ListItem
                  key={ticket.id}
                  to={canOpenTickets ? `/asa/chamados/${encodeURIComponent(ticket.id)}` : undefined}
                  title={ticket.subject}
                  description={ticket.subcategoryLabel ? `${ticket.categoryLabel} · ${ticket.subcategoryLabel}` : ticket.categoryLabel}
                  meta={
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono">{ticket.protocol}</span>
                      <span>aberto em {formatDateTime(ticket.createdAt)}</span>
                      <SlaIndicator sla={ticket.sla} audience="staff" showDue={false} />
                      {ticket.priority !== 'normal' ? <PriorityBadge priority={ticket.priority} /> : null}
                    </span>
                  }
                  trailing={<StatusBadge status={ticket.status} audience="staff" />}
                />
              ))}
            </List>
          )}
        </Surface>
      </div>
    </>
  );
}
