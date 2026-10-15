import { useQuery } from '@tanstack/react-query';
import { Check, Minus } from 'lucide-react';
import { PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { DataTable, type Column } from '@/components/data/DataTable';
import { AccessDenied, EmptyState, LoadingRows } from '@/components/feedback/States';
import { adminApi, adminKeys } from '@/features/admin/api';
import { AdminFailure, Notice, Stat, StatGrid } from '@/features/admin/components';
import { useSession } from '@/features/auth/session';
import type { Permission, PermissionMatrix } from '@/types/api';

type PermissionRow = PermissionMatrix['permissions'][number];

/** Agrupa na ordem em que o servidor envia (Conta, Acadêmico, Atendimento…). */
export function groupPermissions(matrix: PermissionMatrix): Array<{ group: string; items: PermissionRow[] }> {
  const groups = new Map<string, PermissionRow[]>();
  for (const permission of matrix.permissions) {
    const list = groups.get(permission.group) ?? [];
    list.push(permission);
    groups.set(permission.group, list);
  }
  return [...groups.entries()].map(([group, items]) => ({ group, items }));
}

function Allowed({ allowed, role }: { allowed: boolean; role: string }) {
  return allowed ? (
    <span className="relative inline-flex items-center gap-1 text-success-text">
      <Check size={20} aria-hidden />
      <span className="sr-only">{`${role}: permitido`}</span>
    </span>
  ) : (
    <span className="relative inline-flex items-center gap-1 text-fog">
      <Minus size={20} aria-hidden />
      <span className="sr-only">{`${role}: não permitido`}</span>
    </span>
  );
}

function Matrix({ matrix }: { matrix: PermissionMatrix }) {
  const roleSets = matrix.roles.map((role) => ({ ...role, set: new Set<Permission>(role.permissions) }));
  const columns: Column<PermissionRow>[] = [
    {
      key: 'permission',
      header: 'Permissão',
      // fica parada ao rolar as colunas dos papéis em telas estreitas
      className: 'sticky left-0 z-10 min-w-[11rem] max-w-[18rem] bg-white',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-small text-ink">{row.label}</p>
          <p className="font-mono text-caption text-mist">{row.key}</p>
        </div>
      ),
    },
    ...roleSets.map(
      (role): Column<PermissionRow> => ({
        key: role.role,
        header: role.label,
        className: 'w-32 text-center',
        render: (row) => <Allowed allowed={role.set.has(row.key)} role={role.label} />,
      }),
    ),
  ];
  return (
    <div className="flex flex-col gap-8">
      <Surface aria-label="Permissões por papel">
        <StatGrid className="sm:grid-cols-3">
          {matrix.roles.map((role) => (
            <Stat key={role.role} label={role.label} value={role.permissions.length} hint="permissões" />
          ))}
        </StatGrid>
      </Surface>
      {groupPermissions(matrix).map(({ group, items }) => {
        const id = `grupo-${group.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        return (
          <section key={group} aria-labelledby={id}>
            <SectionHeader id={id} title={group} />
            <DataTable caption={`Permissões do grupo ${group} por papel`} columns={columns} rows={items} rowKey={(row) => row.key} />
          </section>
        );
      })}
    </div>
  );
}

/** Matriz de permissões (somente leitura): o que cada papel pode fazer, agrupado por assunto. */
export default function PermissionsPage() {
  const { can } = useSession();
  const allowed = can('permissions:read');
  const query = useQuery({ queryKey: adminKeys.permissions, queryFn: adminApi.permissions, staleTime: 10 * 60_000, enabled: allowed });

  if (!allowed) return <AccessDenied />;

  return (
    <>
      <PageHeader title="Permissões" description="O que cada papel pode fazer na plataforma. Somente leitura: a matriz é definida no servidor." />
      <Notice tone="info" title="Quem decide é o servidor" className="mb-6">
        A API confere a permissão em toda requisição e recusa (e registra na auditoria) o que o papel não pode fazer. Os menus do portal e do aplicativo só escondem o que não se aplica: são conveniência, não proteção.
      </Notice>
      {query.isPending ? (
        <LoadingRows rows={6} />
      ) : query.data === undefined ? (
        <AdminFailure error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar a matriz" />
      ) : query.data.permissions.length === 0 ? (
        <EmptyState title="Matriz vazia" description="O servidor não devolveu permissões." />
      ) : (
        <Matrix matrix={query.data} />
      )}
    </>
  );
}
