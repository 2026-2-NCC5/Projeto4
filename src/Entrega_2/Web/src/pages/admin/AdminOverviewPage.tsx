import { useQuery } from '@tanstack/react-query';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { AccessDenied, LoadingRows } from '@/components/feedback/States';
import { adminApi, adminKeys } from '@/features/admin/api';
import { AdminFailure, SourceLine, Stat, StatGrid, StateBadge } from '@/features/admin/components';
import { INTEGRATION_STATE_META, SERVICE_STATUS_META } from '@/features/admin/labels';
import { useSession } from '@/features/auth/session';
import { ACTIVE_STATUSES } from '@/features/support/labels';
import { Freshness } from '@/features/support/staff/components';
import { dayKey, formatNumber } from '@/lib/format';
import type { AdminOverview } from '@/types/api';

/** Lista de chamados em aberto (mesma definição da contagem: tudo que não foi resolvido, encerrado nem cancelado). */
export const ACTIVE_TICKETS_LINK = `/admin/chamados?status=${ACTIVE_STATUSES.join(',')}`;

/**
 * Links da segurança para a auditoria já filtrada. A auditoria filtra por dia (fuso da instituição): o link
 * começa no dia de 24 h antes da geração dos números, então cobre toda a janela das últimas 24 h.
 */
export function securityLinks(generatedAt: string) {
  const since = dayKey(new Date(Date.parse(generatedAt) - 86_400_000));
  return {
    failedLogins: `/admin/auditoria?action=auth.login_failed&from=${since}`,
    denied: `/admin/auditoria?outcome=denied&from=${since}`,
  };
}

const SERVICES: Array<{ key: keyof AdminOverview['services']; label: string }> = [
  { key: 'database', label: 'Banco de dados (PostgreSQL)' },
  { key: 'agentService', label: 'Agent Service' },
  { key: 'queue', label: 'Fila presencial do ASA' },
];

