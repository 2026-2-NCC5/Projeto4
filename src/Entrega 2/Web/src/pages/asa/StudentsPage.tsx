import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/ui/Display';
import { DataTable, FiltersBar, Pagination, SearchInput, type Column } from '@/components/data/DataTable';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { useSession } from '@/features/auth/session';
import { operationsApi, staffKeys } from '@/features/support/staff/api';
import { Freshness, LoadError, MinimizationNote } from '@/features/support/staff/components';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { StudentContextSummary } from '@/types/api';

export const STUDENTS_PAGE_SIZE = 20;

const studentHref = (row: StudentContextSummary) => `/asa/alunos/${encodeURIComponent(row.studentId)}`;

/** Alunos que já interagiram com o ASA (busca por nome ou RA, paginação no servidor). */
export default function StudentsPage() {
  const { can } = useSession();
  const allowed = can('students:read:support_context');
  const [params, setParams] = useSearchParams();
  const search = params.get('busca')?.trim() ?? '';
  const page = Math.max(1, Number.parseInt(params.get('pagina') ?? '1', 10) || 1);
  const queryParams = { ...(search ? { search } : {}), page, pageSize: STUDENTS_PAGE_SIZE };
  const query = useQuery({ queryKey: staffKeys.students(queryParams), queryFn: () => operationsApi.students(queryParams), placeholderData: keepPreviousData, enabled: allowed });

  const onSearch = useCallback(
    (value: string) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set('busca', value);
          else next.delete('busca');
          next.delete('pagina');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  if (!allowed) return <AccessDenied />;

  const goTo = (target: number) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (target > 1) next.set('pagina', String(target));
      else next.delete('pagina');
      return next;
    });

  const columns: Column<StudentContextSummary>[] = [
    {
      key: 'name',
      header: 'Nome',
      render: (row) => (
        <Link to={studentHref(row)} className="font-medium text-ink hover:text-action hover:underline">
          {row.fullName}
        </Link>
      ),
    },
    { key: 'ra', header: 'RA', render: (row) => <span className="whitespace-nowrap font-mono text-small">{row.registrationNumber}</span> },
    { key: 'program', header: 'Curso', hideOnMobile: true, render: (row) => <span className="text-small text-slate">{row.program ?? '—'}</span> },
    {
      key: 'tickets',
      header: 'Chamados',
      render: (row) => (
        <span className="text-small tabular-nums" title={`${row.ticketsOpen} em aberto de ${row.ticketsTotal} no total`}>
          <span className="text-ink">{row.ticketsOpen} abertos</span>
          <span className="text-mist"> / {row.ticketsTotal} no total</span>
        </span>
      ),
    },
    {
      key: 'last',
      header: 'Última interação',
      render: (row) =>
        row.lastInteractionAt ? (
          <time dateTime={row.lastInteractionAt} title={formatDateTime(row.lastInteractionAt)} className="whitespace-nowrap text-small text-slate">
            {formatRelative(row.lastInteractionAt)}
          </time>
        ) : (
          <span className="text-small text-mist">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Alunos atendidos" description="Somente alunos que já abriram chamados ou falaram com o ASA. Cada consulta ao perfil de um aluno fica registrada na auditoria." />
      <div className="mb-4">
        <MinimizationNote />
      </div>
      <FiltersBar trailing={<Freshness updatedAt={query.dataUpdatedAt} fetching={query.isFetching} failed={query.isRefetchError} onRefresh={() => void query.refetch()} />}>
        <SearchInput value={search} onChange={onSearch} label="Buscar aluno por nome ou RA" placeholder="Nome ou RA" />
      </FiltersBar>
      {query.isPending ? (
        <LoadingRows rows={6} />
      ) : query.data === undefined ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} notFoundTitle="Lista indisponível" backTo="/asa" backLabel="Voltar ao painel" />
      ) : query.data.items.length === 0 ? (
        <EmptyState title={search ? 'Nenhum aluno encontrado' : 'Nenhum aluno atendido ainda'} description={search ? 'Confira o nome ou o RA digitado.' : 'Alunos aparecem aqui depois do primeiro contato com o ASA.'} />
      ) : (
        <>
          <DataTable caption="Alunos atendidos" columns={columns} rows={query.data.items} rowKey={(row) => row.studentId} rowHref={studentHref} />
          <Pagination page={page} pageSize={STUDENTS_PAGE_SIZE} total={query.data.total} onPage={goTo} />
        </>
      )}
    </>
  );
}
