import { useQuery } from '@tanstack/react-query';
import { PageHeader, SectionHeader } from '@/components/ui/Display';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { adminApi, adminKeys } from '@/features/admin/api';
import { AdminFailure, CheckedAt, EnvNames, StateBadge } from '@/features/admin/components';
import { INTEGRATION_STATE_META, INTEGRATION_STATE_ORDER } from '@/features/admin/labels';
import { useSession } from '@/features/auth/session';
import type { IntegrationView } from '@/types/api';

const metaFor = (state: IntegrationView['state']) => INTEGRATION_STATE_META[state] ?? INTEGRATION_STATE_META.not_configured;

function IntegrationRow({ item }: { item: IntegrationView }) {
  const meta = metaFor(item.state);
  return (
    <li className="flex flex-col gap-2 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-h4 font-semibold text-ink">{item.name}</h3>
          <p className="text-small text-slate">{item.description}</p>
        </div>
        <StateBadge meta={meta} className="self-start" />
      </div>
      <p className="text-small text-ink">{item.detail}</p>
      <p className="text-caption text-slate">
        <span className="font-medium text-ink">{meta.label}:</span> {meta.explanation}
      </p>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <span className="shrink-0 text-caption text-mist">Variáveis de ambiente</span>
        {item.configuredBy.length > 0 ? (
          <EnvNames names={item.configuredBy} />
        ) : (
          <span className="text-caption text-slate">Nenhuma ainda: depende de credenciais e autorização institucionais.</span>
        )}
      </div>
    </li>
  );
}

function IntegrationList({ items, label }: { items: IntegrationView[]; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-line-soft rounded-lg border border-line bg-white">
      {items.map((item) => (
        <IntegrationRow key={item.id} item={item} />
      ))}
    </ul>
  );
}

function Legend() {
  return (
    <details className="rounded-lg border border-line bg-white px-4 py-3 sm:px-5">
      <summary className="cursor-pointer rounded-sm text-small font-medium text-action hover:underline">O que significa cada estado</summary>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {INTEGRATION_STATE_ORDER.map((state) => (
          <div key={state} className="flex min-w-0 flex-col items-start gap-1">
            <dt>
              <StateBadge meta={INTEGRATION_STATE_META[state]} />
            </dt>
            <dd className="text-small text-slate">{INTEGRATION_STATE_META[state].explanation}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Integrações: estado de cada conexão externa, sem segredos (só os nomes das variáveis de ambiente). */
export default function IntegrationsPage() {
  const { can } = useSession();
  const allowed = can('integrations:read');
  const query = useQuery({ queryKey: adminKeys.integrations, queryFn: adminApi.integrations, enabled: allowed });

  if (!allowed) return <AccessDenied />;

  const items = query.data ?? [];
  const current = items.filter((item) => item.state !== 'planned');
  const planned = items.filter((item) => item.state === 'planned');

  return (
    <>
      <PageHeader
        title="Integrações"
        description="Estado das conexões com serviços externos. Segredos nunca aparecem aqui: só os nomes das variáveis de ambiente que configuram cada integração."
        actions={<CheckedAt checkedAt={query.data?.[0]?.checkedAt} fetching={query.isFetching} failed={query.isRefetchError} onRefresh={() => void query.refetch()} />}
      />
      {query.isPending ? (
        <LoadingRows rows={5} />
      ) : query.data === undefined ? (
        <AdminFailure error={query.error} onRetry={() => void query.refetch()} title="Não foi possível verificar as integrações" />
      ) : items.length === 0 ? (
        <EmptyState title="Nenhuma integração informada" description="O servidor não devolveu integrações." />
      ) : (
        <div className="flex flex-col gap-6">
          <Legend />
          {current.length > 0 ? (
            <section aria-labelledby="integracoes-ambiente">
              <SectionHeader id="integracoes-ambiente" title="Neste ambiente" description="Situação informada pelo servidor nesta verificação." />
              <IntegrationList items={current} label="Integrações deste ambiente" />
            </section>
          ) : null}
          {planned.length > 0 ? (
            <section aria-labelledby="integracoes-planejadas">
              <SectionHeader id="integracoes-planejadas" title="Planejadas" description="Ainda não funcionam: dependem de contrato técnico, credenciais ou autorização da FECAP." />
              <IntegrationList items={planned} label="Integrações planejadas" />
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