function Overview({ data }: { data: AdminOverview }) {
  const links = securityLinks(data.source.generatedAt);
  const { users, tickets, security } = data;
  return (
    <div className="flex flex-col gap-6">
      <Surface aria-labelledby="visao-contas">
        <SectionHeader
          id="visao-contas"
          title="Contas"
          description="Contas ativas por papel."
          action={
            <ButtonLink to="/admin/usuarios" variant="ghost" size="sm" aria-label="Gerenciar usuários">
              Gerenciar
            </ButtonLink>
          }
        />
        <StatGrid className="sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Alunos" value={formatNumber(users.students)} />
          <Stat label="Equipe ASA" value={formatNumber(users.staff)} />
          <Stat label="Administração" value={formatNumber(users.admins)} />
          <Stat label="Contas inativas" value={formatNumber(users.inactive)} hint="Desativadas: não conseguem entrar" />
          <Stat label="Sessões ativas" value={formatNumber(users.activeSessions)} hint="Aparelhos e navegadores com acesso válido" />
        </StatGrid>
      </Surface>

      <Surface aria-labelledby="visao-atendimento">
        <SectionHeader
          id="visao-atendimento"
          title="Atendimento"
          description="Só contagens e metadados."
          action={
            <ButtonLink to="/admin/chamados" variant="ghost" size="sm" aria-label="Ver chamados (metadados)">
              Ver chamados
            </ButtonLink>
          }
        />
        <StatGrid className="sm:grid-cols-3 lg:grid-cols-5">
          <Stat
            label="Chamados em aberto"
            value={formatNumber(tickets.open)}
            hint="Não resolvidos, encerrados nem cancelados"
            link={{ to: ACTIVE_TICKETS_LINK, label: 'Ver lista', ariaLabel: 'Ver a lista de chamados em aberto (metadados)' }}
          />
          <Stat label="Prazo excedido" value={formatNumber(tickets.slaOverdue)} hint="Prazo vencido sem conclusão" />
          <Stat label="Prazo próximo" value={formatNumber(tickets.slaNearDeadline)} hint="Últimos 25% do prazo ou menos de 8 h" />
          <Stat label="Sem atendente" value={formatNumber(tickets.unassigned)} hint="Em aberto e ainda não assumidos" />
          <Stat
            label="Agendamentos hoje"
            value={data.appointmentsToday === null ? '—' : formatNumber(data.appointmentsToday)}
            hint={data.appointmentsToday === null ? 'Indisponível: agendamentos desligados ou sem banco de dados neste ambiente' : 'Marcados para hoje, sem os cancelados'}
          />
        </StatGrid>
        <p className="mt-4 border-t border-line pt-3 text-caption text-slate">
          Assunto, mensagens, anexos e identificação dos alunos ficam visíveis apenas para a equipe ASA.
        </p>
      </Surface>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Surface aria-labelledby="visao-seguranca">
          <SectionHeader id="visao-seguranca" title="Segurança" description="Últimas 24 horas, pela trilha de auditoria." />
          <StatGrid className="sm:grid-cols-2">
            <Stat
              label="Entradas recusadas"
              value={formatNumber(security.failedLogins24h)}
              hint="Senha errada, conta desativada ou bloqueada por tentativas"
              link={{ to: links.failedLogins, label: 'Ver na auditoria', ariaLabel: 'Ver as entradas recusadas na auditoria' }}
            />
            <Stat
              label="Acessos negados"
              value={formatNumber(security.deniedAccess24h)}
              hint="Pedidos recusados pelo servidor por falta de permissão"
              link={{ to: links.denied, label: 'Ver na auditoria', ariaLabel: 'Ver os acessos negados na auditoria' }}
            />
          </StatGrid>
        </Surface>

        <Surface aria-labelledby="visao-servicos">
          <SectionHeader
            id="visao-servicos"
            title="Serviços"
            description="Consultados agora."
            action={
              <ButtonLink to="/admin/saude" variant="ghost" size="sm" aria-label="Ver saúde dos serviços">
                Ver saúde
              </ButtonLink>
            }
          />
          <ul className="divide-y divide-line-soft">
            {SERVICES.map((service) => (
              <li key={service.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                <span className="text-body text-ink">{service.label}</span>
                <StateBadge meta={SERVICE_STATUS_META[data.services[service.key]]} />
              </li>
            ))}
          </ul>
        </Surface>
      </div>

      <Surface aria-labelledby="visao-integracoes">
        <SectionHeader
          id="visao-integracoes"
          title="Integrações"
          description="Planejadas ainda não funcionam neste ambiente."
          action={
            <ButtonLink to="/admin/integracoes" variant="ghost" size="sm" aria-label="Ver detalhes das integrações">
              Ver detalhes
            </ButtonLink>
          }
        />
        {data.integrations.length === 0 ? <p className="text-small text-slate">O servidor não informou integrações.</p> : null}
        <ul className="divide-y divide-line-soft">
          {data.integrations.map((integration) => (
            <li key={integration.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
              <span className="min-w-0 text-body text-ink">{integration.name}</span>
              <StateBadge meta={INTEGRATION_STATE_META[integration.state] ?? INTEGRATION_STATE_META.not_configured} />
            </li>
          ))}
        </ul>
      </Surface>
    </div>
  );
}

/** Visão geral da Administração: contas, contagens de atendimento, segurança, serviços e integrações. */
export default function AdminOverviewPage() {
  const { can } = useSession();
  const allowed = can('health:read');
  const query = useQuery({ queryKey: adminKeys.overview, queryFn: adminApi.overview, refetchInterval: 60_000, enabled: allowed });

  if (!allowed) return <AccessDenied />;

  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Situação da plataforma agora. A administração vê contagens e metadados; o conteúdo dos atendimentos é da equipe ASA."
        actions={<Freshness updatedAt={query.dataUpdatedAt} fetching={query.isFetching} failed={query.isRefetchError} onRefresh={() => void query.refetch()} />}
      />
      {query.isPending ? (
        <LoadingRows rows={5} />
      ) : query.data === undefined ? (
        <AdminFailure error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar a visão geral" />
      ) : (
        <div className="flex flex-col gap-4">
          <SourceLine source={query.data.source} />
          <Overview data={query.data} />
        </div>
      )}
    </>
  );
}
