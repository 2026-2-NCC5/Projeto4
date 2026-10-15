import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FlaskConical, MailQuestion, UserPlus, Users, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge, PageHeader } from '@/components/ui/Display';
import { Select } from '@/components/ui/Form';
import { DataTable, Pagination, SearchInput, type Column } from '@/components/data/DataTable';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { adminApi, adminKeys, type AdminUsersQuery } from '@/features/admin/api';
import { AdminFailure, DemoBadge } from '@/features/admin/components';
import { ROLE_LABELS } from '@/features/admin/labels';
import { useMe, useSession } from '@/features/auth/session';
import { usePlatformInfo } from '@/features/platform/platform';
import { Freshness, ToggleChip } from '@/features/support/staff/components';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { AdminUser, UserRole } from '@/types/api';
import { InviteUserDialog } from './InviteUserDialog';
import { AccountStatusBadge, UserDrawer } from './UserDrawer';

export const USERS_PAGE_SIZE = 25;

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as UserRole[]).map((role) => ({ value: role, label: ROLE_LABELS[role] }));
const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativas' },
  { value: 'inactive', label: 'Inativas' },
];

/** Usuários e equipe: busca, filtros na URL, convite, detalhe com papel, ativação, sessões e convite. */
export default function UsersPage() {
  const { can } = useSession();
  const me = useMe();
  const allowed = can('users:manage');
  const platform = usePlatformInfo();
  const [params, setParams] = useSearchParams();
  const [inviteOpen, setInviteOpen] = useState(false);

  const search = params.get('search') ?? '';
  const role = ROLE_OPTIONS.some((option) => option.value === params.get('role')) ? (params.get('role') ?? '') : '';
  const status = params.get('status') === 'active' || params.get('status') === 'inactive' ? (params.get('status') as 'active' | 'inactive') : '';
  const includeDemo = params.get('demo') !== '0';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const selectedId = params.get('conta');

  const apiQuery: AdminUsersQuery = {
    page,
    pageSize: USERS_PAGE_SIZE,
    ...(search ? { search } : {}),
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(includeDemo ? {} : { includeDemo: false }),
  };
  const query = useQuery({ queryKey: adminKeys.userList(apiQuery), queryFn: () => adminApi.users(apiQuery), placeholderData: keepPreviousData, enabled: allowed });

  const update = useCallback(
    (changes: Record<string, string | null>, resetPage = true) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          if (resetPage) next.delete('page');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  const onSearch = useCallback((value: string) => update({ search: value || null }), [update]);

  if (!allowed) return <AccessDenied />;

  const openUser = (id: string | null) => update({ conta: id }, false);
  // o detalhe abre pelo endereço (?conta=…): dá para abrir em outra aba ou voltar com o navegador
  const userHref = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('conta', id);
    return `/admin/usuarios?${next.toString()}`;
  };
  const selectedRow = query.data?.items.find((item) => item.id === selectedId);
  const demoMode = platform.data?.dataMode !== 'institutional';
  const filtered = Boolean(search || role || status || !includeDemo);

  const columns: Column<AdminUser>[] = [
    {
      key: 'person',
      header: 'Pessoa',
      className: 'min-w-[14rem]',
      render: (user) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">
            <Link to={userHref(user.id)} className="text-ink hover:text-action hover:underline">
              {user.fullName}
            </Link>
            {user.id === me.user.id ? <span className="font-normal text-mist"> (você)</span> : null}
          </p>
          <p className="break-all text-caption text-mist">{user.email}</p>
          {user.isDemo ? (
            <div className="mt-1">
              <DemoBadge />
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Papel',
      render: (user) => (
        <div className="min-w-0">
          <p className="whitespace-nowrap text-small text-ink">{user.roleLabel}</p>
          {user.student ? <p className="whitespace-nowrap font-mono text-caption text-mist">RA {user.student.registrationNumber}</p> : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Situação',
      render: (user) => (
        <div className="flex flex-col items-start gap-1">
          <AccountStatusBadge user={user} />
          {user.role !== 'student' && user.isActive && user.invitedAt && !user.lastLoginAt ? (
            <Badge tone="info" icon={MailQuestion}>
              Convite pendente
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Último acesso',
      render: (user) =>
        user.lastLoginAt ? (
          <time dateTime={user.lastLoginAt} title={formatDateTime(user.lastLoginAt)} className="whitespace-nowrap text-small text-slate">
            {formatRelative(user.lastLoginAt)}
          </time>
        ) : (
          <span className="whitespace-nowrap text-small text-mist">Nunca entrou</span>
        ),
    },
    { key: 'sessions', header: 'Sessões ativas', render: (user) => <span className="tabular-nums text-small text-ink">{user.activeSessions}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Usuários e equipe"
        description="Alunos se cadastram sozinhos com o e-mail institucional. Aqui você convida a equipe ASA e a administração, muda papéis, desativa contas e encerra sessões."
        actions={
          <Button variant="primary" icon={UserPlus} onClick={() => setInviteOpen(true)}>
            Convidar pessoa
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="lg:w-80">
            <SearchInput value={search} onChange={onSearch} label="Buscar por nome ou e-mail" placeholder="Nome ou e-mail" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[26rem]">
            <Select label="Papel" value={role} placeholder="Todos" options={ROLE_OPTIONS} onChange={(event) => update({ role: event.target.value || null })} />
            <Select label="Situação" value={status} placeholder="Todas" options={STATUS_OPTIONS} onChange={(event) => update({ status: event.target.value || null })} />
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {demoMode ? (
              <ToggleChip pressed={includeDemo} onChange={(on) => update({ demo: on ? null : '0' })} icon={<FlaskConical size={16} aria-hidden />}>
                Mostrar contas de demonstração
              </ToggleChip>
            ) : null}
            {filtered ? (
              <Button variant="ghost" size="sm" icon={X} onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Limpar filtros
              </Button>
            ) : null}
          </div>
          <Freshness updatedAt={query.dataUpdatedAt} fetching={query.isFetching} failed={query.isRefetchError} onRefresh={() => void query.refetch()} />
        </div>
      </div>
      {query.isPending ? (
        <LoadingRows rows={6} />
      ) : query.data === undefined ? (
        <AdminFailure error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar as contas" />
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={Users} title="Nenhuma conta encontrada" description={filtered ? 'Nenhuma conta com estes filtros.' : 'Ainda não há contas cadastradas.'} />
      ) : (
        <>
          <DataTable caption="Contas da plataforma" columns={columns} rows={query.data.items} rowKey={(user) => user.id} rowHref={(user) => userHref(user.id)} />
          <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPage={(target) => update({ page: target > 1 ? String(target) : null }, false)} />
        </>
      )}
      <UserDrawer userId={selectedId} placeholder={selectedRow} onClose={() => openUser(null)} />
      <InviteUserDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onOpenUser={(id) => {
          setInviteOpen(false);
          openUser(id);
        }}
      />
    </>
  );
}
