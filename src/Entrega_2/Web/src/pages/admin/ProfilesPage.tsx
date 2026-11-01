import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ShieldCheck, Users, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { AccessDenied, LoadingRows, EmptyState } from '@/components/feedback/States';
import { Badge, PageHeader, Surface } from '@/components/ui/Display';
import { adminApi, adminKeys } from '@/features/admin/api';
import { AdminFailure, Notice } from '@/features/admin/components';
import { ROLE_DESCRIPTIONS } from '@/features/admin/labels';
import { useSession } from '@/features/auth/session';
import type { UserRole } from '@/types/api';

const ROLE_ICONS: Record<UserRole, typeof UserRound> = { student: UserRound, institutional_staff: Users, technical_admin: ShieldCheck };

/** Perfis exibidos a partir da matriz servida pela API; a administração não pode criar permissões no navegador. */
export default function ProfilesPage() {
  const { can } = useSession();
  const allowed = can('permissions:read');
  const query = useQuery({ queryKey: adminKeys.permissions, queryFn: adminApi.permissions, staleTime: 10 * 60_000, enabled: allowed });
  if (!allowed) return <AccessDenied />;
  return <>
    <PageHeader title="Papéis e perfis" description="Perfis de acesso definidos pela instituição. A composição vem da API e não é editável nesta tela." actions={<Link to="/admin/usuarios" className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-small font-semibold text-action hover:bg-action-soft">Gerenciar usuários <ArrowRight size={16} aria-hidden /></Link>} />
    <Notice tone="info" title="Princípio de menor privilégio" className="mb-6">Atribua à equipe somente o papel necessário para seu trabalho. O servidor valida as permissões em cada operação; esta página é uma visão de consulta.</Notice>
    {query.isPending ? <LoadingRows rows={3} /> : query.data === undefined ? <AdminFailure error={query.error} onRetry={() => void query.refetch()} title="Não foi possível carregar os perfis" /> : query.data.roles.length === 0 ? <EmptyState title="Nenhum perfil informado" description="A API não devolveu papéis nesta consulta." /> : <div className="grid gap-4 lg:grid-cols-3">
      {query.data.roles.map((role) => {
        const Icon = ROLE_ICONS[role.role];
        const description = role.role === 'student' ? 'Acesso de estudante associado ao vínculo de aluno; não é um papel atribuível por convite.' : ROLE_DESCRIPTIONS[role.role];
        return <Surface key={role.role} className="flex flex-col p-0 transition-[border,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-action/35 hover:shadow-md">
          <div className="flex items-start justify-between gap-3 border-b border-line p-5"><span className="flex h-11 w-11 items-center justify-center rounded-lg bg-action-soft text-action"><Icon size={21} aria-hidden /></span><Badge tone="action">{role.permissions.length} permissões</Badge></div>
          <div className="flex flex-1 flex-col p-5"><h2 className="text-h3 font-semibold text-ink">{role.label}</h2><p className="mt-2 min-h-16 text-small leading-6 text-slate">{description}</p><Link to="/admin/permissoes" className="mt-5 inline-flex items-center gap-2 self-start text-small font-semibold text-action hover:underline">Ver matriz de permissões <ArrowRight size={16} aria-hidden /></Link></div>
        </Surface>;
      })}
    </div>}
    {query.data ? <p className="mt-5 text-caption text-mist">Os totais são calculados a partir da resposta atual da API. Mudanças de perfil devem ser feitas no detalhe da conta e ficam sujeitas à autorização do servidor.</p> : null}
  </>;
}
