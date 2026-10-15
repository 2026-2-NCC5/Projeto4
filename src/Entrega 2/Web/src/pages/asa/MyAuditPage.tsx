import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Copy, ShieldAlert, X, XCircle } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge, PageHeader } from '@/components/ui/Display';
import { Select, TextInput } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { DataTable, Pagination, type Column } from '@/components/data/DataTable';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { useSession } from '@/features/auth/session';
import { operationsApi, staffKeys, type AuditQuery } from '@/features/support/staff/api';
import { Freshness, LoadError } from '@/features/support/staff/components';
import { formatDateTime } from '@/lib/format';
import type { AuditEventView } from '@/types/api';

export const AUDIT_PAGE_SIZE = 25;

export const ACTION_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'auth.', label: 'Autenticação' },
  { value: 'ticket.', label: 'Chamados' },
  { value: 'report.', label: 'Relatórios' },
  { value: 'student_context.', label: 'Alunos' },
];

const OUTCOME_META: Record<AuditEventView['outcome'], { label: string; tone: 'success' | 'danger' | 'warning'; icon: typeof CheckCircle2 }> = {
  success: { label: 'Concluída', tone: 'success', icon: CheckCircle2 },
  failure: { label: 'Falhou', tone: 'danger', icon: XCircle },
  denied: { label: 'Negada', tone: 'warning', icon: ShieldAlert },
};

const CHANNEL_LABELS: Record<AuditEventView['channel'], string> = { web: 'Portal web', mobile: 'Aplicativo', system: 'Sistema' };

const RESOURCE_LABELS: Record<string, string> = {
  ticket: 'Chamado',
  student: 'Aluno',
  report: 'Relatório',
  session: 'Sessão',
  user: 'Conta',
  appointment: 'Agendamento',
  article: 'Artigo',
};

/** Código da requisição (o suporte localiza o registro por ele) com botão de copiar. */
function RequestCode({ value }: { value: string }) {
  const toast = useToast();
  const copy = () => {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clipboard) {
      toast.show('Não foi possível copiar. Selecione o código e copie manualmente.', 'error');
      return;
    }
    clipboard.writeText(value).then(
      () => toast.show('Código copiado.'),
      () => toast.show('Não foi possível copiar. Selecione o código e copie manualmente.', 'error'),
    );
  };
  return (
    <span className="flex items-center gap-1">
      <span className="block max-w-[11rem] truncate font-mono text-caption text-slate" title={value}>
        {value}
      </span>
      <IconButton size="sm" icon={Copy} label={`Copiar código ${value}`} onClick={copy} />
    </span>
  );
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string | null) => (value && DATE.test(value) ? value : '');

const columns: Column<AuditEventView>[] = [
  {
    key: 'when',
    header: 'Quando',
    render: (row) => (
      <time dateTime={row.occurredAt} className="whitespace-nowrap text-small text-ink">
        {formatDateTime(row.occurredAt)}
      </time>
    ),
  },
  {
    key: 'action',
    header: 'Ação',
    className: 'min-w-[14rem]',
    render: (row) => (
      <div className="min-w-0">
        <p className="text-small text-ink">{row.label}</p>
        <p className="font-mono text-caption text-mist">{row.action}</p>
      </div>
    ),
  },
  {
    key: 'outcome',
    header: 'Resultado',
    render: (row) => {
      const meta = OUTCOME_META[row.outcome];
      return (
        <Badge tone={meta.tone} icon={meta.icon}>
          {meta.label}
        </Badge>
      );
    },
  },
  { key: 'channel', header: 'Canal', render: (row) => <span className="whitespace-nowrap text-small text-slate">{CHANNEL_LABELS[row.channel] ?? row.channel}</span> },
  {
    key: 'resource',
    header: 'Recurso',
    hideOnMobile: true,
    render: (row) =>
      row.resource ? (
        <div className="min-w-0 max-w-[14rem]">
          <p className="text-small text-ink">{RESOURCE_LABELS[row.resource.type] ?? row.resource.type}</p>
          {row.resource.id ? (
            <p className="truncate font-mono text-caption text-mist" title={row.resource.id}>
              {row.resource.id}
            </p>
          ) : null}
        </div>
      ) : (
        <span className="text-small text-mist">—</span>
      ),
  },
  {
    key: 'request',
    header: 'Código (suporte)',
    render: (row) =>
      row.requestId ? (
        <RequestCode value={row.requestId} />
      ) : (
        <span className="text-small text-mist">—</span>
      ),
  },
];

