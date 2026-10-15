import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { KeyValueList, PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { AccessDenied, LoadingRows } from '@/components/feedback/States';
import { adminApi, adminKeys } from '@/features/admin/api';
import { AdminFailure, CheckedAt, Notice, StateBadge } from '@/features/admin/components';
import { SERVICE_STATUS_META } from '@/features/admin/labels';
import { plural } from '@/features/appointments/dates';
import { useSession } from '@/features/auth/session';
import { formatDuration, formatNumber } from '@/lib/format';
import type { AdminHealth, ServiceHealth } from '@/types/api';

const ENVIRONMENT_LABELS: Record<string, string> = {
  development: 'Desenvolvimento',
  test: 'Teste',
  staging: 'Homologação',
  demo: 'Demonstração',
  production: 'Produção',
};

const PUSH_PROVIDERS: Record<string, string> = { expo: 'Expo Push', log: 'Somente registro no log', disabled: 'Desligado' };
const QUEUE_PROVIDERS: Record<string, string> = { mock: 'Simulador de demonstração', public_panel: 'Painel público da FECAP' };

/** Tempo no ar a partir de segundos ("menos de 1 min", "3 h 10 min", "2 d 4 h"). */
export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return 'menos de 1 min';
  return formatDuration(seconds / 60);
}

const latency = (value: number | null): string => (value === null ? '—' : `${formatNumber(value)} ms`);

/** Uma linha de serviço: nome, situação, explicação do servidor e os dados que importam. */
function ServiceRow({ name, health, facts, children }: { name: string; health: ServiceHealth; facts: Array<{ label: string; value: ReactNode }>; children?: ReactNode }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-h4 font-semibold text-ink">{name}</h3>
        <StateBadge meta={SERVICE_STATUS_META[health.status]} />
      </div>
      <p className="text-small text-slate">{health.detail}</p>
      {facts.length > 0 ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-caption text-mist">{fact.label}</dt>
              <dd className="wrap-break-word text-small text-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </li>
  );
}

/** E-mail e push: o servidor informa a configuração, sem testar a entrega a cada verificação. */
function ConfigOnlyNote() {
  return <p className="text-caption text-slate">Sem teste de entrega nesta verificação: “Funcionando” aqui quer dizer que o envio está configurado e ligado.</p>;
}

function Migrations({ migrations }: { migrations: AdminHealth['database']['migrations'] }) {
  return (
    <div className="flex flex-col gap-2">
      {migrations.pending.length > 0 ? (
        <Notice tone="warning" title={`${plural(migrations.pending.length, 'migration pendente', 'migrations pendentes')}`}>
          <p>Aplique antes de usar os recursos que dependem delas:</p>
          <ul className="mt-1 list-disc pl-5 font-mono text-caption">
            {migrations.pending.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {migrations.applied.length > 0 ? (
        <details className="text-small text-slate">
          <summary className="cursor-pointer rounded-sm text-action hover:underline">Ver migrations aplicadas ({migrations.applied.length})</summary>
          <ul className="mt-2 flex flex-col gap-0.5 font-mono text-caption text-slate">
            {migrations.applied.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Health({ data }: { data: AdminHealth }) {
  const { api, database, agentService, queue, mail, push } = data;
  return (
    <div className="flex flex-col gap-6">
      <Surface aria-labelledby="saude-api">
        <SectionHeader id="saude-api" title="API" description="Servidor Node.js que atende o portal e o aplicativo." />
        <KeyValueList
          columns={2}
          items={[
            { label: 'Versão', value: <span className="font-mono">{api.version}</span> },
            { label: 'Ambiente', value: ENVIRONMENT_LABELS[api.environment] ?? api.environment },
            { label: 'No ar há', value: formatUptime(api.uptimeSeconds) },
            { label: 'Node.js', value: <span className="font-mono">{api.node}</span> },
            { label: 'Memória em uso', value: `${formatNumber(api.memoryMb)} MB` },
          ]}
        />
      </Surface>

      <section aria-labelledby="saude-servicos">
        <SectionHeader id="saude-servicos" title="Serviços" />
        <ul className="divide-y divide-line-soft rounded-lg border border-line bg-white">
          <ServiceRow
            name="Banco de dados (PostgreSQL)"
            health={database}
            facts={[
              { label: 'Latência', value: latency(database.latencyMs) },
              { label: 'Migrations aplicadas', value: formatNumber(database.migrations.applied.length) },
              { label: 'Migrations pendentes', value: formatNumber(database.migrations.pending.length) },
            ]}
          >
            <Migrations migrations={database.migrations} />
          </ServiceRow>
          <ServiceRow
            name="Agent Service (Agente para o Estudante)"
            health={agentService}
            facts={[
              { label: 'Latência', value: latency(agentService.latencyMs) },
              { label: 'Versão do agente', value: agentService.agentVersion ? <span className="font-mono">{agentService.agentVersion}</span> : 'Não informada' },
              { label: 'Versão da configuração', value: agentService.configVersion ? <span className="font-mono">{agentService.configVersion}</span> : 'Não informada' },
            ]}
          />
          <ServiceRow
            name="Fila presencial do ASA"
            health={queue}
            facts={[
              { label: 'Provedor', value: QUEUE_PROVIDERS[queue.provider] ?? queue.provider },
              { label: 'Fonte autorizada', value: queue.authorizedSource ? 'Sim' : 'Não: sem autorização institucional registrada' },
            ]}
          />
          <ServiceRow name="E-mail (recuperação de senha e convites)" health={mail} facts={[]}>
            <ConfigOnlyNote />
          </ServiceRow>
          <ServiceRow name="Notificações push" health={push} facts={[{ label: 'Provedor', value: PUSH_PROVIDERS[push.provider] ?? push.provider }]}>
            <ConfigOnlyNote />
          </ServiceRow>
        </ul>
      </section>
    </div>
  );
}

/** Saúde dos serviços: versões, banco e migrations, Agent Service, fila, e-mail e push. Verificação sob demanda. */
export default function HealthPage() {
  const { can } = useSession();
  const allowed = can('health:read');
  const query = useQuery({ queryKey: adminKeys.health, queryFn: adminApi.health, enabled: allowed });

  if (!allowed) return <AccessDenied />;

  return (
    <>
      <PageHeader
        title="Saúde dos serviços"
        description="Situação de cada parte da plataforma no momento da verificação. Banco de dados, Agent Service e fila são consultados agora; e-mail e push mostram a configuração do envio."
        actions={<CheckedAt checkedAt={query.data?.checkedAt} fetching={query.isFetching} failed={query.isRefetchError} onRefresh={() => void query.refetch()} />}
      />
      {query.isPending ? (
        <LoadingRows rows={6} />
      ) : query.data === undefined ? (
        <AdminFailure error={query.error} onRetry={() => void query.refetch()} title="Não foi possível verificar os serviços" />
      ) : (
        <Health data={query.data} />
      )}
    </>
  );
}