/** A própria trilha de auditoria (ações da pessoa logada), com filtro por período e tipo de ação. */
export default function MyAuditPage() {
  const { can } = useSession();
  const allowed = can('audit:read:own');
  const [params, setParams] = useSearchParams();
  const from = validDate(params.get('de'));
  const to = validDate(params.get('ate'));
  const action = ACTION_FILTERS.some((item) => item.value === params.get('acao')) ? (params.get('acao') ?? '') : '';
  const page = Math.max(1, Number.parseInt(params.get('pagina') ?? '1', 10) || 1);
  const rangeError = from && to && to < from ? 'A data final deve ser igual ou posterior à inicial.' : null;
  const queryParams: AuditQuery = { page, pageSize: AUDIT_PAGE_SIZE, ...(action ? { action } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const query = useQuery({ queryKey: staffKeys.audit(queryParams), queryFn: () => operationsApi.myAudit(queryParams), placeholderData: keepPreviousData, enabled: allowed && !rangeError });

  if (!allowed) return <AccessDenied />;

  const update = (changes: Record<string, string | null>, resetPage = true) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (resetPage) next.delete('pagina');
        return next;
      },
      { replace: resetPage },
    );
  const filtered = Boolean(from || to || action);

  return (
    <>
      <PageHeader title="Minha auditoria" description="Tudo o que você fez na plataforma fica registrado: entradas, ações em chamados, relatórios e consultas a alunos. Use o código para falar com o suporte." />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-[40rem]">
          <TextInput
            label="De"
            type="date"
            value={from}
            max={to || undefined}
            // regra do servidor: só com a data final, o período são os 30 dias até ela
            hint={to && !from ? 'Sem data inicial: considera os 30 dias até a data final.' : undefined}
            onChange={(event) => update({ de: event.target.value || null })}
          />
          <TextInput label="Até" type="date" value={to} min={from || undefined} error={rangeError} onChange={(event) => update({ ate: event.target.value || null })} />
          <Select label="Tipo de ação" value={action} placeholder="Todas" options={ACTION_FILTERS} onChange={(event) => update({ acao: event.target.value || null })} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filtered ? (
            <Button variant="ghost" size="sm" icon={X} onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              Limpar filtros
            </Button>
          ) : null}
          <Freshness updatedAt={query.dataUpdatedAt} fetching={query.isFetching} failed={query.isRefetchError} onRefresh={() => void query.refetch()} />
        </div>
      </div>
      {rangeError ? (
        <EmptyState title="Período inválido" description={rangeError} />
      ) : query.isPending ? (
        <LoadingRows rows={6} />
      ) : query.data === undefined ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} notFoundTitle="Auditoria indisponível" backTo="/asa" backLabel="Voltar ao painel" />
      ) : query.data.items.length === 0 ? (
        <EmptyState title="Nenhum registro" description={filtered ? 'Nenhuma ação sua neste período ou tipo.' : 'Suas ações na plataforma aparecem aqui.'} />
      ) : (
        <>
          <DataTable caption="Minhas ações registradas na auditoria" columns={columns} rows={query.data.items} rowKey={(row) => row.id} />
          <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPage={(target) => update({ pagina: target > 1 ? String(target) : null }, false)} />
        </>
      )}
    </>
  );
}
